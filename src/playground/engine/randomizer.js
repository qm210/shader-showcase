const FALLBACK_MIN = -1;
const FALLBACK_MAX = 1;

function createId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

function isRangeValue(value) {
    return typeof value === 'number' && Number.isFinite(value)
        || Array.isArray(value) && value.length > 0 && value.every(Number.isFinite);
}

function componentOf(value, index) {
    return Array.isArray(value) ? (value[index] ?? value[0]) : value;
}

function randomBetween(min, max, intensity) {
    return min + Math.random() * (max - min) * intensity;
}

export class UniformBatch {
    constructor(name, { id = null, custom = false } = {}) {
        this.id = id ?? createId(custom ? 'custom' : 'auto');
        this.name = name;
        this.custom = custom;
        this.uniforms = []; // [{ name, min, max }]
    }

    addUniform(name = '', min = null, max = null, active = true) {
        const entry = { name, factor: 1, min, max, active };
        this.uniforms.push(entry);
        return entry;
    }

    updateUniform(index, patch) {
        const entry = this.uniforms[index];
        if (entry) {
            Object.assign(entry, patch);
        }
        return entry;
    }

    /** Toggle a uniform's active state in this batch. Returns the entry or null. */
    toggleUniform(name, active) {
        const existing = this.uniforms.find(u => u.name === name);
        if (existing) {
            existing.active = active;
            return existing;
        }
        if (active) {
            return this.addUniform(name);
        }
        return null;
    }

    /** Remove a uniform from this batch entirely. */
    removeUniform(index) {
        this.uniforms.splice(index, 1);
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            uniforms: this.uniforms.map(({ name, factor, min, max, active }) => ({
                name, factor, min, max, active
            })),
        };
    }

    static fromJSON(json) {
        const batch = new UniformBatch(String(json.name ?? 'Batch'), {
            id: json.id ?? null,
            custom: true,
        });
        for (const entry of json.uniforms ?? []) {
            batch.addUniform(
                String(entry.name ?? ''),
                isRangeValue(entry.min) ? entry.min : null,
                isRangeValue(entry.max) ? entry.max : null,
                entry.active != null ? entry.active : true,
            );
            if (entry.factor != null) {
                batch.uniforms[batch.uniforms.length - 1].factor = Number(entry.factor);
            }
        }
        return batch;
    }
}

export class Randomizer {
    constructor() {
        this.controls = new Map(); // uniform name -> { min, max, defaultValue }
        this.autoBatches = [];
        this.customBatches = [];
    }

    /**
     * Rebuild the control lookup and the auto batches from the control definitions.
     * Custom batches are kept.
     * @param {Array|{uniforms: Array}} controls
     */
    setControls(controls) {
        const list = Array.isArray(controls) ? controls : controls?.uniforms;
        if (!Array.isArray(list)) {
            return;
        }

        this.controls.clear();
        this.autoBatches = [];
        let currentBatch = null;

        for (const control of list) {
            if (control.separator) {
                currentBatch = new UniformBatch(control.separator, { id: `auto:${control.separator}` });
                this.autoBatches.push(currentBatch);
                continue;
            }
            const isNumeric = control.type && !control.boolean
                && control.min !== undefined && control.max !== undefined;
            if (!isNumeric) {
                continue;
            }
            this.controls.set(control.name, {
                min: control.min,
                max: control.max,
                defaultValue: control.defaultValue,
                type: control.type ?? 'float',
            });
            if (!currentBatch) {
                currentBatch = new UniformBatch('General', { id: 'auto:General' });
                this.autoBatches.push(currentBatch);
            }
            currentBatch.addUniform(control.name);
        }

        // Separators without any numeric uniform are not useful for randomizing.
        this.autoBatches = this.autoBatches.filter(batch => batch.uniforms.length > 0);
    }

    /** Names of all uniforms known from the controls. */
    getKnownUniformNames() {
        return Array.from(this.controls.keys());
    }

    getControlRange(uniformName) {
        const control = this.controls.get(uniformName);
        return {
            min: control?.min ?? FALLBACK_MIN,
            max: control?.max ?? FALLBACK_MAX,
            type: control?.type ?? 'float',
        };
    }

    getControlType(uniformName) {
        const control = this.controls.get(uniformName);
        return control?.type ?? 'float';
    }

    addBatch(name) {
        const batch = new UniformBatch(name, { custom: true });
        this.customBatches.push(batch);
        return batch;
    }

    removeBatch(id) {
        this.customBatches = this.customBatches.filter(batch => batch.id !== id);
    }

    getBatch(id) {
        return this.getAllBatches().find(batch => batch.id === id);
    }

    getAllBatches() {
        return [...this.customBatches, ...this.autoBatches];
    }

    /** Resolve the effective range of an entry: overwrite → control → fallback. */
    resolveRange(entry) {
        const control = this.controls.get(entry.name);
        const min = entry.min ?? control?.min ?? FALLBACK_MIN;
        const max = entry.max ?? control?.max ?? FALLBACK_MAX;

        const components = [control?.defaultValue, min, max]
            .find(Array.isArray)?.length ?? null;

        return { min, max, components };
    }

    /** Random values for a batch, keyed by uniform name. */
    getBatchRandomValues(id, intensity) {
        const batch = this.getBatch(id);
        const result = {};
        if (!batch) {
            return result;
        }

        for (const entry of batch.uniforms) {
            if (!entry.name || entry.active === false) {
                continue;
            }
            const { min, max, components } = this.resolveRange(entry);
            const factor = entry.factor ?? 1;
            result[entry.name] = components === null
                ? randomBetween(componentOf(min, 0), componentOf(max, 0), intensity) * factor
                : Array.from({ length: components }, (_, i) =>
                    randomBetween(componentOf(min, i), componentOf(max, i), intensity) * factor);
        }
        return result;
    }

    /**
     * Randomize uniforms in a batch and apply them to the engine as overrides.
     * @param {string} id
     * @param {number} intensity 0..1
     * @param {TimelineEngine} engine
     */
    randomizeBatch(id, intensity, engine) {
        const values = this.getBatchRandomValues(id, intensity);
        for (const [name, value] of Object.entries(values)) {
            engine.setUniformValue(name, value);
        }
        return values;
    }

    /** Only custom batches are persisted; auto batches come from the controls. */
    toJSON() {
        return this.customBatches.map(batch => batch.toJSON());
    }

    loadJSON(json) {
        this.customBatches = Array.isArray(json)
            ? json.map(batchJson => UniformBatch.fromJSON(batchJson))
            : [];
    }

    clearCustomBatches() {
        this.customBatches = [];
    }
}

// Singleton instance
let _randomizer = null;

export function getUniformRandomizer(controls) {
    if (!_randomizer) {
        _randomizer = new Randomizer();
    }
    if (controls) {
        _randomizer.setControls(controls);
    }
    return _randomizer;
}

export { isRangeValue };
