import {createKeyframeId, findSurroundingKeyframes, interpolateKeyframes} from "./keyframes.js";
import {MIN_TIME_STEP} from "./timeZoom.js";
import {FALLBACK_RANGE} from "./valueRanges.js";

const MAX_UNDO_STEPS = 50;

export class TimeLane {
    constructor(name) {
        this.id = TimeLane.createId();
        this.name = name;
        this.targets = [];
        this.keyframes = [];
        this.range = {...FALLBACK_RANGE};
        this.loop = false;
        this.duration = 0;
        this._undoStack = [];
        this.updateDuration();
    }

    static createId() {
        return "lane_" + Math.random().toString(36).slice(2, 11);
    }

    updateDuration() {
        if (this.keyframes.length === 0) {
            this.duration = 0;
            return;
        }
        this.duration = Math.max(
            ...this.keyframes.map(k => k.time)
        );
    }

    addTarget(uniformName, control = null) {
        const min = control?.min ?? FALLBACK_RANGE.min;
        const max = control?.max ?? FALLBACK_RANGE.max;
        const existing = this.targets.find(t =>
            t.uniformName === uniformName
        );
        if (existing) {
            existing.min = min;
            existing.max = max;
            existing.enabled = true;
            return existing;
        }
        const target = {
            uniformName, min, max, enabled: true
        };
        this.targets.push(target);
        this.initRangeFromFirstControl();
        return target;
    }

    removeTarget(uniformName) {
        this.targets = this.targets.filter(t =>
            t.uniformName !== uniformName
        );
    }

    createKeyframe(time, value, ease = "linear") {
        return {
            id: createKeyframeId(),
            time, value, ease
        };
    }

    addKeyframe(time, value, ease = "linear") {
        const kf = this.createKeyframe(time, value, ease);
        // Insert sorted by time
        let inserted = false;
        for (let i = 0; i < this.keyframes.length; i++) {
            if (kf.time < this.keyframes[i].time) {
                this.keyframes.splice(i, 0, kf);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            this.keyframes.push(kf);
        }
        this._pushUndo({ type: "add", keyframes: [kf] });
        this.updateDuration();
        return kf;
    }

    removeKeyframe(time, tolerance = MIN_TIME_STEP) {
        const removed = [];
        this.keyframes = this.keyframes.filter(k => {
            if (Math.abs(k.time - time) <= tolerance) {
                removed.push(k);
                return false;
            }
            return true;
        });
        if (removed.length) {
            this._pushUndo({ type: "remove", keyframes: removed });
        }
        this.updateDuration();
    }

    findKeyframe(kfId) {
        return this.keyframes.find(k => k.id === kfId);
    }

    undo() {
        const entry = this._undoStack.pop();
        if (!entry) return false;
        if (entry.type === "add") {
            for (const kf of entry.keyframes) {
                this.keyframes = this.keyframes.filter(
                    k => Math.abs(k.time - kf.time) > MIN_TIME_STEP
                );
            }
        } else if (entry.type === "remove") {
            for (const kf of entry.keyframes) {
                let reinserted = false;
                for (let i = 0; i < this.keyframes.length; i++) {
                    if (kf.time < this.keyframes[i].time) {
                        this.keyframes.splice(i, 0, kf);
                        reinserted = true;
                        break;
                    }
                }
                if (!reinserted) this.keyframes.push(kf);
            }
        } else if (entry.type === "edit") {
            for (const { index, prev } of entry.keyframes) {
                if (this.keyframes[index]) {
                    this.keyframes[index] = prev;
                }
            }
        }
        this.updateDuration();
        return true;
    }

    _pushUndo(entry) {
        this._undoStack.push(entry);
        if (this._undoStack.length > MAX_UNDO_STEPS) {
            this._undoStack.shift();
        }
    }

    mapToRange(value) {
        const span = this.range.max - this.range.min;
        return this.range.min + (value + 1) * span / 2;
    }

    mapFromRange(value) {
        const span = this.range.max - this.range.min;
        return span === 0 ? 0 : 2 * (value - this.range.min) / span - 1;
    }

    initRangeFromFirstControl() {
        const control = this.targets.find(t => t.enabled);
        if (!control) {
            this.range = {...FALLBACK_RANGE};
        } else {
            this.range = {
                min: control.min,
                max: control.max
            };
        }
    }

    /** Get interpolated value for a specific target uniform at current time */
    getTargetValue(uniformName, currentTime) {
        const target = this.targets.find(t => t.uniformName === uniformName);
        if (!target || !target.enabled || this.keyframes.length === 0) {
            return null;
        }

        const surrounding = findSurroundingKeyframes(this.keyframes, currentTime);
        if (!surrounding) {
            return this.mapToRange(-1, target);
        }

        const rawValue = interpolateKeyframes(surrounding.prev, surrounding.next, surrounding.t,
            surrounding.prev.ease);

        if (Array.isArray(rawValue)) {
            return rawValue.map((v, i) => {
                const t = this.targets[i];
                return t ? this.mapToRange(v, t) : v;
            });
        }
        return this.mapToRange(rawValue, target);
    }

    getAllValues(currentTime) {
        const result = {};
        for (const target of this.targets) {
            if (!target.enabled) continue;
            const val = this.getTargetValue(target.uniformName, currentTime);
            if (val !== null) result[target.uniformName] = val;
        }
        return result;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            targets: this.targets,
            keyframes: this.keyframes,
            loop: this.loop,
            range: this.range,
            duration: this.duration,
        };
    }

    static fromJSON(json) {
        const lane = new TimeLane(json.name);
        lane.id = json.id ?? lane.id;
        lane.targets = json.targets ?? lane.targets;
        lane.keyframes = json.keyframes ?? lane.keyframes;
        for (const kf of lane.keyframes) {
            kf.id ??= createKeyframeId();
        }
        lane.loop = json.loop ?? lane.loop;
        lane.range = json.range ?? lane.range;
        lane.updateDuration();
        return lane;
    }
}

