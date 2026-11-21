import {ACTION} from "../../actions.js";
import {actionButton, cls, dataAttrs, esc} from "./html.js";
import {CHAR} from "../index.js";
import {targetSelectorTemplate} from "./targetSelector.js";
import {TARGET_PREFIX, targetId} from "../../engine/targets.js";

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
                       min="0"
                       max="1"
                       step="0.01"
                       value="1">
                <span class="intensity-value">1.00</span>
                ${targetSelectorTemplate({
                    label: 'Target:',
                    title: 'Uniform batch to randomize',
                })}
            </div>
        </section>`;
}

function randomizerTargets(provider, selectedCount) {
    /** @type {{ id: string | null, name: string, type: string, count?: number }[]} */
    const targets = [
        {
            id: null,
            name: "Current Selection",
            type: "batch",
            count: selectedCount,
        },
    ];
    const ids = new Set([
        targets[0].id
    ]);
    for (const batch of provider.allBatches()) {
        targets.push({
            id: batch.id,
            name: batch.name,
            type: "batch",
            count: batch.uniforms.length,
        });
        ids.add(batch.id);
    }
    for (const name of provider.getUniformTargetNames()) {
        const id = targetId(TARGET_PREFIX.UNIFORM, name);
        if (!ids.has(id)) {
            targets.push({
                id,
                name,
                type: "uniform",
                count: undefined
            });
        }
    }
    return targets;
}

function selectorItem(target, selectedId) {
    const isCurrentSelection = target.id === null;
    const icon = isCurrentSelection
        ? CHAR.BULLET_UNIFORM
        : target.type === "batch"
            ? CHAR.BULLET_BATCH
            : CHAR.BULLET_UNIFORM;
    const countSpan = target.count !== undefined && target.count > 0
        ? `<span class="selector-count">[batch of ${target.count}]</span>`
        : "";
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
        const isCurrentSelection = target.id === null;
        const icon = isCurrentSelection
            ? CHAR.BULLET_UNIFORM
            : target.type === "batch"
                ? CHAR.BULLET_BATCH
                : CHAR.BULLET_UNIFORM;
        const countSpan = target.count !== undefined && target.count > 0
            ? `<span class="selector-count">[batch of ${target.count}]</span>`
            : "";
        display.innerHTML = `
            <span class="selector-icon">${icon}</span>
            <span class="selector-name">${esc(target.name)}</span>
            ${countSpan}`;
        display.title = isCurrentSelection
            ? `Randomize ${target.count} selected uniform${target.count !== 1 ? 's' : ''}`
            : `${target.type}: ${target.name}`;
    } else {
        display.textContent = "No target";
        display.title = "Click to select a target";
    }
}

export function renderRandomizerPanel(ui, provider, targetId, selectedCount = 0) {
    const targets = randomizerTargets(provider, selectedCount);
    ui.randomize.targetDropdown.innerHTML = targets
        .map(target => selectorItem(target, targetId))
        .join("");
    const target = targets.find(t => t.id === targetId);
    renderSelectorDisplay(ui.randomize.targetSelector, target);
    ui.randomize.button.disabled = target?.count === 0;
    ui.uniformNames.innerHTML = provider.getUniformTargetNames()
        .map(name => `<option value="${esc(name)}"></option>`)
        .join("");
}
