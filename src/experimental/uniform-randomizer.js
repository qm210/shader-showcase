/**
 * Uniform Randomizer — experimental module for defining uniform sets
 * and randomizing their values with intensity control.
 */

export class UniformSet {
    constructor(name) {
        this.name = name;
        this.uniforms = []; // [{ name, min, max }]
    }

    addUniform(name, min = -1, max = 1) {
        const existing = this.uniforms.find(u => u.name === name);
        if (existing) {
            existing.min = min;
            existing.max = max;
        } else {
            this.uniforms.push({ name, min, max });
        }
    }

    removeUniform(name) {
        this.uniforms = this.uniforms.filter(u => u.name !== name);
    }

    toJSON() {
        return {
            name: this.name,
            uniforms: this.uniforms,
        };
    }

    static fromJSON(json) {
        const set = new UniformSet(json.name);
        set.uniforms = json.uniforms || [];
        return set;
    }
}

export class UniformRandomizer {
    constructor() {
        this.sets = new Map(); // name -> UniformSet
        this.defaultSets = [
            {
                name: 'Wall Colors',
                uniforms: [
                    { name: 'uColPlaster', min: 0, max: 1 },
                    { name: 'uColFrame', min: 0, max: 1 },
                    { name: 'uColMullion', min: 0, max: 1 },
                    { name: 'uColSill', min: 0, max: 1 },
                    { name: 'uColPlinth', min: 0, max: 1 },
                    { name: 'uColCornice', min: 0, max: 1 },
                    { name: 'uColGlassLo', min: 0, max: 1 },
                    { name: 'uColGlassHi', min: 0, max: 1 },
                    { name: 'uColLitLo', min: 0, max: 1 },
                    { name: 'uColLitHi', min: 0, max: 1 },
                ],
            },
            {
                name: 'Layout Dimensions',
                uniforms: [
                    { name: 'uLayoutNCols', min: 0, max: 20 },
                    { name: 'uLayoutNRows', min: 0, max: 10 },
                    { name: 'uLayoutPanesX', min: 0, max: 8 },
                    { name: 'uLayoutPanesY', min: 0, max: 12 },
                    { name: 'uLayoutGapBottomMid', min: 0, max: 2 },
                    { name: 'uLayoutGapMidTop', min: 0, max: 2 },
                    { name: 'uLayoutMarginX', min: 0, max: 5 },
                    { name: 'uLayoutMarginY', min: 0, max: 5 },
                    { name: 'uLayoutBlockShiftY', min: -1, max: 1 },
                    { name: 'uLayoutFrameW', min: 0, max: 0.5 },
                    { name: 'uLayoutMullionW', min: 0, max: 0.2 },
                    { name: 'uLayoutSillH', min: 0, max: 0.5 },
                    { name: 'uLayoutSillOverhang', min: 0, max: 0.5 },
                    { name: 'uLayoutPlinthH', min: 0, max: 2 },
                    { name: 'uLayoutCorniceH', min: 0, max: 2 },
                    { name: 'uLayoutWrapSmooth', min: 0, max: 1 },
                ],
            },
        ];

        // Load from localStorage or use defaults
        const saved = localStorage.getItem('uniform-randomizer-sets');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                for (const setJson of parsed) {
                    this.sets.set(setJson.name, UniformSet.fromJSON(setJson));
                }
            } catch (e) {
                console.warn('Failed to load randomizer sets from localStorage:', e);
                this._initDefaults();
            }
        } else {
            this._initDefaults();
        }
    }

    _initDefaults() {
        for (const def of this.defaultSets) {
            const set = new UniformSet(def.name);
            set.uniforms = def.uniforms;
            this.sets.set(def.name, set);
        }
    }

    addSet(name, uniforms) {
        const set = new UniformSet(name);
        for (const u of uniforms) {
            set.addUniform(u.name, u.min, u.max);
        }
        this.sets.set(name, set);
        this.saveSets();
        return set;
    }

    removeSet(name) {
        this.sets.delete(name);
        this.saveSets();
    }

    getSet(name) {
        return this.sets.get(name);
    }

    getAllSets() {
        return Array.from(this.sets.entries());
    }

    /**
     * Randomize uniforms in a set and apply to engine.
     * @param {string} setName
     * @param {number} intensity 0..1
     * @param {TimelineEngine} engine
     */
    randomizeSet(setName, intensity, engine) {
        const set = this.sets.get(setName);
        if (!set) return;

        for (const uniform of set.uniforms) {
            // Calculate random value within range, scaled by intensity
            const range = uniform.max - uniform.min;
            const randomOffset = Math.random() * range * intensity;
            const value = uniform.min + randomOffset;

            // Apply to engine (overrides current timeline value for this frame)
            engine.setUniformValue(uniform.name, value);
        }
    }

    /**
     * Get randomized values for a set without applying to engine.
     */
    getSetRandomValues(setName, intensity) {
        const set = this.sets.get(setName);
        if (!set) return {};

        const result = {};
        for (const uniform of set.uniforms) {
            const range = uniform.max - uniform.min;
            const randomOffset = Math.random() * range * intensity;
            result[uniform.name] = uniform.min + randomOffset;
        }
        return result;
    }

    saveSets() {
        const data = Array.from(this.sets.entries()).map(([name, set]) => set.toJSON());
        localStorage.setItem('uniform-randomizer-sets', JSON.stringify(data));
    }
}

// Singleton instance
let _randomizer = null;

export function getUniformRandomizer() {
    if (!_randomizer) {
        _randomizer = new UniformRandomizer();
    }
    return _randomizer;
}
