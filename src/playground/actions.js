import {DEBUG} from "./overlay/index.js";
import {calcTrackValueRange} from "./engine/valueRanges.js";

export const ACTION = Object.freeze({
    HIDE_OVERLAY: 'hide-overlay',
    PLAY: 'play',
    ADD_TRACK: 'add-track',
    EXPORT: 'export',
    IMPORT: 'import',
    RESET: 'reset',
    DELETE_TRACK: 'delete-track',
    ADD_TARGET: 'add-target',
    REMOVE_TARGET: 'remove-target',
    ADD_KEYFRAME: 'add-keyframe',
    ADD_BATCH: 'add-batch',
    REMOVE_BATCH: 'remove-batch',
    DESELECT_BATCHES: 'deselect-batches',
    ADD_UNIFORM: 'add-uniform',
    REMOVE_UNIFORM: 'remove-uniform',
    RANDOMIZE: 'randomize',
    CANCEL_TRACK_NAME: 'cancel-track-name',
    CLEAR_TRACK: 'clear-track',
    RESCALE_TRACK: 'rescale-track',
    COPY_TRACK: 'copy-track',
    PASTE_TRACK: 'paste-track',
    LOAD_SNAPSHOT: 'load-snapshot',
});

export function runAction(overlay, data) {
    DEBUG.log("runAction()", data.action, data);

    switch (data.action) {
        case ACTION.HIDE_OVERLAY:
            overlay.element.classList.toggle("hidden");
            break;

        case ACTION.PLAY:
            overlay.togglePlaying();
            break;

        case ACTION.ADD_TRACK: {
            const count = overlay.engine.getAllTracks().length + 1;
            const name = `Track ${count}`;
            overlay.engine.addTrack(name);
            const tracks = overlay.engine.getAllTracks();
            if (tracks.length === 1) {
                overlay.track.selectedId = tracks[0].id;
            }
            overlay.renderTimeline();
            break;
        }

        case ACTION.EXPORT:
            overlay._exportTimeline();
            break;

        case ACTION.IMPORT:
            overlay._importTimeline();
            break;

        case ACTION.RESET:
            if (confirm('Reset the playground? This clears all tracks, batches and values, including the stored ones.')) {
                overlay.reset();
            }
            break;

        case ACTION.DELETE_TRACK:
            if (confirm('Delete this track?')) {
                overlay.engine.removeTrack(data.trackId);
                overlay.collapsedTrackIds.delete(data.trackId);
                overlay.selectedKeyframe = null;
                const tracks = overlay.engine.getAllTracks();
                if (tracks.length === 1) {
                    overlay.track.selectedId = tracks[0].id;
                }
                overlay.renderTimeline();
            }
            break;

        case ACTION.ADD_TARGET: {
            const track = overlay.engine.getTrack(data.trackId);
            if (track) {
                // Add an empty target that the user can fill in
                track.addTarget('', -1, 1);
                overlay.renderTimeline();
                // Focus the new selector (last one added)
                const selectors = overlay.ui.trackList.querySelectorAll('.target-selector');
                const lastSelector = selectors[selectors.length - 1];
                if (lastSelector) {
                    lastSelector.focus();
                    lastSelector.select();
                }
            }
            break;
        }

        case ACTION.REMOVE_TARGET: {
            const track = overlay.engine.getTrack(data.trackId);
            const target = track?.targets[parseInt(data.targetIdx, 10)];
            if (target) {
                track.removeTarget(target.uniformName);
                overlay.renderTimeline();
            }
            break;
        }

        case ACTION.ADD_KEYFRAME: {
            const track = overlay.engine.getTrack(data.trackId);
            if (!track) {
                return;
            }
            // Use prompt for X (time) and Y (value) coordinates per user override.
            const defaultTime = overlay.engine.currentTime.toFixed(1);
            const timeStr = prompt('Keyframe time (s):', defaultTime);
            if (timeStr === null) {
                return;
            }
            const time = parseFloat(timeStr);
            if (isNaN(time)) {
                return;
            }
            const [minVal, maxVal] = calcTrackValueRange(track, overlay.ctx);
            const midVal = ((minVal + maxVal) / 2).toFixed(3);
            const defaultVal = overlay.ctx.getControlValue() ?? midVal;
            const valStr = prompt('Keyframe value:', defaultVal);
            if (valStr === null) {
                return;
            }
            const value = parseFloat(valStr);
            if (isNaN(value)) {
                return;
            }
            overlay._addKeyframe(track, time, value);
            break;
        }

        case ACTION.ADD_BATCH: {
            const count = overlay.ctx.batches.custom.length + 1;
            const name = `Batch ${count}`;
            const batch = overlay.ctx.addBatch(name);
            overlay.selectedBatchId = batch.id;
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
            overlay.selectedBatchId = null;
            overlay._editingBatchId = null;
            overlay.renderUniformPanel();
            break;
        }

        case ACTION.ADD_UNIFORM: {
            const batch = overlay.ctx.getBatch(data.batchId);
            if (batch) {
                batch.addUniform('');
                overlay.selectedBatchId = batch.id;
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
                        entry.name = '';
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
            if (overlay.selectedBatchId) {
                overlay.ctx.randomizeBatch(overlay.selectedBatchId, overlay.randomIntensity, overlay.engine);
                overlay._renderPreview();
                overlay._scheduleSave();
            }
            break;

        case ACTION.CANCEL_TRACK_NAME:
            overlay._editingTrackId = null;
            overlay.renderTimeline();
            break;

        case ACTION.CLEAR_TRACK: {
            const track = overlay.engine.getTrack(data.trackId);
            if (track && confirm('Clear all keyframes from this track?')) {
                track.keyframes = [];
                track.updateDuration();
                overlay.selectedKeyframe = null;
                overlay.renderTimeline();
            }
            break;
        }

        case ACTION.RESCALE_TRACK: {
            const track = overlay.engine.getTrack(data.trackId);
            if (!track || !track.keyframes.length) return;
            const oldStart = track.keyframes[0].time;
            const oldEnd = track.keyframes[track.keyframes.length - 1].time;
            const range = oldEnd - oldStart;
            if (range <= 0) return;

            // Use a small inline prompt-like input via the overlay itself to avoid window.prompt
            const newStartStr = prompt('New start time:', oldStart.toFixed(1));
            const newEndStr = prompt('New end time:', oldEnd.toFixed(1));
            if (newStartStr === null || newEndStr === null) return;

            const s = parseFloat(newStartStr);
            const e = parseFloat(newEndStr);
            if (isNaN(s) || isNaN(e) || e <= s) return;

            const factor = (e - s) / range;
            for (const kf of track.keyframes) {
                kf.time = s + (kf.time - oldStart) * factor;
            }
            track.updateDuration();
            overlay.renderTimeline();
            break;
        }

        case ACTION.COPY_TRACK: {
            const track = overlay.engine.getTrack(data.trackId);
            if (track && track.keyframes.length) {
                overlay.clipboard.track = JSON.parse(JSON.stringify(track.keyframes));
                alert('Keyframes copied! Use the paste button on another track.');
            }
            break;
        }

        case ACTION.PASTE_TRACK: {
            if (!overlay.clipboard.track || !overlay.clipboard.track.length) return;
            const track = overlay.engine.getTrack(data.trackId);
            if (track) {
                track.keyframes = JSON.parse(JSON.stringify(overlay.clipboard.track));
                track.updateDuration();
                overlay.renderTimeline();
            }
            break;
        }

        case ACTION.LOAD_SNAPSHOT: {
            // Load current uniform values from the main page's state.uni into the engine overrides
            const snapshot = overlay.ctx.loadSnapshotFromState();
            if (!snapshot) {
                console.warn('[PLAYGROUND] No snapshot available. Click Load Snapshot again.');
                return;
            }
            for (const [name, value] of Object.entries(snapshot)) {
                overlay.engine.setUniformValue(name, value);
            }
            overlay.renderTimeline();
            break;
        }
    }
}
