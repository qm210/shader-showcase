import {ACTION} from '../../actions.js';
import {percentOfSpan, smoothstep} from '../../engine/math.js';
import {calcTrackValueRange} from '../../engine/valueRanges.js';
import {CHAR, clamp} from '../index.js';
import {actionButton, cls, dataAttrs, editableName, esc, pointerFraction,} from './html.js';
import {DATALIST} from "./shell.js";
import {isInView} from "../../engine/timeZoom.js";

function easedT(t, ease) {
    if (ease === 'step') {
        return 0;
    }
    if (ease === 'smoothstep') {
        return smoothstep(0, 1, t);
    }
    return t;
}

function valueFraction(value, min, max) {
    const range = max - min;
    return range === 0 ? 0.5 : 1 - (value - min) / range;
}

const CURVE_STEPS = 20;

const fmt = (n) => n.toFixed(2);

function easingPath(kf1, kf2, toPoint) {
    const ease = kf1.ease || 'linear';
    const [x1, y1] = toPoint(kf1.time, kf1.value);
    const [x2, y2] = toPoint(kf2.time, kf2.value);
    if (ease === 'step') {
        return `M ${fmt(x1)} ${fmt(y1)} H ${fmt(x2)} V ${fmt(y2)}`;
    }
    const steps = ease === 'linear' ? 1 : CURVE_STEPS;
    const points = [];
    for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const x = x1 + (x2 - x1) * frac;
        const y = y1 + (y2 - y1) * easedT(frac, ease);
        points.push(`${fmt(x)} ${fmt(y)}`);
    }
    return `M ${points.join(' L ')}`;
}

/**
 * One SVG with the easing curves between the keyframes and the tail
 * after the last one. The viewBox is 0..100 in both directions and is
 * stretched over the strip, like the percent positions of the dots.
 */
function curveLines(track, view, min, max) {
    const kfs = track.keyframes;
    const span = view.end - view.start;
    if (kfs.length === 0 || span <= 0) {
        return '';
    }
    const toPoint = (time, value) => [
        (time - view.start) / span * 100,
        valueFraction(value, min, max) * 100,
    ];
    // Segments overlapping the view, also those spanning all of it.
    const easing = kfs.slice(0, -1)
        .map((kf, i) => [kf, kfs[i + 1]])
        .filter(([a, b]) => a.time <= view.end && b.time >= view.start)
        .map(([a, b]) => easingPath(a, b, toPoint))
        .join(' ');

    const last = kfs[kfs.length - 1];
    let tail = '';
    if (last.time < view.end) {
        const [x, y] = toPoint(last.time, last.value);
        tail = `M ${fmt(x)} ${fmt(y)} H 100`;
    }
    return `
        <svg class="curve-lines"
             viewBox="0 0 100 100"
             preserveAspectRatio="none"
             >
            <path class="easing-line"
                  d="${easing}"
                  />
            <path class="tail-line"
                  d="${tail}"
                  />
        </svg>`;
}

const TRACK_ACTIONS = [
    {action: ACTION.ADD_KEYFRAME, label: '+',
        title: 'Add keyframe at current time'},
    {action: ACTION.RESCALE_TRACK, label: CHAR.RESCALE,
        title: 'Rescale time range'},
    {action: ACTION.COPY_TRACK, label: CHAR.ARROW_PAIR_RIGHT,
        title: 'Copy keyframes'},
    {action: ACTION.PASTE_TRACK, label: CHAR.ARROW_PAIR_LEFT,
        title: 'Paste keyframes'},
    {action: ACTION.CLEAR_TRACK, label: CHAR.CLEAR,
        title: 'Clear track keyframes', className: 'btn icon danger'},
    {action: ACTION.DELETE_TRACK, label: CHAR.TRASH,
        title: 'Delete track', className: 'btn icon danger'},
];

function knownTargetNames(provider) {
    const names = new Set(provider.getKnownUniformNames());
    for (const batch of provider.allBatches()) {
        names.add(batch.id);
    }
    return names;
}

/** One target row; target = null renders the empty "add" row. */
function targetRow(trackId, index, target, knownNames) {
    const data = dataAttrs({trackId, targetIdx: index});
    const name = target?.uniformName ?? '';
    const isValid = !name || knownNames.has(name);
    const checked = target && (!isValid || target.enabled);
    const disabled = target && !isValid && target.enabled;
    const removeButton = target
        ? actionButton({
            action: ACTION.REMOVE_TARGET,
            label: CHAR.TIMES,
            className: 'btn icon subtle',
            title: 'Remove target',
            data: {trackId, targetIdx: index},
        })
        : '';
    return `
        <div class="${cls('target-row', !isValid && 'invalid-target')}">
            <input type="checkbox"
                   class="target-enable"
                   ${data}
                   ${checked ? 'checked' : ''}
                   ${disabled ? 'disabled' : ''}
                   title="Enable/disable">
            <input type="text"
                   class="field target-selector"
                   list="${DATALIST.UNIFORMS}"
                   placeholder="Uniform name"
                   value="${esc(name)}"
                   ${data}
                   spellcheck="false"
                   autocomplete="off">
            ${removeButton}
        </div>`;
}

function targetRows(track, knownNames) {
    const rows = track.targets.map((target, i) =>
        targetRow(track.id, i, target, knownNames)
    );
    rows.push(targetRow(track.id, track.targets.length, null, knownNames));
    return rows.join('');
}

/** Pointer x on a keyframe strip as a fraction of its time axis. */
export function stripFraction(strip, clientX) {
    // The strip has an inset of half a font size on both sides.
    const inset = parseFloat(getComputedStyle(strip).fontSize) * 0.5;
    return pointerFraction(strip, clientX, inset);
}

function stripPosition(time, view) {
    return isInView(view, time)
        ? `left:${percentOfSpan(time - view.start, view.end - view.start)}`
        : 'display:none';
}

/** Dots of the keyframes inside the visible window `view`. */
function keyframeDots(track, view, selectedKeyframes, min, max) {
    return track.keyframes.map((kf, i) => {
        if (!isInView(view, kf.time)) {
            return '';
        }
        const key = `${track.id}:${i}`;
        const selected = selectedKeyframes.has(key);
        const title = `t=${kf.time.toFixed(1)}s, val=${kf.value}, `
            + kf.ease;
        return `
            <div class="${cls('keyframe-dot', selected && 'selected')}"
                 ${dataAttrs({trackId: track.id, kfIndex: i})}
                 style="${position(kf, view)}"
                 title="${esc(title)}"></div>`;
    }).join('');

    function position(kf, view) {
        const left = stripPosition(kf.time, view);
        const top = `top:${valuePosition(kf.value)}`;
        return `${left}; ${top}`;
    }

    function valuePosition(value) {
        const fraction = valueFraction(value, min, max);
        return `${clamp(fraction * 100, 0, 100).toFixed(1)}%`;
    }
}

function valueLine(target, min, max, currentValue) {
    if (!target || !target.uniformName) {
        return '';
    }
    const value = currentValue?.[target.uniformName];
    if (value === undefined || value === null) {
        return '';
    }
    if (max === min) {
        return '';
    }
    const fraction = valueFraction(value, min, max);
    const clamped = clamp(fraction, 0, 1);
    const topPercent = (clamped * 100).toFixed(1);
    const outside = clamped !== fraction;
    return `
        <div class="value-line ${outside && 'outside'}"
             ${dataAttrs({uniformName: target.uniformName})}
             style="top:${topPercent}%"
             title="${esc(target.uniformName)}">
        </div>`;
}

function keyframeStrip(track, provider, view, selectedKeyframes) {
    const [min, max] = calcTrackValueRange(track, provider);
    const playhead = stripPosition(provider.engine.currentTime, view);
    const values = provider.engine.getAllUniformValues();
    const uniformLines = track.targets
        .filter(t => t.uniformName)
        .map(t => valueLine(t, min, max, values))
        .join('');
    const keyframes = keyframeDots(track, view, selectedKeyframes, min, max);
    return `
        <div class="keyframe-strip"
             ${dataAttrs({trackId: track.id})}
             title="Click to set keyframe">
            <div class="strip-bg"></div>
            ${curveLines(track, view, min, max)}
            ${keyframes}
            <div class="playhead"
                 style="${playhead}"></div>
            ${uniformLines}
            <span class="range-label max-label">${esc(max.toFixed(2))}</span>
            <span class="zero-marker">0</span>
            <span class="range-label min-label">${esc(min.toFixed(2))}</span>
        </div>
    `;
}

function trackActions(trackId) {
    return TRACK_ACTIONS
        .map(({className = 'btn icon', ...button}) =>
            actionButton({...button, className, data: {trackId}})
        )
        .join('');
}

function trackColumns(
    track, provider, view, knownNames, editingTrackId, selectedKeyframes
) {
    const data = {trackId: track.id};
    const nameCol = editableName({
        isEditing: editingTrackId === track.id,
        name: track.name,
        data,
        labelClass: 'track-name',
        extra: actionButton({
            action: ACTION.CANCEL_TRACK_NAME,
            label: CHAR.X_MARK,
            className: 'btn subtle cancel-name',
            data,
        }),
    });
    return `
        <div class="track-name-col">
            ${nameCol}
        </div>
        <div class="track-targets-col">
            ${targetRows(track, knownNames)}
        </div>
        <div class="track-widget">
            ${keyframeStrip(track, provider, view, selectedKeyframes)}
        </div>
        <div class="track-actions-col">
            ${trackActions(track.id)}
        </div>`;
}

function createTrackRow(track, provider, knownNames, selectedTrackId,
                        editingTrackId, collapsedTrackIds, selectedKeyframes,
                        view) {
    const wrapper = document.createElement('div');
    wrapper.className = 'track-wrapper';
    wrapper.classList.toggle('selected', selectedTrackId === track.id);
    wrapper.classList.toggle('collapsed', collapsedTrackIds.has(track.id));
    wrapper.dataset.trackId = track.id;
    wrapper.innerHTML = trackColumns(
        track, provider, view, knownNames, editingTrackId,
        selectedKeyframes
    );
    return wrapper;
}

export function renderAllTracks(ui, provider, ...state) {
    const knownNames = knownTargetNames(provider);
    const rows = provider.engine.getAllTracks().map(track =>
        createTrackRow(track, provider, knownNames, ...state)
    );
    ui.trackRows.replaceChildren(...rows);
}

export function renderTrack(ui, provider, trackId, ...state) {
    const track = provider.engine.getTrack(trackId);
    const row = ui.trackRows.querySelector(
        `.track-wrapper[data-track-id="${CSS.escape(trackId)}"]`
    );
    if (!track || !row) {
        return false;
    }
    row.replaceWith(
        createTrackRow(track, provider, knownTargetNames(provider), ...state)
    );
    return true;
}
