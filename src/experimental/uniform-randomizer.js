/**
 * Uniform Randomizer — defines uniform sets and randomizes their values
 * with intensity control.
 *
 * There are two kinds of sets:
 *   - Auto sets are derived from the control definitions (one per separator)
 *     and are rebuilt whenever the controls are set. They are not persisted.
 *   - Custom sets are created in the overlay ("+ Set" / "+ Uniform").
 *     Each entry may overwrite the min and max values of its control.
 *     Persistence is handled by the overlay via toJSON() / loadJSON().
 *
 * A uniform entry is { name, min, max }, where min/max are either
 * null (use the control's range), a number, or an array (per component).
 */

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

export class UniformSet {
    constructor(name, { id = null, custom = false } = {}) {
        this.id = id ?? createId(custom ? 'custom' : 'auto');
        this.name = name;
        this.custom = custom;
        this.uniforms = []; // [{ name, min, max }]
    }

    addUniform(name = '', min = null, max = null) {
        const entry = { name, min, max };
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

    removeUniform(index) {
        this.uniforms.splice(index, 1);
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            uniforms: this.uniforms.map(({ name, min, max }) => ({ name, min, max })),
        };
    }

    static fromJSON(json) {
        const set = new UniformSet(String(json.name ?? 'Set'), {
            id: json.id ?? null,
            custom: true,
        });
        for (const entry of json.uniforms ?? []) {
            set.addUniform(
                String(entry.name ?? ''),
                isRangeValue(entry.min) ? entry.min : null,
                isRangeValue(entry.max) ? entry.max : null,
            );
        }
        return set;
    }
}

export class UniformRandomizer {
    constructor() {
        this.controls = new Map(); // uniform name -> { min, max, defaultValue }
        this.autoSets = [];
        this.customSets = [];
    }

    /**
     * Rebuild the control lookup and the auto sets from the control definitions.
     * Custom sets are kept.
     * @param {Array|{uniforms: Array}} controls
     */
    setControls(controls) {
        const list = Array.isArray(controls) ? controls : controls?.uniforms;
        if (!Array.isArray(list)) {
            return;
        }

        this.controls.clear();
        this.autoSets = [];
        let currentSet = null;

        for (const control of list) {
            if (control.separator) {
                currentSet = new UniformSet(control.separator, { id: `auto:${control.separator}` });
                this.autoSets.push(currentSet);
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
            });
            if (!currentSet) {
                currentSet = new UniformSet('General', { id: 'auto:General' });
                this.autoSets.push(currentSet);
            }
            currentSet.addUniform(control.name);
        }

        // Separators without any numeric uniform are not useful for randomizing.
        this.autoSets = this.autoSets.filter(set => set.uniforms.length > 0);
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
        };
    }

    addSet(name) {
        const set = new UniformSet(name, { custom: true });
        this.customSets.push(set);
        return set;
    }

    removeSet(id) {
        this.customSets = this.customSets.filter(set => set.id !== id);
    }

    getSet(id) {
        return this.getAllSets().find(set => set.id === id);
    }

    getAllSets() {
        return [...this.customSets, ...this.autoSets];
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

    /** Random values for a set, keyed by uniform name. */
    getSetRandomValues(id, intensity) {
        const set = this.getSet(id);
        const result = {};
        if (!set) {
            return result;
        }

        for (const entry of set.uniforms) {
            if (!entry.name) {
                continue;
            }
            const { min, max, components } = this.resolveRange(entry);
            result[entry.name] = components === null
                ? randomBetween(componentOf(min, 0), componentOf(max, 0), intensity)
                : Array.from({ length: components }, (_, i) =>
                    randomBetween(componentOf(min, i), componentOf(max, i), intensity));
        }
        return result;
    }

    /**
     * Randomize uniforms in a set and apply them to the engine as overrides.
     * @param {string} id
     * @param {number} intensity 0..1
     * @param {TimelineEngine} engine
     */
    randomizeSet(id, intensity, engine) {
        const values = this.getSetRandomValues(id, intensity);
        for (const [name, value] of Object.entries(values)) {
            engine.setUniformValue(name, value);
        }
        return values;
    }

    /** Only custom sets are persisted; auto sets come from the controls. */
    toJSON() {
        return this.customSets.map(set => set.toJSON());
    }

    loadJSON(json) {
        this.customSets = Array.isArray(json)
            ? json.map(setJson => UniformSet.fromJSON(setJson))
            : [];
    }

    clearCustomSets() {
        this.customSets = [];
    }
}

// Singleton instance
let _randomizer = null;

export function getUniformRandomizer(controls) {
    if (!_randomizer) {
        _randomizer = new UniformRandomizer();
    }
    if (controls) {
        _randomizer.setControls(controls);
    }
    return _randomizer;
}

export { isRangeValue };
