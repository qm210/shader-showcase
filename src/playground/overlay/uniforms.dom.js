import {escape, formatRange} from "./helpers.js";
import {CHAR} from "../../app/constants.js";
import {ACTION} from "../actions.js";
import {DATALIST} from "./overlay.dom.js";

function formatStr(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (Array.isArray(value)) {
        return String(value).replaceAll(",", "/");
    }
    return String(value);
}

function getComponentRange(range, index) {
    if (range === null || range === undefined) {
        return { min: 0, max: 1, step: 0.01 };
    }
    const minVal = Array.isArray(range.min) ? range.min[index] : range.min;
    const maxVal = Array.isArray(range.max) ? range.max[index] : range.max;
    return { min: minVal ?? 0, max: maxVal ?? 1, step: range.step ?? 0.01 };
}

function formatComponentValue(value, index) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) {
        return String(value[index] ?? "");
    }
    return String(value);
}

export function renderUniformList(ui, provider, selectedBatchId, editingBatchId) {
    const {uniformListBody} = ui;
    if (!uniformListBody) {
        return;
    }

    const groups = new Map();
    for (const batch of provider.batches.auto) {
        for (const entry of batch.uniforms) {
            if (!groups.has(batch.name)) {
                groups.set(batch.name, []);
            }
            groups.get(batch.name).push(entry);
        }
    }
    const selectedBatch = provider.getBatch(selectedBatchId);
    const selectedNames = selectedBatch
        ? new Set(
            selectedBatch.uniforms.filter(u => u.active !== false).map(u => u.name)
        ) : null;

    const editingBatch = provider.getBatch(editingBatchId);

    if (!groups.size) {
        uniformListBody.innerHTML = '<div class="uniform-empty">No uniforms known yet</div>';
        return;
    }

    // Collect selected entries for the "Selected" section (only when not editing).
    const selectedEntries = [];
    for (const batch of provider.batches.auto) {
        for (const entry of batch.uniforms) {
            if (selectedNames && selectedNames.has(entry.name)) {
                selectedEntries.push({
                    name: entry.name,
                    min: entry.min,
                    max: entry.max
                });
            }
        }
    }

    const tableHeader = `
        <thead><tr>
            <th></th>
            <th>Name</th>
            <th>Type</th>
            <th>Min</th>
            <th>Value</th>
            <th>Max</th>
        </tr></thead>        
    `;

    let html = renderSelectedUniformsSection(
        provider, selectedEntries, selectedBatchId, tableHeader
    );

    for (const [groupName, entries] of groups) {
        html += `
            <div class="uniform-group">
                <div class="uniform-group-header" data-group="${escape(groupName)}">
                    <span class="uniform-group-arrow"></span>
                    <span class="uniform-group-name">${escape(groupName)}</span>
                    <span class="uniform-group-count">(${entries.length})</span>
                </div>
                <table class="uniform-table group-body">
                    ${tableHeader}
                    <tbody>
        `;
        for (const entry of entries) {
            const range = provider.getControlRange(entry.name);
            const isVec = /^vec[2-4]$/.test(entry.type);
            const dims = isVec ? parseInt(entry.type.slice(3), 10) : 1;
            const components = isVec ? ['x', 'y', 'z', 'w'].slice(0, dims) : [null];

            for (let i = 0; i < components.length; i++) {
                const suffix = components[i];
                const compName = suffix ? `${entry.name}.${suffix}` : entry.name;
                const compType = suffix ? `${entry.type}.${suffix}` : entry.type;
                const compRange = getComponentRange(range, i);
                let checked = "";
                if (editingBatch) {
                    // When editing a batch, show whether the uniform is active in that batch.
                    const batchEntry = editingBatch.uniforms.find(u => u.name === entry.name);
                    if (batchEntry && batchEntry.active !== false) {
                        checked = "checked";
                    }
                } else if (selectedNames) {
                    checked = selectedNames.has(entry.name) ? "checked" : "";
                }
                const isComponent = i > 0;
                html += `
                        <tr class="uniform-row${isComponent ? ' uniform-row-component' : ''}">
                            <td class="cell-check">
                                ${isComponent
                                    ? '<span class="component-placeholder"></span>'
                                    : `<input type="checkbox"
                                           class="uniform-checkbox"
                                           data-uniform-name="${entry.name}"
                                           ${checked}>`}
                            </td>
                            <td class="cell-name">${isComponent ? '' : entry.name}</td>
                            <td class="cell-type">${compType}</td>
                            <td class="cell-min">
                                <input type="text"
                                       class="uniform-min"
                                       placeholder="${escape(formatRange(compRange.min))}"
                                       value="${formatComponentValue(entry.min, i)}"
                                       data-uniform-name="${entry.name}"
                                       data-component="${i}"
                                       title="Min overwrite (empty = control default)"
                                       inputmode="decimal">
                            </td>
                            <td class="cell-value">
                                <span class="slider-tooltip">${formatComponentValue(range.value, i)}</span>
                                <input type="range"
                                       class="uniform-slider"
                                       data-uniform-name="${entry.name}"
                                       data-component="${i}"
                                       min="${compRange.min}"
                                       max="${compRange.max}"
                                       step="${compRange.step}"
                                       title="Drag to preview value">
                            </td>
                            <td class="cell-max">
                                <input type="text"
                                       class="uniform-max"
                                       placeholder="${formatRange(compRange.max)}"
                                       value="${formatComponentValue(entry.max, i)}"
                                       data-uniform-name="${entry.name}"
                                       data-component="${i}"
                                       title="Max overwrite (empty = control default)"
                                       inputmode="decimal">
                            </td>
                        </tr>
                `;
            }
        }
        html += `
                    </tbody>
                </table>
            </div>
        `;
    }
    uniformListBody.innerHTML = html;
}

export function renderBatchList(ui, controlsProvider, selectedBatchId, editingBatchId) {
    const {batchList} = ui;
    const {batches} = controlsProvider;

    batchList.innerHTML = batches.custom.map(batch => {
        const batchId = escape(batch.id);
        const rows = batch.uniforms.map((entry, index) => {
            const range = controlsProvider.getControlRange(entry.name);
            return `
                <div class="batch-uniform-row">
                    <input class="field name"
                           list="${DATALIST.UNIFORMS}"
                           placeholder="uniform..."
                           value="${entry.name}"
                           data-batch-id="${batchId}"
                           data-index="${index}"
                           spellcheck="false"
                           autocomplete="off">
                    <div>
                        <span>${CHAR.TIMES}</span>
                        <drag-number step="0.01">
                            <input class="field factor"
                                   placeholder="factor"
                                   value="${entry.factor ?? 1}"
                                   data-batch-id="${batchId}"
                                   data-index="${index}"
                                   title="Factor multiplier (default 1)"
                                   inputmode="decimal">
                        </drag-number>
                    </div>
                    <div>
                        <span>[</span>
                        <input class="field min"
                               placeholder="${formatRange(range.min)}"
                               value="${formatStr(entry.min)}"
                               data-batch-id="${batchId}"
                               data-index="${index}"
                               title="Min overwrite (empty = control default)"
                               inputmode="decimal">
                    </div>
                    <div>
                        <input class="field max"
                               placeholder="${formatRange(range.max)}"
                               value="${formatDisplayMax(entry.max)}"
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
                            title="Remove uniform">${CHAR.TRASH}</button>
                </div>
            `;
        }).join('');

        const nameCol = editingBatchId === batch.id
            ? `<input class="field name"
                      value="${escape(batch.name)}"
                      data-batch-id="${batchId}"
                      spellcheck="false"
                      autocomplete="off">`
            : `<span class="batch-name name"
                     data-batch-id="${batchId}">
                    ${escape(batch.name)}
                </span>`;

        return `
            <div class="batch-card${batch.id === selectedBatchId ? ' selected' : ''}${editingBatchId === batch.id ? ' editing' : ''}"
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
                        ${CHAR.TRASH}
                    </button>
                </div>
                <div class="batch-uniforms">${rows}</div>
            </div>
        `;
    }).join('');
}

function renderSelectedUniformsSection(provider, selectedEntries, selectedBatchId, tableHeader) {
    if (selectedBatchId || !selectedEntries.length) {
        return "";
    }
    let html = "";
    html += `
        <div class="uniform-section selected-section">
            <div class="section-header">Selected</div>
            <table class="uniform-table">
                ${tableHeader}
                <tbody>
    `;
    for (const entry of selectedEntries) {
        const range = provider.getControlRange(entry.name);
        const isVec = /^vec[2-4]$/.test(entry.type);
        const dims = isVec ? parseInt(entry.type.slice(3), 10) : 1;
        const components = isVec ? ['x', 'y', 'z', 'w'].slice(0, dims) : [null];

        for (let i = 0; i < components.length; i++) {
            const suffix = components[i];
            const compType = suffix ? `${entry.type}.${suffix}` : entry.type;
            const compRange = getComponentRange(range, i);
            const isComponent = i > 0;
            html += `
                    <tr class="uniform-row${isComponent ? ' uniform-row-component' : ''}">
                        <td class="cell-check">
                            ${isComponent
                                ? '<span class="component-placeholder"></span>'
                                : `<input type="checkbox"
                                       class="uniform-checkbox"
                                       data-uniform-name="${entry.name}"
                                       checked>`}
                        </td>
                        <td class="cell-name">${isComponent ? '' : entry.name}</td>
                        <td class="cell-type">${compType}</td>
                        <td class="cell-min">
                            <input type="text"
                                   class="uniform-min"
                                   placeholder="${formatStr(compRange.min)}"
                                   value="${formatComponentValue(entry, i)}"
                                   data-uniform-name="${entry.name}"
                                   data-component="${i}"
                                   title="Min overwrite (empty = control default)"
                                   inputmode="decimal">
                        </td>
                        <td class="cell-value">
                            <span class="slider-tooltip">${formatComponentValue(entry.min, i)}</span>
                            <input type="range"
                                   class="uniform-slider"
                                   data-uniform-name="${entry.name}"
                                   data-component="${i}"
                                   min="${compRange.min}"
                                   max="${compRange.max}"
                                   step="${compRange.step}"
                                   title="Drag to preview value">
                        </td>
                        <td class="cell-max">
                            <input type="text"
                                   class="uniform-max"
                                   placeholder="${formatStr(compRange.max)}"
                                   value="${formatComponentValue(entry.max, i)}"
                                   data-uniform-name="${entry.name}"
                                   data-component="${i}"
                                   title="Max overwrite (empty = control default)"
                                   inputmode="decimal">
                        </td>
                    </tr>
            `;
        }
    }
    html += `
                </tbody>
            </table>
        </div>
    `;
    return html;
}