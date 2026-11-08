import {TimelineEngine} from './engine/timeline.js';
import {Overlay} from './overlay/overlay.js';
import {Randomizer} from './engine/randomizer.js';
import {UniformBatch} from './engine/uniformBatch.js';
import {isNumeric} from "../app/controls.js";
import {FALLBACK_RANGE} from "./engine/valueRanges.js";


export class PlaygroundContext {
    constructor(state, controls) {
        this.engine = new TimelineEngine();
        this._controlMap = null; // Map<name, { min, max, defaultValue, type }>
        this.batches = {
            auto: [],
            custom: []
        };
        this._rawControls = null;
        this.setControls(controls);
        if (state) {
            this.initUniformValues(state);
        }
        this._provider = this._createProvider();
        this.randomizer = new Randomizer(this._provider);
        this.overlay = new Overlay(this._provider);
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

            getAllBatches() {
                return [...ctx.batches.custom, ...ctx.batches.auto];
            },

            getBatch(id) {
                return this.getAllBatches().find(b => b.id === id);
            },

            get autoBatches() { return ctx.batches.auto; },
            get customBatches() { return ctx.batches.custom; },

            loadCustomBatches(json) {
                let batches = [];
                try {
                    if (Array.isArray(json)) {
                        batches = json.map(batchJson =>
                            UniformBatch.fromJSON(batchJson)
                        );
                    }
                    ctx.batches.custom = batches;
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
        };
    }

    setControls(controls) {
        const list = Array.isArray(controls)
            ? controls : controls?.uniforms;
        if (!Array.isArray(list)) {
            return;
        }

        this._rawControls = list;
        this.batches.auto = UniformBatch.deriveAutoBatches(list);

        this._controlMap = new Map();
        for (const control of list) {
            if (control.separator || !isNumeric(control)) {
                continue;
            }
            this._controlMap.set(control.name, {
                min: control.min,
                max: control.max,
                defaultValue: control.defaultValue,
                type: control.type ?? 'float',
            });
        }
    }

    initUniformValues(state) {
        if (!this._rawControls) {
            return;
        }
        for (const control of this._rawControls) {
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

    toJSON() {
        return this.engine.toJSON();
    }

    resolveRange(entry) {
        const control = this._controlMap?.get(entry.name);
        let min = entry.min ?? control?.min ?? FALLBACK_RANGE.min;
        let max = entry.max ?? control?.max ?? FALLBACK_RANGE.max;

        const components = [control?.defaultValue, min, max]
            .find(Array.isArray)?.length
            ?? null;

        return { min, max, components };
    }
}

// ─── Legacy compat ──────────────────────────────────────────────

let _pg = null;

export function createUniformPlayground(state, controls) {
    if (!_pg) {
        _pg = new PlaygroundContext(state, controls);
    }
    return {
        engine: _pg.engine,
        overlay: _pg.overlay,
        _provider: _pg._provider,
        update: (dt) => _pg.update(dt),
        syncToShader: (gl, state) => _pg.syncToShader(gl, state),
        toggleOverlay: () => _pg.toggleOverlay(),
        getUniformValues: () => _pg.getUniformValues(),
        addTrack: (name) => _pg.addTrack(name),
        removeTrack: (id) => _pg.removeTrack(id),
        resetOverlay: () => _pg.resetOverlay(),
        toJSON: () => _pg.toJSON(),
    };
}
