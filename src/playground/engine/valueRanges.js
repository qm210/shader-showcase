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

export function calcLaneRange(lane, _context) {
    // Use the lane's own stored range if available.
    if (lane.range && lane.range.min !== undefined && lane.range.max !== undefined) {
        return [lane.range.min, lane.range.max];
    }
    // Fallback: compute from targets (legacy path).
    let [min, max] = [FALLBACK_RANGE.min, FALLBACK_RANGE.max];
    for (const target of lane.targets) {
        if (target.enabled && target.uniformName) {
            const range = _context.getControl(target.uniformName);
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
