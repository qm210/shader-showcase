import {escapeHtml, formatRange} from './helpers.js';
import {ACTION} from '../actions.js';

export const MIN_TIMELINE_SPAN = 60;

export const DATALIST = {
    UNIFORMS: 'playground-uniform-names'
};

// ─── Main Overlay Shell ──────────────────────────────────────────────

export function createPlaygroundOverlayDOM() {
    const overlay = document.createElement('div');
    overlay.id = 'playground-overlay';
    overlay.innerHTML = `
        <div class="panel-header"
             data-drag-handle>
            <button type="button"
                    class="btn danger reset-btn"
                    data-action="${ACTION.RESET}"
                    title="Clear all tracks, batches, values and the stored overlay state">
                Reset
            </button>
            <span class="title">
                Uniform Playground
            </span>
            <button type="button"
                    class="minimize-btn"
                    data-action="${ACTION.MINIMIZE}"
                    title="Minimize">
                −
            </button>
        </div>

        <div class="action-bar">
            <button type="button"
                    class="btn"
                    data-action="${ACTION.ADD_TRACK}"
                    title="Create a new track">
                + Track
            </button>

            <div class="timeline-controls">
                <button type="button"
                        class="btn icon play-btn"
                        data-action="${ACTION.PLAY}"
                        title="Play/Pause (Space)">
                    ▶
                </button>
                <input type="range"
                       class="time-slider"
                       min="0"
                       max="${MIN_TIMELINE_SPAN}"
                       step="0.1"
                       value="0">
                <span class="time-display">
                    0.0s
                </span>

                <div class="speed-control">
                    <label for="playground-speed">
                        x
                    </label>
                    <input type="number"
                           id="playground-speed"
                           class="field num speed-input"
                           min="0.1"
                           max="5"
                           step="0.1"
                           value="1.0">
                </div>
            </div>

            <div class="track-list-export">
                <button type="button"
                        class="btn"
                        data-action="${ACTION.EXPORT}">
                    Export
                </button>
                <button type="button"
                        class="btn"
                        data-action="${ACTION.IMPORT}">
                    Import
                </button>
            </div>
        </div>

        <div class="track-list">
            <div class="value-preview">
            </div>
        </div>

        <div class="uniform-list-panel"
             title="All known uniforms – check to include in the selected batch">
            <div class="uniform-list-header">
                Uniforms
            </div>
            <div class="uniform-list-body"></div>
            <div class="uniform-batches">
                <div class="batch-list"></div>
                <button type="button"
                        class="btn batch-add-btn"
                        data-action="${ACTION.ADD_BATCH}"
                        title="Create a new uniform batch">
                    + Uniform Batch
                </button>
            </div>
        </div>

        <section class="randomizer-panel">
            <div class="randomizer-header">
                <span class="randomizer-title">
                    Randomize
                </span>
            </div>

            <div class="randomizer-run">
                <div class="target-selector-wrapper">
                    <span>
                        Target:
                    </span>
                    <div class="target-selector-display"
                         title="Uniform batch to randomize">
                    </div>
                    <div class="target-selector-dropdown"
                         hidden>
                    </div>
                </div>
            </div>

            <div class="intensity-control">
                <button type="button"
                        class="btn randomize-btn"
                        data-action="${ACTION.RANDOMIZE}">
                    Randomize
                </button>
                <span class="intensity-label">
                    by Amount
                </span>
                <input type="range"
                       class="intensity-slider"
                       min="0"
                       max="1"
                       step="0.01"
                       value="1">
                <span class="intensity-value">
                    1.00
                </span>
            </div>

            <datalist id="${DATALIST.UNIFORMS}">
            </datalist>
        </section>
    `;
    return {
        element: overlay,
        ui: {
            playBtn: overlay.querySelector('.play-btn'),
            timeSlider: overlay.querySelector('.time-slider'),
            timeDisplay: overlay.querySelector('.time-display'),
            speedInput: overlay.querySelector('.speed-input'),
            trackList: overlay.querySelector('.track-list'),
            preview: overlay.querySelector('.value-preview'),
            batchSelectorDisplay: overlay.querySelector('.target-selector-display'),
            batchSelectorDropdown: overlay.querySelector('.target-selector-dropdown'),
            randomizeBtn: overlay.querySelector('.randomize-btn'),
            intensitySlider: overlay.querySelector('.intensity-slider'),
            intensityValue: overlay.querySelector('.intensity-value'),
            batchList: overlay.querySelector('.batch-list'),
            uniformNames: overlay.querySelector(`#${DATALIST.UNIFORMS}`),
            uniformListBody: overlay.querySelector('.uniform-list-body'),
            newTrackInput: null,
            newBatchInput: null,
        }
    }
}

// ─── Tracks DOM Generation ──────────────────────────────────────────

export function renderTracksDOM(ui, engine, collapsedTrackIds, selectedKeyframe, _editingTrackId, _newTrackName, timelineSpanFn, percentOfSpanFn) {
    const { trackList } = ui;
    trackList.innerHTML = '';
    ui.timeSlider.max = timelineSpanFn(engine);

    if (_newTrackName !== null) {
        const newTrackRow = document.createElement('div');
        newTrackRow.className = 'track-item new-track-pending';
        newTrackRow.innerHTML = `
            <div class="track-header">
                <span class="track-name">New track</span>
            </div>
            <div class="track-body">
                <div class="target-row">
                    <input class="field"
                           id="playground-new-track-name"
                           value="${escapeHtml(_newTrackName)}"
                           placeholder="Track name"
                           spellcheck="false"
                           autocomplete="off">
                    <button type="button"
                            class="btn"
                            data-action="${ACTION.CONFIRM_NEW_TRACK}">
                        OK
                    </button>
                    <button type="button"
                            class="btn subtle"
                            data-action="${ACTION.CANCEL_NEW_TRACK}">
                        Cancel
                    </button>
                </div>
            </div>
        `;
        trackList.appendChild(newTrackRow);
        ui.newTrackInput = newTrackRow.querySelector('#playground-new-track-name');
    }

    for (const track of engine.getAllTracks()) {
        const id = escapeHtml(track.id);

        const targetRows = track.targets.map((target, i) => `
            <div class="target-row">
                <span class="target-name"
                      data-track-id="${id}"
                      data-target-idx="${i}"
                      title="Double-click to rename">
                    ${escapeHtml(target.uniformName)}
                </span>
                <div class="target-inputs">
                    <input type="number"
                           class="field num target-min"
                           data-track-id="${id}"
                           data-target-idx="${i}"
                           value="${target.minValue}"
                           step="0.01"
                           title="Min value">
                    <span class="target-arrow">→</span>
                    <input type="number"
                           class="field num target-max"
                           data-track-id="${id}"
                           data-target-idx="${i}"
                           value="${target.maxValue}"
                           step="0.01"
                           title="Max value">
                </div>
                <input type="checkbox"
                       class="target-enable"
                       data-track-id="${id}"
                       data-target-idx="${i}"
                       ${target.enabled ? 'checked' : ''}
                       title="Enable/disable">
                <button type="button"
                        class="btn icon subtle"
                        data-action="${ACTION.REMOVE_TARGET}"
                        data-track-id="${id}"
                        data-target-idx="${i}"
                        title="Remove target">×</button>
            </div>
        `).join('');

        const dots = track.keyframes.map((kf, i) => {
            const selected = selectedKeyframe?.trackId === track.id && selectedKeyframe.kfIndex === i;
            const title = escapeHtml(`t=${kf.time.toFixed(1)}s, val=${kf.value}, ${kf.transition}`);
            return `<div class="keyframe-dot${selected ? ' selected' : ''}"
                         data-track-id="${id}"
                         data-kf-index="${i}"
                         style="left:${percentOfSpanFn(kf.time, timelineSpanFn(engine))}"
                         title="${title}"></div>`;
        }).join('');

        const nameCol = _editingTrackId === track.id
            ? `<input class="field name"
                      value="${escapeHtml(track.name)}"
                      data-track-id="${id}"
                      spellcheck="false"
                      autocomplete="off"
                      title="Click to rename">
               <button type="button"
                       class="btn subtle confirm-name"
                       data-action="${ACTION.CONFIRM_TRACK_NAME}"
                       data-track-id="${id}">✓</button>
               <button type="button"
                       class="btn subtle cancel-name"
                       data-action="${ACTION.CANCEL_TRACK_NAME}"
                       data-track-id="${id}">✕</button>`
            : `<span class="track-name name"
                     data-track-id="${id}"
                     title="Click to rename">
                    ${escapeHtml(track.name)}
                </span>`;

        const cols = `
            <div class="track-name-col">${nameCol}</div>
            <div class="track-targets-col">${targetRows}</div>
            <div class="track-actions-col">
                <button type="button"
                        class="btn"
                        data-action="${ACTION.ADD_TARGET}"
                        data-track-id="${id}">
                    + Target
                </button>
                <button type="button"
                        class="btn icon danger"
                        data-action="${ACTION.DELETE_TRACK}"
                        data-track-id="${id}"
                        title="Delete track">
                    ×
                </button>
            </div>
            <div class="track-widget">
                <div class="keyframe-strip"
                     data-track-id="${id}"
                     title="Click to add a keyframe">
                    <div class="strip-bg"></div>
                    ${dots}
                    <div class="playhead"
                         style="left:${percentOfSpanFn(engine.currentTime, timelineSpanFn(engine))}"></div>
                </div>
            </div>
        `;
        const wrapper = document.createElement('div');
        wrapper.className = 'track-wrapper' + (collapsedTrackIds.has(track.id) ? ' collapsed' : '');
        wrapper.dataset.trackId = track.id;
        wrapper.innerHTML = cols;
        trackList.appendChild(wrapper);
    }
}

export function renderPreviewDOM(ui, engine) {
    const lines = Object.entries(engine.getAllUniformValues()).map(([name, val]) => {
        const displayVal = Array.isArray(val)
            ? `[${val.map(v => v.toFixed(3)).join(', ')}]`
            : val.toFixed(4);
        return `<div class="val-line">
                    <span class="val-name">${escapeHtml(name)}</span>
                    <span class="val-num">${displayVal}</span>
                </div>`;
    });
    ui.preview.innerHTML = lines.length > 0
        ? lines.join('')
        : '<div class="val-empty">No active tracks</div>';
}

export function keyframeDotHtml(kf, i, trackId, selectedKeyframe, timelineSpanFn, percentOfSpanFn) {
    const id = escapeHtml(trackId);
    const selected = selectedKeyframe?.trackId === trackId && selectedKeyframe.kfIndex === i;
    const title = escapeHtml(`t=${kf.time.toFixed(1)}s, val=${kf.value}, ${kf.transition}`);
    return `<div class="keyframe-dot${selected ? ' selected' : ''}"
                 data-track-id="${id}"
                 data-kf-index="${i}"
                 style="left:${percentOfSpanFn(kf.time, timelineSpanFn)}"
                 title="${title}"></div>`;
}

// ─── Batch List DOM Generation ──────────────────────────────────────

export function renderBatchListDOM(ui, randomizer, selectedBatchId, _editingBatchName, _newBatchName) {
    const { batchList } = ui;
    const { customBatches } = randomizer;

    let pendingBatchHtml = '';
    if (_newBatchName !== null) {
        pendingBatchHtml = `
            <div class="batch-card new-batch-pending">
                <div class="batch-card-header">
                    <span class="batch-name">New batch</span>
                </div>
                <div class="batch-uniforms">
                    <div class="batch-uniform-row">
                        <input class="field name"
                               value="${escapeHtml(_newBatchName)}"
                               placeholder="Batch name"
                               spellcheck="false"
                               autocomplete="off">
                        <button type="button"
                                class="btn"
                                data-action="${ACTION.CONFIRM_NEW_BATCH}">
                            OK
                        </button>
                        <button type="button"
                                class="btn subtle"
                                data-action="${ACTION.CANCEL_NEW_BATCH}">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    const batchesHtml = customBatches.map(batch => {
        const batchId = escapeHtml(batch.id);
        const rows = batch.uniforms.map((entry, index) => {
            const range = randomizer.getControlRange(entry.name);
            return `
                <div class="batch-uniform-row">
                    <input class="field name"
                           list="${DATALIST.UNIFORMS}"
                           placeholder="uniform"
                           value="${escapeHtml(entry.name)}"
                           data-batch-id="${batchId}"
                           data-index="${index}"
                           spellcheck="false"
                           autocomplete="off">
                    <input class="field min"
                           placeholder="${escapeHtml(formatRange(range.min))}"
                           value="${escapeHtml(formatRange(entry.min))}"
                           data-batch-id="${batchId}"
                           data-index="${index}"
                           title="Min overwrite (empty = control default)"
                           inputmode="decimal">
                    <input class="field max"
                           placeholder="${escapeHtml(formatRange(range.max))}"
                           value="${escapeHtml(formatRange(entry.max))}"
                           data-batch-id="${batchId}"
                           data-index="${index}"
                           title="Max overwrite (empty = control default)"
                           inputmode="decimal">
                    <button type="button"
                            class="btn icon subtle"
                            data-action="${ACTION.REMOVE_UNIFORM}"
                            data-batch-id="${batchId}"
                            data-index="${index}"
                            title="Remove uniform">×</button>
                </div>
            `;
        }).join('');

        const nameCol = _editingBatchName === batch.id
            ? `<input class="field name"
                      value="${escapeHtml(batch.name)}"
                      data-batch-id="${batchId}"
                      spellcheck="false"
                      autocomplete="off">`
            : `<span class="batch-name name"
                     data-batch-id="${batchId}"
                     title="Click to rename">
                    ${escapeHtml(batch.name)}
                </span>`;

        return `
            <div class="batch-card${batch.id === selectedBatchId ? ' selected' : ''}"
                 data-batch-id="${batchId}">
                <div class="batch-card-header"
                     title="Click to select, double-click the name to rename">
                    ${nameCol}
                    <span class="batch-count">${batch.uniforms.length}</span>
                    <button type="button"
                            class="btn"
                            data-action="${ACTION.ADD_UNIFORM}"
                            data-batch-id="${batchId}">
                        + Uniform
                    </button>
                    <button type="button"
                            class="btn icon danger"
                            data-action="${ACTION.REMOVE_BATCH}"
                            data-batch-id="${batchId}"
                            title="Delete batch">
                        ×
                    </button>
                </div>
                <div class="batch-uniforms">${rows}</div>
            </div>
        `;
    }).join('');

    batchList.innerHTML = pendingBatchHtml + batchesHtml;
}

// ─── Randomizer Panel DOM Generation ────────────────────────────────

export function renderRandomizerPanelDOM(ui, randomizer, selectedBatchId) {
    const { batchSelectorDisplay, batchSelectorDropdown, randomizeBtn, uniformNames } = ui;
    const { customBatches, autoBatches } = randomizer;

    // Default to first available batch.
    if (!randomizer.getBatch(selectedBatchId)) {
        return { selectedBatchId: customBatches[0]?.id ?? autoBatches[0]?.id ?? null };
    }

    // Build all targets (custom batches + auto batches + individual uniforms).
    const allTargets = [];
    for (const batch of customBatches) {
        allTargets.push({ id: batch.id, name: batch.name, type: 'batch' });
    }
    for (const batch of autoBatches) {
        allTargets.push({ id: batch.id, name: batch.name, type: 'batch' });
    }
    const knownNames = randomizer.getKnownUniformNames();
    for (const name of knownNames) {
        if (!allTargets.some(t => t.id === `uniform:${name}`)) {
            allTargets.push({ id: `uniform:${name}`, name, type: 'uniform' });
        }
    }

    // Dropdown items.
    const dropdownItems = allTargets.map(target => {
        const isSelected = target.id === selectedBatchId;
        return `
            <div class="selector-item${isSelected ? ' selected' : ''}"
                 data-target-id="${escapeHtml(target.id)}">
                <span class="selector-icon">${target.type === 'batch' ? '◆' : '●'}</span>
                <span class="selector-name">${escapeHtml(target.name)}</span>
            </div>
        `;
    }).join('');
    batchSelectorDropdown.innerHTML = dropdownItems;

    // Display text.
    const selectedTarget = allTargets.find(t => t.id === selectedBatchId);
    if (selectedTarget) {
        batchSelectorDisplay.textContent = selectedTarget.name;
        batchSelectorDisplay.title = `${selectedTarget.type === 'batch' ? 'Batch' : 'Uniform'}: ${selectedTarget.name}`;
    } else {
        batchSelectorDisplay.textContent = 'No target';
        batchSelectorDisplay.title = 'Click to select a target';
    }
    randomizeBtn.disabled = !selectedBatchId;

    // Uniform name suggestions.
    uniformNames.innerHTML = randomizer.getKnownUniformNames()
        .map(name => `<option value="${escapeHtml(name)}"></option>`)
        .join('');

    return { selectedBatchId };
}

// ─── Uniform List DOM Generation ────────────────────────────────────

/** Format a value for display: scalar as-is, vector → component min. */
function formatDisplayValue(value) {
    if (value == null) return '';
    if (Array.isArray(value)) {
        return Math.min(...value).toFixed(2);
    }
    return String(value);
}

/** Format a value for display: scalar or vector component min/max. */
function formatDisplayMax(value) {
    if (value == null) return '';
    if (Array.isArray(value)) {
        return Math.max(...value).toFixed(2);
    }
    return String(value);
}

/** Render the uniform list panel on the right side of the randomizer. */
export function renderUniformListDOM(ui, randomizer, selectedBatchId) {
    const { uniformListBody } = ui;
    if (!uniformListBody) return;

    // Group uniforms by their auto-batch (separator label from controls).
    const groups = new Map();
    for (const batch of randomizer.autoBatches) {
        for (const entry of batch.uniforms) {
            if (!groups.has(batch.name)) groups.set(batch.name, []);
            groups.get(batch.name).push(entry);
        }
    }

    const selectedBatch = selectedBatchId ? randomizer.getBatch(selectedBatchId) : null;
    const selectedNames = selectedBatch ? new Set(selectedBatch.uniforms.map(u => u.name)) : null;

    if (!groups.size) {
        uniformListBody.innerHTML = '<div class="uniform-empty">No uniforms known yet</div>';
        return;
    }

    const selectedEntries = [];
    for (const batch of randomizer.autoBatches) {
        for (const entry of batch.uniforms) {
            if (selectedNames && selectedNames.has(entry.name)) {
                selectedEntries.push({ name: entry.name, min: entry.min, max: entry.max });
            }
        }
    }

    let html = '';

    if (selectedEntries.length) {
        html += `
            <div class="uniform-section selected-section">
                <div class="section-header">Selected</div>
                <table class="uniform-table">
                    <thead><tr><th></th><th>Name</th><th>Type</th><th>Min</th><th>Max</th></tr></thead>
                    <tbody>
        `;
        for (const entry of selectedEntries) {
            const range = randomizer.getControlRange(entry.name);
            const type = range.type || 'float';
            html += `
                        <tr class="uniform-row">
                            <td class="cell-check">
                                <input type="checkbox"
                                       class="uniform-checkbox"
                                       data-uniform-name="${escapeHtml(entry.name)}"
                                       checked>
                            </td>
                            <td class="cell-name">${escapeHtml(entry.name)}</td>
                            <td class="cell-type">${type}</td>
                            <td class="cell-min">
                                <input type="text"
                                       class="uniform-min"
                                       placeholder="${escapeHtml(formatRange(range.min))}"
                                       value="${escapeHtml(formatDisplayValue(entry.min))}"
                                       data-uniform-name="${escapeHtml(entry.name)}"
                                       title="Min overwrite (empty = control default)"
                                       inputmode="decimal">
                            </td>
                            <td class="cell-max">
                                <input type="text"
                                       class="uniform-max"
                                       placeholder="${escapeHtml(formatRange(range.max))}"
                                       value="${escapeHtml(formatDisplayMax(entry.max))}"
                                       data-uniform-name="${escapeHtml(entry.name)}"
                                       title="Max overwrite (empty = control default)"
                                       inputmode="decimal">
                            </td>
                        </tr>
            `;
        }
        html += `
                    </tbody>
                </table>
            </div>
        `;
    }

    for (const [groupName, entries] of groups) {
        html += `
            <div class="uniform-group">
                <div class="uniform-group-header" data-group="${escapeHtml(groupName)}">
                    <span class="uniform-group-arrow"></span>
                    <span class="uniform-group-name">${escapeHtml(groupName)}</span>
                    <span class="uniform-group-count">(${entries.length})</span>
                </div>
                <table class="uniform-table group-body">
                    <thead><tr><th></th><th>Name</th><th>Type</th><th>Min</th><th>Max</th></tr></thead>
                    <tbody>
        `;
        for (const entry of entries) {
            const range = randomizer.getControlRange(entry.name);
            const type = range.type || 'float';
            const checked = selectedNames ? selectedNames.has(entry.name) : '';
            html += `
                        <tr class="uniform-row">
                            <td class="cell-check">
                                <input type="checkbox"
                                       class="uniform-checkbox"
                                       data-uniform-name="${escapeHtml(entry.name)}"
                                       ${checked}>
                            </td>
                            <td class="cell-name">${escapeHtml(entry.name)}</td>
                            <td class="cell-type">${type}</td>
                            <td class="cell-min">
                                <input type="text"
                                       class="uniform-min"
                                       placeholder="${escapeHtml(formatRange(range.min))}"
                                       value="${escapeHtml(formatDisplayValue(entry.min))}"
                                       data-uniform-name="${escapeHtml(entry.name)}"
                                       title="Min overwrite (empty = control default)"
                                       inputmode="decimal">
                            </td>
                            <td class="cell-max">
                                <input type="text"
                                       class="uniform-max"
                                       placeholder="${escapeHtml(formatRange(range.max))}"
                                       value="${escapeHtml(formatDisplayMax(entry.max))}"
                                       data-uniform-name="${escapeHtml(entry.name)}"
                                       title="Max overwrite (empty = control default)"
                                       inputmode="decimal">
                            </td>
                        </tr>
            `;
        }
        html += `
                    </tbody>
                </table>
            </div>
        `;
    }
    uniformListBody.innerHTML = html;
}

// ─── Playback DOM Update (no HTML generation, just updates) ─────────

export function renderPlaybackDOM(ui, engine, timelineSpanFn, percentOfSpanFn) {
    const time = engine.currentTime;
    ui.timeSlider.value = time;
    ui.timeDisplay.textContent = `${time.toFixed(1)}s`;
    const left = percentOfSpanFn(time, timelineSpanFn(engine));
    for (const playhead of ui.trackList.querySelectorAll('.playhead')) {
        playhead.style.left = left;
    }
}

