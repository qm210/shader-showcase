import {ACTION} from "../actions.js";
import {checkValidTarget} from "../engine/targets.js";
import {renderBatchList} from "./dom/batchList.js";
import {renderRandomizerPanel} from "./dom/randomizer.js";
import {collectUniformComponents, renderUniformList, updateUniformRow} from "./dom/uniformList.js";
import {intAttr, setShown, sibling} from "./dom/html.js";
import {toggleTargetDropdown} from "./dom/targetSelector.js";
import {formatRange, parseRangeInput} from "./format.js";

/**
 * @typedef {Object} UniformPanelDeps
 * @property {any} ctx
 *     Context provider; passed on to the render functions.
 * @property {any} engine
 * @property {{selectedId: string | null, renamingId: string | null}} batch
 * @property {{intensity: number, targetId: string | null}} randomize
 * @property {() => Set<string>} getSelectedUniforms
 * @property {(callback: () => void) => void} ifSingleClick
 * @property {() => void} renderPreview
 * @property {() => void} onTargetsChanged
 * @property {() => void} requestSave
 */

/**
 * Uniform list, batch cards and randomizer. The handle* methods return
 * true if they consumed the event.
 */
export class UniformPanelController {
    /**
     * @param {{root: HTMLElement, ui: any}} elements
     * @param {UniformPanelDeps} deps
     */
    constructor({root, ui}, deps) {
        this._root = root;
        this._ui = ui;
        this._deps = deps;
    }

    render() {
        const {ctx, batch, getSelectedUniforms} = this._deps;
        renderBatchList(this._ui, ctx, batch);
        renderUniformList(
            this._ui.uniformListBody, ctx, batch.selectedId,
            getSelectedUniforms()
        );
        this._root.querySelectorAll(
            `button[data-action="${ACTION.DESELECT_BATCHES}"]`
        ).forEach(button => setShown(button, !!batch.selectedId));
    }

    renderRandomizer() {
        const {ctx, randomize, getSelectedUniforms} = this._deps;
        const count = getSelectedUniforms().size;
        randomize.targetId = checkValidTarget(ctx, randomize.targetId, count);
        renderRandomizerPanel(this._ui, ctx, randomize.targetId, count);
    }

    updateUniform(name, value) {
        this._deps.engine.setActualUniformValue(name, value);
        const range = this._deps.ctx.getControl(name);
        updateUniformRow(this._root, name, value, range);
        this._deps.renderPreview();
    }

    toggleUniform(name, active) {
        const selected = this._deps.getSelectedUniforms();
        if (active) {
            selected.add(name);
        } else {
            selected.delete(name);
        }
        this._deps.ctx.getBatch(this._deps.batch.selectedId)
            ?.toggleUniform(name, active);
        this.render();
        this.renderRandomizer();
        this._deps.requestSave();
    }

    /** Sets min/max of the uniform in every batch; invalid -> default. */
    setOverwrite(name, key, value) {
        for (const batch of this._deps.ctx.allBatches()) {
            const entry = batch.uniforms.find(u => u.name === name);
            if (entry) {
                entry[key] = value ?? null;
            }
        }
        this._deps.requestSave();
    }

    /** Looks in the selected batch first, then in the auto batches. */
    findEntry(name) {
        const {ctx, batch} = this._deps;
        const batches = [ctx.getBatch(batch.selectedId), ...ctx.batches.auto];
        for (const candidate of batches.filter(Boolean)) {
            const entry = candidate.uniforms.find(u => u.name === name);
            if (entry) {
                return entry;
            }
        }
        return null;
    }

    handleClick(e) {
        const dropdown = this._ui.randomize.targetDropdown;

        const batchHeader = e.target.closest(".batch-card-header");
        if (batchHeader) {
            const {batchId} = batchHeader.closest(".batch-card").dataset;
            this._deps.ifSingleClick(() => {
                this._deps.batch.selectedId = batchId;
                this._deps.onTargetsChanged();
            });
            return true;
        }

        const display =
            e.target.closest(".target-selector > .selector-display");
        if (display) {
            toggleTargetDropdown(display, dropdown);
            return true;
        }

        const targetItem = e.target.closest(".selector-item");
        if (targetItem) {
            this._deps.randomize.targetId =
                targetItem.dataset.targetId || null;
            dropdown.hidden = true;
            this._deps.onTargetsChanged();
            return true;
        }

        // Not consumed: these let the click continue to other handlers.
        if (!e.target.closest(".target-selector")) {
            dropdown.hidden = true;
        }
        e.target.closest(".uniform-group-header")
            ?.classList.toggle("collapsed");
        return false;
    }

    /** Double-clicking a slider resets the uniform to its default. */
    handleDoubleClick(e) {
        const slider = e.target.closest(".uniform-slider");
        if (!slider) {
            return false;
        }
        const name = slider.dataset.uniformName;
        const control = this._deps.ctx.getControl(name);
        if (control?.defaultValue !== undefined) {
            this.updateUniform(name, control.defaultValue);
        }
        return true;
    }

    handleChange(e) {
        const el = e.target;
        if (el.closest(".batch-uniform-row")) {
            this._updateBatchField(el);
        } else if (el.classList.contains("uniform-checkbox")) {
            this.toggleUniform(el.dataset.uniformName, el.checked);
        } else if (el.matches(".uniform-min, .uniform-max")) {
            this.setOverwrite(
                el.dataset.uniformName,
                el.classList.contains("uniform-min") ? "min" : "max",
                parseRangeInput(el.value)
            );
        } else {
            return false;
        }
        return true;
    }

    handleInput(e) {
        const el = e.target;
        if (el === this._ui.randomize.intensitySlider) {
            const {randomize} = this._deps;
            randomize.intensity = parseFloat(el.value);
            this._ui.randomize.intensityValue.textContent =
                randomize.intensity.toFixed(2);
            this._deps.requestSave();
        } else if (el.matches(
            ".uniform-min, .uniform-max," +
            " .batch-uniform-row .min, .batch-uniform-row .max"
        )) {
            // Validate while typing; values are committed on change.
            el.classList.toggle(
                "invalid", parseRangeInput(el.value) === undefined
            );
        } else if (el.classList.contains("uniform-slider")) {
            const name = el.dataset.uniformName;
            const value = collectUniformComponents(name, el);
            this._deps.engine.setActualUniformValue(name, value);
            const tooltip = sibling(el, ".slider-tooltip");
            if (tooltip) {
                tooltip.textContent = String(value);
            }
            this._deps.renderPreview();
        } else {
            return false;
        }
        return true;
    }

    /**
     * Right-click on a slider resets it to the latest snapshot;
     * elsewhere on a uniform row it logs the row's data.
     */
    handleContextMenu(e) {
        const slider = e.target.closest(".uniform-slider");
        if (slider) {
            e.preventDefault();
            const name = slider.dataset.uniformName;
            const snapshot = this._deps.engine.latestSnapshot;
            if (snapshot && name in snapshot) {
                this.updateUniform(name, snapshot[name]);
            }
            return true;
        }
        const row = e.target.closest(".uniform-row");
        if (!row) {
            return false;
        }
        e.preventDefault();
        const name =
            row.querySelector("[data-uniform-name]")?.dataset.uniformName;
        if (name) {
            console.group(`Uniform: ${name}`);
            console.log("Entry:", this.findEntry(name)
                ?? "(not in any batch)");
            console.log("Control Range:", this._deps.ctx.getControl(name));
            console.groupEnd();
        }
        return true;
    }

    _updateBatchField(el) {
        const batch = this._deps.ctx.getBatch(el.dataset.batchId);
        const index = intAttr(el, "index");
        if (!batch?.uniforms[index]) {
            return;
        }

        if (el.classList.contains("name")) {
            const name = el.value.trim();
            batch.updateUniform(index, {name});
            // Update the range placeholders in place to keep the focus.
            const range = this._deps.ctx.getControl(name);
            const row = el.closest(".batch-uniform-row");
            row.querySelector(".min").placeholder = formatRange(range.min);
            row.querySelector(".max").placeholder = formatRange(range.max);
        } else {
            const key = ["min", "max", "factor"]
                .find(k => el.classList.contains(k));
            const value = parseRangeInput(el.value);
            el.classList.toggle("invalid", value === undefined);
            if (!key || value === undefined) {
                return;
            }
            batch.updateUniform(index, {[key]: value});
        }
        this._deps.requestSave();
    }
}
