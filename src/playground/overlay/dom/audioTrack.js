import {isInView} from '../../engine/timeZoom.js';

let _samplesPerPixel = 16;

const SAMPLE_OPTIONS = [32, 16, 8, 4, 2];

export function setWaveformSamples(value) {
    _samplesPerPixel = Number(value);
}

function sampleSelectorHTML(current, tooltipText) {
    const options = SAMPLE_OPTIONS.map(v =>
        `<div class="sample-option" data-value="${v}" ${v === current ? 'data-selected="true"' : ''}>${v}</div>`
    ).join('');
    return `
        <div class="sample-selector" tabindex="0" title="${tooltipText}">
            <div class="sample-selector-value">${current}</div>
            <div class="sample-selector-dropdown">
                ${options}
            </div>
        </div>
    `;
}

function controlsColHTML(tooltipText) {
    return `
        <div class="audio-controls-col" title="${tooltipText}">
            <label class="sample-res-label" title="${tooltipText}">res</label>
            ${sampleSelectorHTML(_samplesPerPixel, tooltipText)}
        </div>
    `;
}

function emptyRow(track, statusText, tooltipText) {
    const duration = track.duration > 0 ? ` (${track.duration.toFixed(1)}s)` : '';
    return `
        <div class="audio-track-row audio-empty" data-track-id="${track.id}">
            <div class="audio-name-col">
                <span class="audio-label">🎵 ${track.name}</span>
                <span class="audio-duration">${duration}</span>
            </div>
            <div class="audio-widget">
                <span class="audio-status">${statusText}</span>
            </div>
            ${controlsColHTML(tooltipText)}
        </div>
    `;
}

/**
 * Generate SVG path data for a waveform display.
 * @param {Float32Array} data - Waveform samples
 * @param {number} start - Start time (seconds)
 * @param {number} end - End time (seconds)
 * @param {number} duration - Total audio duration
 * @param {number} width - SVG viewBox width
 * @param {number} height - SVG viewBox height
 * @returns {{path: string, bins: number[]}} SVG path data and bin min/max values
 */
function waveformPath(data, start, end, duration, width, height) {
    if (!data || data.length === 0) {
        return {path: '', bins: []};
    }

    const startSample = Math.floor((start / duration) * data.length);
    const endSample = Math.ceil((end / duration) * data.length);
    const visibleSamples = endSample - startSample;

    if (visibleSamples <= 0) {
        return {path: '', bins: []};
    }

    // Downsample: for each pixel column, find min/max of samples
    const columns = Math.max(1, Math.floor(visibleSamples / _samplesPerPixel));
    const samplesPerColumn = Math.ceil(visibleSamples / columns);
    const stepX = width / columns;

    // Build top and bottom arrays, store bins as packed [min, max] pairs
    const tops = [];
    const bottoms = [];
    const bins = [];

    for (let col = 0; col < columns; col++) {
        const sStart = startSample + col * samplesPerColumn;
        const sEnd = Math.min(sStart + samplesPerColumn, endSample);

        let min = 1;
        let max = -1;
        for (let s = sStart; s < sEnd; s++) {
            const val = data[s];
            if (val < min) min = val;
            if (val > max) max = val;
        }

        // Normalize to pixel coordinates (top=0, bottom=height)
        tops.push(((1 - max) / 2) * height);
        bottoms.push(((1 - min) / 2) * height);
        bins.push(min, max);
    }

    // Build path: top edge left-to-right, bottom edge right-to-left
    let path = `M 0 ${tops[0]}`;
    for (let i = 1; i < columns; i++) {
        path += ` L ${i * stepX} ${tops[i]}`;
    }
    for (let i = columns - 1; i >= 0; i--) {
        path += ` L ${i * stepX} ${bottoms[i]}`;
    }
    path += ' Z';
    return {path, bins};
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

    const {path, bins} =
        waveformPath(data, audioStart, audioEnd, track.duration, 100, 40);

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

    const duration = track.duration > 0 ? ` (${track.duration.toFixed(1)}s)` : '';
    return `
        <div class="audio-track-row" data-track-id="${track.id}">
            <div class="audio-name-col">
                <span class="audio-label">🎵 ${track.name}</span>
                <span class="audio-duration">${duration}</span>
            </div>
            <div class="audio-widget">
                <div class="audio-waveform-container">
                    <svg class="audio-waveform"
                         viewBox="0 0 100 40"
                         preserveAspectRatio="none"
                         data-bins="${bins.join(',')}">
                        <rect x="0" y="0" width="100" height="40"
                              fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.25"
                              rx="1"/>
                        <line x1="0" y1="20" x2="100" y2="20"
                              stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
                        <path d="${path}"/>
                    </svg>
                    ${showPlayhead ? `<div class="playhead" style="left: ${playheadPercent}%"></div>` : ''}
                </div>
            </div>
            ${controlsColHTML(tooltipText)}
        </div>`;
}
