import {CHAR} from "../index.js";
import {formatValue} from "../format.js";
import {setShown} from "./html.js";
import {EASING_TYPES} from "../../engine/keyframes.js";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

function neighbourValue(className, title) {
    return `
        <div class="kf-val ${className}"
              title="${title}"></div>
    `;
}

export function keyframePopupTemplate() {
    return `
        <div class="kf-popup" style="display:none">
            <div class="row kf-popup-main">
                <div class="kf-info">
                    <span class="kf-time-label">t =</span>
                    <button type="button"
                            class="btn icon kf-seek-btn"
                            title="Seek to keyframe time">
                        <span class="kf-time-value"></span>
                    </button>
                </div>
                <div class="kf-values">
                    <label>prev</label>
                    <label>value</label>
                    <label>next</label>
                    <div class="kf-val kf-prev-val"
                        title="Previous keyframe value"></div>
                    <input class="field kf-current-val"
                           type="text"
                           inputmode="decimal"
                           spellcheck="false"
                           autocomplete="off">
                    <div class="kf-val kf-next-val"
                         title="Next keyframe value"></div>
                </div>
                <div class="kf-ease">
                    <label>Easing:</label>
                    <select class="field kf-ease-select">
                        ${EASING_TYPES.map(t =>
                            `<option value="${t}">${t === "smoothstep" ? "smooth" : t}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div class="row">
                <button type="button"
                        class="btn icon kf-undo-btn"
                        title="Undo">
                    ${CHAR.UNDO} Undo
                </button>
                <button type="button"
                        class="btn icon kf-remove-btn"
                        title="Remove keyframe">
                    ${CHAR.TRASH} Remove keyframe
                </button>
            </div>
        </div>`;
}

function showNeighbour(el, neighbour, kf, lane) {
    if (neighbour && neighbour !== kf) {
        el.textContent = formatValue(
            lane.mapToRange(neighbour.value)
        );
    } else {
        el.textContent = "--";
    }
}

/** Fill the popup with keyframe info; hides it when kf is missing. */
export function renderKeyframePopup(popup, kf, lane, surrounding) {
    if (!popup) {
        return;
    }
    setShown(popup, Boolean(kf));
    if (!kf) {
        return;
    }
    popup.querySelector(".kf-time-value").textContent =`${kf.time.toFixed(1)}\u2009s`;
    popup.querySelector(".kf-current-val").value = formatValue(
        lane.mapToRange(kf.value)
    );
    popup.querySelector(".kf-ease-select").value = kf.ease || "linear";
    showNeighbour(popup.querySelector(".kf-prev-val"), surrounding?.prev, kf, lane);
    showNeighbour(popup.querySelector(".kf-next-val"), surrounding?.next, kf, lane);
    popup.querySelector(".kf-undo-btn").disabled = !lane?._undoStack?.length;
    // Expose kfId for event handlers.
    popup.dataset.kfId = kf.id;
}

/**
 * Place the (visible) popup centred below an anchor rect in viewport
 * coordinates, clamped to the viewport.
 */
export function positionKeyframePopup(bar, anchor) {
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
