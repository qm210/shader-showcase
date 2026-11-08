import {MIN_TIMELINE_SPAN} from "../overlay/overlay.dom.js";

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

export function percentOfSpan(time, span) {
    return (time / span) * 100;
}

export function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function smoothstep(a, b, t) {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
}

