import {cls, dataAttrs, esc} from './html.js';
import {CHAR} from '../index.js';
import "../../styles/targetSelector.css";

/**
 * Label, display and hidden dropdown of a target selector. The elements
 * get the classes `${className}-wrapper`, `-display` and `-dropdown`.
 */
export function targetSelectorTemplate(
    {label, title, className = 'target-selector'}
) {
    return `
        <div class="${className} selector-wrapper">
            <span>
                ${esc(label)}
            </span>
            <div class="selector-display"
                 title="${esc(title)}"
                 ></div>
            <div class="selector-dropdown"
                 hidden
                 ></div>
        </div>`;
}

/**
 * Fills the dropdown with `targets` ({id, name, type, count?}) and shows
 * the one with `selectedId` in the display.
 */
export function renderTargetSelector(display, dropdown, targets, selectedId) {
    dropdown.innerHTML = targets
        .map(target => selectorItem(target, selectedId))
        .join('');
    renderSelectorDisplay(
        display, targets.find(t => t.id === selectedId)
    );
}

function targetContent(target, countText) {
    const icon = target.type === 'batch'
        ? CHAR.BULLET_BATCH
        : CHAR.BULLET_UNIFORM;
    const countSpan = target.count !== undefined
        ? `<span class="selector-count">batch of [${countText(target.count)}]</span>`
        : '';
    return `
        <span class="selector-icon">${icon}</span>
        <span class="selector-name">${esc(target.name)}</span>
        ${countSpan}`;
}

function selectorItem(target, selectedId) {
    const selected = target.id === selectedId;
    return `
        <div class="${cls('selector-item', selected && 'selected')}"
             ${dataAttrs({targetId: target.id})}>
            ${targetContent(target, count => count)}
        </div>`;
}

function renderSelectorDisplay(display, target) {
    if (target) {
        display.innerHTML =
            targetContent(target, count => `batch of ${count}`);
        display.title = `${target.type}: ${target.name}`;
    } else {
        display.textContent = 'No target';
        display.title = 'Click to select a target';
    }
}

export function toggleTargetDropdown(selector, dropdown) {
    if (!dropdown.hidden) {
        dropdown.hidden = true;
        return;
    }
    const gap = 4;
    const viewportH = window.innerHeight;
    const rect = selector.getBoundingClientRect();
    const style = dropdown.style;
    style.left = `${rect.left}px`;
    style.width = `${rect.width}px`;

    dropdown.hidden = false;
    const height = dropdown.getBoundingClientRect().height;
    const spaceBelow = viewportH - rect.bottom;

    if (spaceBelow < height) {
        const bottomEdge = rect.top - gap;
        style.bottom = `${viewportH - bottomEdge}px`;
        style.top = 'auto';
        if (!style.maxHeight) {
            const maxHeight = Math.max(0, bottomEdge - 2 * gap);
            style.maxHeight = `${maxHeight}px`;
        }
    } else {
        style.bottom = 'auto';
        style.top = `${rect.bottom + gap}px`;
    }
}
