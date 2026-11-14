import {TimelineTrack} from "./timeline.js";

const LATEST_SNAPSHOT_KEY = "_LATEST_";

export class PlaygroundEngine {
    constructor(mainState, mainElements) {
        this._mainState = mainState;
        this._mainElements = mainElements;
        this.snapshots = new Map();
        this.loadCurrentSnapshot();
        this.tracks = new Map();
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

    getActualUniformValue(name) {
        return this._mainState.uni[name];
    }

    getAllTimelineValues() {
        const result = {};
        for (const track of this.tracks.values()) {
            const vals = track.getAllValues(this.currentTime);
            Object.assign(result, vals);
        }
        return result;
    }

    getOverrides() {
        return {...this._overrides};
    }

    getUniformBaseValue(name) {
        return this._overrides[name] ?? this.latestSnapshot[name];
    }

    getUniformBaseValues() {
        const snapshot = this.latestSnapshot;
        if (!snapshot) {
            console.error("[ENGINE] Engine does not know any snapshot!");
        }
        return {
            ...snapshot,
            ...this.getOverrides()
        }
    }

    getCurrentUniformValues() {
        return {
            ...this.getUniformBaseValues(),
            ...this.getAllTimelineValues(),
        }
    }

    setActualUniformValue(name, value) {
        this.setUniformOverride(name, value);
        const elements = this._mainElementsForUniform(name);
        return elements.updateValue(value);
    }

    _mainElementsForUniform(name) {
        return this._mainElements.uniforms[name];
    }

    setUniformOverride(uniformName, value) {
        this._overrides[uniformName] = value;
    }

    clearOverrides() {
        this._overrides = {};
    }

    get overrideCount() {
        return this._overrides.length;
    }

    get latestSnapshot() {
        return this.snapshots.get(LATEST_SNAPSHOT_KEY) || null;
    }

    loadCurrentSnapshot() {
        const snapshot = this._collectSnapshotOfUniforms();
        this.snapshots.set(LATEST_SNAPSHOT_KEY, snapshot);
    }

    _collectSnapshotOfUniforms() {
        const entries = Object.entries(this._mainState.uni);
        const snapshot = {};
        for (const [name, value] of entries) {
            if (typeof value === 'number' || Array.isArray(value)) {
                snapshot[name] = value;
            }
        }
        return snapshot;
    }

    resetToLastSnapshot() {
        for (const [name, value] of this.latestSnapshot) {
            this.setActualUniformValue(name, value)
        }
    }

    timelineToJSON() {
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

    loadTimelineFromJSON(json) {
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
}