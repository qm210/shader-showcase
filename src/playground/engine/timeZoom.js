import {clamp} from '../../app/algorithms.js';

export const MIN_TIMELINE_SPAN = 60;
export const MIN_TIME_STEP = 0.01;
const MIN_ZOOM_SPAN = 0.5;
const TICK_STEPS = [1, 2, 5];

export function timelineSpan(engine, factor = 1) {
    const tracks = engine.getAllTracks();
    let maxTime = 0;
    for (const track of tracks) {
        for (const kf of track.keyframes) {
            if (kf.time > maxTime) {
                maxTime = kf.time;
            }
        }
    }
    return Math.max(maxTime, MIN_TIMELINE_SPAN) * factor;
}

export const fullView = (engine) => ({start: 0, end: timelineSpan(engine)});

/** The visible window: the zoom kept inside [0, span], else everything. */
export function visibleRange(zoom, span) {
    const full = {start: 0, end: span};
    return (zoom && clampZoom(zoom.start, zoom.end, span)) ?? full;
}

/**
 * Normalizes a window given by two times in any order: at least
 * MIN_ZOOM_SPAN wide and shifted into [0, span]. Returns null when the
 * window covers the whole timeline, which means "not zoomed".
 */
export function clampZoom(a, b, span) {
    const width = clamp(Math.abs(b - a), Math.min(MIN_ZOOM_SPAN, span), span);
    if (width >= span - 1e-6) {
        return null;
    }
    const center = (a + b) / 2;
    const start = clamp(center - width / 2, 0, span - width);
    return {start, end: start + width};
}

/** A window from `anchor` towards `time`, at least MIN_ZOOM_SPAN wide. */
export function zoomFromAnchor(anchor, time, span) {
    const delta = time - anchor;
    const width = Math.max(Math.abs(delta), MIN_ZOOM_SPAN);
    return clampZoom(anchor, anchor + Math.sign(delta || 1) * width, span);
}

/** Scales the view by `factor` while `time` stays at the same spot. */
export function zoomAround(view, time, factor, span) {
    const width = view.end - view.start;
    const newWidth = clamp(width * factor, MIN_ZOOM_SPAN, span);
    const start = time - (time - view.start) * newWidth / width;
    return clampZoom(start, start + newWidth, span);
}

/** Moves the view by `delta` seconds, keeping its width. */
export function panBy(view, delta, span) {
    return clampZoom(view.start + delta, view.end + delta, span);
}

export const timeAt = (view, fraction) =>
    view.start + fraction * (view.end - view.start);

export const isInView = (view, time) =>
    time >= view.start && time <= view.end;

/** Round tick times (1-2-5 steps) for about `maxCount` labels. */
export function tickTimes(view, maxCount = 8) {
    const raw = (view.end - view.start) / maxCount;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = magnitude
        * (TICK_STEPS.find(s => s * magnitude >= raw) ?? 10);
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));

    const times = [];
    const last = Math.floor(view.end / step + 1e-9);
    for (let i = Math.ceil(view.start / step - 1e-9); i <= last; i++) {
        const time = i * step;
        times.push({time, label: `${time.toFixed(decimals)}s`});
    }
    return times;
}
