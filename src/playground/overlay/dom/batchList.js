import {ACTION} from '../../actions.js';
import {CHAR} from '../index.js';
import {formatOverwrite, formatRange} from '../format.js';
import {actionButton, cls, dataAttrs, editableName, esc} from './html.js';

import {DATALIST} from "./shell.js";

function overwriteInput(kind, value, placeholder, data) {
    const label = kind === 'min' ? 'Min' : 'Max';
    return `
        <input class="field ${kind}"
               placeholder="${esc(formatRange(placeholder))}"
               value="${esc(formatOverwrite(value))}"
               ${data}
               title="${label} overwrite (empty = control default)"
               inputmode="decimal">
    `;
}

function batchUniformRow(provider, batchId, entry, index) {
    const range = provider.getControlRange(entry.name);
    const data = dataAttrs({batchId, index});
    return `
        <div class="batch-uniform-row">
            <input class="field name"
                   list="${DATALIST.UNIFORMS}"
                   placeholder="uniform..."
                   value="${esc(entry.name)}"
                   ${data}
                   spellcheck="false"
                   autocomplete="off">
        </div>
            <div>
                <span>${CHAR.TIMES}</span>
                <drag-number step="0.01">
                    <input class="field factor"
                           placeholder="factor"
                           value="${esc(entry.factor ?? 1)}"
                           ${data}
                           title="Factor multiplier (default 1)"
                           inputmode="decimal">
                </drag-number>
        </div>
            </div>
            <div>
                <span>[</span>
                ${overwriteInput('min', entry.min, range.min, data)}
            </div>
            <div>
                ${overwriteInput('max', entry.max, range.max, data)}
                <span>]</span>
            </div>
            ${actionButton({
                action: ACTION.REMOVE_UNIFORM,
                label: CHAR.TRASH,
                className: 'btn icon subtle',
                title: 'Remove uniform',
                data: {batchId, index},
            })}
        </div>`;
}

function batchHeaderButtons(batchId, isSelected) {
    const toggle = isSelected
        ? actionButton({
            action: ACTION.DESELECT_BATCHES,
            label: 'Deselect',
            className: 'btn subtle clear-batch-btn',
            title: 'Deselect this batch',
        })
        : actionButton({
            action: ACTION.ADD_UNIFORM,
            label: '+',
            data: {batchId},
        });
    const remove = actionButton({
        action: ACTION.REMOVE_BATCH,
        label: CHAR.TRASH,
        className: 'btn icon danger',
        title: 'Delete batch',
        data: {batchId},
    });
    return toggle + remove;
}

function batchCard(provider, batch, selectedBatchId, editingBatchId) {
    const isSelected = batch.id === selectedBatchId;
    const isEditing = batch.id === editingBatchId;
    const data = {batchId: batch.id};
    const rows = batch.uniforms
        .map((entry, i) => batchUniformRow(provider, batch.id, entry, i))
        .join('');
    return `
        <div class="${cls(
                'batch-card', isSelected && 'selected', isEditing && 'editing'
             )}"
             ${dataAttrs(data)}>
            <div class="batch-card-header"
                 title="Double-click to rename, click to select">
                ${editableName({
                    isEditing,
                    name: batch.name,
                    data,
                    labelClass: 'batch-name',
                })}
                ${batchHeaderButtons(batch.id, isSelected)}
            </div>
            <div class="batch-uniforms">${rows}</div>
        </div>`;
}

export function renderBatchList(ui, provider, {selectedId, renamingId}) {
    ui.batchList.innerHTML = provider.batches.custom
        .map(batch =>
            batchCard(provider, batch, selectedId, renamingId)
        ).join('');
}
