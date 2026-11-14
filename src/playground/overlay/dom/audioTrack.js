import {isInView} from '../../engine/timeZoom.js';
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
    ).join('');
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
    const duration = track.duration > 0 ? ` (${track.duration.toFixed(1)}s)` : '';
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
    const content = `<span class="audio-status">${statusText}</span>`;
    return rowHTML(track, content, tooltipText, true);
}

function resolutionInfo(totalSamples) {
    const kiloSamples = (totalSamples / 1000).toLocaleString();
    const totalPixels = Math.max(1, Math.floor(totalSamples / _samplesPerPixel));
    const pixels = totalPixels.toLocaleString();
    return [
        `Waveform Resolution ${_samplesPerPixel}/px`,
        `(${kiloSamples}k samples take ${pixels} px)`
    ].join(" ");
}

const MAX_COLUMNS = 2048;
const WAVE_HEIGHT = 200;

/** Last computed path per waveform buffer, reused while the view is unchanged. */
const _pathCache = new WeakMap();

function waveformPath(data, start, end, duration) {
    const first = Math.max(0, Math.floor((start / duration) * data.length));
    const last =
        Math.min(data.length, Math.ceil((end / duration) * data.length));
    const visible = last - first;
    if (visible <= 0) {
        return {path: '', columns: 1};
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
    parts.push('Z');

    const result = {key, path: parts.join(''), columns};
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

    if (wave.loading) {
        const tooltipText = `Waveform resolution ${_samplesPerPixel}/px (decoding...)`;
        return emptyRow(track, 'Decoding audio…', tooltipText);
    }
    if (!data) {
        const tooltipText = `Waveform resolution ${_samplesPerPixel}/px (no audio data)`;
        return emptyRow(track, 'No audio data', tooltipText);
    }
    if (!wave.visible) {
        return '';
    }

    const {audioStart, audioEnd, path, width} = wave;

    // Calculate playhead position (percentage within the widget)
    const playheadPercent = track.duration > 0
        ? ((currentTime - audioStart) / (audioEnd - audioStart)) * 100
        : 0;
    const showPlayhead = currentTime >= audioStart && currentTime <= audioEnd;

    // Calculate total samples and pixels for tooltip
    const totalSamples = data.length;
    const totalPixels = Math.max(1, Math.floor(totalSamples / _samplesPerPixel));
    const kiloSamples = (totalSamples / 1000).toLocaleString();
    const tooltipText =
        `Waveform Resolution ${_samplesPerPixel}/px (${kiloSamples}k samples take ${totalPixels.toLocaleString()} px)`;

    const playhead = showPlayhead ? `
        <div class="playhead"
             style="left: ${playheadPercent}%"></div>
    ` : '';

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

    DEBUG.log("[AUDIO]", {audioTracks, audioData, editor, rows});
    if (!editor || rows.length === 0) {
        return;
    }

    const className = "audio-waveform-rows";
    const existing = editor.querySelector(`.${className}`);
    const container = document.createElement('div');
    container.className = className;
    container.innerHTML = rows.join('');
    if (existing) {
        existing.replaceWith(container);
    } else {
        ui.trackRows.after(container);
    }

    // Add click-to-seek handler to audio widgets
    container.addEventListener('click', (e) => {
        const widget = e.target.closest('.audio-widget');
        if (!widget) return;
        const rect = widget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const time = view.start + percentage * (view.end - view.start);
        ui.onSeek?.(time);
    });

    // Add hover tooltip handler to audio widgets
    const tooltip = ui.timelineTooltip;
    const timelineEditor = ui.timelineEditor;

    DEBUG.log("[TOOLTIP]", {tooltip, timelineEditor, container});

    container.addEventListener('mousemove', (e) => {
        const widget = e.target.closest('.audio-widget');
        if (!widget) {
            DEBUG.log("[TOOLTIP] no widget -> hide");
            tooltip?.classList.remove('visible');
            return;
        }
        const svg = widget.querySelector('.audio-waveform');
        if (!svg) {
            DEBUG.log("[TOOLTIP] no svg", {widget});
            return;
        }
        const audioTrackId = svg.dataset.audioId;
        const analyzed = audioData.find(t => t.id === audioTrackId);
        const bins = analyzed?.bins;
        if (!bins) {
            DEBUG.log("[TOOLTIP] no bins", {widget, svg, audioTrackId, analyzed});
            return;
        }

        const overlayRect = timelineEditor.getBoundingClientRect();
        const widgetRect = widget.getBoundingClientRect();
        const x = e.clientX - widgetRect.left;
        const percentage = Math.max(0, Math.min(1, x / widgetRect.width));

        const binIndex = Math.floor(percentage * 100);
        const binStart = binIndex * 2;
        const binEnd = Math.min(binStart + 1, bins.length - 1);
        const minVal = parseFloat(bins[binStart]);
        const maxVal = parseFloat(bins[binEnd]);

        const time = view.start + percentage * (view.end - view.start);
        const timeStr = time.toFixed(2) + 's';
        const rangeStr = `${minVal.toFixed(3)} .. ${maxVal.toFixed(3)}`;

        tooltip.textContent = `${timeStr}\n${rangeStr}`;
        tooltip.style.left = `${e.clientX - overlayRect.left + 10}px`;
        tooltip.style.top = `${e.clientY - overlayRect.top - 40}px`;
        tooltip.classList.add('visible');

        DEBUG.log("[TOOLTIP] visible", {
            left: tooltip.style.left,
            top: tooltip.style.top,
            opacity: tooltip.style.opacity,
            visibility: tooltip.style.visibility,
            zIndex: tooltip.style.zIndex,
            hasClass: tooltip.classList.contains('visible'),
        });
    });

    container.addEventListener('mouseleave', () => {
        DEBUG.log("[TOOLTIP] leave -> hide");
        tooltip?.classList.remove('visible');
    });
}