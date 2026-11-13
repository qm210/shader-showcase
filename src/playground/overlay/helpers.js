import {urlSearchParam} from "../../app/layout/page.js";

export function escape(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

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

const _debug = urlSearchParam("debug");

export const DEBUG = {
    log: (...args) =>
        _debug && console.log("[DEBUG]", ...args),
    table: (arg) =>
        _debug && console.table(arg),
};
