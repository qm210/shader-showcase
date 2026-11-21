import {FALLBACK_RANGE} from "../engine/valueRanges.js";
import {intAttr} from "./dom/html.js";

/**
 * @typedef {Object} LaneTargetDeps
 * @property {(laneId: string) => any} getLane
 * @property {(uniformName: string) => any} getControl
 * @property {(laneId: string, selector: string) => Element | null}
 *     queryInLane
 * @property {(laneId: string) => void} renderLane
 * @property {() => void} requestSave
 */

/**
 * Target rows of a lane: naming, enabling and removing the uniforms a
 * lane drives. The handle* methods return true if they consumed the event.
 */
export class LaneTargetEditor {
    /** @param {LaneTargetDeps} deps */
    constructor(deps) {
        this._deps = deps;
    }

    handleInput(e) {
        if (!e.target.classList.contains("target-selector")) {
            return false;
        }
        this._onNameInput(e.target);
        return true;
    }

    handleChange(e) {
        const el = e.target;
        if (!el.classList.contains("target-enable")) {
            return false;
        }
        const {laneId} = el.dataset;
        const targetIdx = intAttr(el, "targetIdx");
        const lane = this._deps.getLane(laneId);
        const target = lane?.targets[targetIdx];
        if (target) {
            const wasEnabled = target.enabled;
            target.enabled = el.checked;
            if (el.checked && !wasEnabled) {
                this._resetRange(lane, targetIdx, target);
            }
            this._deps.renderLane(laneId);
        }
        return true;
    }

    handleKeyDown(e) {
        const el = e.target;
        if (!el.classList.contains("target-selector") || e.code !== "Escape") {
            return false;
        }
        this._removeIfEmpty(el);
        return true;
    }

    handleBlur(e) {
        if (!e.target.classList.contains("target-selector")) {
            return false;
        }
        this._removeIfEmpty(e.target);
        return true;
    }

    _onNameInput(input) {
        const {laneId} = input.dataset;
        const targetIdx = intAttr(input, "targetIdx");
        const lane = this._deps.getLane(laneId);
        if (!lane) {
            return;
        }
        const newName = input.value.trim();
        const control = this._deps.getControl(newName);

        // Typing into the trailing "add" row creates a real target.
        if (newName && targetIdx === lane.targets.length) {
            this._addTarget(newName, control, lane, targetIdx);
            return;
        }

        const target = lane.targets[targetIdx];
        if (!target || newName === target.uniformName) {
            return;
        }
        if (target.uniformName) {
            lane.removeTarget(target.uniformName);
        }
        target.uniformName = newName;
        if (control) {
            this._addTarget(newName, control, lane, targetIdx);
        } else {
            this._resetRange(lane, targetIdx, target);
        }
        this._deps.requestSave();
    }

    _addTarget(name, control, lane, targetIdx) {
        lane.addTarget(name, control);
        this._deps.renderLane(lane.id);
        if (targetIdx) {
            this._refocus(lane.id, targetIdx);
        }
    }

    /** Removes a target whose name was cleared. */
    _removeIfEmpty(input) {
        const lane = this._deps.getLane(input.dataset.laneId);
        // The trailing "add" row has no target object and is never removed.
        const target = lane?.targets[intAttr(input, "targetIdx")];
        if (target && !target.uniformName.trim()) {
            lane.removeTarget(target.uniformName);
            this._deps.renderLane(lane.id);
        }
    }

    /** Puts the caret back into a target input after a re-render. */
    _refocus(laneId, targetIdx) {
        const input = this._deps.queryInLane(
            laneId, `.target-selector[data-target-idx="${targetIdx}"]`
        );
        if (input) {
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
        }
    }

    /** Scalar control ranges are taken over, vectors use -1..1. */
    _resetRange(lane, targetIdx, target) {
        const control = target.uniformName
            ? this._deps.getControl(target.uniformName)
            : null;
        const range = control ?? FALLBACK_RANGE;
        const scalarOr = (value, fallback) =>
            Array.isArray(value) ? fallback : value;
        target.min = scalarOr(range.min, FALLBACK_RANGE.min);
        target.max = scalarOr(range.max, FALLBACK_RANGE.max);
        // Update the lane range if it's still at the fallback.
        if (lane.range.min === FALLBACK_RANGE.min &&
            lane.range.max === FALLBACK_RANGE.max &&
            lane.targets.length === 1 && targetIdx === 0) {
            lane.initRangeFromControl(control);
        }
    }
}
