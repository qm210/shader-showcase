import {STORAGE_KEY} from "../../app/constants.js";

export const OVERLAY_STATE_VERSION = 2;

export function collectStorageJson(overlay) {
    const store = {
        version: OVERLAY_STATE_VERSION,
        position: overlay.position,
        collapsed: overlay.element.classList
            .contains("collapsed"),
        collapsedTracks: [...overlay.collapsedTrackIds]
            .filter(overlay.engine.getTrack),
        timeline: {
            ...overlay.engine.toJSON(),
            playing: false
        },
        overrides: overlay.engine.getOverrides(),
        selectedTrackId: overlay.selectedTrackId,
        selectedBatchId: overlay.selectedBatchId,
        customBatches: overlay.ctx.batches.custom
            .map(b => b.toJSON()),
        randomIntensity: overlay.randomIntensity,
    };
    return JSON.stringify(store);
}

export function readStoredState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY.PLAYGROUND_OVERLAY);
        const state = raw ? JSON.parse(raw) : null;
        return state?.version === OVERLAY_STATE_VERSION ? state : null;
    } catch (error) {
        console.warn('Failed to read the playground overlay state:', error);
        return null;
    }
}
