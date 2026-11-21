import {DELAY_MS} from "./index.js";

/**
 * One kind of renamable item, e.g. lanes or batches.
 *
 * @typedef {Object} RenameKind
 * @property {string} trigger
 *     Selector of the element that starts renaming on double-click.
 * @property {string} container
 *     Selector of the item element, e.g. ".lane-wrapper".
 * @property {string} idKey
 *     Dataset key of the item id on the container, e.g. "laneId".
 * @property {() => string | null} getRenamingId
 * @property {(id: string | null) => void} setRenamingId
 * @property {(id: string) => {name: string} | null} get
 * @property {(id: string) => void} render
 *     Renders the item, as input while getRenamingId() === id.
 * @property {(id: string) => void} [afterCommit]  Defaults to render.
 * @property {(related: Element | null) => boolean} [keepOnBlur]
 *     True if losing the focus to `related` must not commit.
 */

/**
 * Inline editing of names: double-click starts, Enter or blur commits,
 * Escape cancels. Also tells single from double clicks, so a single
 * click (e.g. selecting) can wait until no double click follows.
 */
export class InlineRename {
    /** @param {Record<string, RenameKind>} kinds  Checked in this order. */
    constructor(kinds) {
        this._kinds = kinds;
        this._clickTimer = null;
    }

    /** Runs callback unless a double click follows in time. */
    ifSingleClick(callback) {
        clearTimeout(this._clickTimer);
        this._clickTimer = setTimeout(() => {
            this._clickTimer = null;
            callback();
        }, DELAY_MS.DOUBLE_CLICK);
    }

    cancelSingleClick() {
        clearTimeout(this._clickTimer);
        this._clickTimer = null;
    }

    /** The kind being renamed, or null. */
    active() {
        return Object.values(this._kinds)
            .find(kind => kind.getRenamingId()) ?? null;
    }

    isEditing(el) {
        return el.classList.contains("name") && Boolean(this.active());
    }

    start(kindName, id) {
        const kind = this._kinds[kindName];
        requestAnimationFrame(() => {
            kind.setRenamingId(id);
            kind.render(id);
            const selector =
                `${kind.container}[data-${toAttr(kind.idKey)}` +
                `="${CSS.escape(id)}"] .name`;
            document.querySelector(selector)?.focus();
        });
    }

    /** Applies the edited name and leaves editing. */
    commit(input) {
        const kind = this.active();
        if (!kind) {
            return;
        }
        const id = kind.getRenamingId();
        const name = input.value.trim();
        const item = kind.get(id);
        if (name && item) {
            item.name = name;
        }
        // Cleared before rendering, so the blur of the replaced input
        // does not commit a second time.
        kind.setRenamingId(null);
        (kind.afterCommit ?? kind.render)(id);
    }

    /** Leaves editing without renaming; optionally only for one kind. */
    cancel(kindName = null) {
        const kind = kindName ? this._kinds[kindName] : this.active();
        const id = kind?.getRenamingId();
        if (id) {
            kind.setRenamingId(null);
            kind.render(id);
        }
    }

    handleDoubleClick(e) {
        for (const [name, kind] of Object.entries(this._kinds)) {
            const trigger = e.target.closest(kind.trigger);
            if (trigger) {
                const container = trigger.closest(kind.container);
                this.start(name, container.dataset[kind.idKey]);
                return true;
            }
        }
        return false;
    }

    handleKeyDown(e) {
        if (!this.isEditing(e.target)) {
            return false;
        }
        if (e.code === "Enter") {
            this.commit(e.target);
        } else if (e.code === "Escape") {
            this.cancel();
        }
        return true;
    }

    handleBlur(e) {
        if (!this.isEditing(e.target)) {
            return false;
        }
        if (!this.active().keepOnBlur?.(e.relatedTarget)) {
            this.commit(e.target);
        }
        return true;
    }
}

/** "laneId" -> "lane-id" */
const toAttr = (key) => key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
