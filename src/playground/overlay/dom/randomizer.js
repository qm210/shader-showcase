import {ACTION} from '../../actions.js';
import {actionButton, cls, dataAttrs, esc} from './html.js';
import {CHAR} from "../index.js";

export function randomizerTemplate() {
    return `
        <section class="randomizer-panel">
            <div class="randomizer-run">
                ${actionButton({
                    action: ACTION.RANDOMIZE,
                    label: 'Randomize',
                    className: 'btn randomize-btn',
                })}
                <span class="intensity-label">amount:</span>
                <input type="range"
                       class="intensity-slider"
                       min="0" max="1" step="0.01" value="1">
                <span class="intensity-value">1.00</span>
                <div class="target-selector-wrapper">
                    <span>Target:</span>
                    <div class="target-selector-display"
                         title="Uniform batch to randomize">
                    </div>
                    <div class="target-selector-dropdown" hidden></div>
                </div>
            </div>
        </section>`;
}

const UNIFORM_TARGET_PREFIX = 'uniform:';

/** Custom batches, auto batches, then every single uniform. */
function randomizerTargets(provider) {
    const targets = provider.allBatches()
        .map(batch => ({
            id: batch.id,
            name: batch.name,
            type: 'batch',
            count: batch.uniforms.length
        }));
    const ids = new Set(targets.map(t => t.id));
    for (const name of provider.getKnownUniformNames()) {
        const id = UNIFORM_TARGET_PREFIX + name;
        if (!ids.has(id)) {
            targets.push({id, name, type: 'uniform'});
        }
    }
    return targets;
}

function selectorItem(target, selectedId) {
    const icon = target.type === 'batch'
        ? CHAR.BULLET_BATCH
        : CHAR.BULLET_UNIFORM;
    const countSpan = target.count !== undefined
        ? `<span class="selector-count">[${target.count}]</span>`
        : '';
    return `
        <div class="${cls('selector-item', target.id === selectedId
                          && 'selected')}"
             ${dataAttrs({targetId: target.id})}>
            <span class="selector-icon">${icon}</span>
            <span class="selector-name">${esc(target.name)}</span>
            ${countSpan}
        </div>
    `;
}

function renderSelectorDisplay(display, target) {
    if (target) {
        const kind = target.type === 'batch' ? 'Batch' : 'Uniform';
        const count = target.count !== undefined
            ? ` [${target.count}]`
            : '';
        display.textContent = target.name + count;
        display.title = `${kind}: ${target.name}`;
    } else {
        display.textContent = 'No target';
        display.title = 'Click to select a target';
    }
}

/**
 * Renders the panel and returns the effective selection: an unknown
 * batch id falls back to "All Uniforms", then the first custom, then
 * the first auto batch.
 */
export function renderRandomizerPanel(ui, provider, selectedBatchId) {
    const {batches} = provider;
    if (!provider.getBatch(selectedBatchId)) {
        selectedBatchId =
            batches.auto.find(b => b.id === 'auto:All Uniforms')?.id
            ?? batches.custom[0]?.id
            ?? batches.auto[0]?.id
            ?? null;
    }

    const targets = randomizerTargets(provider);
    ui.batchSelectorDropdown.innerHTML = targets
        .map(target => selectorItem(target, selectedBatchId))
        .join('');
    renderSelectorDisplay(
        ui.batchSelectorDisplay,
        targets.find(t => t.id === selectedBatchId)
    );
    ui.randomizeBtn.disabled = !selectedBatchId;
    ui.uniformNames.innerHTML = provider.getKnownUniformNames()
        .map(name => `<option value="${esc(name)}"></option>`)
        .join('');

    return {selectedBatchId};
}
