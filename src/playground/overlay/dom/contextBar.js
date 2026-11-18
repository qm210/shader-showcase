import {CHAR} from "../index.js";
import {formatValue} from "../format.js";
import {setShown} from "./html.js";
import {EASING_TYPES} from "../../engine/keyframes.js";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

function neighbourValue(className, title) {
    return `
        <span class="kf-val ${className}"
              title="${title}">
            ${CHAR.NO_VALUE}
        </span>
    `;
}

export function contextBarTemplate() {
    return `
        <div class="context-action-bar">
            <div class="kf-info">
                <span class="kf-time-label">t</span>
                <span class="kf-time-value"></span>
            </div>
            <div class="kf-values">
                <div class="kf-field-group">
                    <label>Prev</label>
                    ${neighbourValue('kf-prev-val', 'Previous keyframe value')}
                </div>
                <div class="kf-field-group">
                    <label>Val</label>
                    <input class="field kf-current-val"
                           type="text"
                           inputmode="decimal"
                           spellcheck="false"
                           autocomplete="off">
                </div>
                <div class="kf-field-group">
                    <label>Next</label>
                    ${neighbourValue('kf-next-val', 'Next keyframe value')}
                </div>
            </div>
            <div class="kf-ease">
                <label>Ease:</label>
                <select class="field kf-ease-select">
                    ${EASING_TYPES.map(t =>
                        `<option value="${t}">${t === "smoothstep" ? "smooth" : t}</option>`
                    ).join('')}
                </select>
            </div>
            <button type="button"
                    class="btn icon kf-undo-btn"
                    title="Undo (Ctrl+Z)">
                ${CHAR.UNDO}
            </button>
        </div>`;
}

/** Create the context action bar element (initially hidden). */
export function createContextActionBar() {
    const bar = document.createElement("div");
    bar.className = "context-action-bar";
    setShown(bar, false);
    bar.innerHTML = `
        <div class="kf-info">
            <span class="kf-time-label">t</span>
            <span class="kf-time-value"></span>
        </div>
        <div class="kf-values">
            <div class="kf-field-group">
                <label>Prev</label>
                ${neighbourValue('kf-prev-val', 'Previous keyframe value')}
            </div>
            <div class="kf-field-group">
                <label>Val</label>
                <input class="field kf-current-val"
                       type="text"
                       inputmode="decimal"
                       spellcheck="false"
                       autocomplete="off">
            </div>
            <div class="kf-field-group">
                <label>Next</label>
                ${neighbourValue('kf-next-val', 'Next keyframe value')}
            </div>
        </div>
        <div class="kf-ease">
            <label>Ease:</label>
            <select class="field kf-ease-select">
                ${EASING_TYPES.map(t =>
                    `<option value="${t}">${t === "smoothstep" ? "smooth" : t}</option>`
                ).join('')}
            </select>
        </div>
        <button type="button"
                class="btn icon kf-undo-btn"
                title="Undo (Ctrl+Z)">
            ${CHAR.UNDO}
        </button>`;
    return bar;
}

function showNeighbour(el, neighbour, kf, lane) {
    const visible = Boolean(neighbour) && neighbour !== kf;
    setShown(el, visible);
    if (visible) {
        el.textContent = formatValue(_fromNormalized(neighbour.value, lane));
    }
}

/** Map a [-1, +1] value (or array) to the lane's range for display. */
function _fromNormalized(normalized, lane) {
    if (!lane || lane.targets.length === 0) {
        return normalized;
    }
    const mapScalar = (val, target) =>
        target.minValue + (val + 1) * (target.maxValue - target.minValue) / 2;
    if (Array.isArray(normalized)) {
        return normalized.map((v, i) => {
            const t = lane.targets[i] || lane.targets[0];
            return t ? mapScalar(v, t) : v;
        });
    }
    const target = lane.targets[0];
    return mapScalar(normalized, target);
}

/** Fill the bar with keyframe info; hides it when kf is missing. */
export function renderContextActionBar(bar, kf, lane, surrounding) {
    if (!bar) {
        return;
    }
    setShown(bar, Boolean(kf));
    if (!kf) {
        return;
    }
    bar.querySelector(".kf-time-value").textContent = `${kf.time.toFixed(1)}s`;
    bar.querySelector(".kf-current-val").value = formatValue(_fromNormalized(kf.value, lane));
    bar.querySelector(".kf-ease-select").value =
        kf.ease || "linear";
    showNeighbour(bar.querySelector(".kf-prev-val"), surrounding?.prev, kf, lane);
    showNeighbour(bar.querySelector(".kf-next-val"), surrounding?.next, kf, lane);
    bar.querySelector(".kf-undo-btn").disabled = !lane?._undoStack?.length;
}

/**
 * Place the (visible) bar centred below an anchor rect in viewport
 * coordinates, clamped to the viewport.
 */
export function positionContextBar(bar, anchor) {
    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    const centreX = anchor.left + anchor.width / 2;
    const left = Math.min(
        Math.max(VIEWPORT_MARGIN, centreX - width / 2),
        window.innerWidth - width - VIEWPORT_MARGIN
    );
    const top = Math.min(
        Math.max(VIEWPORT_MARGIN, anchor.bottom + ANCHOR_GAP),
        window.innerHeight - height - VIEWPORT_MARGIN
    );
    bar.style.left = `${left + window.scrollX}px`;
    bar.style.top = `${top + window.scrollY}px`;
}
