import {findSurroundingKeyframes, interpolateKeyframes} from "./keyframes.js";
import {MIN_TIME_STEP} from "./timeZoom.js";
import {FALLBACK_RANGE} from "./valueRanges.js";

/**
 *  TODO: think ~ should the keyframeKey come from the index?
 *              ~ can the index change when dragged? hmhmhmmmm...
 */
export function keyframeKey(trackId, kfIndex) {
    return `${trackId}:${kfIndex}`;
}

const MAX_UNDO_STEPS = 50;

export class TimelineTrack {
    constructor(name) {
        this.id = 'track_' + Math.random().toString(36).substr(2, 9);
        this.name = name;
        this.targets = [];
        this.keyframes = [];
        this.loop = false;
        this.duration = 0;
        this._undoStack = [];
        this.updateDuration();
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

    addTarget(uniformName, minValue = undefined, maxValue = undefined) {
        minValue ??= FALLBACK_RANGE.min;
        maxValue ??= FALLBACK_RANGE.max;
        const existing = this.targets.find(t => t.uniformName === uniformName);
        if (existing) {
            existing.minValue = minValue;
            existing.maxValue = maxValue;
            existing.enabled = true;
            return existing;
        }
        const target = { uniformName, minValue, maxValue, enabled: true };
        this.targets.push(target);
        return target;
    }

    removeTarget(uniformName) {
        this.targets = this.targets.filter(t => t.uniformName !== uniformName);
    }

    addKeyframe(time, value, ease = 'linear') {
        // Clamp value to target ranges if possible
        const clampedValue = Array.isArray(value)
            ? value.map((v, i) => {
                const target = this.targets[i];
                if (target && target.enabled) {
                    return Math.max(target.minValue, Math.min(target.maxValue, v));
                }
                return v;
            })
            : this.targets[0]?.enabled
                ? Math.max(this.targets[0].minValue, Math.min(this.targets[0].maxValue, value))
                : value;

        const kf = { time, value: clampedValue, ease };
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

        this._pushUndo({ type: 'add', keyframes: [kf] });
        this.updateDuration();
        return kf;
    }

    /** Remove a keyframe at the given time (with tolerance) */
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
            this._pushUndo({ type: 'remove', keyframes: removed });
        }
        this.updateDuration();
    }

    /** Undo the last action on this track. Returns true if something was undone. */
    undo() {
        const entry = this._undoStack.pop();
        if (!entry) return false;
        if (entry.type === 'add') {
            // Remove the added keyframe(s)
            for (const kf of entry.keyframes) {
                this.keyframes = this.keyframes.filter(
                    k => Math.abs(k.time - kf.time) > MIN_TIME_STEP
                );
            }
        } else if (entry.type === 'remove') {
            // Re-insert the removed keyframe(s)
            for (const kf of entry.keyframes) {
                let inserted = false;
                for (let i = 0; i < this.keyframes.length; i++) {
                    if (kf.time < this.keyframes[i].time) {
                        this.keyframes.splice(i, 0, kf);
                        inserted = true;
                        break;
                    }
                }
                if (!inserted) this.keyframes.push(kf);
            }
        } else if (entry.type === 'edit') {
            // Restore previous keyframe state
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

    /** Get interpolated value for a specific target uniform at current time */
    getTargetValue(uniformName, currentTime) {
        const target = this.targets.find(t => t.uniformName === uniformName);
        if (!target || !target.enabled || this.keyframes.length === 0) return null;

        const surrounding = findSurroundingKeyframes(this.keyframes, currentTime);
        if (!surrounding) return target.minValue;

        const rawValue = interpolateKeyframes(surrounding.prev, surrounding.next, surrounding.t,
            surrounding.prev.ease);

        // Clamp to target range
        if (Array.isArray(rawValue)) {
            return rawValue.map((v, i) => Math.max(target.minValue, Math.min(target.maxValue, v)));
        }
        return Math.max(target.minValue, Math.min(target.maxValue, rawValue));
    }

    /** Get all target values at current time as a map */
    getAllValues(currentTime) {
        const result = {};
        for (const target of this.targets) {
            if (!target.enabled) continue;
            const val = this.getTargetValue(target.uniformName, currentTime);
            if (val !== null) result[target.uniformName] = val;
        }
        return result;
    }

    /** Serialize to JSON */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            targets: this.targets,
            keyframes: this.keyframes,
            loop: this.loop,
        };
    }

    /** Deserialize from JSON */
    static fromJSON(json) {
        const track = new TimelineTrack(json.name);
        track.id = json.id ?? track.id;
        track.targets = json.targets || [];
        track.keyframes = json.keyframes || [];
        track.loop = json.loop || false;
        track.updateDuration();
        return track;
    }
}

export function parseKeyframeKey(key) {
    const sep = key.lastIndexOf(':');
    return {
        trackId: key.slice(0, sep),
        kfIndex: parseInt(key.slice(sep + 1), 10),
    };
}
