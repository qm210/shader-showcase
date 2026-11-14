import {escape} from './helpers.js';
import {ACTION} from '../actions.js';
import {percentOfSpan, timelineSpan} from "../engine/math.js";
import {calcTrackValueRange} from "../engine/valueRanges.js";
import {CHAR} from '../../app/constants.js';

export const MIN_TIMELINE_SPAN = 60;

export const DATALIST = {
    UNIFORMS: 'playground-uniform-names'
};

export function createPlaygroundOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pg-overlay';
    overlay.innerHTML = `
        <div class="panel-header"
             data-drag-handle>
            <span class="title">
                Uniform Playground
            </span>
             <div class="panel-header-actions">
                <div class="uniform-snaphot">
                    <span>Uniforms:</span>
                    <button type="button"
                            class="btn danger reset-btn"
                            data-action="${ACTION.RESET}"
                            title="Clear all tracks, batches, values and the stored overlay state">
                        Reset
                    </button>
                    <button type="button"
                            class="btn danger load-snapshot-btn"
                            data-action="${ACTION.LOAD_SNAPSHOT}"
                            title="Load current uniform values from main page sliders">
                        Load Snapshot
                    </button>
                </div>
                <div class="track-list-export">
                    <span>Timeline:</span>
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
            <button type="button"
                    class="minimize-btn"
                    data-action="${ACTION.HIDE_OVERLAY}"
                    title="Minimize">
                ${CHAR.X_MARK}
            </button>
        </div>

        <div class="timeline-editor">
            <div class="tracks-actions">
                <button type="button"
                    class="btn"
                    data-action="${ACTION.ADD_TRACK}"
                    title="Create a new track">
                    + Track
                </button>            
            </div>
            <div class="timeline-controls">
                <div class="play-controls">
                    <div class="speed-control">
                        <label for="playground-speed">
                            ${CHAR.TIMES}
                        </label>
                        <input type="number"
                               id="playground-speed"
                               class="field num speed-input"
                               min="0.1"
                               max="20"
                               step="0.1"
                               value="1.0">
                    </div>
                    <button type="button"
                            class="btn icon play-btn"
                            data-action="${ACTION.PLAY}"
                            title="Play/Pause (Space)">
                        ${CHAR.PLAY}
                    </button>                    
                </div>
            </div>            
            <div class="time-range-bar">
                <div class="time-range-labels">
                    <div>
                        <span class="time-range-label">Start:</span>
                        <input type="number" class="field num time-start" min="0" step="1" value="0">
                        <span class="time-range-unit">s</span>
                    </div>
                    <div>
                        <span class="time-range-label">End:</span>
                        <input type="number" class="field num time-end" min="1" step="1" value="60">
                        <span class="time-range-unit">s</span>
                    </div>
                </div>
                <input type="range"
                       class="time-slider"
                       min="0"
                       max="60"
                       step="0.1"
                       value="0">
            </div>
            <div></div>
            <div class="track-rows"></div>
            <div class="value-preview"></div>
        </div>

        <div class="uniform-list-panel">
            <div class="uniform-list-header">
                Uniforms
                <button type="button"
                        class="btn subtle clear-batch-btn"
                        data-action="${ACTION.DESELECT_BATCHES}"
                        title="Unselect all uniform batches">
                    Deselect Batch
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
            timeStart: overlay.querySelector('.time-start'),
            timeEnd: overlay.querySelector('.time-end'),

            speedInput: overlay.querySelector('.speed-input'),
            timelineEditor: overlay.querySelector('.timeline-editor'),
            preview: overlay.querySelector('.value-preview'),
            batchSelectorDisplay: overlay.querySelector('.target-selector-display'),
            batchSelectorDropdown: overlay.querySelector('.target-selector-dropdown'),
            randomizeBtn: overlay.querySelector('.randomize-btn'),
            intensitySlider: overlay.querySelector('.intensity-slider'),
            intensityValue: overlay.querySelector('.intensity-value'),
            batchList: overlay.querySelector('.batch-list'),
            uniformNames: overlay.querySelector(`#${DATALIST.UNIFORMS}`),
            uniformListBody: overlay.querySelector('.uniform-list-body'),
        },
        // Context action bar for selected keyframe
        contextBar: null,
    };
}

/** Create the context action bar element (shown near a selected keyframe). */
export function createContextActionBar() {
    const bar = document.createElement('div');
    bar.className = 'context-action-bar';
    bar.innerHTML = `
        <div class="kf-info">
            <span class="kf-time-label">t</span>
            <span class="kf-time-value"></span>
        </div>
        <div class="kf-values">
            <div class="kf-field-group">
                <label>Prev</label>
                <span class="kf-val kf-prev-val" title="Previous keyframe value">${CHAR.NO_VALUE}</span>
            </div>
            <div class="kf-field-group">
                <label>Val</label>
                <input class="field kf-current-val" type="text" inputmode="decimal"
                       spellcheck="false" autocomplete="off">
            </div>
            <div class="kf-field-group">
                <label>Next</label>
                <span class="kf-val kf-next-val" title="Next keyframe value">${CHAR.NO_VALUE}</span>
            </div>
        </div>
        <div class="kf-transition">
            <label>Tr:</label>
            <select class="field kf-transition-select">
                <option value="linear">linear</option>
                <option value="smoothstep">smooth</option>
                <option value="step">step</option>
            </select>
        </div>
        <button type="button" class="btn icon kf-undo-btn" title="Undo (Ctrl+Z)">↩</button>
    `;
    return bar;
}

/** Format a keyframe value for display. */
function formatKfValue(val) {
    if (val == null) return CHAR.NO_VALUE;
    if (Array.isArray(val)) return '[' + val.map(v => v.toFixed(3)).join(', ') + ']';
    return val.toFixed(4);
}

/** Render the context action bar with keyframe info. */
export function renderContextActionBar(bar, kf, track, surrounding) {
    if (!bar || !kf) {
        if (bar) bar.style.display = 'none';
        return;
    }
    bar.style.display = '';

    bar.querySelector('.kf-time-value').textContent = kf.time.toFixed(1) + 's';
    bar.querySelector('.kf-current-val').value = formatKfValue(kf.value);
    bar.querySelector('.kf-transition-select').value = kf.transition || 'linear';

    const prevEl = bar.querySelector('.kf-prev-val');
    if (surrounding?.prev && surrounding.prev !== kf) {
        prevEl.textContent = formatKfValue(surrounding.prev.value);
        prevEl.style.display = '';
    } else {
        prevEl.style.display = 'none';
    }

    const nextEl = bar.querySelector('.kf-next-val');
    if (surrounding?.next && surrounding.next !== kf) {
        nextEl.textContent = formatKfValue(surrounding.next.value);
        nextEl.style.display = '';
    } else {
        nextEl.style.display = 'none';
    }
}

export function renderTracks(ui, provider, selectedTrackId, editingTrackId, collapsedTrackIds, selectedKeyframe) {
    const { timelineEditor } = ui;
    const engine = provider.engine;
    const trackRows = timelineEditor.querySelector('.track-rows');
    ui.timeSlider.max = timelineSpan(engine);

    // Build set of known uniform/batch names for validation
    const knownNames = new Set(provider.getKnownUniformNames());
    for (const batch of provider.allBatches()) {
        knownNames.add(batch.id);
    }

    for (const track of engine.getAllTracks()) {
        const id = escape(track.id);

        // Build target rows: show filled targets + one empty row at the end
        const targetRows = [];
        for (let i = 0; i < track.targets.length; i++) {
            const target = track.targets[i];
            const isValid = !target.uniformName || knownNames.has(target.uniformName);
            const invalidClass = !isValid ? 'invalid-target' : '';
            const disabledAttr = !isValid && target.enabled ? 'disabled' : '';
            const checkedAttr = (!isValid || target.enabled) ? 'checked' : '';
            targetRows.push(`
                <div class="target-row ${invalidClass}">
                    <input type="checkbox"
                           class="target-enable"
                           data-track-id="${id}"
                           data-target-idx="${i}"
                           ${checkedAttr}
                           ${disabledAttr}
                           title="Enable/disable">
                    <input type="text"
                           class="field target-selector"
                           list="${DATALIST.UNIFORMS}"
                           placeholder="Uniform name"
                           value="${escape(target.uniformName)}"
                           data-track-id="${id}"
                           data-target-idx="${i}"
                           spellcheck="false"
                           autocomplete="off">
                    <button type="button"
                            class="btn icon subtle"
                            data-action="${ACTION.REMOVE_TARGET}"
                            data-track-id="${id}"
                            data-target-idx="${i}"
                            title="Remove target">${CHAR.TIMES}</button>
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
            const title = escape(`t=${kf.time.toFixed(1)}s, val=${kf.value}, ${kf.transition}`);
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
                      value="${escape(track.name)}"
                      data-track-id="${id}"
                      spellcheck="false"
                      autocomplete="off">
               <button type="button"
                       class="btn subtle cancel-name"
                       data-action="${ACTION.CANCEL_TRACK_NAME}"
                       data-track-id="${id}">${CHAR.X_MARK}</button>`
            : `<span class="track-name name"
                     data-track-id="${id}">
                    ${escape(track.name)}
                </span>`;

        const cols = `
            <div class="track-name-col">${nameCol}</div>
            <div class="track-targets-col">
                ${targetRows.join('')}
            </div>
            <div class="track-widget">
                <div class="keyframe-strip"
                     data-track-id="${id}"
                     title="Click to set keyframe">
                    <div class="strip-bg"></div>
                    ${dots}
                    <div class="playhead"
                         style="left:${percentOfSpan(engine.currentTime, timelineSpan(engine))}"></div>
                    <span class="range-label max-label">${escape(trackMax.toFixed(2))}</span>
                    <span class="zero-marker">0</span>
                    <span class="range-label min-label">${escape(trackMin.toFixed(2))}</span>
                </div>
            </div>
            <div class="track-actions-col">
                <button type="button"
                        class="btn icon"
                        data-action="${ACTION.ADD_KEYFRAME}"
                        data-track-id="${id}"
                        title="Add keyframe at current time">+</button>
                <button type="button"
                        class="btn icon"
                        data-action="${ACTION.RESCALE_TRACK}"
                        data-track-id="${id}"
                        title="Rescale time range">${CHAR.RESCALE}</button>
                <button type="button"
                        class="btn icon"
                        data-action="${ACTION.COPY_TRACK}"
                        data-track-id="${id}"
                        title="Copy keyframes">${CHAR.ARROW_PAIR_RIGHT}</button>
                <button type="button"
                        class="btn icon"
                        data-action="${ACTION.PASTE_TRACK}"
                        data-track-id="${id}"
                        title="Paste keyframes">${CHAR.ARROW_PAIR_LEFT}</button>
                <button type="button"
                        class="btn icon"
                        data-action="${ACTION.CLEAR_TRACK}"
                        data-track-id="${id}"
                        title="Clear track keyframes">${CHAR.CLEAR}</button>
                <button type="button"
                        class="btn icon danger"
                        data-action="${ACTION.DELETE_TRACK}"
                        data-track-id="${id}"
                        title="Delete track">${CHAR.TRASH}</button>
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
        trackRows.appendChild(wrapper);
    }
}

export function renderPreview(ui, engine) {
    const lines = Object.entries(engine.getAllUniformValues()).map(([name, val]) => {
        const displayVal = Array.isArray(val)
            ? `[${val.map(v => v.toFixed(3)).join(', ')}]`
            : val.toFixed(4);
        return `<div class="val-line">
                    <span class="val-name">${escape(name)}</span>
                    <span class="val-num">${displayVal}</span>
                </div>`;
    });
    ui.preview.innerHTML = lines.length > 0
        ? lines.join('')
        : '<div class="val-empty">No active tracks</div>';
}

// ─── Batch List DOM Generation ──────────────────────────────────────

// ─── Randomizer Panel DOM Generation ────────────────────────────────

export function renderRandomizerPanel(ui, provider, selectedBatchId) {
    const { batchSelectorDisplay, batchSelectorDropdown, randomizeBtn, uniformNames } = ui;
    const { batches } = provider;

    // Default to first available batch.
    if (!provider.getBatch(selectedBatchId)) {
        return { selectedBatchId: batches.custom[0]?.id ?? batches.auto[0]?.id ?? null };
    }

    // Build all targets (custom batches + auto batches + individual uniforms).
    const allTargets = [];
    for (const batch of provider.allBatches()) {
        allTargets.push({ id: batch.id, name: batch.name, type: 'batch' });
    }
    const knownNames = provider.getKnownUniformNames();
    for (const name of knownNames) {
        if (!allTargets.some(t => t.id === `uniform:${name}`)) {
            allTargets.push({ id: `uniform:${name}`, name, type: 'uniform' });
        }
    }

    // Dropdown items.
    batchSelectorDropdown.innerHTML = allTargets.map(target => {
        const isSelected = target.id === selectedBatchId;
        return `
            <div class="selector-item${isSelected ? ' selected' : ''}"
                 data-target-id="${escape(target.id)}">
                <span class="selector-icon">${
                    target.type === 'batch' ? CHAR.BULLET_BATCH : CHAR.BULLET_UNIFORM
                }</span>
                <span class="selector-name">${escape(target.name)}</span>
            </div>
        `;
    }).join('');

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
        .map(name => `<option value="${escape(name)}"></option>`)
        .join('');

    return { selectedBatchId };
}

export function renderPlayback(ui, engine) {
    const time = engine.currentTime;
    ui.timeSlider.value = time;
    const left = percentOfSpan(time, timelineSpan(engine));
    const playheads = ui.timelineEditor.querySelectorAll('.playhead');
    for (const playhead of playheads) {
        playhead.style.left = left;
    }
}

