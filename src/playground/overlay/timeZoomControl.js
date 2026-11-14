// Mouse, wheel and keyboard interaction for zooming the timeline:
//
//   ruler          drag = select a range, click = jump to that time,
//                  wheel = zoom around the pointer, Shift+wheel = pan
//   zoom band      drag = move, drag a handle = resize, double-click = reset
//   detail slider  wheel = pan, Ctrl+wheel = zoom
//   keyframe strip Ctrl+wheel = zoom (also pinch), Shift+wheel = pan
//   Esc / button   back to the full timeline

import {pointerFraction} from './dom/html.js';
import {stripFraction} from './dom/tracks.js';
import {clampZoom, panBy, timeAt, visibleRange, zoomAround, zoomFromAnchor,} from '../engine/timeZoom.js';

/** Pointer travel below which a ruler press counts as a click. */
const CLICK_TOLERANCE_PX = 3;
/** Wheel pixels that zoom by a factor of e. */
const WHEEL_ZOOM_PX = 500;
/** Wheel pixels that pan by one view width. */
const WHEEL_PAN_PX = 1000;
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 400;

/** Wheel delta in pixels, whatever unit the device reports. */
function wheelPixels(e, delta) {
    const unit = [1, LINE_HEIGHT_PX, PAGE_HEIGHT_PX][e.deltaMode] ?? 1;
    return delta * unit;
}

export class TimeZoomControl {
    /**
     * @param ui        the overlay's element references
     * @param timeline  {span(), zoom(), setZoom(zoom | null), seek(time)}
     */
    constructor(ui, timeline) {
        this.ui = ui;
        this.timeline = timeline;
        this.drag = null;

        const {timeRuler, timeRangeBar, trackRows} = ui;
        timeRuler.addEventListener('pointerdown', (e) => this._begin(e));
        timeRuler.addEventListener('pointermove', (e) => this._move(e));
        timeRuler.addEventListener('pointerup', (e) => this._end(e));
        timeRuler.addEventListener('pointercancel', () => {
            this.drag = null;
        });
        timeRuler.addEventListener('dblclick', (e) => {
            if (e.target.closest('.time-zoom-band')) {
                this.reset();
            }
        });
        ui.timeZoomReset.addEventListener('click', () => this.reset());
        timeRangeBar.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && this.timeline.zoom()) {
                e.preventDefault();
                this.reset();
            }
        });

        const active = {passive: false};
        timeRangeBar.addEventListener('wheel', (e) => this._onBarWheel(e),
            active);
        trackRows.addEventListener('wheel', (e) => this._onStripWheel(e),
            active);
    }

    reset() {
        this.timeline.setZoom(null);
    }

    /** Applies typed start/end values; reversed or empty input is fixed. */
    applyTypedRange(start, end) {
        const span = this.timeline.span();
        const view = this._view();
        const from = Number.isFinite(start) ? start : view.start;
        const to = Number.isFinite(end) ? end : view.end;
        this.timeline.setZoom(clampZoom(from, to, span));
    }

    _view() {
        return visibleRange(this.timeline.zoom(), this.timeline.span());
    }

    /** Time under the pointer on the ruler or main slider. */
    _overviewTime(clientX) {
        return pointerFraction(this.ui.timeRuler, clientX)
            * this.timeline.span();
    }

    // ─── Ruler dragging ─────────────────────────────────────────

    _begin(e) {
        if (e.button !== 0) {
            return;
        }
        const time = this._overviewTime(e.clientX);
        const zoom = this.timeline.zoom();
        const handle = e.target.closest('.time-zoom-handle');

        if (zoom && handle) {
            // Resizing keeps the opposite edge where it is.
            const isStart = handle.dataset.edge === 'start';
            const anchor = isStart ? zoom.end : zoom.start;
            this.drag = {mode: 'resize', anchor};
        } else if (zoom && e.target.closest('.time-zoom-band')) {
            this.drag = {mode: 'move', origin: time, view: this._view()};
        } else {
            this.drag = {mode: 'select', anchor: time};
        }
        Object.assign(this.drag, {startX: e.clientX, moved: false});
        this.ui.timeRuler.setPointerCapture(e.pointerId);
        e.preventDefault();
    }

    _move(e) {
        const {drag} = this;
        if (!drag) {
            return;
        }
        drag.moved ||=
            Math.abs(e.clientX - drag.startX) > CLICK_TOLERANCE_PX;
        if (!drag.moved) {
            return;
        }
        const time = this._overviewTime(e.clientX);
        const span = this.timeline.span();
        this.timeline.setZoom(drag.mode === 'move'
            ? panBy(drag.view, time - drag.origin, span)
            : zoomFromAnchor(drag.anchor, time, span));
    }

    _end(e) {
        const {drag} = this;
        this.drag = null;
        if (drag?.mode === 'select' && !drag.moved) {
            this.timeline.seek(this._overviewTime(e.clientX));
        }
    }

    // ─── Wheel ──────────────────────────────────────────────────

    _onBarWheel(e) {
        const inDetail = e.target.closest('.time-zoom-detail');
        if (inDetail) {
            const fraction =
                pointerFraction(this.ui.timeSubTicks, e.clientX);
            this._wheel(e, timeAt(this._view(), fraction),
                e.ctrlKey || e.metaKey ? 'zoom' : 'pan');
        } else if (e.target.closest('.time-ruler, .time-slider')) {
            this._wheel(e, this._overviewTime(e.clientX),
                e.shiftKey ? 'pan' : 'zoom');
        }
    }

    _onStripWheel(e) {
        const strip = e.target.closest('.keyframe-strip');
        const mode = (e.ctrlKey || e.metaKey) ? 'zoom'
            : e.shiftKey ? 'pan' : null;
        if (strip && mode) {
            const fraction = stripFraction(strip, e.clientX);
            this._wheel(e, timeAt(this._view(), fraction), mode);
        }
    }

    /** Zooms around `time` or pans, depending on `mode`. */
    _wheel(e, time, mode) {
        e.preventDefault();
        const view = this._view();
        const span = this.timeline.span();
        // Shift+wheel often arrives as deltaX; take the dominant axis.
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY)
            ? e.deltaX : e.deltaY;
        const pixels = wheelPixels(e, delta);

        const factor = Math.exp(pixels / WHEEL_ZOOM_PX);
        const shift = pixels / WHEEL_PAN_PX * (view.end - view.start);
        this.timeline.setZoom(mode === 'zoom'
            ? zoomAround(view, time, factor, span)
            : panBy(view, shift, span));
    }
}
