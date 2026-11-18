import {TimeLane} from "./timeline.js";
import {AudioTrack} from "./audioTrack.js";

const LATEST_SNAPSHOT_KEY = "_LATEST_";

/**
 * @typedef {Object} PlaygroundEngineDependencies
 * @property {() => [string, unknown][]} getUniformEntries
 * @property {(name: string, value: number) => void} setUniformValue
 * @property {() => boolean} getPlaying
 * @property {(boolean) => void} setPlaying
 * @property {() => number} getCurrentTime
 * @property {(number) => void} setCurrentTime
 */
export class PlaygroundEngine {
    constructor(deps) {
        this._deps = deps;
        this.playing = deps.getPlaying;
        this.setPlaying = deps.setPlaying;
        this.time = deps.getCurrentTime;
        this.setTime = deps.setCurrentTime;

        this.lanes = new Map();
        this.overrides = {};
        this.snapshots = new Map();
        this.loadCurrentSnapshot();

        this.onlyOneAudioTrack = true;
        this.audioTracks = new Map();
        this._audioContext = null;
    }

    get audioContext() {
        if (!this._audioContext) {
            const AudioContext =
                window.AudioContext ||
                window.webkitAudioContext;
            this._audioContext = new AudioContext();
        }
        return this._audioContext;
    }

    reset() {
        this.lanes.clear();
        this.overrides = {};
        this.audioTracks.clear();
        this.setTime(0);
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

    async loadAudioTrack(file) {
        const lane = await AudioTrack.load(file, this.audioContext);
        if (this.onlyOneAudioTrack) {
            this.audioTracks.clear();
        }
        this.audioTracks.set(lane.id, lane);
        return lane;
    }

    removeLoadedAudio(id = undefined) {
        if (!id) {
            this.audioTracks.clear();
        } else {
            this.audioTracks.delete(id);
        }
    }

    getAllAudioTracks() {
        return Array.from(this.audioTracks.values());
    }

    getAllTimelineValues() {
        const result = {};
        for (const lane of this.lanes.values()) {
            const vals = lane.getAllValues(this.time());
            Object.assign(result, vals);
        }
        return result;
    }

    getOverrides() {
        return {...this.overrides};
    }

    getUniformBaseValue(name) {
        return this.overrides[name] ?? this.latestSnapshot[name];
    }

    getUniformBaseValues() {
        const snapshot = this.latestSnapshot;
        if (!snapshot) {
            console.error("[ENGINE] Engine does not know any uniform snapshot!");
        }
        return {
            ...snapshot,
            ...this.getOverrides()
        };
    }

    getCurrentUniformValues() {
        return {
            ...this.getUniformBaseValues(),
            ...this.getAllTimelineValues(),
        };
    }

    updateUniformValue(name, value) {
        try {
            this._deps.setUniformValue(name, value);
        } catch (error) {
            console.error("Error setting uniform", {name, value, error});
        }
    }

    setActualUniformValue(name, value) {
        this.setUniformOverride(name, value);
        this.updateUniformValue(name, value);
    }

    setUniformOverride(name, value) {
        this.overrides[name] = value;
    }

    clearOverrides({writeSnapshot = true} = {}) {
        if (writeSnapshot) {
            const snapshot = this.latestSnapshot
                ?? this.loadCurrentSnapshot();
            for (const name in this.overrides) {
                const resetValue = snapshot[name];
                if (resetValue !== undefined) {
                    this.updateUniformValue(name, resetValue);
                }
            }
        }
        this.overrides = {};
    }

    get latestSnapshot() {
        return this.snapshots.get(LATEST_SNAPSHOT_KEY) || null;
    }

    loadCurrentSnapshot() {
        const snapshot = this._collectSnapshotOfUniforms();
        this.snapshots.set(LATEST_SNAPSHOT_KEY, snapshot);
        return snapshot;
    }

    _collectSnapshotOfUniforms() {
        const entries = this._deps.getUniformEntries();
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
                const override = this.overrides[name];
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
        const lanes = [];
        for (const lane of this.lanes.values()) {
            lanes.push(lane.toJSON());
        }
        return { lanes };
    }

    loadTimelineFromJSON(json) {
        this.reset();
        for (const laneJson of json?.lanes ?? []) {
            const lane = TimeLane.fromJSON(laneJson);
            this.lanes.set(lane.id, lane);
        }
        return this;
    }
}