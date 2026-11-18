import {isRangeValue} from "./valueRanges.js";
import {isNumeric} from "../../app/controls.js";

export const TARGET_PREFIX = {
    UNIFORM: "uniform",
    BATCH: "batch",
    AUTO_BATCH: "auto",
};

const TARGET_PREFIXES = Object.values(TARGET_PREFIX);

export const targetId = (prefix, name) => {
    const id = `${prefix}:${name}`;
    if (!TARGET_PREFIXES.includes(prefix)) {
        console.warn(`Invalid Target Prefix for ID "${id}"`);
    }
    return id;
};


export class BatchTarget {
    constructor(name, {id = "", custom = false} = {}) {
        const prefix = custom ? TARGET_PREFIX.BATCH : TARGET_PREFIX.AUTO_BATCH;
        this.id = id || BatchTarget.createId(prefix);
        this.name = name;
        this.custom = custom;
        this.uniforms = [];
        this.containsAll = false;
    }

    static newAuto(name) {
        const id = targetId(TARGET_PREFIX.AUTO_BATCH, name);
        return new BatchTarget(name, {id});
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
            control.name,{
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
        const batch = new BatchTarget(
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
    const allUniforms = [];
    let batch = null;
    for (const control of controls) {
        if (control.separator) {
            if (batch) {
                batches.push(batch);
            }
            batch = BatchTarget.newAuto(control.separator);
            continue;
        }
        if (!isNumeric(control)) {
            continue;
        }
        allUniforms.push(control);
        if (!batch) {
            batch = BatchTarget.newAuto("Any");
        }
        batch.addUniformFrom(control);
    }
    if (batch) {
        batches.push(batch);
    }
    if (allUniforms.length > 0) {
        const allBatch = BatchTarget.newAuto("All Uniforms");
        allBatch.containsAll = true;
        for (const control of allUniforms) {
            allBatch.addUniformFrom(control);
        }
        batches.unshift(allBatch);
    }
    return batches;
}

export function groupUniforms(autoBatches) {
    const groups = new Map();
    for (const batch of autoBatches) {
        if (!batch.uniforms.length) {
            continue;
        }
        if (batch.containsAll && autoBatches.length > 1) {
            continue;
        }
        const entries = groups.get(batch.name) ?? [];
        entries.push(...batch.uniforms);
        groups.set(batch.name, entries);
    }
    return groups;
}
