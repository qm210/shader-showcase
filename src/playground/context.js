import {TimelineEngine} from './engine/timeline.js';
import {Overlay} from './overlay/overlay.js';
import {Randomizer} from './engine/randomizer.js';
import {deriveAutoBatches, UniformBatch} from './engine/uniformBatch.js';
import {isNumeric} from "../app/controls.js";
import {FALLBACK_RANGE} from "./engine/valueRanges.js";
import {updateAllSliders} from "../app/layout/elements/uniforms.js";


export class PlaygroundContext {
    constructor(state, controls, elements) {
        this._mainState = state;
        this._elements = elements;
        this.engine = new TimelineEngine();
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
                getValue: () => state.uni[control.name],
                mainElements,
            });
            const callbacks = mainElements?.synchronize?.onChange;
            if (!callbacks || callbacks.has("overlay")) {
                continue;
            }
            callbacks.set("overlay", value => {
                state.uni[control.name] = value;
                console.log("SYNC MAIN -> OVERLAY", control.name, value);
            });
        }

        this.batches.auto = deriveAutoBatches(list);

        console.log("[PLAYGROUND] connectControls(…) ->", {
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

    // ─── Public API ──────────────────────────────────────────────

    update(dt) {
        this.overlay.update(dt);
    }

    syncToShader(gl, state) {
        this.overlay.syncToShader(gl, state);
    }

    toggleOverlay() {
        this.overlay.toggle();
    }

    getUniformValues() {
        return this.engine.getAllUniformValues();
    }

    /** Sync computed uniform values back to the main page's state.uni and update sliders. */
    syncToState(state) {
        if (!state || !state.uni) return;
        const values = this.engine.getAllUniformValues();
        for (const [name, value] of Object.entries(values)) {
            state.uni[name] = value;
        }
        // Update main page slider elements
        if (this._elements?.uniforms) {
            updateAllSliders(this._elements, state, this._controls);
        }
    }

    addTrack(name) {
        const track = this.engine.addTrack(name);
        this.overlay.renderTimeline();
        return track;
    }

    removeTrack(id) {
        this.engine.removeTrack(id);
        this.overlay.renderTimeline();
    }

    resetOverlay() {
        this.batches.custom = [];
        this.overlay.reset();
    }

    /** Load a snapshot of current uniform values from the main page's state.uni. */
    loadSnapshotFromState() {
        const state = this._mainState;
        if (!state || !state.uni) return;
        const snapshot = {};
        for (const [name, value] of Object.entries(state.uni)) {
            if (typeof value === 'number' || Array.isArray(value)) {
                snapshot[name] = value;
            }
        }
        this._snapshot = snapshot;
        console.log('[PLAYGROUND] Snapshot loaded:', snapshot);
        return snapshot;
    }

    getSnapshot() {
        return this._snapshot || null;
    }

    toJSON() {
        return this.engine.toJSON();
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
            value: control?.getValue()
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

            getKnownUniformNames() {
                return ctx._controlMap ? Array.from(ctx._controlMap.keys()) : [];
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

            loadSnapshotFromState() {
                return ctx.loadSnapshotFromState();
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
        engine: _pg.engine,
        overlay: _pg.overlay,
        _provider: _pg._provider,
        update: (dt) => _pg.update(dt),
        syncToShader: (gl, state) => _pg.syncToShader(gl, state),
        syncToState: (state) => _pg.syncToState(state),
        toggleOverlay: () => _pg.toggleOverlay(),
        getUniformValues: () => _pg.getUniformValues(),
        addTrack: (name) => _pg.addTrack(name),
        removeTrack: (id) => _pg.removeTrack(id),
        resetOverlay: () => _pg.resetOverlay(),
        toJSON: () => _pg.toJSON(),
        loadSnapshotFromState: () => _pg.loadSnapshotFromState(),
    };
}
