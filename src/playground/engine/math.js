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

