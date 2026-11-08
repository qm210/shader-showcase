import {findSurroundingKeyframes, interpolateKeyframes} from "./keyframes.js";

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
        track.id = json.id ?? track.id;
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
        this._overrides = {};
    }

    reset() {
        this.tracks.clear();
        this.currentTime = 0;
        this.playing = false;
        this.speed = 1.0;
        this.baseTime = 0;
        this._overrides = {};
    }

    addTrack(name) {
        const track = new TimelineTrack(name);
        this.tracks.set(track.id, track);
        return track;
    }

    removeTrack(id) {
        this.tracks.delete(id);
    }

    getTrack(id) {
        return this.tracks.get(id);
    }

    getAllTracks() {
        return Array.from(this.tracks.values());
    }

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

    getUniformValues() {
        const result = {};
        for (const track of this.tracks.values()) {
            const vals = track.getAllValues(this.currentTime);
            Object.assign(result, vals);
        }
        return result;
    }

    setUniformValue(uniformName, value) {
        this._overrides[uniformName] = value;
    }

    getOverrides() {
        return { ...this._overrides };
    }

    getAllUniformValues() {
        return Object.assign(this.getUniformValues(), this._overrides);
    }

    clearOverrides() {
        this._overrides = {};
    }

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

    loadJSON(json) {
        this.reset();
        this.currentTime = Number(json?.currentTime) || 0;
        this.playing = Boolean(json?.playing);
        this.speed = Number(json?.speed) || 1.0;
        this.baseTime = Number(json?.baseTime) || 0;
        for (const trackJson of json?.tracks ?? []) {
            const track = TimelineTrack.fromJSON(trackJson);
            this.tracks.set(track.id, track);
        }
        return this;
    }

    static fromJSON(json) {
        return new TimelineEngine().loadJSON(json);
    }
}
