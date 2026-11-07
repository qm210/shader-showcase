/**
 * Timeline Engine — drives uniform values from keyframe tracks.
 *
 * Each track has:
 *   - name (human label)
 *   - targets: [{ uniformName, minValue, maxValue, enabled }]
 *   - keyframes: [{ time, value, transition }]
 *
 * Interpolation supports: 'step', 'linear', 'smoothstep'
 */

// ─── Interpolation helpers ────────────────────────────────────────

function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
}

function smoothstep(a, b, t) {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
}

/**
 * Interpolate between two keyframe values.
 * Handles scalar and vec3 arrays.
 */
function interpolateKeyframes(from, to, t, transition) {
    if (transition === 'step') {
        return from.value; // hold until next keyframe
    }

    const easedT = transition === 'smoothstep' ? smoothstep(0, 1, t) : t;

    if (Array.isArray(from.value)) {
        return from.value.map((v, i) => lerp(v, to.value[i], easedT));
    }
    return lerp(from.value, to.value, easedT);
}

/**
 * Find the two keyframes surrounding a given time within a track.
 */
function findSurroundingKeyframes(keyframes, time) {
    if (keyframes.length === 0) return null;
    if (keyframes.length === 1) return { prev: keyframes[0], next: keyframes[0], t: 0 };

    // Before first keyframe
    if (time <= keyframes[0].time) {
        return { prev: keyframes[0], next: keyframes[1] || keyframes[0], t: 0 };
    }

    // After last keyframe
    if (time >= keyframes[keyframes.length - 1].time) {
        const last = keyframes[keyframes.length - 1];
        return { prev: keyframes[keyframes.length - 2], next: last, t: 1 };
    }

    // Between keyframes
    for (let i = 0; i < keyframes.length - 1; i++) {
        if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
            const dur = keyframes[i + 1].time - keyframes[i].time || 0.001;
            return { prev: keyframes[i], next: keyframes[i + 1], t: (time - keyframes[i].time) / dur };
        }
    }

    return { prev: keyframes[keyframes.length - 2], next: keyframes[keyframes.length - 1], t: 1 };
}

// ─── Track class ──────────────────────────────────────────────────

export class TimelineTrack {
    constructor(name) {
        this.id = 'track_' + Math.random().toString(36).substr(2, 9);
        this.name = name;
        // List of target uniforms this track drives
        this.targets = []; // [{ uniformName, minValue, maxValue, enabled }]
        this.keyframes = []; // [{ time, value, transition }]
        this.loop = false;
        this.duration = 0;

        // Recompute duration from keyframes
        this.updateDuration();
    }

    updateDuration() {
        if (this.keyframes.length === 0) {
            this.duration = 0;
            return;
        }
        this.duration = Math.max(...this.keyframes.map(k => k.time));
    }

    /** Add a target uniform to this track */
    addTarget(uniformName, minValue = -1, maxValue = 1) {
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

    /** Remove a target by uniform name */
    removeTarget(uniformName) {
        this.targets = this.targets.filter(t => t.uniformName !== uniformName);
    }

    /** Add a keyframe at the given time with the given value */
    addKeyframe(time, value, transition = 'linear') {
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

        const kf = { time, value: clampedValue, transition };
        // Insert sorted by time
        let inserted = false;
        for (let i = 0; i < this.keyframes.length; i++) {
            if (kf.time < this.keyframes[i].time) {
                this.keyframes.splice(i, 0, kf);
                inserted = true;
                break;
            }
        }
        if (!inserted) this.keyframes.push(kf);

        this.updateDuration();
        return kf;
    }

    /** Remove a keyframe at the given time (with tolerance) */
    removeKeyframe(time, tolerance = 0.01) {
        this.keyframes = this.keyframes.filter(k => Math.abs(k.time - time) > tolerance);
        this.updateDuration();
    }

    /** Get interpolated value for a specific target uniform at current time */
    getTargetValue(uniformName, currentTime) {
        const target = this.targets.find(t => t.uniformName === uniformName);
        if (!target || !target.enabled || this.keyframes.length === 0) return null;

        const surrounding = findSurroundingKeyframes(this.keyframes, currentTime);
        if (!surrounding) return target.minValue;

        const rawValue = interpolateKeyframes(surrounding.prev, surrounding.next, surrounding.t,
            surrounding.prev.transition);

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
        track.id = json.id;
        track.targets = json.targets || [];
        track.keyframes = json.keyframes || [];
        track.loop = json.loop || false;
        track.updateDuration();
        return track;
    }
}

// ─── Timeline Engine class ────────────────────────────────────────

export class TimelineEngine {
    constructor() {
        this.tracks = new Map(); // id -> TimelineTrack
        this.currentTime = 0;
        this.playing = false;
        this.speed = 1.0;
        this.baseTime = 0; // offset for shader iTime sync
        this.onUpdate = null; // callback: (engine) => void, called every frame
    }

    /** Add a track by name */
    addTrack(name) {
        const track = new TimelineTrack(name);
        this.tracks.set(track.id, track);
        return track;
    }

    /** Remove a track by id */
    removeTrack(id) {
        this.tracks.delete(id);
    }

    /** Get a track by id */
    getTrack(id) {
        return this.tracks.get(id);
    }

    /** Get all tracks as an array */
    getAllTracks() {
        return Array.from(this.tracks.values());
    }

    /** Update engine time by delta seconds */
    update(dt) {
        if (!this.playing) return;
        this.currentTime += dt * this.speed;

        // Auto-loop tracks that exceed their duration
        for (const track of this.tracks.values()) {
            if (track.loop && track.duration > 0 && this.currentTime > track.duration) {
                this.currentTime -= track.duration;
            }
        }

        if (this.onUpdate) this.onUpdate(this);
    }

    /** Get all uniform values across all tracks at current time */
    getUniformValues() {
        const result = {};
        for (const track of this.tracks.values()) {
            const vals = track.getAllValues(this.currentTime);
            Object.assign(result, vals);
        }
        return result;
    }

    /** Set a single uniform value directly (bypasses timeline) */
    setUniformValue(uniformName, value) {
        // Store in a special "override" map
        if (!this._overrides) this._overrides = {};
        this._overrides[uniformName] = value;
    }

    /** Get all uniform values including overrides */
    getAllUniformValues() {
        const result = this.getUniformValues();
        if (this._overrides) {
            Object.assign(result, this._overrides);
        }
        return result;
    }

    /** Clear manual overrides */
    clearOverrides() {
        this._overrides = {};
    }

    /** Serialize entire timeline to JSON */
    toJSON() {
        const tracks = [];
        for (const track of this.tracks.values()) {
            tracks.push(track.toJSON());
        }
        return {
            currentTime: this.currentTime,
            playing: this.playing,
            speed: this.speed,
            baseTime: this.baseTime,
            tracks,
        };
    }

    /** Deserialize timeline from JSON */
    static fromJSON(json) {
        const engine = new TimelineEngine();
        engine.currentTime = json.currentTime || 0;
        engine.playing = json.playing || false;
        engine.speed = json.speed || 1.0;
        engine.baseTime = json.baseTime || 0;
        for (const trackJson of json.tracks) {
            const track = TimelineTrack.fromJSON(trackJson);
            engine.tracks.set(track.id, track);
        }
        return engine;
    }
}
