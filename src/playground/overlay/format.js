import {CHAR} from './index.js';

const VECTOR_COMPONENTS = ['x', 'y', 'z', 'w'];

const isNil = (value) => value === null || value === undefined;

/** Check if a GLSL type is an integer type (int, ivec*). */
export function isIntegerType(type) {
    return /^i(ivec|nt)$/.test(type ?? '');
}

/** Uniform value for display: vectors with 3, scalars with 4 decimals. */
export function formatValue(value, empty = CHAR.NO_VALUE) {
    if (isNil(value)) {
        return empty;
    }
    if (Array.isArray(value)) {
        return `[${value.map(v => v.toFixed(3)).join(', ')}]`;
    }
    return value.toFixed(4);
}

/** Content of an overwrite field: "a/b/c" for vectors, "" when unset. */
export function formatOverwrite(value) {
    if (isNil(value)) {
        return '';
    }
    return Array.isArray(value)
        ? value.join('/')
        : String(value);
}

/** One component of a scalar or vector value as text, "" when unset. */
export function formatComponent(value, index) {
    if (isNil(value)) {
        return '';
    }
    return Array.isArray(value)
        ? String(value[index] ?? '')
        : String(value);
}

/** Min/max/step of one component of a control range. */
export function componentRange(range, index, isInteger) {
    if (isNil(range)) {
        return {min: 0, max: 1, step: isInteger ? 1 : 0.01};
    }
    const pick = (v) => Array.isArray(v) ? v[index] : v;
    return {
        min: pick(range.min) ?? 0,
        max: pick(range.max) ?? 1,
        step: range.step ?? (isInteger ? 1 : 0.01),
    };
}

/** Component suffixes of a GLSL type: vec3 -> ['x','y','z'], else [null]. */
export function vectorComponents(type) {
    const match = /^vec([2-4])$/.exec(type ?? '');
    return match
        ? VECTOR_COMPONENTS.slice(0, Number(match[1]))
        : [null];
}

export const formatNumber = (value, digits = 2) =>
    typeof value === 'number' ? value.toFixed(digits) : JSON.stringify(value);

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