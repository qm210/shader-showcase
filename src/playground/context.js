import {Overlay} from './overlay/overlay.js';
import {Randomizer} from './engine/randomizer.js';
import {deriveAutoBatches, UniformBatch} from './engine/uniformBatch.js';
import {isNumeric} from "../app/controls.js";
import {FALLBACK_RANGE} from "./engine/valueRanges.js";
import './styles/overlay.css';
import {DEBUG} from "./overlay/index.js";
import {isIntegerType} from "./overlay/format.js";
import {PlaygroundEngine} from "./engine/engine.js";

export class PlaygroundContext {
    constructor(state, controls, elements) {
        this.engine = new PlaygroundEngine(state, elements);
        this._controlMap = null;
        this._controls = null;
        this.batches = {
            auto: [],
            custom: []
        };
        this._connect(state, controls, elements);
        this._provider = this._createProvider();
        this.randomizer = new Randomizer(this._provider);
        this.overlay = new Overlay(this._provider);

        DEBUG.log("[PLAYGROUND] Context constructed.", {
            overlay: this.overlay,
            provider: this._provider,
        });
    }

    _connect(state, controls, elements) {
        const list = Array.isArray(controls)
            ? controls
            : controls?.uniforms;
        if (!Array.isArray(list)) {
            console.error("Cannot connectControls:", controls);
            return;
        }

        this._controls = list;
        this._controlMap = new Map();
        for (const control of list) {
            if (control.separator || !isNumeric(control)) {
                continue;
            }
            const mainElements = elements.uniforms[control.name];
            this._controlMap.set(control.name, {
                min: control.min,
                max: control.max,
                defaultValue: control.defaultValue,
                type: control.type,
                mainElements,
            });
            const callbacks = mainElements?.synchronize?.onChange;
            if (!callbacks || callbacks.has("overlay")) {
                continue;
            }
            callbacks.set("overlay", value => {
                /** This would update the Playground when the Main State changes.
                 *  This direction is currently intentionally unused.
                 * */
            });
        }

        this.batches.auto = deriveAutoBatches(list);

        DEBUG.log("[PLAYGROUND] connectControls(…) ->", {
            controls: this._controls,
            controlMap: this._controlMap,
            batches: structuredClone(this.batches)
        });

        this._initUniformValues(state);
    }

    _initUniformValues(state) {
        if (!this._controls) {
            return;
        }
        for (const control of this._controls) {
            if (control.separator || control.boolean) {
                continue;
            }
            const target = control.notAnUniform ? state : state.uni;
            if (target[control.name] === undefined) {
                target[control.name] = control.defaultValue;
            }
        }
    }

    update(dt) {
        this.engine.update(dt);
        this.overlay.update();
    }

    toJSON() {
        return this.engine.timelineToJSON();
    }

    resolveRange(entry) {
        const control = this._controlMap?.get(entry.name);

        const min = entry.min ?? control?.min ?? FALLBACK_RANGE.min;
        const max = entry.max ?? control?.max ?? FALLBACK_RANGE.max;

        const components = [control?.defaultValue, min, max]
            .find(Array.isArray)?.length ?? 1;

        return {
            min,
            max,
            components,
        };
    }

    _createProvider() {
        const ctx = this;

        return {
            get engine() { return ctx.engine; },

            get resolveControlRange() { return ctx.resolveRange; },

            getControlRange(name) {
                return ctx.resolveRange({ name });
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
                            UniformBatch.fromJSON(batchJson)
                        );
                    } else {
                        // add if single batch, if id is new
                        const batch = UniformBatch.fromJSON(json);
                        if (!ctx.batches.custom.find(b => b.id === batch.id)) {
                            ctx.batches.custom.push(batch);
                        }
                    }
                } catch (err) {
                    console.warn("Cannot load custom batches:", json, err);
                }
            },

            addBatch(name) {
                const batch = new UniformBatch(
                    name, {
                        id: `custom:${Date.now()}`
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

            randomizeBatch(batchId, intensity, engine) {
                const batch = this.getBatch(batchId);
                if (batch) {
                    return ctx.randomizer.randomizeBatch(batch, intensity, engine);
                }
                return {};
            },

            /** Returns the main page's updateValue function for a uniform, or null. */
            getUniformUpdateValue(name) {
                return ctx._controlMap?.get(name)?.mainElements?.updateValue ?? null;
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
        provider: _pg._provider,
        update: (dt) => _pg.update(dt),
    };
}
