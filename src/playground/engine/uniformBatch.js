import {isNumeric} from "../../app/controls.js";
import {isRangeValue} from "./valueRanges.js";


export class UniformBatch {
    constructor(name, {id = "", custom = false} = {}) {
        this.id = id || createId(custom ? 'custom' : 'auto');
        this.name = name;
        this.custom = custom;
        this.uniforms = [];
    }

    addUniform(name = '', {
        min = null,
        max = null,
        active = true,
        factor = undefined
    } = {}) {
        const entry = {
            name,
            min: isRangeValue(min) ? min : null,
            max: isRangeValue(max) ? max : null,
            active: active !== false,
            factor: 1
        };
        try {
            entry.factor = Number(factor);
        } finally {
            this.uniforms.push(entry);
        }
        return entry;
    }

    updateUniform(index, patch) {
        const entry = this.uniforms[index];
        if (entry) {
            Object.assign(entry, patch);
        }
        return entry;
    }

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

    removeUniform(index) {
        this.uniforms.splice(index, 1);
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            uniforms: this.uniforms.map(({name, factor, min, max, active}) => ({
                name, factor, min, max, active
            })),
        };
    }

    static fromJSON(json) {
        const name = String(json.name ?? "Batch");
        const batch = new UniformBatch(
            name, {
                id: json.id ?? null,
                custom: true,
            }
        );
        for (const entry of json.uniforms ?? []) {
            batch.addUniform(
                String(entry.name ?? ""),
                entry
            );
        }
        return batch;
    }

    static deriveAutoBatches(controls) {
        const batches = [];
        let currentBatch = null;
        for (const control of controls) {
            if (control.separator) {
                currentBatch = new UniformBatch(
                    control.separator,
                    { id: `auto:${control.separator}` }
                );
                batches.push(currentBatch);
                continue;
            }
            if (!isNumeric(control)) {
                continue;
            }
            if (!currentBatch) {
                currentBatch = new UniformBatch(
                    "Any",
                    { id: "auto:Any" },
                );
                batches.push(currentBatch);
            }
            currentBatch.addUniform(control.name);
        }
        return batches.filter(b => b.uniforms.length > 0);
    }
}

function createId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}
