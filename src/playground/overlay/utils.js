export function formatRange(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return Array.isArray(value) ? value.join(', ') : String(value);
}

export function parseRangeInput(text) {
    const trimmed = text.trim();
    if (trimmed === '') {
        return null;
    }
    const parts = trimmed.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (parts.length === 0 || !parts.every(Number.isFinite)) {
        return undefined;
    }
    return parts.length === 1 ? parts[0] : parts;
}

export function isTypingTarget(target) {
    return Boolean(
        target?.closest?.('input, select, textarea, button, [contenteditable="true"]')
    );
}

