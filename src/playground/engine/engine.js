import {TimeLane} from "./timeline.js";
import {AudioTrack} from "./audioTrack.js";

const LATEST_SNAPSHOT_KEY = "_LATEST_";

export class PlaygroundEngine {
    constructor(mainState, mainElements) {
        this._mainState = mainState;
        this._mainElements = mainElements;
        this.snapshots = new Map();
        this.loadCurrentSnapshot();
        this.lanes = new Map();
        this.audioTracks = new Map();
        this._audioContext = null;
        this.onlyOneAudioTrack = true;
        this.currentTime = 0;
        this.playing = false;
        this.speed = 1.0;
        this.baseTime = 0; // offset for shader iTime sync
        this.onUpdate = null; // callback: (engine) => void, called every frame
        this._overrides = {};
    }

    reset() {
        this.lanes.clear();
        this.audioTracks.clear();
        this.currentTime = 0;
        this.playing = false;
        this.speed = 1.0;
        this.baseTime = 0;
        this._overrides = {};
    }

    /**
     * Get or create an AudioContext for decoding audio.
     * @returns {AudioContext}
     */
    _getAudioContext() {
        if (!this._audioContext) {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this._audioContext;
    }

    addLane(name) {
        const lane = new TimeLane(name);
        this.lanes.set(lane.id, lane);
        return lane;
    }

    removeLane(id) {
        this.lanes.delete(id);
    }

    getLane(id) {
        return this.lanes.get(id);
    }

    getAllLanes() {
        return Array.from(this.lanes.values());
    }

    /**
     * Load an audio file and add it as an audio lane.
     * @param {File} file
     * @returns {Promise<AudioTrack>}
     */
    async loadAudioTrack(file) {
        const lane = await AudioTrack.load(file, this._getAudioContext());
        if (this.onlyOneAudioTrack) {
            this.audioTracks.clear();
        }
        this.audioTracks.set(lane.id, lane);
        return lane;
    }

    removeAudioTrack(id) {
        this.audioTracks.delete(id);
    }

    getAudioTrack(id) {
        return this.audioTracks.get(id);
    }

    getAllAudioTracks() {
        return Array.from(this.audioTracks.values());
    }

    update(dt) {
        if (!this.playing) return;
        this.currentTime += dt * this.speed;

        // Auto-loop tracks that exceed their duration
        for (const lane of this.lanes.values()) {
            if (lane.loop && lane.duration > 0 && this.currentTime > lane.duration) {
                this.currentTime -= lane.duration;
            }
        }

        if (this.onUpdate) this.onUpdate(this);
    }

    getAllTimelineValues() {
        const result = {};
        for (const lane of this.lanes.values()) {
            const vals = lane.getAllValues(this.currentTime);
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
            console.error("[ENGINE] Engine does not know any uniform snapshot!");
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

    getActualUniformValue(name) {
        return this._mainState.uni[name];
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
            if (typeof value === "number" || Array.isArray(value)) {
                snapshot[name] = value;
            }
        }
        return snapshot;
    }

    getCurrentUniformDetails() {
        const tracksByName = new Map();

        for (const lane of this.lanes.values()) {
            for (const target of lane.targets) {
                if (!target.enabled) {
                    continue;
                }
                const name = target.uniformName;
                if (!tracksByName.has(name)) {
                    tracksByName.set(name, []);
                }
                tracksByName.get(name).push(lane);
            }
        }

        return Object.entries(this.getCurrentUniformValues())
            .map(([name, value]) => {
                const override = this._overrides[name];
                const usedInTracks = (tracksByName.get(name) ?? [])
                        .map(t => t.name).join(", ");
                return {
                    name,
                    value,
                    isUntouched: override === undefined && usedInTracks === "",
                    override,
                    usedInTracks,
                };
            });
    }

    timelineToJSON() {
        const tracks = [];
        for (const lane of this.lanes.values()) {
            tracks.push(lane.toJSON());
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
        for (const laneJson of json?.tracks ?? []) {
            const lane = TimeLane.fromJSON(laneJson);
            this.lanes.set(lane.id, lane);
        }
        return this;
    }
}