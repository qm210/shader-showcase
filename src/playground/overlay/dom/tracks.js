import {ACTION} from '../../actions.js';
import {percentOfSpan, smoothstep} from '../../engine/math.js';
import {calcTrackValueRange} from '../../engine/valueRanges.js';
import {CHAR, clamp} from '../index.js';
import {actionButton, cls, dataAttrs, editableName, esc, pointerFraction,} from './html.js';
import {DATALIST} from "./shell.js";
import {fullView, isInView} from "../../engine/timeZoom.js";

/** Compute eased t for a given ease type. */
function easedT(t, ease) {
    if (ease === 'step') {
        return 0;
    }
    if (ease === 'smoothstep') {
        return smoothstep(0, 1, t);
    }
    return t;
}

/** Generate SVG path for easing curve between two keyframes. */
function easingPath(kf1, kf2, view, stripWidth, min, max) {
    const span = view.end - view.start;
    if (span <= 0) {
        return '';
    }
    const t1 = (kf1.time - view.start) / span;
    const t2 = (kf2.time - view.start) / span;
    const x1 = t1 * stripWidth;
    const x2 = t2 * stripWidth;
    const range = max - min;
    const y1 = range === 0 ? 50 : (1 - (kf1.value - min) / range) * 100;
    const y2 = range === 0 ? 50 : (1 - (kf2.value - min) / range) * 100;
    const steps = 20;
    const ease = kf1.ease || 'linear';

    if (ease === 'step') {
        return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }

    let d = `M ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    for (let i = 1; i <= steps; i++) {
        const frac = i / steps;
        const eased = easedT(frac, ease);
        const x = x1 + (x2 - x1) * frac;
        const y = y1 + (y2 - y1) * eased;
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
}

/** Generate SVG element for a single easing curve segment. */
function easingSegment(kf1, kf2, view, min, max) {
    if (!isInView(view, kf1.time) && !isInView(view, kf2.time)) {
        return '';
    }
    const path = easingPath(kf1, kf2, view, 100, min, max);
    if (!path) {
        return '';
    }
    return `<svg class="easing-line" viewBox="0 0 100 100"
                 preserveAspectRatio="none">
            <path d="${path}" />
        </svg>`;
}

/** Generate all easing line SVGs for a track's keyframes. */
function easingLines(track, view, min, max) {
    if (track.keyframes.length <= 1) {
        return '';
    }
    return track.keyframes.slice(0, -1)
        .map((kf, i) => easingSegment(kf, track.keyframes[i + 1], view, min, max))
        .filter(Boolean)
        .join('');
}

/** Generate the tail line from the last keyframe to the right edge. */
function tailLine(track, view, min, max) {
    const kfs = track.keyframes;
    if (kfs.length === 0) {
        return '';
    }
    const last = kfs[kfs.length - 1];
    const span = view.end - view.start;
    if (span <= 0 || last.time < view.start) {
        return '';
    }
    const range = max - min;
    const y = range === 0
        ? 50
        : (1 - (last.value - min) / range) * 100;
    const xStart = ((last.time - view.start) / span) * 100;
    return `<svg class="tail-line" viewBox="0 0 100 100"
                 preserveAspectRatio="none">
            <path d="M ${xStart.toFixed(1)} ${y.toFixed(1)} L 100 ${y.toFixed(1)}" />
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

/** Uniform names and batch ids a target may refer to. */
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
    const range = max - min;
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
        if (range === 0) {
            return '50%';
        }
        const fraction = 1 - (value - min) / range;
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
    const range = max - min;
    if (range === 0) {
        return '';
    }
    const fraction = 1 - (value - min) / range;
    const clamped = Math.max(0, Math.min(1, fraction));
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
    const tail = tailLine(track, view, min, max);
    return `
        <div class="keyframe-strip"
             ${dataAttrs({trackId: track.id})}
             title="Click to set keyframe">
            <div class="strip-bg"></div>
            ${keyframes}
            ${easingLines(track, view, min, max)}
            ${tail}
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

/**
 * Rebuilds all track rows. The keyframe strips show the time window
 * `view`, the full timeline by default.
 */
export function renderTracks(ui, provider, selectedTrackId, editingTrackId,
                             collapsedTrackIds, selectedKeyframes,
                             view = fullView(provider.engine)) {
    const knownNames = knownTargetNames(provider);
    const wrappers = provider.engine.getAllTracks().map(track => {
        const wrapper = document.createElement('div');
        wrapper.className = 'track-wrapper';
        wrapper.classList.toggle('selected', selectedTrackId === track.id);
        wrapper.classList.toggle('collapsed', collapsedTrackIds.has(track.id));
        wrapper.dataset.trackId = track.id;
        wrapper.innerHTML = trackColumns(
            track, provider, view, knownNames,
            editingTrackId, selectedKeyframes
        );
        return wrapper;
    });
    ui.trackRows.replaceChildren(...wrappers);
}
