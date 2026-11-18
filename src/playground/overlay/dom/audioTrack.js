import {isInView} from "../../engine/timeZoom.js";
import {CHAR} from "../../../app/constants.js";
import {clamp} from "../../../app/algorithms.js";
import {DEBUG} from "../index.js";

let _samplesPerPixel = 16;

const SAMPLE_OPTIONS = [32, 16, 8, 4, 2];

export function setWaveformSamples(value) {
    _samplesPerPixel = Number(value);
}

function sampleSelectorHTML(current, tooltipText) {
    const options = SAMPLE_OPTIONS.map(v =>
        `<div class="sample-option"
              data-value="${v}"
              ${v === current ? 'data-selected="true"' : ''}>${v}</div>`
    ).join("");
    return `
        <div class="sample-selector"
             tabindex="0"
             title="${tooltipText}">
            <div class="sample-selector-value">${current}</div>
            <div class="sample-selector-dropdown">
                ${options}
            </div>
        </div>
    `;
}

function controlsColHTML(tooltipText) {
    return `
        <div class="audio-controls-col"
             title="${tooltipText}">
            <label class="sample-res-label"
                   title="${tooltipText}">res</label>
            ${sampleSelectorHTML(_samplesPerPixel, tooltipText)}
        </div>
    `;
}

function rowHTML(track, content, tooltipText, empty = false) {
    const duration = track.duration > 0
        ? `(${track.duration.toFixed(1)}\u2009s)` : "";
    return `
        <div class="audio-track-row${empty ? ' audio-empty' : ''}"
             data-track-id="${track.id}">
            <div class="audio-name-col">
                <span class="audio-label"
                      title="Audio Track: ${track.name}">
                    ${CHAR.NOTES} ${track.name}
                </span>
                <span class="audio-duration">${duration}</span>
            </div>
            <div class="audio-widget">
                ${content}
            </div>
            ${controlsColHTML(tooltipText)}
        </div>
    `;
}

function emptyRow(track, statusText, tooltipText) {
    const fullTooltip = `${tooltipText} (${statusText})`;
    const content = `<span class="audio-status">${statusText}</span>`;
    return rowHTML(track, content, fullTooltip, true);
}

function basicResolutionInfo() {
    return `Waveform Resolution ${_samplesPerPixel}/px`;
}

function withResolutionApplied(totalSamples) {
    const totalPixels = Math.max(1, Math.floor(totalSamples / _samplesPerPixel));
    const str = {
        samples: totalSamples.toLocaleString(),
        pixels: totalPixels.toLocaleString(),
    }
    return `${str.samples} samples ~ ${str.pixels} px`;
}

/**
 * @param {MouseEvent} e
 * @returns {{ratio: number, svg: SVGElement}|null}
 */
function getAudioWidthRatio(e) {
    const widget = e.target.closest(".audio-widget");
    const svg = widget?.querySelector(".audio-waveform");
    if (!svg) {
        return null;
    }
    const svgRect = svg.getBoundingClientRect();
    const ratio = (e.clientX - svgRect.left) / svgRect.width;
    if (ratio < 0 || ratio > 1) {
        return null;
    }
    return { ratio, svg };
}

/** Last computed path per waveform buffer, reused while the view is unchanged. */
const _pathCache = new WeakMap();

const MAX_COLUMNS = 2048;
const WAVE_HEIGHT = 200;

function waveformPath(data, start, end, duration, maxColumns = 0) {
    const first = Math.max(0, Math.floor((start / duration) * data.length));
    const last =
        Math.min(data.length, Math.ceil((end / duration) * data.length));
    const visible = last - first;
    if (visible <= 0) {
        return {path: "", columns: 1, bins: []};
    }

    const columns = clamp(
        Math.floor(visible / _samplesPerPixel),
        2, maxColumns || MAX_COLUMNS
    );
    DEBUG.log("[WAVEFORM]", {
        visible, first, last, columns, _samplesPerPixel, start, end, duration
    });

    const key = `${first}:${last}:${columns}`;
    const cached = _pathCache.get(data);
    if (cached?.key === key) {
        return cached;
    }

    const half = WAVE_HEIGHT / 2;
    const bins = new Array(columns * 2);
    const tops = new Array(columns);
    const bottoms = new Array(columns);

    for (let col = 0; col < columns; col++) {
        // Floor-divided bounds spread samples evenly over the columns.
        // At least one sample per column, even if visible < columns.
        const sStart = first + Math.floor(col * visible / columns);
        const sEnd = Math.min(last, Math.max(
            sStart + 1,
            first + Math.floor((col + 1) * visible / columns)
        ));

        let min = Infinity;
        let max = -Infinity;
        for (let s = sStart; s < sEnd; s++) {
            const val = data[s];
            if (val < min) min = val;
            if (val > max) max = val;
        }

        bins[2 * col] = min;
        bins[2 * col + 1] = max;
        tops[col] = Math.round((1 - max) * half);
        bottoms[col] = Math.round((1 - min) * half);
    }

    const parts = [`M0 ${tops[0]}`];
    for (let i = 1; i < columns; i++) {
        parts.push(`L${i} ${tops[i]}`);
    }
    for (let i = columns - 1; i >= 0; i--) {
        parts.push(`L${i} ${bottoms[i]}`);
    }
    parts.push("Z");

    const result = {key, path: parts.join(""), columns, bins};
    _pathCache.set(data, result);
    return result;
}

export function analyzeAudioWaveform(track, view, maxPixels = 0) {
    if (track.loading) {
        return {track, loading: true};
    }

    const data = track.getWaveformData();
    if (!data) {
        return {track, data};
    }

    const audioStart = Math.max(view.start, 0);
    const audioEnd = Math.min(view.end, track.duration);

    if (!isInView({start: audioStart, end: audioEnd}, 0)) {
        return {track, data, visible: false};
    }

    const {path, columns, bins} =
        waveformPath(data, audioStart, audioEnd, track.duration, maxPixels);

    return {
        track,
        data,
        visible: true,
        audioStart,
        audioEnd,
        path,
        columns,
        bins,
        width: columns - 1,
    };
}

export function renderAudioWaveform(wave, currentTime = 0) {
    const {track, data} = wave;
    let tooltipText = basicResolutionInfo();

    if (wave.loading) {
        return emptyRow(track, "Decoding audio…", tooltipText);
    }
    if (!data) {
        return emptyRow(track, "No audio data", tooltipText);
    }
    if (!wave.visible) {
        return "";
    }
    const {audioStart, audioEnd, path, width} = wave;

    tooltipText += ` (${withResolutionApplied(data.length)})`;

    const playheadPercent = track.duration > 0
        ? ((currentTime - audioStart) / (audioEnd - audioStart)) * 100
        : 0;
    const showPlayhead =
        currentTime >= audioStart && currentTime <= audioEnd;

    const playhead = showPlayhead ? `
        <div class="playhead"
             style="left: ${playheadPercent}%"
        ></div>
    ` : "";

    const content = `
        <div class="audio-waveform-container">
            <svg class="audio-waveform"
                 viewBox="0 0 ${width} ${WAVE_HEIGHT}"
                 preserveAspectRatio="none"
                 data-audio-id="${track.id}"
                 >
                <rect x="0"
                      y="0"
                      width="${width}"
                      height="${WAVE_HEIGHT}"
                      fill="none"
                      stroke="rgba(255,255,255,0.2)"
                      stroke-width="1"
                      vector-effect="non-scaling-stroke"/>
                <line x1="0"
                      y1="${WAVE_HEIGHT / 2}"
                      x2="${width}"
                      y2="${WAVE_HEIGHT / 2}"
                      stroke="rgba(255,255,255,0.4)"
                      stroke-width="1"
                      vector-effect="non-scaling-stroke"/>
                <path d="${path}"/>
            </svg>
            ${playhead}
        </div>
    `;
    return rowHTML(track, content, tooltipText);
}

/**
 * Render audio waveform rows in the timeline-editor.
 * @param {object} ui
 * @param {PlaygroundEngine} engine
 * @param {object} view - {start, end}
 */
export function renderAudioWaveforms(ui, engine, view) {
    const maxPixels = Math.ceil(
        ui.timeSlider.parentElement.getBoundingClientRect().width
    );
    const audioData = engine.getAllAudioTracks()
        .map(t => analyzeAudioWaveform(t, view, maxPixels));
    const rows = audioData
        .map(wave => renderAudioWaveform(wave, engine.time()))
        .filter(Boolean);
    if (rows.length === 0) {
        return;
    }

    const className = "audio-waveform-rows";
    const existing = ui.timelineEditor.querySelector(`.${className}`);
    const container = document.createElement("div");
    container.className = className;
    container.innerHTML = rows.join("");
    if (existing) {
        existing.replaceWith(container);
    } else {
        ui.laneRows.after(container);
    }

    container.addEventListener("click", (e) => {
        const result = getAudioWidthRatio(e);
        if (!result) {
            return;
        }
        const { ratio } = result;
        const time = view.start + ratio * (view.end - view.start);
        ui.onSeek?.(time);
    });

    const tooltip = ui.timelineTooltip;
    const overlayEl = ui.timelineEditor.parentElement;

    /**
     * @param e some Mouse Event, most probably via "mousemove"
     * @return {boolean} whether this event is hereby consumed
     */
    ui.onAudioTooltip = (e) => {
        const result = getAudioWidthRatio(e);
        if (!result) {
            tooltip?.classList.remove("visible");
            return false;
        }
        const { ratio, svg } = result;
        const clampedPercentage = Math.max(0, Math.min(1, ratio));
        const audioTrackId = svg.dataset.audioId;
        const analyzed = audioData.find(it => it.track.id === audioTrackId);
        const bins = analyzed?.bins;
        if (!bins) {
            return false;
        }

        const binIndex = Math.floor(clampedPercentage * 100);
        const binStart = binIndex * 2;
        const binEnd = Math.min(binStart + 1, bins.length - 1);
        const minVal = parseFloat(bins[binStart]);
        const maxVal = parseFloat(bins[binEnd]);
        const time = view.start + clampedPercentage * (view.end - view.start);

        tooltip.textContent = [
            `t = ${time.toFixed(2).padStart(6)} s`,
            `-- bin #${binIndex} --`,
            `min = ${minVal.toFixed(3).padStart(6)}`,
            `max = ${maxVal.toFixed(3).padStart(6)}`,
        ].join("\n");

        const overlayRect = overlayEl.getBoundingClientRect();
        tooltip.style.left = `${e.clientX - overlayRect.left + 12}px`;
        tooltip.style.top = `${e.clientY - overlayRect.top - 28}px`;
        tooltip.classList.add("visible");
        return true;
    };

    container.addEventListener("mouseleave", () => {
        tooltip?.classList.remove("visible");
    });

    ui.onToggleSampleSelect = (e) => {
        const selector = e.target.closest(".sample-selector");
        if (!selector) {
            document.querySelectorAll(".sample-selector.open")
                .forEach(el =>
                    el.classList.remove("open")
                );
            return false;
        } else {
            selector.classList.toggle("open");
            return true;
        }
    };

    ui.onSampleSelectOption = (e) => {
        const el = e.target;
        if (!el.classList.contains("sample-option")) {
            return false;
        }
        const value = Number(el.dataset.value);
        setWaveformSamples(value);
        const selector = el.closest(".sample-selector");
        if (selector) {
            const valueEl = selector.querySelector(".sample-selector-value");
            if (valueEl) valueEl.textContent = `${value}/px`;
            // Update selected state
            selector.querySelectorAll(".sample-option").forEach(opt =>
                opt.removeAttribute("data-selected")
            );
            el.setAttribute("data-selected", "true");
            selector.classList.remove("open");
        }
        return true;
    };
}