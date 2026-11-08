import {escapeHtml, formatRange} from './helpers.js';
import {ACTION} from '../actions.js';
import {percentOfSpan, timelineSpan} from "../engine/math.js";
import {calcTrackValueRange} from "../engine/valueRanges.js";

export const MIN_TIMELINE_SPAN = 60;

export const DATALIST = {
    UNIFORMS: 'playground-uniform-names'
};

const ICON = {
    REMOVE: "🞬",
    TIMES: "×",
};

export function createPlaygroundOverlay() {
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
                <button type="button"
                        class="btn subtle clear-batch-btn"
                        data-action="${ACTION.DESELECT_BATCHES}"
                        title="Unselect all uniform batches">
                    Unselect Batch
                </button>
            </div>
            <div class="uniform-list-body"></div>
            <div class="uniform-batches">
                <div class="batch-list"></div>
                <button type="button"
                        class="btn batch-add-btn"
                        data-action="${ACTION.ADD_BATCH}"
                        title="Create a new uniform batch">
                    + Batch of Uniforms
                </button>
            </div>
        </div>

        <section class="randomizer-panel">

            <div class="randomizer-run">
                <button type="button"
                        class="btn randomize-btn"
                        data-action="${ACTION.RANDOMIZE}">
                    Randomize
                </button>
                <span class="intensity-label">
                    amount:
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

            <datalist id="${DATALIST.UNIFORMS}"></datalist>
        
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
        }
    }
}

export function renderTracks(ui, provider, selectedTrackId, editingTrackId, collapsedTrackIds, selectedKeyframe) {
    const { trackList } = ui;
    const engine = provider.engine;
    trackList.innerHTML = '';
    ui.timeSlider.max = timelineSpan(engine);

    for (const track of engine.getAllTracks()) {
        const id = escapeHtml(track.id);

        // Build target rows: show filled targets + one empty row at the end
        const targetRows = [];
        for (let i = 0; i < track.targets.length; i++) {
            const target = track.targets[i];
            targetRows.push(`
                <div class="target-row">
                    <input type="checkbox"
                           class="target-enable"
                           data-track-id="${id}"
                           data-target-idx="${i}"
                           ${target.enabled ? 'checked' : ''}
                           title="Enable/disable">
                    <input type="text"
                           class="field target-selector"
                           list="${DATALIST.UNIFORMS}"
                           placeholder="Uniform name"
                           value="${escapeHtml(target.uniformName)}"
                           data-track-id="${id}"
                           data-target-idx="${i}"
                           spellcheck="false"
                           autocomplete="off">
                    <button type="button"
                            class="btn icon subtle"
                            data-action="${ACTION.REMOVE_TARGET}"
                            data-track-id="${id}"
                            data-target-idx="${i}"
                            title="Remove target">${ICON.TIMES}</button>
                </div>
            `);
        }
        // Always show one empty row at the end
        const nextIdx = track.targets.length;
        targetRows.push(`
            <div class="target-row">
                <input type="checkbox"
                       class="target-enable"
                       data-track-id="${id}"
                       data-target-idx="${nextIdx}"
                       title="Enable/disable">
                <input type="text"
                       class="field target-selector"
                       list="${DATALIST.UNIFORMS}"
                       placeholder="Uniform name"
                       value=""
                       data-track-id="${id}"
                       data-target-idx="${nextIdx}"
                       spellcheck="false"
                       autocomplete="off">
            </div>
        `);

        let [trackMin, trackMax] = calcTrackValueRange(track, provider);

        const dots = track.keyframes.map((kf, i) => {
            const selected = selectedKeyframe?.trackId === track.id && selectedKeyframe.kfIndex === i;
            const title = escapeHtml(`t=${kf.time.toFixed(1)}s, val=${kf.value}, ${kf.transition}`);
            return (
                `<div class="keyframe-dot${selected ? ' selected' : ''}"
                      data-track-id="${id}"
                      data-kf-index="${i}"
                      style="left:${percentOfSpan(kf.time, timelineSpan(engine))}"
                      title="${title}"
                ></div>`
            );
        }).join('');

        const nameCol = editingTrackId === track.id
            ? `<input class="field name"
                      value="${escapeHtml(track.name)}"
                      data-track-id="${id}"
                      spellcheck="false"
                      autocomplete="off">
               <button type="button"
                       class="btn subtle confirm-name"
                       data-action="${ACTION.CONFIRM_TRACK_NAME}"
                       data-track-id="${id}">✓</button>
               <button type="button"
                       class="btn subtle cancel-name"
                       data-action="${ACTION.CANCEL_TRACK_NAME}"
                       data-track-id="${id}">✕</button>`
            : `<span class="track-name name"
                     data-track-id="${id}">
                    ${escapeHtml(track.name)}
                </span>`;

        const cols = `
            <div class="track-name-col">${nameCol}</div>
            <div class="track-targets-col">
                ${targetRows.join('')}
            </div>
            <div class="track-widget">
                <div class="keyframe-strip"
                     data-track-id="${id}"
                     title="Click to set value from Y position">
                    <div class="strip-bg"></div>
                    ${dots}
                    <div class="playhead"
                         style="left:${percentOfSpan(engine.currentTime, timelineSpan(engine))}"></div>
                    <span class="range-label max-label">${escapeHtml(trackMax.toFixed(2))}</span>
                    <span class="zero-marker">0</span>
                    <span class="range-label min-label">${escapeHtml(trackMin.toFixed(2))}</span>
                </div>
            </div>
            <div class="track-actions-col">
                <button type="button"
                        class="btn icon danger"
                        data-action="${ACTION.DELETE_TRACK}"
                        data-track-id="${id}"
                        title="Delete track">
                    ${ICON.REMOVE}
                </button>
            </div>
        `;

        const wrapper = document.createElement('div');
        wrapper.className = "track-wrapper";
        wrapper.classList.toggle(
            "selected", selectedTrackId === track.id)
        ;
        wrapper.classList.toggle(
            "collapsed", collapsedTrackIds.has(track.id)
        );
        wrapper.dataset.trackId = track.id;
        wrapper.innerHTML = cols;
        trackList.appendChild(wrapper);
    }
}

export function renderPreview(ui, engine) {
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

// ─── Batch List DOM Generation ──────────────────────────────────────

export function renderBatchList(ui, controlsProvider, selectedBatchId, _editingBatchId) {
    const { batchList } = ui;
    const { customBatches } = controlsProvider;

    batchList.innerHTML = customBatches.map(batch => {
        const batchId = escapeHtml(batch.id);
        const rows = batch.uniforms.map((entry, index) => {
            const range = controlsProvider.getControlRange(entry.name);
            return `
                <div class="batch-uniform-row">
                    <input class="field name"
                           list="${DATALIST.UNIFORMS}"
                           placeholder="uniform..."
                           value="${escapeHtml(entry.name)}"
                           data-batch-id="${batchId}"
                           data-index="${index}"
                           spellcheck="false"
                           autocomplete="off">
                    <div>
                        <span>${ICON.TIMES}</span>
                        <drag-number step="0.01">
                            <input class="field factor"
                                   placeholder="factor"
                                   value="${escapeHtml(entry.factor ?? 1)}"
                                   data-batch-id="${batchId}"
                                   data-index="${index}"
                                   title="Factor multiplier (default 1)"
                                   inputmode="decimal">
                        </drag-number>
                    </div>
                    <div>
                        <span>[</span>
                        <input class="field min"
                               placeholder="${escapeHtml(formatRange(range.min))}"
                               value="${escapeHtml(formatDisplayValue(entry.min))}"
                               data-batch-id="${batchId}"
                               data-index="${index}"
                               title="Min overwrite (empty = control default)"
                               inputmode="decimal">
                    </div>
                    <div>
                        <input class="field max"
                               placeholder="${escapeHtml(formatRange(range.max))}"
                               value="${escapeHtml(formatDisplayMax(entry.max))}"
                               data-batch-id="${batchId}"
                               data-index="${index}"
                               title="Max overwrite (empty = control default)"
                               inputmode="decimal">
                        <span>]</span>
                    </div>
                    <button type="button"
                            class="btn icon subtle"
                            data-action="${ACTION.REMOVE_UNIFORM}"
                            data-batch-id="${batchId}"
                            data-index="${index}"
                            title="Remove uniform">${ICON.REMOVE}</button>
                </div>
            `;
        }).join('');

        const nameCol = _editingBatchId === batch.id
            ? `<input class="field name"
                      value="${escapeHtml(batch.name)}"
                      data-batch-id="${batchId}"
                      spellcheck="false"
                      autocomplete="off">`
            : `<span class="batch-name name"
                     data-batch-id="${batchId}">
                    ${escapeHtml(batch.name)}
                </span>`;

        return `
            <div class="batch-card${batch.id === selectedBatchId ? ' selected' : ''}${_editingBatchId === batch.id ? ' editing' : ''}"
                 data-batch-id="${batchId}">
                <div class="batch-card-header"
                     title="Double-click to rename, click to select">
                    ${nameCol}
                    ${selectedBatchId === batch.id ? `
                        <button type="button"
                                class="btn subtle clear-batch-btn"
                                data-action="${ACTION.DESELECT_BATCHES}"
                                title="Deselect this batch">
                            Deselect
                        </button>
                    ` : ''}
                    ${selectedBatchId === batch.id ? '' : `
                        <button type="button"
                                class="btn"
                                data-action="${ACTION.ADD_UNIFORM}"
                                data-batch-id="${batchId}">
                            +
                        </button>
                    `}
                    <button type="button"
                            class="btn icon danger"
                            data-action="${ACTION.REMOVE_BATCH}"
                            data-batch-id="${batchId}"
                            title="Delete batch">
                        ${ICON.REMOVE}
                    </button>
                </div>
                <div class="batch-uniforms">${rows}</div>
            </div>
        `;
    }).join('');
}

// ─── Randomizer Panel DOM Generation ────────────────────────────────

export function renderRandomizerPanel(ui, provider, selectedBatchId, _editingBatchId) {
    const { batchSelectorDisplay, batchSelectorDropdown, randomizeBtn, uniformNames } = ui;
    const { customBatches, autoBatches } = provider;

    // Default to first available batch.
    if (!provider.getBatch(selectedBatchId)) {
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
    const knownNames = provider.getKnownUniformNames();
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
    uniformNames.innerHTML = provider.getKnownUniformNames()
        .map(name => `<option value="${escapeHtml(name)}"></option>`)
        .join('');

    return { selectedBatchId };
}

function formatDisplayValue(value) {
    if (value == null) {
        return '';
    }
    if (Array.isArray(value)) {
        return Math.min(...value).toFixed(2);
    }
    return String(value);
}

function formatDisplayMax(value) {
    if (value == null) {
        return '';
    }
    if (Array.isArray(value)) {
        return Math.max(...value).toFixed(2);
    }
    return String(value);
}

export function renderUniformList(ui, provider, selectedBatchId, _editingBatchId) {
    const { uniformListBody } = ui;
    if (!uniformListBody) return;

    const groups = new Map();
    for (const batch of provider.autoBatches) {
        for (const entry of batch.uniforms) {
            if (!groups.has(batch.name)) groups.set(batch.name, []);
            groups.get(batch.name).push(entry);
        }
    }

    const selectedBatch = selectedBatchId ? provider.getBatch(selectedBatchId) : null;
    const selectedNames = selectedBatch ? new Set(
        selectedBatch.uniforms.filter(u => u.active !== false).map(u => u.name)
    ) : null;

    // When editing a batch, show all uniforms with checkboxes reflecting their state in that batch.
    const editingBatch = _editingBatchId ? provider.getBatch(_editingBatchId) : null;

    if (!groups.size) {
        uniformListBody.innerHTML = '<div class="uniform-empty">No uniforms known yet</div>';
        return;
    }

    // Collect selected entries for the "Selected" section (only when not editing).
    const selectedEntries = [];
    for (const batch of provider.autoBatches) {
        for (const entry of batch.uniforms) {
            if (selectedNames && selectedNames.has(entry.name)) {
                selectedEntries.push({ name: entry.name, min: entry.min, max: entry.max });
            }
        }
    }

    const tableHeader = () => `
        <thead><tr>
            <th></th>
            <th>Name</th>
            <th>Type</th>
            <th>Min</th>
            <th>Max</th>
        </tr></thead>        
    `;
    let html = '';

    // Show "Selected" section only when no batch selected
    if (selectedEntries.length && !selectedBatchId) {
        html += `
            <div class="uniform-section selected-section">
                <div class="section-header">Selected</div>
                <table class="uniform-table">
                    ${tableHeader()}
                    <tbody>
        `;
        for (const entry of selectedEntries) {
            const range = provider.getControlRange(entry.name);
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
                    ${tableHeader()}
                    <tbody>
        `;
        for (const entry of entries) {
            const range = provider.getControlRange(entry.name);
            const type = range.type || 'float';
            // Determine checkbox state based on editing context.
            let checked = '';
            if (editingBatch) {
                // When editing a batch, show whether the uniform is active in that batch.
                const batchEntry = editingBatch.uniforms.find(u => u.name === entry.name);
                if (batchEntry && batchEntry.active !== false) {
                    checked = 'checked';
                }
            } else if (selectedNames) {
                checked = selectedNames.has(entry.name) ? 'checked' : '';
            }
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

export function renderPlayback(ui, engine) {
    const time = engine.currentTime;
    ui.timeSlider.value = time;
    ui.timeDisplay.textContent = `${time.toFixed(1)}s`;
    const left = percentOfSpan(time, timelineSpan(engine));
    const playheads = ui.trackList.querySelectorAll('.playhead');
    for (const playhead of playheads) {
        playhead.style.left = left;
    }
}

