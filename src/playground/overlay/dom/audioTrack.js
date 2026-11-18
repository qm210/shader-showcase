import {isInView} from "../../engine/timeZoom.js";
import {CHAR} from "../../../app/constants.js";
import {clamp} from "../../../app/algorithms.js";

function rowHTML(track, content, empty = false) {
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
            <div class="audio-control"></div>
        </div>
    `;
}

function emptyRow(track, statusText) {
    const content = `<span class="audio-status">${statusText}</span>`;
    return rowHTML(track, content, true);
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

function waveformPath(data, view, duration, pixelWidth = 0, maxColumns = 0) {
    const {start, end} = view;
    const first = Math.max(
        0,
        Math.floor((start / duration) * data.length)
    );
    const last = Math.min(
        data.length,
        Math.ceil((end / duration) * data.length)
    );
    const visible = last - first;
    if (visible <= 0) {
        return {path: "", columns: 1, bins: []};
    }

    const columns = Math.ceil(clamp(
        pixelWidth, 2, maxColumns || MAX_COLUMNS
    ));

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

export function analyzeAudioWaveform(track, view, pixelWidth = 0) {
    if (track.loading) {
        return {track, loading: true};
    }

    const data = track.getWaveformData();
    if (!data) {
        return {track, data};
    }
    const audioView = {
        start: Math.max(view.start, 0),
        end: Math.min(view.end, track.duration),
    };

    if (!isInView(audioView, 0)) {
        return {track, data, visible: false};
    }

    const {path, columns, bins} =
        waveformPath(data, audioView, track.duration, pixelWidth, MAX_COLUMNS);

    return {
        track,
        data,
        visible: true,
        audioView,
        path,
        columns,
        bins,
        width: columns - 1,
    };
}

export function renderAudioWaveform(wave, currentTime = 0) {
    const {track, data} = wave;

    if (wave.loading) {
        return emptyRow(track, "Decoding audio…");
    }
    if (!data) {
        return emptyRow(track, "No audio data");
    }
    if (!wave.visible) {
        return "";
    }
    const {audioView: {start, end}, path, width} = wave;

    const playheadPercent = track.duration > 0
        ? ((currentTime - start) / (end - start)) * 100
        : 0;
    const showPlayhead =
        currentTime >= start && currentTime <= end;

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
    return rowHTML(track, content);
}

/**
 * Render audio waveform rows in the timeline-editor.
 * @param {object} ui
 * @param {PlaygroundEngine} engine
 * @param {object} view - {start, end}
 */
export function renderAudioWaveforms(ui, engine, view) {
    const containerWidth = ui.timeSlider.parentElement
        ?.getBoundingClientRect().width ?? 0;
    const audioData = engine.getAllAudioTracks()
        .map(t => analyzeAudioWaveform(t, view, containerWidth));
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

    if (!ui._audioResizeObserver) {
        let _resizeTimer = null;
        ui._audioResizeObserver = new ResizeObserver(() => {
            clearTimeout(_resizeTimer);
            _resizeTimer = setTimeout(() => {
                renderAudioWaveforms(ui, engine, view);
            }, 300);
        });
        ui._audioResizeObserver.observe(ui.timelineEditor);
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
}