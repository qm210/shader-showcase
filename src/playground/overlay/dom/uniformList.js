import {ACTION} from '../../actions.js';
import {formatRange} from '../utils.js';
import {componentRange, formatComponent, isIntegerType, vectorComponents,} from '../format.js';
import {actionButton, cls, dataAttrs, esc} from './html.js';

const TABLE_HEADER = `
    <thead><tr>
        <th></th>
        <th>Name</th>
        <th>Type</th>
        <th>Min</th>
        <th>Value</th>
        <th>Max</th>
    </tr></thead>`;

const OVERWRITE_TITLE = {
    min: 'Min overwrite (empty = control default)',
    max: 'Max overwrite (empty = control default)',
};

export function uniformPanelTemplate() {
    return `
        <div class="uniform-list-panel">
            <div class="uniform-list-header">
                Uniforms
                ${actionButton({
                    action: ACTION.DESELECT_BATCHES,
                    label: 'Deselect Batch',
                    className: 'btn subtle clear-batch-btn',
                    title: 'Unselect all uniform batches',
                })}
            </div>
            <div class="uniform-list-body"></div>
            <div class="uniform-batches">
                <div class="batch-list"></div>
                ${actionButton({
                    action: ACTION.ADD_BATCH,
                    label: '+ Batch of Uniforms',
                    className: 'btn batch-add-btn',
                    title: 'Create a new uniform batch',
                })}
            </div>
        </div>`;
}

/** Names of the active uniforms of a batch, or null without a batch. */
function activeNames(batch) {
    if (!batch) {
        return null;
    }
    return new Set(
        batch.uniforms.filter(u => u.active !== false).map(u => u.name)
    );
}

/** Auto-batch uniforms grouped by batch name (empty batches skipped). */
function groupByBatch(autoBatches) {
    const groups = new Map();
    for (const batch of autoBatches) {
        if (!batch.uniforms.length) {
            continue;
        }
        const entries = groups.get(batch.name) ?? [];
        entries.push(...batch.uniforms);
        groups.set(batch.name, entries);
    }
    return groups;
}

function overwriteCell(kind, entry, index, placeholder) {
    return `
        <td class="cell-${kind}">
            <input type="text"
                   class="uniform-${kind}"
                   placeholder="${esc(formatRange(placeholder))}"
                   value="${esc(formatComponent(entry[kind], index))}"
                   ${dataAttrs({uniformName: entry.name, component: index})}
                   title="${OVERWRITE_TITLE[kind]}"
                   inputmode="decimal">
        </td>
    `;
}

/** One table row per component (a vec3 gives three rows). */
function uniformRows(provider, entry, isChecked) {
    const range = provider.getControlRange(entry.name);
    const isInteger = isIntegerType(entry.type);
    return vectorComponents(entry.type).map((suffix, i) => {
        const isComponent = i > 0;
        const compRange = componentRange(range, i, isInteger);
        const data = dataAttrs({uniformName: entry.name, component: i});
        const checkCell = isComponent
            ? '<span class="component-placeholder"></span>'
            : `<input type="checkbox"
                      class="uniform-checkbox"
                      ${dataAttrs({uniformName: entry.name})}
                      ${isChecked ? 'checked' : ''}>
            </td>`;
        const rowClass = cls(
            'uniform-row', isComponent && 'uniform-row-component'
        );
        return `
            <tr class="${rowClass}">
                <td class="cell-check">${checkCell}</td>
                <td class="cell-name">${isComponent ? '' : esc(entry.name)}</td>
                <td class="cell-type">
                    ${esc(suffix ? `${entry.type}.${suffix}` : entry.type)}
                </td>
                ${overwriteCell('min', entry, i, compRange.min)}
                <td class="cell-value">
                    <span class="slider-tooltip">
                        ${esc(formatComponent(range?.value, i))}
                    </span>
                    <input type="range"
                           class="uniform-slider"
                           ${data}
                           min="${compRange.min}"
                           max="${compRange.max}"
                           step="${compRange.step}"
                           title="Drag to preview value">
                </td>
            </tr>`;
    }).join('');
}

function uniformTable(provider, entries, isChecked, extraClass = '') {
    const rows = entries
        .map(entry => uniformRows(provider, entry, isChecked(entry)))
        .join('');
    return `
        <table class="${cls('uniform-table', extraClass)}">
            ${TABLE_HEADER}
            <tbody>${rows}</tbody>
        </table>`;
}

function groupSection(provider, groupName, entries, isChecked) {
    const name = esc(groupName);
    return `
        <div class="uniform-group">
            <div class="uniform-group-header" data-group="${name}">
                <span class="uniform-group-arrow"></span>
                <span class="uniform-group-name">${name}</span>
                <span class="uniform-group-count">(${entries.length})</span>
            </div>
            ${uniformTable(provider, entries, isChecked, 'group-body')}
        </div>`;
}

// NOTE: kept from the original, but it can never render: selectedEntries
// is only non-empty when a batch is selected, which returns early here.
function selectedSection(provider, selectedEntries, selectedBatchId) {
    if (selectedBatchId || !selectedEntries.length) {
        return '';
    }
    return `
        <div class="uniform-section selected-section">
            <div class="section-header">Selected</div>
            ${uniformTable(provider, selectedEntries, () => true)}
        </div>`;
}

export function renderUniformList(ui, provider, selectedBatchId,
                                  editingBatchId) {
    const {uniformListBody} = ui;
    if (!uniformListBody) {
        return;
    }
    const groups = groupByBatch(provider.batches.auto);
    if (!groups.size) {
        uniformListBody.innerHTML =
            '<div class="uniform-empty">No uniforms known yet</div>';
        return;
    }

    const selectedNames = activeNames(provider.getBatch(selectedBatchId));
    // While editing a batch, the checkboxes reflect that batch instead.
    const checkedNames = activeNames(provider.getBatch(editingBatchId))
        ?? selectedNames;
    const isChecked = (entry) => Boolean(checkedNames?.has(entry.name));

    const allEntries = [...groups.values()].flat();
    const selectedEntries = selectedNames
        ? allEntries.filter(entry => selectedNames.has(entry.name))
        : [];

    uniformListBody.innerHTML =
        selectedSection(provider, selectedEntries, selectedBatchId)
        + [...groups]
            .map(([name, entries]) =>
                groupSection(provider, name, entries, isChecked))
            .join('');
}
