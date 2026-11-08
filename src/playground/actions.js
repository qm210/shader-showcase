/**
 * Action constants and the central action dispatcher for the playground overlay.
 * All `data-action` attributes should reference these constants to avoid magic strings.
 */

export const ACTION = Object.freeze({
    MINIMIZE: 'minimize',
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
    ADD_UNIFORM: 'add-uniform',
    REMOVE_UNIFORM: 'remove-uniform',
    CONFIRM_NEW_TRACK: 'confirm-new-track',
    CONFIRM_NEW_BATCH: 'confirm-new-batch',
    CANCEL_NEW_TRACK: 'cancel-new-track',
    CANCEL_NEW_BATCH: 'cancel-new-batch',
    RANDOMIZE: 'randomize',
    CONFIRM_TRACK_NAME: 'confirm-track-name',
    CANCEL_TRACK_NAME: 'cancel-track-name',
});

/**
 * Execute an action on the overlay instance.
 * This replaces the inline `_runAction` switch-case in `Overlay`.
 */
export function runAction(overlay, action, data) {
    switch (action) {
        case ACTION.MINIMIZE:
            overlay.element.classList.toggle('collapsed');
            overlay._scheduleSave();
            break;

        case ACTION.PLAY:
            overlay.togglePlaying();
            break;

        case ACTION.ADD_TRACK: {
            const count = overlay.engine.getAllTracks().length + 1;
            const name = `Track ${count}`;
            overlay.engine.addTrack(name);
            overlay.render();
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
                overlay.render();
            }
            break;

        case ACTION.ADD_TARGET: {
            const track = overlay.engine.getTrack(data.trackId);
            const name = track && prompt('Uniform name:', '');
            if (name?.trim()) {
                const {min, max} = overlay.randomizer.getControlRange(name.trim());
                track.addTarget(name.trim(), Array.isArray(min) ? -1 : min, Array.isArray(max) ? 1 : max);
                overlay.render();
            }
            break;
        }

        case ACTION.REMOVE_TARGET: {
            const track = overlay.engine.getTrack(data.trackId);
            const target = track?.targets[parseInt(data.targetIdx, 10)];
            if (target) {
                track.removeTarget(target.uniformName);
                overlay.render();
            }
            break;
        }

        case ACTION.ADD_KEYFRAME: {
            const track = overlay.engine.getTrack(data.trackId);
            if (track) {
                overlay._promptKeyframe(track, overlay.engine.currentTime);
            }
            break;
        }

        case ACTION.ADD_BATCH: {
            const count = overlay.randomizer.customBatches.length + 1;
            const name = `Batch ${count}`;
            const batch = overlay.randomizer.addBatch(name);
            overlay.selectedBatchId = batch.id;
            overlay.renderRandomizer();
            break;
        }

        case ACTION.REMOVE_BATCH: {
            const batch = overlay.randomizer.getBatch(data.batchId);
            if (batch && confirm(`Delete the batch "${batch.name}"?`)) {
                overlay.randomizer.removeBatch(batch.id);
                overlay.renderRandomizer();
                overlay._scheduleSave();
            }
            break;
        }

        case ACTION.ADD_UNIFORM: {
            const batch = overlay.randomizer.getBatch(data.batchId);
            if (batch) {
                batch.addUniform('');
                overlay.selectedBatchId = batch.id;
                overlay.renderRandomizer();
                overlay.element
                    .querySelector(`.batch-card[data-batch-id="${CSS.escape(batch.id)}"] .batch-uniform-row:last-child .name`)
                    ?.focus();
                overlay._scheduleSave();
            }
            break;
        }

        case ACTION.REMOVE_UNIFORM: {
            const batch = overlay.randomizer.getBatch(data.batchId);
            if (batch) {
                batch.removeUniform(parseInt(data.index, 10));
                overlay.renderRandomizer();
                overlay._scheduleSave();
            }
            break;
        }

        case ACTION.CONFIRM_NEW_TRACK: {
            const input = overlay.ui.newTrackInput;
            if (input) {
                const name = input.value.trim();
                if (name) {
                    overlay.engine.addTrack(name);
                }
            }
            overlay._newTrackName = null;
            overlay.render();
            break;
        }

        case ACTION.CONFIRM_NEW_BATCH: {
            const input = overlay.ui.newBatchInput;
            if (input) {
                const name = input.value.trim();
                if (name) {
                    const batch = overlay.randomizer.addBatch(name);
                    overlay.selectedBatchId = batch.id;
                }
            }
            overlay._newBatchName = null;
            overlay.renderRandomizer();
            overlay._scheduleSave();
            break;
        }

        case ACTION.CANCEL_NEW_TRACK: {
            overlay._newTrackName = null;
            overlay.render();
            break;
        }

        case ACTION.CANCEL_NEW_BATCH: {
            overlay._newBatchName = null;
            overlay.renderRandomizer();
            overlay._scheduleSave();
            break;
        }

        case ACTION.RANDOMIZE:
            if (overlay.selectedBatchId) {
                overlay.randomizer.randomizeBatch(overlay.selectedBatchId, overlay.intensity, overlay.engine);
                overlay._renderPreview();
                overlay._scheduleSave();
            }
            break;

        case ACTION.CONFIRM_TRACK_NAME: {
            const input = overlay.element.querySelector(`.track-wrapper[data-track-id="${CSS.escape(data.trackId)}"] .field.name`);
            if (input) {
                const name = input.value.trim();
                if (name) {
                    const track = overlay.engine.getTrack(data.trackId);
                    if (track) {
                        track.name = name;
                    }
                }
            }
            overlay._editingTrackId = null;
            overlay.render();
            break;
        }

        case ACTION.CANCEL_TRACK_NAME:
            overlay._editingTrackId = null;
            overlay.render();
            break;
    }
}
