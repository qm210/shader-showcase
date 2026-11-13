export const FALLBACK_RANGE = {
    min: -1,
    max: 1
};

export function isRangeValue(value) {
    return typeof value === "number"
        ? Number.isFinite(value)
        : isFiniteArray(value);
}

export function isFiniteArray(value) {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(Number.isFinite)
    );
}

export function calcTrackValueRange(track, context) {
    let [min, max] = [0, 1];
    for (const target of track.targets) {
        if (target.enabled && target.uniformName) {
            const range = context.getControlRange(target.uniformName);
            const tMin = Array.isArray(range.min)
                ? FALLBACK_RANGE.min : range.min;
            const tMax = Array.isArray(range.max)
                ? FALLBACK_RANGE.max : range.max;
            min = Math.min(min, tMin);
            max = Math.max(max, tMax);
        }
    }
    return [min, max];
}
