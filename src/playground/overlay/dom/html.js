const toKebab = (key) =>
    key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

export const esc = (value) =>
    String(value ?? "")
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

export const cls = (...names) =>
    names.filter(Boolean).join(' ');

/** data-* attributes from camelCase keys; nullish values are skipped. */
export function dataAttrs(data = {}) {
    return Object.entries(data)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `data-${toKebab(key)}="${esc(value)}"`)
        .join(' ');
}

/** A button that triggers an ACTION via the overlay's click delegation. */
export function actionButton({
    action, label, className = 'btn', title = '', data = {},
}) {
    const titleAttr = title ? `title="${esc(title)}"` : '';
    return `
        <button type="button"
                class="${className}"
                data-action="${action}"
                ${dataAttrs(data)}
                ${titleAttr}>${label}</button>`;
}

/**
 * Name column of a track or batch: an input while editing, else a label.
 * `extra` is appended after the input (e.g. a cancel button).
 */
export function editableName({isEditing, name, data, labelClass, extra = ''}) {
    if (isEditing) {
        return `
            <input class="field name"
                   value="${esc(name)}"
                   ${dataAttrs(data)}
                   spellcheck="false"
                   autocomplete="off">
            ${extra}`;
    }
    return `
        <span class="${labelClass} name" ${dataAttrs(data)}>
            ${esc(name)}
        </span>`;
}

/** Hides via inline display:none, which beats any CSS display rule. */
export function setShown(el, shown) {
    el.style.display = shown ? '' : 'none';
}

/** Horizontal pointer position as a fraction [0, 1] of the element. */
export function pointerFraction(el, clientX, inset = 0) {
    const rect = el.getBoundingClientRect();
    const width = rect.width - 2 * inset;
    return width > 0
        ? Math.min(Math.max((clientX - rect.left - inset) / width, 0), 1)
        : 0;
}
