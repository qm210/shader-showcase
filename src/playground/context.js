import {Overlay} from "./overlay/overlay.js";
import {Randomizer} from "./engine/randomizer.js";
import {isNumeric} from "../app/controls.js";
import {FALLBACK_RANGE} from "./engine/valueRanges.js";
import "./styles/overlay.css";
import {DEBUG} from "./overlay/index.js";
import {isIntegerType} from "./overlay/format.js";
import {PlaygroundEngine} from "./engine/engine.js";
import {BatchTarget, deriveAutoBatches, groupUniforms, TARGET_PREFIX} from "./engine/targets.js";

export class PlaygroundContext {

    constructor(state, controls, elements) {
        this.engine = new PlaygroundEngine({
            getUniformEntries: () =>
                Object.entries(state.uni),
            setUniformValue: (name, value) =>
                elements.uniforms[name].updateValue(value),
            getPlaying: () => state.play.running,
            setPlaying: (p) => state.play.actions.toggle(p),
            getCurrentTime: () => state.time,
            setCurrentTime: (to) => state.play.actions.jump({to}),
        });
        this._controlMap = null;
        this.batches = { auto: [], custom: [] };
        this.uniformGroups = [];
        this._connect(state, controls, elements);
        this._provider = this._createProvider();
        this.randomizer = new Randomizer(this._provider);
        this.overlay = new Overlay(this._provider);

        this.overlay.init()
            .catch(err => {
                console.error("[PLAYGROUND] Overlay init failed:", err);
            });

        DEBUG.log("[PLAYGROUND] Context constructed.", {
            overlay: this.overlay,
            provider: this._provider,
        });
    }

    _connect(state, controls, elements) {
        const uniformsWithSeparators = controls.uniforms.filter(
            c => c.separator || (isNumeric(c) && !c.hidden)
        );
        this.batches.auto = deriveAutoBatches(uniformsWithSeparators);
        this.uniformGroups = groupUniforms(this.batches.auto);

        const uniformControls = uniformsWithSeparators.filter(
            c => !c.separator
        );
        this._controlMap = new Map();
        for (const control of uniformControls) {
            this._controlMap.set(control.name, {
                min: control.min,
                max: control.max,
                defaultValue: control.defaultValue,
                type: control.type,
            });
            const mainElements = elements.uniforms[control.name];
            if (!mainElements?.updateValue) {
                console.warn("Uniform Elements have no updateValue:", {
                    ...control,
                    elements: mainElements
                });
            }

            const callbacks = mainElements?.synchronize?.onChange;
            if (!callbacks || callbacks.has("overlay")) {
                continue;
            }
            callbacks.set("overlay", value => {
                /** Currently unused on purpose:
                 *  Update the Playground when the Main State changes.
                 * */
            });
        }

        DEBUG.log("[PLAYGROUND] _connect(…) ->", {
            uniformControls,
            controlMap: this._controlMap,
            batches: structuredClone(this.batches)
        });
    }

    update(_dt) {
        this.overlay.update();
    }

    resolveControl(entry) {
        let control = this._controlMap?.get(entry.name);
        if (!control) {
            console.warn("Failed to resolveRange()", entry, this._controlMap);
            control = { ...FALLBACK_RANGE, defaultValue: 0 };
        }
        return {
            ...control,
            name: entry.name,
            min: entry.min ?? control.min,
            max: entry.max ?? control.max,
            components: Array.isArray(control.defaultValue)
                ? control.defaultValue.length : 1
        };
    }

    _createProvider() {
        const ctx = this;

        return {
            get engine() { return ctx.engine; },

            getControl(entry) {
                if (typeof entry === "string") {
                    entry = {name: entry};
                }
                return ctx.resolveControl(entry);
            },

            getUniformValue(name) {
                return ctx.engine.getUniformBaseValue(name);
            },

            getKnownUniformNames() {
                if (!ctx._controlMap) {
                    return [];
                }
                return Array.from(ctx._controlMap.entries())
                    .filter(([, ctrl]) => !isIntegerType(ctrl.type))
                    .map(([name]) => name);
            },

            get uniformGroups() {
                return ctx.uniformGroups;
            },

            get batches() { return ctx.batches; },

            allBatches() {
                return [...ctx.batches.custom, ...ctx.batches.auto];
            },

            getBatch(id) {
                return this.allBatches()
                    .find(b => b.id === id) ?? null;
            },

            loadCustomBatches(json) {
                try {
                    if (Array.isArray(json)) {
                        // replace when given an array
                        ctx.batches.custom = json.map(batchJson =>
                            BatchTarget.fromJSON(batchJson)
                        );
                    } else {
                        // add if single batch, if id is new
                        const batch = BatchTarget.fromJSON(json);
                        if (!ctx.batches.custom.find(b => b.id === batch.id)) {
                            ctx.batches.custom.push(batch);
                        }
                    }
                } catch (err) {
                    console.warn("Cannot load custom batches:", json, err);
                }
            },

            addBatch(name) {
                const batch = new BatchTarget(
                    name, {
                        id: `${TARGET_PREFIX.BATCH}:${Date.now()}`,
                        custom: true,
                    });
                ctx.batches.custom.push(batch);
                return batch;
            },

            removeBatch(id) {
                const idx = ctx.batches.custom
                    .findIndex(b => b.id === id);
                if (idx !== -1) {
                    ctx.batches.custom.splice(idx, 1);
                }
            },

            randomizeBatch(batchId, intensity) {
                const batch = this.getBatch(batchId);
                if (!batch) {
                    return {};
                }
                return ctx.randomizer.randomizeBatch(batch, intensity);
            },
        };
    }
}

let _pg = null;

export function createUniformPlayground(state, controls, elements) {
    if (!_pg) {
        _pg = new PlaygroundContext(state, controls, elements);
    }
    return {
        overlay: _pg.overlay,
        update: (dt) => _pg.update(dt),
    };
}
