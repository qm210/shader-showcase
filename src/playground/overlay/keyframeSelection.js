import {keyframeKey, parseKeyframeKey} from "../engine/keyframes.js";

/**
 * @typedef {Object} KeyframeSelectionDeps
 * @property {() => Set<string>} getKeys
 *     The selected keyframe keys; the Set stays in the overlay state,
 *     which persists it and may replace it (e.g. on box select).
 * @property {(laneId: string) => any} getLane
 */

export class KeyframeSelection {
    /** @param {KeyframeSelectionDeps} deps */
    constructor({getKeys, getLane}) {
        this._getKeys = getKeys;
        this._getLane = getLane;
    }

    /** @returns {{laneId: string, kfId: string}[]} */
    list() {
        return [...this._getKeys()].map(parseKeyframeKey);
    }

    first() {
        return this.list()[0] ?? null;
    }

    current() {
        const first = this.first();
        if (!first) {
            return null;
        }
        const lane = this._getLane(first.laneId);
        const kf = lane?.findKeyframe(first.kfId);
        if (!kf) {
            return null;
        }
        return {lane, kf, index: lane.keyframes.indexOf(kf)};
    }

    clear() {
        this._getKeys().clear();
    }

    add(laneId, kfId) {
        this._getKeys().add(keyframeKey(laneId, kfId));
    }

    only(laneId, kfId) {
        this.clear();
        this.add(laneId, kfId);
    }

    toggle(laneId, kfId) {
        const keys = this._getKeys();
        const key = keyframeKey(laneId, kfId);
        if (!keys.delete(key)) {
            keys.add(key);
        }
    }

    range(laneId, kfId) {
        const lane = this._getLane(laneId);
        if (!lane) {
            return;
        }
        const first = this.first();
        if (first?.laneId !== laneId) {
            this.only(laneId, kfId);
            return;
        }
        const firstKf = lane.findKeyframe(first.kfId);
        const targetKf = lane.findKeyframe(kfId);
        if (!firstKf || !targetKf) {
            return;
        }
        const fromIdx = lane.keyframes.indexOf(firstKf);
        const toIdx = lane.keyframes.indexOf(targetKf);
        this.clear();
        for (let i = Math.min(fromIdx, toIdx);
             i <= Math.max(fromIdx, toIdx); i++) {
            this.add(laneId, lane.keyframes[i].id);
        }
    }

    deselectLane(laneId) {
        const keys = this._getKeys();
        for (const key of [...keys]) {
            if (parseKeyframeKey(key).laneId === laneId) {
                keys.delete(key);
            }
        }
    }
}
