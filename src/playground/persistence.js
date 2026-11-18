import {STORAGE_KEY} from "../app/constants.js";

const OVERLAY_STATE_VERSION = 4;

export function collectStorageJson(overlay) {
    const store = {
        version: OVERLAY_STATE_VERSION,
        position: overlay.position,
        collapsedLaneIds: [...overlay.lane.collapsedIds]
            .filter(overlay.engine.getLane),
        timeline: overlay.engine.timelineToJSON(),
        overrides: overlay.engine.getOverrides(),
        selectedLaneId: overlay.lane.selectedId,
        selectedBatchId: overlay.batch.selectedId,
        customBatches: overlay.ctx.batches.custom.map(b => b.toJSON()),
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
        console.warn("Failed to read the playground overlay state:", error);
        return null;
    }
}

export function downloadJson(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const url = URL.createObjectURL(
        new Blob([json], {type: "application/json"})
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export function pickJsonFile() {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = () => {
            const [file] = input.files;
            if (!file) {
                return;
            }
            file.text()
                .then(text => resolve(JSON.parse(text)))
                .catch(reject);
        };
        input.click();
    });
}