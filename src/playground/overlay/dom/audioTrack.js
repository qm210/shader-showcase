import {isInView} from "../../engine/timeZoom.js";

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
    const duration = track.duration > 0 ? ` (${track.duration.toFixed(1)}s)` : "";
    return `
        <div class="audio-track-row${empty ? ' audio-empty' : ''}"
             data-track-id="${track.id}">
            <div class="audio-name-col">
                <span class="audio-label">🎵 ${track.name}</span>
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

const MAX_COLUMNS = 2048;
const WAVE_HEIGHT = 200;

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

function waveformPath(data, start, end, duration) {
    const first = Math.max(0, Math.floor((start / duration) * data.length));
    const last =
        Math.min(data.length, Math.ceil((end / duration) * data.length));
    const visible = last - first;
    if (visible <= 0) {
        return {path: "", columns: 1};
    }

    // More columns than screen pixels only cost parse and raster time.
    const columns = Math.max(2, Math.min(MAX_COLUMNS,
        Math.floor(visible / _samplesPerPixel)));

    const key = `${first}:${last}:${columns}`;
    const cached = _pathCache.get(data);
    if (cached?.key === key) {
        return cached;
    }

    const half = WAVE_HEIGHT / 2;
    const tops = new Array(columns);
    const bottoms = new Array(columns);

    for (let col = 0; col < columns; col++) {
        // Floor-divided bounds: every column gets samples, none stays empty.
        const sStart = first + Math.floor(col * visible / columns);
        const sEnd = first + Math.floor((col + 1) * visible / columns);

        let min = Infinity;
        let max = -Infinity;
        for (let s = sStart; s < sEnd; s++) {
            const val = data[s];
            if (val < min) min = val;
            if (val > max) max = val;
        }

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

    const result = {key, path: parts.join(""), columns};
    _pathCache.set(data, result);
    return result;
}

export function analyzeAudioWaveform(track, view, span) {
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

    const {path, columns} =
        waveformPath(data, audioStart, audioEnd, track.duration);

    return {
        track,
        data,
        visible: true,
        audioStart,
        audioEnd,
        path,
        width: columns - 1,
        ...analyzeBins(data, {
            start: audioStart,
            end: audioEnd,
            duration: track.duration,
            width: 100,
            height: 40
        })
    };
}

function analyzeBins(data, {start, end, duration, height}) {
    const counts = {
        columns: 0,
        perColumn: 0,
        tops: [],
        bottoms: [],
        bins: [],
    };
    if (!data || data.length === 0) {
        return counts;
    }
    const startSample = Math.floor((start / duration) * data.length);
    const endSample = Math.ceil((end / duration) * data.length);
    const visibleSamples = endSample - startSample;
    if (visibleSamples <= 0) {
        return counts;
    }

    // Downsample: for each pixel column, find min/max of samples
    counts.columns = Math.max(1, Math.floor(visibleSamples / _samplesPerPixel));
    counts.perColumn = Math.ceil(visibleSamples / counts.columns);

    for (let col = 0; col < counts.columns; col++) {
        const sStart = startSample + col * counts.perColumn;
        const sEnd = Math.min(sStart + counts.perColumn, endSample);

        let min = 1;
        let max = -1;
        for (let s = sStart; s < sEnd; s++) {
            const val = data[s];
            if (val < min) min = val;
            if (val > max) max = val;
        }

        counts.tops.push(normalize(max));
        counts.bottoms.push(normalize(min));
        counts.bins.push(min, max);
    }
    return counts;

    function normalize(value) {
        return ((1 - value) / 2) * height;
    }
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
             style="left: ${playheadPercent}%"></div>
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
 * @param {number} span - Total timeline span
 */
export function renderAudioWaveforms(ui, engine, view, span) {
    const editor = ui.trackRows.parentElement;
    const audioTracks = engine.getAllAudioTracks();
    const audioData = audioTracks.map(t => analyzeAudioWaveform(t, view, span));
    const rows = audioData
        .map(wave => renderAudioWaveform(wave, engine.currentTime))
        .filter(Boolean);

    if (!editor || rows.length === 0) {
        return;
    }

    const className = "audio-waveform-rows";
    const existing = editor.querySelector(`.${className}`);
    const container = document.createElement("div");
    container.className = className;
    container.innerHTML = rows.join("");
    if (existing) {
        existing.replaceWith(container);
    } else {
        ui.trackRows.after(container);
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