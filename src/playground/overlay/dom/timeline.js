import {ACTION} from '../../actions.js';
import {percentOfSpan} from '../../engine/math.js';
import {CHAR, DEBUG} from '../index.js';
import {formatValue} from '../format.js';
import {actionButton, esc, setShown} from './html.js';
import {fullView, isInView, MIN_TIME_STEP, MIN_TIMELINE_SPAN, tickTimes, visibleRange} from "../../engine/timeZoom.js";
import {renderAudioWaveform} from './audioTrack.js';

function timeRangeField(label, className, min, value) {
    return `
        <div>
            <span class="time-range-label">${label}</span>
            <input type="number"
                   class="field num ${className}"
                   min="${min}" step="0.1" value="${value}">
            <span class="time-range-unit">s</span>
        </div>`;
}

export function timelineTemplate() {
    return `
        <div class="timeline-editor">
            <div class="tracks-actions">
                ${actionButton({
                    action: ACTION.REMOVE_ALL_TRACKS,
                    label: `${CHAR.TRASH} Clear All`,
                    className: 'btn danger',
                    title: 'Delete all tracks! Irreversible!',
                    disabled: true
                })}             
                ${actionButton({
                    action: ACTION.ADD_TRACK,
                    label: '+ Track',
                    title: 'Create a new track',
                })}
                <input type="file"
                       id="audio-file-input"
                       accept="audio/*"
                       style="display:none">
            </div>
            <div class="timeline-controls">
                <div class="play-controls">
                    <div class="speed-control">
                        <label for="playground-speed">${CHAR.TIMES}</label>
                        <input type="number"
                               id="playground-speed"
                               class="field num speed-input"
                               min="0.1" max="20" step="0.1"
                               value="1.0">
                    </div>
                    ${actionButton({
                        action: ACTION.PLAY,
                        label: CHAR.PLAY,
                        className: 'btn icon play-btn',
                        title: 'Play/Pause (Space)',
                    })}
                </div>
            </div>
            <div class="time-range-bar">
                <div class="time-range-labels">
                    ${timeRangeField('Start:', 'time-start', 0, 0)}
                    <div>
                        <button type="button"
                                class="btn time-zoom-reset"
                                title="Show the whole timeline (Esc)"
                                disabled>
                            Full view
                        </button>
                    </div>
                    ${timeRangeField('End:', 'time-end', 0, MIN_TIMELINE_SPAN)}
                </div>
                <div class="time-ruler"
                     title="Drag to zoom into a time range, wheel to zoom">
                    <div class="time-ticks"></div>
                    <span class="time-ruler-hint">drag to zoom</span>
                    <div class="time-zoom-band"
                         title="Drag to move, double-click for full view">
                        <div class="time-zoom-handle"
                             data-edge="start"></div>
                        <div class="time-zoom-handle"
                             data-edge="end"></div>
                    </div>
                </div>
                <div class="time-slider-cell">
                    <input type="range"
                           class="time-slider"
                           aria-label="Time"
                           min="0" max="${MIN_TIMELINE_SPAN}" step="0.1"
                           value="0">
                    <span class="slider-tooltip"></span>
                </div>
                <div class="time-zoom-detail">
                    <div class="time-zoom-lens"></div>
                    <input type="range"
                           class="time-sub-slider"
                           aria-label="Time within the zoomed range"
                           min="0" max="${MIN_TIMELINE_SPAN}" step=${MIN_TIME_STEP}
                           value="0">
                    <div class="time-ticks time-sub-ticks"></div>
                </div>
            </div>
            <div></div>
            <div class="track-rows"></div>
            <div class="value-preview"></div>
            <div class="timeline-tooltip"></div>
        </div>`;
}

const percent = (fraction) => `${(100 * fraction).toFixed(3)}%`;

function tickMarks(view) {
    const width = view.end - view.start;
    return tickTimes(view).map(({time, label}) => `
        <span class="time-tick"
              style="left:${percent((time - view.start) / width)}">
            <span class="time-tick-label">${label}</span>
        </span>
    `).join('');
}

export function renderTimeZoom(ui, span, zoom) {
    const view = visibleRange(zoom, span);
    const isZoomed = zoom !== null;
    const left = view.start / span;
    const right = view.end / span;

    ui.timeSlider.max = span;
    ui.timeSubSlider.min = view.start;
    ui.timeSubSlider.max = view.end;
    ui.timeStart.value = Number(view.start.toFixed(2));
    ui.timeEnd.value = Number(view.end.toFixed(2));
    ui.timeZoomReset.disabled = !isZoomed;

    // Lets the CSS highlight the window on the main slider's track.
    ui.timeRangeBar.style.setProperty('--zoom-start', left);
    ui.timeRangeBar.style.setProperty('--zoom-end', right);
    ui.timeRangeBar.classList.toggle('zoomed', isZoomed);

    setShown(ui.timeZoomBand, isZoomed);
    setShown(ui.timeZoomDetail, isZoomed);
    Object.assign(ui.timeZoomBand.style, {
        left: percent(left),
        width: percent(right - left),
    });
    ui.timeZoomLens.style.clipPath =
        `polygon(${percent(left)} 0, ${percent(right)} 0, 100% 100%, 0 100%)`;

    ui.timeRulerTicks.innerHTML = tickMarks({start: 0, end: span});
    ui.timeSubTicks.innerHTML = isZoomed ? tickMarks(view) : '';
}

export function renderPlayback(ui, engine, view = fullView(engine)) {
    const time = engine.currentTime;
    const inView = isInView(view, time);
    ui.timeSlider.value = time;
    ui.timeSubSlider.value = time;
    ui.timeSubSlider.classList.toggle('out-of-view', !inView);

    const percentage = percentOfSpan(time - view.start, view.end - view.start);
    const editor = ui.trackRows.parentElement;
    const playheadElements = editor.querySelectorAll('.playhead');
    for (const playhead of playheadElements) {
        playhead.style.left = percentage;
        setShown(playhead, inView);
    }
}

export function renderPreview(ui, engine, {debug = false} = {}) {
    const currentValues = engine.getCurrentUniformDetails()
    if (debug) {
        console.group("[UNIFORM PREVIEW] t =", engine.currentTime, "sec.");
        console.table(currentValues);
        console.groupEnd();
    }
    const lines = currentValues
        .filter(it => !it.isUntouched)
        .map(it => `
            <div class="val-line">
                <span class="val-name">${esc(it.name)}</span>
                <span class="val-num">${formatValue(it.value)}</span>
            </div>`
        );
    ui.preview.innerHTML = lines.length
        ? lines.join('')
        : '<div class="val-empty">No active tracks</div>';
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
    const rows = audioTracks
        .map(track => renderAudioWaveform(track, view, span))
        .filter(Boolean);

    DEBUG.log("[AUDIO]", {audioTracks, editor, rows});
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
    const overlayRect = ui.timelineEditor?.getBoundingClientRect();
    if (!overlayRect) return;

    container.addEventListener('mousemove', (e) => {
        const widget = e.target.closest('.audio-widget');
        if (!widget) {
            tooltip.classList.remove('visible');
            return;
        }

        const svg = widget.querySelector('.audio-waveform');
        if (!svg) return;

        const bins = svg.dataset.bins;
        if (!bins) return;

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
    });

    container.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
    });
}
