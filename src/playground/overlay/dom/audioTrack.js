import {isInView} from '../../engine/timeZoom.js';

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

const MAX_COLUMNS = 2048;
const WAVE_HEIGHT = 200;

/** Last computed path per waveform buffer, reused while the view is unchanged. */
const _pathCache = new WeakMap();

/**
 * Generate SVG path data for a waveform display.
 * x runs in whole columns and y in whole units of WAVE_HEIGHT, so the
 * coordinates stay short integers; the viewBox stretches them to the widget.
 * @param {Float32Array} data - Waveform samples
 * @param {number} start - Start time (seconds)
 * @param {number} end - End time (seconds)
 * @param {number} duration - Total audio duration
 * @returns {{path: string, columns: number}}
 */
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

/**
 * Render the audio waveform row HTML.
 * @param {AudioTrack} track
 * @param {object} view - {start, end} time range
 * @param {number} span - Total timeline span
 * @param {number} currentTime - Current playback time
 * @returns {string}
 */
export function renderAudioWaveform(track, view, span, currentTime = 0) {
    // Show loading indicator while track is being decoded
    if (track.loading) {
        const tooltipText = `Waveform resolution ${_samplesPerPixel}/px (decoding...)`;
        return emptyRow(track, 'Decoding audio…', tooltipText);
    }

    const data = track.getWaveformData();
    if (!data) {
        const tooltipText = `Waveform resolution ${_samplesPerPixel}/px (no audio data)`;
        return emptyRow(track, 'No audio data', tooltipText);
    }

    const audioStart = Math.max(view.start, 0);
    const audioEnd = Math.min(view.end, track.duration);

    if (!isInView({start: audioStart, end: audioEnd}, 0)) {
        return '';
    }

    const {path, columns} =
        waveformPath(data, audioStart, audioEnd, track.duration);
    const width = columns - 1;

    const playheadPercent = track.duration > 0
        ? ((currentTime - audioStart) / (audioEnd - audioStart)) * 100
        : 0;
    const showPlayhead = currentTime >= audioStart && currentTime <= audioEnd;

    const tooltipText = resolutionInfo(data.length);

    const playhead = showPlayhead ? `
        <div class="playhead"
             style="left: ${playheadPercent}%"></div>
    ` : '';

    const content = `
        <div class="audio-waveform-container">
            <svg class="audio-waveform"
                 viewBox="0 0 ${width} ${WAVE_HEIGHT}"
                 preserveAspectRatio="none">
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

function resolutionInfo(totalSamples) {
    const kiloSamples = (totalSamples / 1000).toLocaleString();
    const totalPixels = Math.max(1, Math.floor(totalSamples / _samplesPerPixel));
    const pixels = totalPixels.toLocaleString();
    return [
        `Waveform Resolution ${_samplesPerPixel}/px`,
        `(${kiloSamples}k samples take ${pixels} px)`
    ].join(" ");
}
