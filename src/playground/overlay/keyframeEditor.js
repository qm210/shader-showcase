import {MIN_TIME_STEP} from "../engine/timeZoom.js";
import {positionKeyframePopup, renderKeyframePopup} from "./dom/keyframePopup.js";
import {KeyframeSelection} from "./keyframeSelection.js";
import {KeyframeDragController} from "./keyframeDrag.js";

/**
 * @typedef {Object} KeyframeEditorDeps
 * @property {(laneId: string) => any} getLane
 * @property {() => Set<string>} getSelectedKeys
 * @property {(laneId: string, selector: string) => Element | null} queryInLane
 * @property {() => Element | null} firstStrip
 * @property {(strip: Element, e: MouseEvent) => {time: number, value: number}} pointerOnStrip
 * @property {() => number} time
 * @property {() => {start: number, end: number}} timeView
 * @property {(time: number) => void} seek
 * @property {(laneId: string) => void} renderLane
 * @property {() => void} renderTimeline
 */

/** Selecting, adding, removing, dragging and editing keyframes. */
export class KeyframeEditor {
    /**
     * @param {{root: HTMLElement, popup: HTMLElement}} elements
     * @param {KeyframeEditorDeps} deps
     */
    constructor({root, popup}, deps) {
        this._popup = popup;
        this._deps = deps;
        this.selection = new KeyframeSelection({
            getKeys: deps.getSelectedKeys,
            getLane: deps.getLane,
        });
        this.drag = new KeyframeDragController(root, {
            getLane: deps.getLane,
            findStrip: (laneId) =>
                deps.queryInLane(laneId, ".keyframe-strip"),
            pointerOnStrip: deps.pointerOnStrip,
            renderLane: deps.renderLane,
        });
        this._bindPopup();
    }

    /** The keyframe drag in progress, or null. */
    get dragging() {
        return this.drag.current;
    }

    /** Shift selects a range, Ctrl/Cmd toggles, plain click selects one. */
    onDotClick(dot, e) {
        const {laneId, kfId} = dot.dataset;
        if (e.shiftKey) {
            this.selection.range(laneId, kfId);
        } else if (e.ctrlKey || e.metaKey) {
            this.selection.toggle(laneId, kfId);
        } else {
            this.selection.only(laneId, kfId);
        }
        this._debug(laneId);
        // Selection may change on several tracks, so render them all.
        this._deps.renderTimeline();
    }

    addAtPointer(strip, e) {
        const lane = this._deps.getLane(strip.dataset.laneId);
        if (lane) {
            const {time, value} = this._deps.pointerOnStrip(strip, e);
            this.add(lane, time, value);
        }
    }

    /** Adds a keyframe; the first one of a lane gets a partner at 0. */
    add(lane, time, value) {
        if (lane.keyframes.length === 0 && time > MIN_TIME_STEP) {
            lane.addKeyframe(0, value);
        }
        const kf = lane.addKeyframe(time, value);
        this.selection.only(lane.id, kf.id);
        this._deps.renderLane(lane.id);
    }

    remove(laneId, kfId) {
        const lane = this._deps.getLane(laneId);
        const kf = lane?.findKeyframe(kfId);
        if (!kf) {
            return;
        }
        lane.removeKeyframe(kf.time);
        this.selection.deselectLane(laneId);
        this._deps.renderLane(laneId);
    }

    /** Deletes the selected keyframes on the first selected lane. */
    deleteSelected() {
        const lane = this.selection.current()?.lane;
        if (!lane) {
            return;
        }
        // Collect times first, removing shifts the indices.
        const times = this.selection.list()
            .filter(k => k.laneId === lane.id)
            .map(k => lane.findKeyframe(k.kfId)?.time)
            .filter(time => time !== undefined);
        for (const time of times) {
            lane.removeKeyframe(time);
        }
        this.selection.clear();
        this._deps.renderTimeline();
    }

    /** Undoes the last edit on the lane of the first selected keyframe. */
    undo() {
        const first = this.selection.first();
        if (this._deps.getLane(first?.laneId)?.undo()) {
            this._deps.renderLane(first.laneId);
        }
    }

    /** Selects the keyframe of a dot and focuses its popup value. */
    focusValue(dot) {
        const {laneId, kfId} = dot.dataset;
        if (!this._deps.getLane(laneId)?.findKeyframe(kfId)) {
            return;
        }
        this.selection.add(laneId, kfId);
        this._deps.renderTimeline();
        requestAnimationFrame(() => {
            const input = this._popup.querySelector(".kf-current-val");
            input.focus();
            input.select();
        });
    }

    renderPopup() {
        const selection = this.selection.current();
        renderKeyframePopup(
            this._popup,
            selection?.kf,
            selection?.lane,
            selection && neighbours(selection),
        );
        const anchor = selection && this._anchor();
        if (anchor) {
            positionKeyframePopup(this._popup, anchor);
        }
    }

    _bindPopup() {
        const popup = this._popup;
        popup.addEventListener("click", (e) => {
            const {classList} = e.target;
            const kfId = popup.dataset.kfId;
            if (classList.contains("kf-undo-btn")) {
                this.undo();
            } else if (classList.contains("kf-seek-btn") && kfId) {
                const kf = this._firstSelectedLane()?.findKeyframe(kfId);
                if (kf) {
                    this._deps.seek(kf.time);
                }
            } else if (classList.contains("kf-remove-btn") && kfId) {
                const lane = this._firstSelectedLane();
                if (lane?.findKeyframe(kfId)) {
                    this.remove(lane.id, kfId);
                }
            }
        });
        popup.querySelector(".kf-ease-select")
            .addEventListener("change", (e) => {
                this._editSelected(({kf}) => {
                    kf.ease = e.target.value;
                });
            });
        popup.querySelector(".kf-current-val")
            .addEventListener("change", (e) => {
                const displayValue = parseFloat(e.target.value);
                if (isNaN(displayValue)) {
                    return;
                }
                this._editSelected(({lane, kf}) => {
                    kf.value = lane.mapFromRange(displayValue);
                });
            });
    }

    /** Popup buttons act on their keyframe in the first selected lane. */
    _firstSelectedLane() {
        const first = this.selection.first();
        return first ? this._deps.getLane(first.laneId) : null;
    }

    _editSelected(edit) {
        const selection = this.selection.current();
        if (selection) {
            edit(selection);
            this._deps.renderLane(selection.lane.id);
        }
    }

    /** Rect of the first selected dot, else the playhead on the first strip. */
    _anchor() {
        const first = this.selection.first();
        if (!first) {
            return null;
        }
        const dot = this._deps.queryInLane(
            first.laneId, `.keyframe-dot[data-kf-id="${first.kfId}"]`
        );
        if (dot) {
            return dot.getBoundingClientRect();
        }
        const strip = this._deps.firstStrip();
        if (!strip) {
            return null;
        }
        const rect = strip.getBoundingClientRect();
        const {start, end} = this._deps.timeView();
        const fraction = (this._deps.time() - start) / (end - start);
        return {
            left: rect.left + rect.width * fraction,
            width: 0,
            bottom: rect.bottom,
        };
    }

    _debug(laneId) {
        const lane = this._deps.getLane(laneId);
        console.group("[KEYFRAMES] on Track", laneId, lane, " - Keyframes:");
        console.table(lane.keyframes);
        console.log("Selected:", this._deps.getSelectedKeys());
        console.groupEnd();
    }
}

function neighbours({lane, index}) {
    return {
        prev: lane.keyframes[index - 1] ?? null,
        next: lane.keyframes[index + 1] ?? null,
    };
}
