import {lerp, smoothstep} from "./math.js";

export function interpolateKeyframes(from, to, t, transition) {
    if (transition === 'step') {
        // "step" means to hold until next keyframe
        return from.value;
    }

    const easedT = transition === 'smoothstep' ? smoothstep(0, 1, t) : t;

    if (Array.isArray(from.value)) {
        return from.value.map((v, i) => lerp(v, to.value[i], easedT));
    }
    return lerp(from.value, to.value, easedT);
}

export function findSurroundingKeyframes(keyframes, time) {
    if (keyframes.length === 0) return null;
    if (keyframes.length === 1) return {prev: keyframes[0], next: keyframes[0], t: 0};

    if (time <= keyframes[0].time) {
        return {prev: keyframes[0], next: keyframes[1] || keyframes[0], t: 0};
    }

    if (time >= keyframes[keyframes.length - 1].time) {
        const last = keyframes[keyframes.length - 1];
        return {prev: keyframes[keyframes.length - 2], next: last, t: 1};
    }

    for (let i = 0; i < keyframes.length - 1; i++) {
        if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
            const dur = keyframes[i + 1].time - keyframes[i].time || 0.001;
            return {prev: keyframes[i], next: keyframes[i + 1], t: (time - keyframes[i].time) / dur};
        }
    }

    return {prev: keyframes[keyframes.length - 2], next: keyframes[keyframes.length - 1], t: 1};
}