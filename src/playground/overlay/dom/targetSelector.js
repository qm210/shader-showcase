import {esc} from "./html.js";
import "../../styles/targetSelector.css";

/**
 * Label, display and hidden dropdown of a target selector. The elements
 * get the classes `${className}-wrapper`, `-display` and `-dropdown`.
 */
export function targetSelectorTemplate(
    {label, title, className = "target-selector"}
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
        style.top = "auto";
        if (!style.maxHeight) {
            const maxHeight = Math.max(0, bottomEdge - 2 * gap);
            style.maxHeight = `${maxHeight}px`;
        }
    } else {
        style.bottom = "auto";
        style.top = `${rect.bottom + gap}px`;
    }
}
