import {lerp, smoothstep} from "./math.js";

export const EASING_TYPES = ["linear", "smoothstep", "step"];

export function interpolateKeyframes(from, to, t, ease) {
    switch (ease) {
        case "step":
            t = 0;
            break;
        case "smoothstep":
            t = smoothstep(0, 1, t);
            break;
        case "linear":
            break;
        default:
            console.warn("Invalid Easing Type:", ease);
            break;
    }
    if (t <= 0) {
        return from.value;
    }

    if (Array.isArray(from.value)) {
        return from.value.map((v, i) => lerp(v, to.value[i], t));
    }
    return lerp(from.value, to.value, t);
}

export function findSurroundingKeyframes(keyframes, time) {
    if (keyframes.length === 0) {
        return null;
    }
    if (keyframes.length === 1) {
        return {
            prev: keyframes[0],
            next: keyframes[0],
            t: 0
        };
    }
    if (time <= keyframes[0].time) {
        return {
            prev: keyframes[0],
            next: keyframes[1] || keyframes[0],
            t: 0
        };
    }
    if (time >= keyframes[keyframes.length - 1].time) {
        const last = keyframes[keyframes.length - 1];
        return {
            prev: keyframes[keyframes.length - 2],
            next: last,
            t: 1
        };
    }
    for (let i = 0; i < keyframes.length - 1; i++) {
        if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
            const dur = keyframes[i + 1].time - keyframes[i].time;
            return {
                prev: keyframes[i],
                next: keyframes[i + 1],
                t: (time - keyframes[i].time) / (dur || 0.001)
            };
        }
    }
    return {
        prev: keyframes[keyframes.length - 2],
        next: keyframes[keyframes.length - 1],
        t: 1
    };
}

let _keyframeIdCounter = 0;

export function createKeyframeId() {
    return `kf_${++_keyframeIdCounter}${Date.now().toString(36)}`;
}

export function keyframeKey(trackId, kfId) {
    return `${trackId}:${kfId}`;
}

export function parseKeyframeKey(key) {
    const sep = key.lastIndexOf(":");
    return {
        trackId: key.slice(0, sep),
        kfId: key.slice(sep + 1),
    };
}