import {CHAR, DEBUG} from "./overlay/index.js";
import {calcLaneRange} from "./engine/valueRanges.js";
import {queryLaneWrapper} from "./overlay/dom/lanes.js";
import {updateUniformRow} from "./overlay/dom/uniformList.js";

export const ACTION = Object.freeze({
    HIDE_OVERLAY: "hide-overlay",
    PLAY: "play",
    ADD_LANE: "add-lane",
    REMOVE_ALL_LANES: "remove-all-lanes",
    DELETE_LANE: "delete-lane",
    EXPORT: "export",
    IMPORT: "import",
    RESET: "reset",
    ADD_TARGET: "add-target",
    REMOVE_TARGET: "remove-target",
    ADD_KEYFRAME: "add-keyframe",
    ADD_BATCH: "add-batch",
    REMOVE_BATCH: "remove-batch",
    DESELECT_BATCHES: "deselect-batches",
    ADD_UNIFORM: "add-uniform",
    REMOVE_UNIFORM: "remove-uniform",
    RANDOMIZE: "randomize",
    CANCEL_LANE_NAME: "cancel-lane-name",
    CLEAR_LANE: "clear-lane",
    RESCALE_LANE: "rescale-lane",
    LANE_OPTIONS: "lane-options",
    COPY_LANE: "copy-lane",
    PASTE_LANE: "paste-lane",
    LOAD_SNAPSHOT: "load-snapshot",
    CLEAR_OVERRIDES: "clear-overrides",
    LOAD_AUDIO: "load-audio",
});

export function runAction(overlay, data) {
    DEBUG.log(`[ACTION] [${data.action}]`, data);

    switch (data.action) {
        case ACTION.HIDE_OVERLAY:
            overlay.element.classList.toggle("hidden");
            break;

        case ACTION.PLAY:
            overlay.togglePlaying();
            break;

        case ACTION.ADD_LANE: {
            const count = overlay.engine.getAllLanes().length + 1;
            const name = `Lane ${count}`;
            overlay.engine.addLane(name);
            const lanes = overlay.engine.getAllLanes();
            if (lanes.length === 1) {
                overlay.lane.selectedId = lanes[0].id;
            }
            overlay.renderTimeline();
            DEBUG.table(lanes);
            break;
        }

        case ACTION.EXPORT:
            overlay._exportTimeline();
            break;

        case ACTION.IMPORT:
            overlay._importTimeline();
            break;

        case ACTION.RESET:
            if (confirm("Reset? This clears all lanes, batches and values, including the stored ones.")) {
                overlay.reset();
            }
            break;

        case ACTION.DELETE_LANE:
            const lane = this.engine.getLane(data.laneId);
            if (confirm(`Delete lane "${lane.name}"?`)) {
                overlay.engine.removeLane(lane.id);
                overlay.lane.collapsedIds.delete(lane.id);
                overlay.selectedKeyframe = null;
                const lanes = overlay.engine.getAllLanes();
                if (lanes.length === 1) {
                    overlay.lane.selectedId = lanes[0].id;
                }
                overlay.renderTimeline();
            }
            break;

        case ACTION.ADD_TARGET: {
            const lane = overlay.engine.getLane(data.laneId);
            if (!lane) {
                return;
            }
            // Add an empty target that the user can fill in
            lane.addTarget("");
            overlay.renderTimeline();
            // Focus the new selector (last one added)
            const selectors =
                queryLaneWrapper(overlay.ui, lane.id)
                    ?.querySelectorAll(".target-selector");
            const lastSelector = selectors[selectors.length - 1];
            if (lastSelector) {
                lastSelector.focus();
                lastSelector.select();
            }
            break;
        }

        case ACTION.REMOVE_TARGET: {
            const lane = overlay.engine.getLane(data.laneId);
            const target = lane?.targets[parseInt(data.targetIdx, 10)];
            if (target) {
                lane.removeTarget(target.uniformName);
                overlay.renderTimeline();
            }
            break;
        }

        case ACTION.ADD_KEYFRAME: {
            const lane = overlay.engine.getLane(data.laneId);
            if (!lane) {
                return;
            }
            // Use prompt for X (time) and Y (value) coordinates per user override.
            const defaultTime = overlay.engine.time().toFixed(1);
            const timeStr = prompt("Keyframe time (s):", defaultTime);
            if (timeStr === null) {
                return;
            }
            const time = parseFloat(timeStr);
            if (isNaN(time)) {
                return;
            }
            const [minVal, maxVal] = calcLaneRange(lane, overlay.ctx);
            const midVal = ((minVal + maxVal) / 2).toFixed(3);
            const defaultVal = overlay.ctx.getControlValue() ?? midVal;
            const valStr = prompt("Keyframe value:", defaultVal);
            if (valStr === null) {
                return;
            }
            const value = parseFloat(valStr);
            if (isNaN(value)) {
                return;
            }
            overlay._addKeyframe(lane, time, value);
            break;
        }

        case ACTION.ADD_BATCH: {
            const count = overlay.ctx.batches.custom.length + 1;
            const name = `Batch ${count}`;
            const batch = overlay.ctx.addBatch(name);
            overlay.batch.selectedId = batch.id;
            overlay.updateOnTargetsChanged();
            break;
        }

        case ACTION.REMOVE_BATCH: {
            const batch = overlay.ctx.getBatch(data.batchId);
            if (batch && confirm(`Delete the batch "${batch.name}"?`)) {
                overlay.ctx.removeBatch(batch.id);
                overlay.updateOnTargetsChanged();
                overlay._scheduleSave();
            }
            break;
        }

        case ACTION.DESELECT_BATCHES: {
            overlay.batch.selectedId = null;
            overlay.batch.renamingId = null;
            overlay.renderUniformPanel();
            break;
        }

        case ACTION.ADD_UNIFORM: {
            const batch = overlay.ctx.getBatch(data.batchId);
            if (batch) {
                batch.addUniform("");
                overlay.batch.selectedId = batch.id;
                overlay.renderUniformPanel();
                overlay.element
                    .querySelector(`.batch-card[data-batch-id="${CSS.escape(batch.id)}"] .batch-uniform-row:last-child .name`)
                    ?.focus();
                overlay.updateOnTargetsChanged();
            }
            break;
        }

        case ACTION.REMOVE_UNIFORM: {
            const batch = overlay.ctx.getBatch(data.batchId);
            if (batch) {
                const entry = batch.uniforms[parseInt(data.index, 10)];
                if (entry) {
                    if (!entry.name || !entry.name.trim()) {
                        // Second click: actually remove the row
                        batch.removeUniform(parseInt(data.index, 10));
                    } else {
                        // First click: clear the name and associated overrides
                        entry.name = "";
                        entry.min = null;
                        entry.max = null;
                    }
                    overlay.renderUniformPanel();
                    overlay._scheduleSave();
                }
            }
            break;
        }

        case ACTION.RANDOMIZE:
            if (overlay.randomize.batchId) {
                const values = overlay.ctx.randomizeBatch(
                    overlay.randomize.batchId, overlay.randomize.intensity
                );
                for (const name of Object.keys(values)) {
                    updateUniformRow(overlay.element, name, values[name]);
                }
                overlay._renderPreview();
            }
            break;

        case ACTION.CANCEL_LANE_NAME:
            overlay.lane.renamingId = null;
            overlay.renderTimeline();
            break;

        case ACTION.CLEAR_LANE: {
            const lane = overlay.engine.getLane(data.laneId);
            if (lane && confirm("Clear all keyframes from this lane?")) {
                lane.keyframes = [];
                lane.updateDuration();
                overlay.selectedKeyframe = null;
                overlay.renderTimeline();
            }
            break;
        }

        case ACTION.RESCALE_LANE: {
            const lane = overlay.engine.getLane(data.laneId);
            if (!lane || !lane.keyframes.length) return;
            const oldStart = lane.keyframes[0].time;
            const oldEnd = lane.keyframes[lane.keyframes.length - 1].time;
            const range = oldEnd - oldStart;
            if (range <= 0) return;

            // Use a small inline prompt-like input via the overlay itself to avoid window.prompt
            const newStartStr = prompt("New start time:", oldStart.toFixed(1));
            const newEndStr = prompt("New end time:", oldEnd.toFixed(1));
            if (newStartStr === null || newEndStr === null) return;

            const s = parseFloat(newStartStr);
            const e = parseFloat(newEndStr);
            if (isNaN(s) || isNaN(e) || e <= s) return;

            const factor = (e - s) / range;
            for (const kf of lane.keyframes) {
                kf.time = s + (kf.time - oldStart) * factor;
            }
            lane.updateDuration();
            overlay.renderTimeline();
            break;
        }

        case ACTION.LANE_OPTIONS: {
            overlay._showLaneOptions(data.laneId);
            break;
        }

        case ACTION.COPY_LANE: {
            const lane = overlay.engine.getLane(data.laneId);
            if (lane && lane.keyframes.length) {
                overlay.clipboard.lane = JSON.parse(JSON.stringify(lane.keyframes));
                alert("Keyframes copied! Use the paste button on another lane.");
            }
            break;
        }

        case ACTION.PASTE_LANE: {
            if (!overlay.clipboard.lane || !overlay.clipboard.lane.length) return;
            const lane = overlay.engine.getLane(data.laneId);
            if (lane) {
                lane.keyframes = JSON.parse(JSON.stringify(overlay.clipboard.lane));
                lane.updateDuration();
                overlay.renderTimeline();
            }
            break;
        }

        case ACTION.LOAD_SNAPSHOT: {
            overlay.engine.loadCurrentSnapshot();
            console.info("[SNAPSHOT] Loaded:", overlay.engine.latestSnapshot);
            const count = overlay.engine.overrides.length;
            alert(
                "Current Uniform values read from main state;\n" +
                `There are still ${count} Overrides set.\n\n` +
                "Use \"Clear Overrides\" to discard all of these."
            );
            overlay.renderTimeline();
            break;
        }

        case ACTION.CLEAR_OVERRIDES: {
            if (!confirm(
                "Snapshot loaded, do you want to discard all previous Overwrites?"
            )) {
                return;
            }

            overlay.engine.clearOverrides();
            for (const [name, value] of Object.entries(overlay.engine.latestSnapshot)) {
                updateUniformRow(overlay.element, name, value);
            }
            overlay.renderTimeline();
            break;
        }

        case ACTION.LOAD_AUDIO: {
            const fileInput = overlay.ui.audioFileInput;
            if (!fileInput) {
                return;
            }
            fileInput.click();
            break;
        }

        default: {
            alert(`${data.action}? Not Yet Implemented :(`);
            break;
        }
    }

    overlay._scheduleSave();
}

export const LANE_ACTIONS = [
    {action: ACTION.ADD_KEYFRAME,
        label: "+",
        title: "Add keyframe at current time"},
    {action: ACTION.LANE_OPTIONS,
        label: "⚙",
        title: "Lane options (rescale/shift)"},
    {action: ACTION.COPY_LANE,
        label: CHAR.ARROW_PAIR_RIGHT,
        title: "Copy keyframes"},
    {action: ACTION.PASTE_LANE,
        label: CHAR.ARROW_PAIR_LEFT,
        title: "Paste keyframes"},
    {action: ACTION.CLEAR_LANE,
        label: CHAR.CLEAR,
        title: "Clear all keyframes",
        className: "btn icon danger"},
    {action: ACTION.DELETE_LANE,
        label: CHAR.TRASH,
        title: "Delete Lane!",
        className: "btn icon danger"
    },
];