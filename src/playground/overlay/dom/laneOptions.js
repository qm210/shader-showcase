import {clamp} from "../index.js";

/* The rescale slider runs 0..100 and maps logarithmically onto
   0.1..10, so 50 is the neutral factor 1. */
const RESCALE_MIN = 0.1;
const RESCALE_SPAN = 100;

const sliderToRescale = (val) =>
    RESCALE_MIN * Math.pow(RESCALE_SPAN, val / 100);

const rescaleToSlider = (factor) => factor <= 0
    ? 0
    : 100 * Math.log(factor / RESCALE_MIN) / Math.log(RESCALE_SPAN);

/**
 * Opens the lane options popup (rescale/shift values, reset times)
 * next to `anchor`.
 *
 * @param {any} lane
 * @param {Element | null} anchor
 * @param {{onChanged: () => void}} callbacks
 *     Called after the lane's keyframes were modified.
 * @returns {{close: () => void}}
 */
export function openLaneOptions(lane, anchor, {onChanged}) {
    const popup = document.createElement("div");
    popup.className = "lane-options-popup";
    popup.innerHTML = `
        <div class="popup-title">Lane Options</div>
        <div class="popup-row">
            <span class="popup-label">Rescale values</span>
            <input class="popup-field" type="range" id="lane-rescale-val"
                   min="0" max="100" step="1" value="50">
            <span class="popup-value" id="lane-rescale-val-display">1.0</span>
        </div>
        <div class="popup-row">
            <span class="popup-label">Shift values</span>
            <input class="popup-field" type="range" id="lane-shift-val"
                   min="-1" max="1" step="0.01" value="0">
            <span class="popup-value" id="lane-shift-val-display">0.00</span>
        </div>
        <div class="popup-row">
            <span class="popup-label">Time range</span>
            <button class="popup-btn" id="lane-time-reset">Reset</button>
        </div>
        <div class="popup-row">
            <button class="popup-btn" id="lane-options-apply">Apply</button>
            <button class="popup-btn" id="lane-options-cancel">Cancel</button>
        </div>
    `;
    const $ = (selector) => popup.querySelector(selector);
    const rescaleSlider = $("#lane-rescale-val");
    const shiftSlider = $("#lane-shift-val");
    const close = () => popup.remove();

    // Shift range keeps the lane's value range within -1..1.
    const {min, max} = lane.range;
    shiftSlider.min = (-1 - min).toFixed(4);
    shiftSlider.max = (1 - max).toFixed(4);
    rescaleSlider.value = rescaleToSlider(1);

    rescaleSlider.addEventListener("input", () => {
        $("#lane-rescale-val-display").textContent =
            sliderToRescale(parseFloat(rescaleSlider.value)).toFixed(1);
    });
    shiftSlider.addEventListener("input", () => {
        $("#lane-shift-val-display").textContent =
            parseFloat(shiftSlider.value).toFixed(2);
    });
    $("#lane-time-reset").addEventListener("click", () => {
        if (fitKeyframesToDuration(lane)) {
            onChanged();
        }
    });
    $("#lane-options-apply").addEventListener("click", () => {
        rescaleLaneValues(
            lane,
            sliderToRescale(parseFloat(rescaleSlider.value)),
            parseFloat(shiftSlider.value)
        );
        onChanged();
        close();
    });
    $("#lane-options-cancel").addEventListener("click", close);

    if (anchor) {
        const rect = anchor.getBoundingClientRect();
        popup.style.left = `${rect.right + 8 + window.scrollX}px`;
        popup.style.top = `${rect.top + window.scrollY}px`;
    }
    document.body.append(popup);
    return {close};
}

/** Multiplies the keyframe values by `factor`, then adds `shift`. */
export function rescaleLaneValues(lane, factor, shift) {
    for (const kf of lane.keyframes) {
        const normalized = lane.mapFromRange(kf.value);
        const shifted = clamp(normalized * factor + shift, -1, 1);
        kf.value = lane.mapToRange(shifted);
    }
    lane.updateDuration();
}

/**
 * Stretches the keyframe times linearly onto [0, lane.duration].
 * Returns false if the keyframes span no time.
 */
export function fitKeyframesToDuration(lane) {
    const kfs = lane.keyframes;
    const oldStart = kfs[0].time;
    const span = kfs[kfs.length - 1].time - oldStart;
    if (span <= 0) {
        return false;
    }
    for (const kf of kfs) {
        kf.time = (kf.time - oldStart) / span * lane.duration;
    }
    lane.updateDuration();
    return true;
}
