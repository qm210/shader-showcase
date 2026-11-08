import {injectGlobalCSS} from "./utils.js";

class DragNumber extends HTMLElement {

    get pixelDensity() {
        const value = this.getAttribute('pixel-density');
        Math.max(1, Number(value) || 4);
    }

    get min() {
        return this._numberAttribute("min", -Infinity);
    }

    get max() {
        return this._numberAttribute("max", Infinity);
    }

    get step() {
        return this._numberAttribute("step", 1);
    }

    get stepMin() {
        const value = this._numberAttribute("step-min", this.step);
        return value > 0
            ? Math.min(value, this.step)
            : this.step;
    }

    get stepMax() {
        const value = this._numberAttribute("step-max", this.step);
        return value > 0
            ? Math.max(value, this.step)
            : this.step;
    }

    connectedCallback() {
        this._controller?.abort();
        this._controller = new AbortController();
        const { signal } = this._controller;
        const input = this.querySelector('input');
        if (!input) {
            return;
        }
        input.type = "number";

        let handle = this.querySelector('.drag-number-handle');
        if (!handle) {
            handle = document.createElement('span');
            handle.className = 'drag-number-handle';
            handle.textContent = '↕';
            handle.title = 'Drag to change value';
            handle.setAttribute('aria-hidden', 'true');
            this.prepend(handle);
        }

        let drag = null;

        handle.addEventListener('pointerdown', (e) => {
            if (!e.isPrimary ||
                e.button !== 0 ||
                input.disabled ||
                input.readOnly) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            drag = {
                pointerId: e.pointerId,
                startX: e.clientX,
                lastY: e.clientY,
                originalValue: input.value,
                value: Number.isFinite(input.valueAsNumber)
                    ? input.valueAsNumber : 0,
                attr: {
                    baseStep: this.step,
                    minStep: this.stepMin,
                    maxStep: this.stepMax,
                    currentStep: this.step,
                    density: this.density,
                },
                pendingPixels: 0,
                stepRangePixels: this.calcStepRangePixels()
            };

            handle.setPointerCapture(e.pointerId);
            this.setAttribute("dragging", "");
        }, { signal });

        handle.addEventListener("pointermove", (e) => {
            if (!drag || e.pointerId !== drag.pointerId) {
                return;
            }
            const delta = {
                x: (drag.startY - e.clientX) / drag.stepRangePixels,
                y: (e.clientY - drag.lastY) / drag.density,
            };
            const stepDelta = (
                delta.x < 0 ? drag.minStep : drag.maxStep
            ) - drag.baseStep;
            delta.x = Math.min(Math.abs(delta.x), 1);
            drag.currentStep = drag.baseStep + delta.x * stepDelta;
            drag.pendingPixels += drag.lastY - e.clientY;
            drag.lastY = e.clientY;

            const ticks = Math.trunc(drag.pendingPixels / drag.density);
            if (ticks === 0) {
                return;
            }
            drag.pendingPixels -= ticks * drag.pixels;

            let value = drag.value + ticks * drag.currentStep;
            value = Number(value.toFixed(10));
            value = Math.max(this.min, Math.min(this.max, value));
            drag.value = value;

            if (input.value !== String(value)) {
                input.value = String(value);
                input.dispatchEvent(
                    new Event('input', {bubbles: true})
                );
            }
        }, { signal });

        const finish = (e) => {
            if (!drag || e.pointerId !== drag.pointerId) {
                return;
            }
            const changed = input.value !== drag.originalValue;
            drag = null;

            this.removeAttribute('dragging');
            if (handle.hasPointerCapture(e.pointerId)) {
                handle.releasePointerCapture(e.pointerId);
            }
            if (changed) {
                input.dispatchEvent(new Event('change', {
                    bubbles: true,
                }));
            }
        };

        handle.addEventListener('pointerup', finish, { signal });
        handle.addEventListener('pointercancel', finish, { signal });
        handle.addEventListener('lostpointercapture', finish, { signal });
    }

    disconnectedCallback() {
        this._controller?.abort();
        this.removeAttribute('dragging');
    }

    _numberAttribute(name, fallback) {
        const raw = (
            this.getAttribute(name) ||
            this.input?.getAttribute(name)
        );
        if (!raw || raw.trim() === '') {
            return fallback;
        }
        const value = Number(raw);
        return Number.isFinite(value) ? value : fallback;
    }

    calcStepRangePixels() {
        // just some guess, adjust if overly shitty UX.
        const width = this.input.getBoundingClientRect().width;
        return Math.max(1, this.pixelDensity * width);
    }
}


injectGlobalCSS("drag-number-styles",
    `
    drag-number {
        position: relative;
        display: inline-flex;
        align-items: stretch;
        min-width: 0;
        max-width: 100%;
        box-sizing: border-box;
    }
    
    drag-number > input {
        display: block;
        min-width: 0;
        max-width: 100%;
        box-sizing: border-box;
        padding-inline-end: 1ch;
    }
    
    drag-number > .drag-number-handle {
        position: absolute;
        inset-inline-end: 0.2rem;
        top: 50%;
        transform: translate(0.5ch, -50%);

        display: flex;
        align-items: center;
        justify-content: center;
        width: 0.9rem;
        height: 1.4rem;

        font-size: 0.8rem;
        line-height: 1;
        color: currentColor;
        opacity: 0.3;

        cursor: ns-resize;
        user-select: none;
        touch-action: none;
    }

    drag-number:hover > .drag-number-handle {
        opacity: 0.65;
    }

    drag-number[dragging] > .drag-number-handle {
        opacity: 1;
    }

    /* Avoid overlapping native number-input spinner controls. */
    drag-number > input[type="number"] {
        appearance: textfield;
        -moz-appearance: textfield;
    }

    drag-number > input::-webkit-inner-spin-button,
    drag-number > input::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
    `
);

customElements.define('drag-number', DragNumber);
