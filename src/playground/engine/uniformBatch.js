import {isNumeric} from "../../app/controls.js";
import {aggregateIfArray, FALLBACK_RANGE, isRangeValue} from "./valueRanges.js";


export class UniformBatch {
    constructor(name, {id = "", custom = false} = {}) {
        this.id = id || UniformBatch.createId(custom ? 'custom' : 'auto');
        this.name = name;
        this.custom = custom;
        this.uniforms = [];
    }

    addUniform(name = "", {
        min = null,
        max = null,
        active = true,
        factor = undefined,
        type = "",
    } = {}) {
        const entry = {
            name,
            min: isRangeValue(min) ? min : null,
            max: isRangeValue(max) ? max : null,
            active: active !== false,
            factor: 1,
            type,
        };
        try {
            const value = Number(factor);
            if (Number.isFinite(value)) {
                entry.factor = value;
            }
        } finally {
            this.uniforms.push(entry);
        }
        return entry;
    }

    addUniformFrom(control) {
        return this.addUniform(
            control.name, {
                min: aggregateIfArray(
                    control.min, Math.min, FALLBACK_RANGE.min
                ),
                max: aggregateIfArray(
                    control.max, Math.max, FALLBACK_RANGE.max
                ),
                type: control.type
            }
        );
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

    static createId(prefix) {
        return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
    }
}

export function deriveAutoBatches(controls) {
    const batches = [];
    let batch = null;
    for (const control of controls) {
        if (control.separator) {
            batch = new UniformBatch(
                control.separator,
                { id: `auto:${control.separator}` }
            );
            batches.push(batch);
            continue;
        }
        if (!isNumeric(control)) {
            continue;
        }
        if (!batch) {
            batch = new UniformBatch(
                "Any",
                { id: "auto:Any" },
            );
            batches.push(batch);
        }
        batch.addUniformFrom(control);
    }
    return batches.filter(b => b.uniforms.length > 0);
}
