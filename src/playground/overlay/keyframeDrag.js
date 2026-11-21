import {clamp} from "./index.js";
import {MIN_TIME_STEP} from "../engine/timeZoom.js";

/**
 * @typedef {Object} KeyframeDragDeps
 * @property {(laneId: string) => any} getLane
 * @property {(laneId: string) => Element | null} findStrip
 * @property {(strip: Element, e: MouseEvent) =>
 *     {time: number, value: number}} pointerOnStrip
 * @property {(laneId: string) => void} renderLane
 */

export class KeyframeDragController {
    /**
     * @param {HTMLElement} root
     * @param {KeyframeDragDeps} deps
     */
    constructor(root, deps) {
        this._deps = deps;
        /** @type {{lane: any, kf: any, lockTime: boolean,
         *     moved: boolean} | null} */
        this.current = null;
        this._ignoreNextClick = false;

        root.addEventListener("mousedown", (e) => this._onMouseDown(e));
        window.addEventListener("mousemove", (e) => this._onMouseMove(e));
        window.addEventListener("mouseup", () => this._onMouseUp());
    }

    /**
     * True once for the click that ends a real drag;
     * that click must not select or add keyframes.
     */
    consumeClick() {
        const ignore = this._ignoreNextClick;
        this._ignoreNextClick = false;
        return ignore;
    }

    _onMouseDown(e) {
        this._ignoreNextClick = false;
        if (e.button !== 0) {
            return;
        }
        const dot = e.target.closest(".keyframe-dot");
        if (!dot) {
            return;
        }
        e.stopPropagation();
        const lane = this._deps.getLane(dot.dataset.laneId);
        const kf = lane?.findKeyframe(dot.dataset.kfId);
        if (!kf) {
            return;
        }
        this.current = {lane, kf, lockTime: kf.time === 0, moved: false};
    }

    _onMouseMove(e) {
        const drag = this.current;
        if (!drag) {
            return;
        }
        // Re-query, as every move replaces the row of the lane.
        const strip = this._deps.findStrip(drag.lane.id);
        if (!strip) {
            return;
        }
        const {time, value} = this._deps.pointerOnStrip(strip, e);
        if (!drag.lockTime) {
            drag.kf.time = timeBetweenNeighbours(drag.lane, drag.kf, time);
        }
        drag.kf.value = value;
        drag.moved = true;
        this._deps.renderLane(drag.lane.id);
    }

    _onMouseUp() {
        this._ignoreNextClick = Boolean(this.current?.moved);
        this.current = null;
    }
}

/** Keeps the keyframe order, so indices and curves stay valid. */
function timeBetweenNeighbours(lane, kf, time) {
    const kfs = lane.keyframes;
    const i = kfs.indexOf(kf);
    const min = (kfs[i - 1]?.time ?? 0) + MIN_TIME_STEP;
    const max = (kfs[i + 1]?.time ?? Infinity) - MIN_TIME_STEP;
    return clamp(time, min, max);
}
