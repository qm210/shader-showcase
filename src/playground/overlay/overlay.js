import {collectStorageJson, downloadJson, pickJsonFile, readStoredState} from '../persistence.js';
import {calcTrackValueRange, FALLBACK_RANGE, isRangeValue} from '../engine/valueRanges.js';
import {EASING_TYPES} from '../engine/keyframes.js';
import {ACTION, runAction} from '../actions.js';
import {CHAR, clamp, DEBUG, DELAY_MS, STORAGE_KEY} from './index.js';
import {KeyframeBoxSelect} from './boxSelect.js';
import {TimeZoomControl} from './timeZoomControl.js';
import {ifValidTimeZoom, MIN_TIME_STEP, timelineSpan, visibleRange} from '../engine/timeZoom.js';
import {createPlaygroundOverlay} from './dom/shell.js';
import {renderPlayback, renderPreview, renderTimeZoom,} from './dom/timeline.js';
import {renderAllTracks, renderTrack, stripFraction} from './dom/tracks.js';
import {findAllUniformComponents, renderUniformList} from './dom/uniformList.js';
import {renderBatchList} from './dom/batchList.js';
import {renderRandomizerPanel} from './dom/randomizer.js';
import {createContextActionBar, positionContextBar, renderContextActionBar} from './dom/contextBar.js';
import {intAttr, isTypingTarget} from "./dom/html.js";
import {formatNumber, formatRange, parseRangeInput} from "./format.js";
import {keyframeKey, parseKeyframeKey} from "../engine/timeline.js";


export class Overlay {
    constructor(contextProvider) {
        this.ctx = contextProvider;
        this.engine = contextProvider.engine;
        this.element = null;
        this.ui = null;

        // Batch and track ids that are selected or being renamed.
        this.batch = {
            selectedId: null,
            renamingId: null
        };
        this.track = {
            selectedId: null,
            renamingId: null,
            collapsedIds: new Set(),
            selectedKeyframes: new Set(),
        };
        this.randomIntensity = 1;

        // Dragging the panel by its header; position is {left, top}.
        this.drag = {
            position: null,
            active: false,
            startX: 0,
            startY: 0,
            origLeft: 0,
            origTop: 0,
        };
        // Dragging a keyframe dot: {track, kf, lockTime, moved}.
        this._keyframeDrag = null;
        this._ignoreNextClick = false;

        // Target rows of the rendered tracks, refreshed on every render.
        this.render = {
            targetRows: [],
            highlightedUniform: null,
            renderedSpan: null,
        };

        // Timers for click debounce and save throttling.
        this.timers = {
            saveThrottle: null,
            clickTimer: null,
        };

        // Zoomed time window {start, end} of the timeline, or null.
        this.zoom = null;

        // Copy/paste state for track keyframes.
        this.clipboard = { track: null };

        // Context action bar for the selected keyframe
        this.contextBar = createContextActionBar();
        document.body.append(this.contextBar);

        this.init();
    }

    init() {
        this.createDOM();
        this.bindEvents();
        this.restoreState();
        this.syncUI();
        this.renderTimeline();
        this.renderRandomizer();
        this.renderUniformPanel();
    }

    createDOM() {
        const dom = createPlaygroundOverlay();
        this.element = dom.element;
        this.ui = dom.ui;
        document.body.append(this.element);
    }

    bindEvents() {
        const overlay = this.element;
        this._bindPanelDrag();
        this._bindKeyframeDrag();

        // Flush pending changes when the page goes away.
        window.addEventListener('pagehide', () => this.saveState());
        window.addEventListener('keydown', (e) => this._onGlobalKeyDown(e));

        overlay.addEventListener('click', (e) => this._onClick(e));
        overlay.addEventListener('dblclick', (e) => this._onDoubleClick(e));
        overlay.addEventListener('change', (e) => this._onChange(e));
        overlay.addEventListener('input', (e) => this._onInput(e));
        overlay.addEventListener('keydown', (e) => this._onKeyDown(e));
        overlay.addEventListener('focusout', (e) => this._onBlur(e), true);
        overlay.addEventListener('contextmenu', (e) => this._onContextMenu(e));
        overlay.addEventListener('mousemove', (e) => this._onTimelineMouseMove(e));

        this._boxSelect = new KeyframeBoxSelect(overlay, (selection) => {
            if (selection) {
                this.track.selectedKeyframes = new Set(selection);
            }
            this.renderTimeline();
        });

        this._timeZoom = new TimeZoomControl(this.ui, {
            span: () => timelineSpan(this.engine),
            zoom: () => this.zoom,
            setZoom: (zoom) => this.setTimeZoom(zoom),
            seek: (time) => this._seek(time),
        });

        this._bindContextBar();
    }

    _bindPanelDrag() {
        const overlay = this.element;
        const handle = overlay.querySelector('[data-drag-handle]');
        const drag = this.drag;

        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.closest('button')) {
                return;
            }
            const rect = overlay.getBoundingClientRect();
            drag.active = true;
            drag.startX = e.clientX;
            drag.startY = e.clientY;
            drag.origLeft = rect.left;
            drag.origTop = rect.top;
            overlay.classList.add('dragging');
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!drag.active) {
                return;
            }
            this._applyPosition(
                drag.origLeft + e.clientX - drag.startX,
                drag.origTop + e.clientY - drag.startY,
            );
        });

        window.addEventListener('mouseup', () => {
            if (!drag.active) {
                return;
            }
            drag.active = false;
            overlay.classList.remove('dragging');
            this._scheduleSave();
        });

        // Keep a stored position reachable when the window shrinks.
        window.addEventListener('resize', () => {
            if (drag.position) {
                this._applyPosition(drag.position.left, drag.position.top);
            }
        });
    }

    _bindKeyframeDrag() {
        this.element.addEventListener('mousedown', (e) => {
            this._ignoreNextClick = false;
            this._onKeyframeMouseDown(e);
        });
        window.addEventListener('mousemove', (e) => this._onKeyframeDrag(e));
        window.addEventListener('mouseup', () => this._onKeyframeDragEnd());
    }

    _bindContextBar() {
        const bar = this.contextBar;
        bar.addEventListener('click', (e) => {
            if (e.target.classList.contains('kf-undo-btn')) {
                this._doUndo();
            }
        });
        bar.querySelector('.kf-ease-select')
            .addEventListener('change', (e) => {
                this._editSelectedKeyframe(kf => {
                    kf.ease = e.target.value;
                });
            });
        bar.querySelector('.kf-current-val')
            .addEventListener('change', (e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value)) {
                    this._editSelectedKeyframe(kf => {
                        kf.value = value;
                    });
                }
            });
    }

    // ─── Selection helpers ──────────────────────────────────────

    /** All selected keyframes as {trackId, kfIndex}. */
    _selectedKeys() {
        return [...this.track.selectedKeyframes].map(parseKeyframeKey);
    }

    _firstSelectedKey() {
        return this._selectedKeys()[0] ?? null;
    }

    /** The first selected keyframe with its track and index, or null. */
    _selection() {
        const first = this._firstSelectedKey();
        if (!first) {
            return null;
        }
        const track = this.engine.getTrack(first.trackId);
        const kf = track?.keyframes[first.kfIndex];
        return kf ? {track, kf, index: first.kfIndex} : null;
    }

    _selectOnly(trackId, kfIndex) {
        const selected = this.track.selectedKeyframes;
        selected.clear();
        selected.add(keyframeKey(trackId, kfIndex));
    }

    /** Drops the selection of one track, e.g. as its indices shifted. */
    _deselectTrack(trackId) {
        const selected = this.track.selectedKeyframes;
        for (const key of [...selected]) {
            if (parseKeyframeKey(key).trackId === trackId) {
                selected.delete(key);
            }
        }
    }

    _editSelectedKeyframe(edit) {
        const selection = this._selection();
        if (selection) {
            edit(selection.kf);
            this.renderTrack(selection.track.id);
        }
    }

    _selectTrackRow(row) {
        this.track.selectedId = row.dataset.trackId;
        this.element.querySelectorAll('.track-wrapper.selected')
            .forEach(el => el.classList.remove('selected'));
        row.classList.add('selected');
        this._scheduleSave();
    }

    /** First element matching `selector` inside the row of a track. */
    _queryInTrack(trackId, selector) {
        return this.ui.trackRows.querySelector(
            `.track-wrapper[data-track-id="${CSS.escape(trackId)}"]`
            + ` ${selector}`
        );
    }

    // ─── Event handlers ─────────────────────────────────────────

    _onGlobalKeyDown(e) {
        if (isTypingTarget(e.target)) {
            return;
        }
        if (e.code === 'Space') {
            e.preventDefault();
            this.togglePlaying();
        }
        if (e.code === 'Delete') {
            this._deleteSelectedKeyframes();
        }
        // Ctrl+Z / Cmd+Z for undo on the selected track
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
            e.preventDefault();
            this._doUndo();
        }
    }

    /** Deletes the selected keyframes on the first selected track. */
    _deleteSelectedKeyframes() {
        const selection = this._selection();
        if (!selection) {
            return;
        }
        const track = selection.track;
        // Collect times first, removing shifts the indices.
        const times = this._selectedKeys()
            .filter(k => k.trackId === track.id)
            .map(k => track.keyframes[k.kfIndex]?.time)
            .filter(time => time !== undefined);
        for (const time of times) {
            track.removeKeyframe(time);
        }
        this.track.selectedKeyframes.clear();
        this.renderTimeline();
    }

    /** Right-click on a uniform row logs its data for debugging. */
    _onContextMenu(e) {
        const row = e.target.closest('.uniform-row');
        if (!row) {
            return;
        }
        e.preventDefault();

        const name = row.querySelector('[data-uniform-name]')
            ?.dataset.uniformName;
        if (!name) {
            return;
        }
        console.group(`Uniform: ${name}`);
        console.log('Entry:', this._findUniformEntry(name)
            ?? '(not in any batch)');
        console.log('Control Range:', this.ctx.getControlRange(name));
        console.groupEnd();
    }

    _onTimelineMouseMove(e) {
        const tooltip = this.ui.timelineTooltip;

        if (this._keyframeDrag) {
            const {kf} = this._keyframeDrag;
            this._setTooltipText(kf.time, kf.value);
            tooltip.classList.add('visible');
            return;
        }

        const strip = e.target.closest('.keyframe-strip');
        if (!strip) {
            this._highlightValueLine(null);
            tooltip.classList.remove('visible');
            return;
        }

        const track = this.engine.getTrack(strip.dataset.trackId);
        const {time, value} = this._pointerOnStrip(strip, track, e);
        const editorRect = this.element.getBoundingClientRect();
        this._setTooltipText(time, value);
        tooltip.style.left = `${e.clientX - editorRect.left + 12}px`;
        tooltip.style.top = `${e.clientY - editorRect.top - 28}px`;
        tooltip.classList.add('visible');

        // Use elementFromPoint to detect value-line under cursor
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const valueLine = el?.closest('.value-line');
        this._highlightValueLine(valueLine?.dataset.uniformName ?? null);
    }

    /** Time and value under the pointer, as used for new keyframes. */
    _pointerOnStrip(strip, track, e) {
        const [minVal, maxVal] = track
            ? calcTrackValueRange(track, this.ctx)
            : [0, 1];
        const rect = strip.getBoundingClientRect();
        const yRatio = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
        const {start, end} = this._timeView();
        return {
            time: start + stripFraction(strip, e.clientX) * (end - start),
            value: minVal + yRatio * (maxVal - minVal),
        };
    }

    _setTooltipText(time, value) {
        this.ui.timelineTooltip.innerHTML = [
            `t= ${time.toFixed(2).padStart(7)} s`,
            `y= ${formatNumber(value).padStart(7)}`
        ].join('<br>');
    }

    /** Re-reads the target rows; call after every track render. */
    _refreshTargetRows() {
        this.render.targetRows = [
            ...this.ui.trackRows.querySelectorAll('.target-row')
        ];
        this.render.highlightedUniform = null;
    }

    /** Highlights the target rows of a uniform; null clears all. */
    _highlightValueLine(name) {
        if (name === this.render.highlightedUniform) {
            return;
        }
        this.render.highlightedUniform = name;
        for (const row of this.render.targetRows) {
            const selector = row.querySelector('.target-selector');
            row.classList.toggle(
                'highlighted', name !== null && selector?.value === name
            );
        }
    }

    _onKeyframeMouseDown(e) {
        if (e.button !== 0) {
            return;
        }
        const dot = e.target.closest('.keyframe-dot');
        if (!dot) {
            return;
        }
        e.stopPropagation();
        const track = this.engine.getTrack(dot.dataset.trackId);
        const kf = track?.keyframes[intAttr(dot, 'kfIndex')];
        if (!kf) {
            return;
        }
        // The keyframe at t=0 may only move vertically.
        this._keyframeDrag = {track, kf, lockTime: kf.time === 0, moved: false};
    }

    _onKeyframeDrag(e) {
        const drag = this._keyframeDrag;
        if (!drag) {
            return;
        }
        // Re-query, as every move replaces the row of the track.
        const strip = this._queryInTrack(drag.track.id, '.keyframe-strip');
        if (!strip) {
            return;
        }
        const {time, value} = this._pointerOnStrip(strip, drag.track, e);
        if (!drag.lockTime) {
            drag.kf.time =
                this._timeBetweenNeighbours(drag.track, drag.kf, time);
        }
        drag.kf.value = value;
        drag.moved = true;
        this.renderTrack(drag.track.id);
    }

    /** Keeps the keyframe order, so indices and curves stay valid. */
    _timeBetweenNeighbours(track, kf, time) {
        const kfs = track.keyframes;
        const i = kfs.indexOf(kf);
        const min = (kfs[i - 1]?.time ?? 0) + MIN_TIME_STEP;
        const max = (kfs[i + 1]?.time ?? Infinity) - MIN_TIME_STEP;
        return clamp(time, min, max);
    }

    _onKeyframeDragEnd() {
        // The click after a real drag must not select or add keyframes.
        this._ignoreNextClick = Boolean(this._keyframeDrag?.moved);
        this._keyframeDrag = null;
    }

    /** Looks in the selected batch first, then in the auto batches. */
    _findUniformEntry(name) {
        const batches = [
            this.ctx.getBatch(this.batch.selectedId),
            ...this.ctx.batches.auto,
        ].filter(Boolean);
        for (const batch of batches) {
            const entry = batch.uniforms.find(u => u.name === name);
            if (entry) {
                return entry;
            }
        }
        return null;
    }

    _onClick(e) {
        if (this._boxSelect.active) {
            return;
        }
        if (this._ignoreNextClick) {
            this._ignoreNextClick = false;
            return;
        }

        const actionData = e.target.closest('[data-action]')?.dataset;
        if (actionData) {
            runAction(this, actionData);
            return;
        }

        const dot = e.target.closest('.keyframe-dot');
        if (dot) {
            this._onKeyframeDotClick(dot, e);
            return;
        }

        const strip = e.target.closest('.keyframe-strip');
        if (strip) {
            this._addKeyframeAtPointer(strip, e);
            this._removeKeyframePopups();
            return;
        }

        const trackName = e.target.closest('.track-name');
        if (trackName) {
            const row = trackName.closest('.track-wrapper');
            this._ifSingleClick(() => this._selectTrackRow(row));
            return;
        }

        const trackWidget = e.target.closest('.track-widget');
        if (trackWidget) {
            this._selectTrackRow(trackWidget.closest('.track-wrapper'));
            return;
        }

        const batchHeader = e.target.closest('.batch-card-header');
        if (batchHeader) {
            const {batchId} = batchHeader.closest('.batch-card').dataset;
            this._ifSingleClick(() => {
                this.batch.selectedId = batchId;
                this.updateOnTargetsChanged();
            });
            return;
        }

        const targetSelector = e.target.closest('.target-selector-display');
        if (targetSelector) {
            this._toggleTargetDropdown(targetSelector);
            return;
        }

        const selectorItem = e.target.closest('.selector-item');
        if (selectorItem) {
            this.batch.selectedId = selectorItem.dataset.targetId || null;
            this.updateOnTargetsChanged();
            return;
        }

        if (!e.target.closest('.target-selector-wrapper')) {
            this.ui.batchSelectorDropdown.hidden = true;
        }

        e.target.closest('.uniform-group-header')
            ?.classList.toggle('collapsed');
    }

    /** Shift selects a range, Ctrl/Cmd toggles, else selects only it. */
    _onKeyframeDotClick(dot, e) {
        const trackId = dot.dataset.trackId;
        const kfIndex = intAttr(dot, 'kfIndex');
        const key = keyframeKey(trackId, kfIndex);
        const selected = this.track.selectedKeyframes;

        if (e.shiftKey) {
            this._selectRange(trackId, kfIndex);
        } else if (e.ctrlKey || e.metaKey) {
            if (selected.has(key)) {
                selected.delete(key);
            } else {
                selected.add(key);
            }
        } else {
            this._selectOnly(trackId, kfIndex);
        }
        // Selection may change on several tracks, so render them all.
        this.renderTimeline();
        this._showKeyframePopups();
    }

    _addKeyframe(track, time, value) {
        const lengthBefore = track.keyframes.length;
        if (lengthBefore === 0 && time > MIN_TIME_STEP) {
            track.addKeyframe(0, value);
        }
        const kf = track.addKeyframe(time, value);
        DEBUG.log("[KEYFRAMES] After adding: ", track.keyframes, "had before:", lengthBefore);
        this.track.selectedKeyframes.add(
            keyframeKey(track.id, track.keyframes.indexOf(kf))
        );
        this.renderTrack(track.id);
        this._showKeyframePopups();
    }

    _addKeyframeAtPointer(strip, e) {
        const track = this.engine.getTrack(strip.dataset.trackId);
        if (!track) {
            return;
        }
        const {time, value} = this._pointerOnStrip(strip, track, e);
        this._addKeyframe(track, time, value);
    }

    _toggleTargetDropdown(selector) {
        const dropdown = this.ui.batchSelectorDropdown;
        if (!dropdown.hidden) {
            dropdown.hidden = true;
            return;
        }
        const rect = selector.getBoundingClientRect();
        const viewportH = window.innerHeight;

        // Show first to measure the actual height
        dropdown.hidden = false;
        const height = dropdown.getBoundingClientRect().height;

        const spaceBelow = viewportH - rect.bottom;
        const style = dropdown.style;
        if (spaceBelow < height + 8) {
            style.bottom = `${viewportH - rect.top + 4}px`;
            style.top = 'auto';
        } else {
            style.bottom = 'auto';
            style.top = `${rect.bottom + 4}px`;
        }
        style.left = `${rect.left}px`;
        style.width = `${rect.width}px`;
    }

    _onDoubleClick(e) {
        this._resetClickTimer();

        const dot = e.target.closest('.keyframe-dot');
        if (dot) {
            this._focusKeyframeValue(dot);
            return;
        }

        if (e.target.closest('button, input')) {
            return;
        }

        const trackName = e.target.closest('.track-name');
        if (trackName) {
            const id = trackName.closest('.track-wrapper').dataset.trackId;
            requestAnimationFrame(() => {
                this.track.renamingId = id;
                this.renderTrack(id);
                this._focusName('.track-wrapper', 'track-id', id);
            });
            return;
        }

        const batchHeader = e.target.closest('.batch-card-header');
        if (batchHeader) {
            const {batchId} = batchHeader.closest('.batch-card').dataset;
            this.batch.renamingId = batchId;
            this.renderUniformPanel();
            requestAnimationFrame(() =>
                this._focusName('.batch-card', 'batch-id', batchId)
            );
        }
    }

    /** Selects the keyframe and focuses the value input of the bar. */
    _focusKeyframeValue(dot) {
        const {trackId} = dot.dataset;
        const kfIndex = intAttr(dot, 'kfIndex');
        if (!this.engine.getTrack(trackId)?.keyframes[kfIndex]) {
            this._removeKeyframePopups();
            return;
        }
        this.track.selectedKeyframes.add(keyframeKey(trackId, kfIndex));
        this.renderTimeline();
        this._showKeyframePopups();
        requestAnimationFrame(() => {
            const input = this.contextBar.querySelector('.kf-current-val');
            input.focus();
            input.select();
        });
    }

    _showKeyframePopups() {
        this._removeKeyframePopups();
        for (const {trackId, kfIndex} of this._selectedKeys()) {
            const kf = this.engine.getTrack(trackId)?.keyframes[kfIndex];
            const trackWidget = this._queryInTrack(trackId, '.track-widget');
            const dot = trackWidget?.querySelector(
                `.keyframe-dot[data-kf-index="${kfIndex}"]`
            );
            if (!kf || !dot) {
                continue;
            }
            const popup = this._createKeyframePopup(trackId, kfIndex, kf);
            const widgetRect = trackWidget.getBoundingClientRect();
            const dotRect = dot.getBoundingClientRect();
            popup.style.top = `${widgetRect.height + 4}px`;
            popup.style.left = `${dotRect.left - widgetRect.left}px`;
            popup.style.transform = 'translateX(-50%)';
            popup.style.maxWidth = 'none';
            popup.style.width = 'auto';
            trackWidget.appendChild(popup);
        }
    }

    _createKeyframePopup(trackId, kfIndex, kf) {
        const ease = kf.ease || 'linear';
        const popup = document.createElement('div');
        popup.className = 'keyframe-popup';
        popup.innerHTML = `
            <div class="popup-title">Keyframe #${kfIndex}</div>
            <div class="popup-row">
                <span class="popup-label">Time:</span>
                <button class="popup-value kf-seek-btn"
                        title="Seek"
                    >
                    ${kf.time.toFixed(2)}&nbsp;s
                </button>
            </div>
            <div class="popup-row">
                <span class="popup-label">Value:</span>
                <span class="popup-value">${
                    formatNumber(kf.value)
                }&nbsp;&nbsp;&nbsp;</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Ease:</span>
                <select class="field kf-ease-select-popup">
                    ${EASING_TYPES.map(t =>
                        `<option value="${t}"${t === ease ? ' selected' : ''}>
                            ${t}
                        </option>`
                    ).join('')}
                </select>
            </div>
            <div class="popup-remove">
                ${CHAR.TRASH}️ Remove Keyframe
            </div>`;

        popup.querySelector('.popup-remove')
            .addEventListener('click', (e) => {
                e.stopPropagation();
                this._removeKeyframe(trackId, kfIndex);
            });
        popup.querySelector('.kf-ease-select-popup')
            .addEventListener('change', (e) => {
                e.stopPropagation();
                kf.ease = e.target.value;
                this.renderTrack(trackId);
            });
        popup.querySelector('.kf-seek-btn')
            .addEventListener('click', (e) => {
                e.stopPropagation();
                this._seek(kf.time);
                this._removeKeyframePopups();
            });
        return popup;
    }

    _selectRange(trackId, kfIndex) {
        if (!this.engine.getTrack(trackId)) {
            return;
        }
        const first = this._firstSelectedKey();
        if (first?.trackId !== trackId) {
            this._selectOnly(trackId, kfIndex);
            return;
        }
        const from = Math.min(first.kfIndex, kfIndex);
        const to = Math.max(first.kfIndex, kfIndex);
        const selected = this.track.selectedKeyframes;
        selected.clear();
        for (let i = from; i <= to; i++) {
            selected.add(keyframeKey(trackId, i));
        }
    }

    _removeKeyframePopups() {
        for (const popup of this.ui.trackRows.querySelectorAll('.keyframe-popup')) {
            popup.remove();
        }
    }

    _removeKeyframe(trackId, kfIndex) {
        const track = this.engine.getTrack(trackId);
        const kf = track?.keyframes[kfIndex];
        if (!kf) {
            return;
        }
        track.removeKeyframe(kf.time);
        this._removeKeyframePopups();
        this._deselectTrack(trackId);
        this.renderTrack(trackId);
    }

    _focusName(containerSelector, dataKey, id) {
        this.element
            .querySelector(
                `${containerSelector}[data-${dataKey}="${CSS.escape(id)}"]`
                + ' .name'
            )
            ?.focus();
    }

    _ifSingleClick(callback) {
        clearTimeout(this.timers.clickTimer);
        this.timers.clickTimer = setTimeout(() => {
            this.timers.clickTimer = null;
            callback();
        }, DELAY_MS.DOUBLE_CLICK);
    }

    _resetClickTimer() {
        clearTimeout(this.timers.clickTimer);
        this.timers.clickTimer = null;
    }

    _isEditingName(el) {
        return el.classList.contains('name')
            && Boolean(this.track.renamingId || this.batch.renamingId);
    }

    _onKeyDown(e) {
        const el = e.target;
        if (this._isEditingName(el)) {
            if (e.code === 'Enter') {
                this._commitNameEdit(el);
            } else if (e.code === 'Escape') {
                this._cancelNameEdit();
            }
            return;
        }
        if (el.classList.contains('target-selector') && e.code === 'Escape') {
            this._removeEmptyTarget(el);
        }
    }

    _onBlur(e) {
        const el = e.target;
        if (this._isEditingName(el)) {
            const cancelling = e.relatedTarget?.closest(
                `[data-action="${ACTION.CANCEL_TRACK_NAME}"]`
            );
            if (!(this.track.renamingId && cancelling)) {
                this._commitNameEdit(el);
            }
            return;
        }
        if (el.classList.contains('target-selector')) {
            this._removeEmptyTarget(el);
        }
    }

    /** Applies the inline-edited track or batch name and leaves editing. */
    _commitNameEdit(input) {
        const name = input.value.trim();
        if (this.track.renamingId) {
            const track = this.engine.getTrack(this.track.renamingId);
            if (name && track) {
                track.name = name;
            }
            this._stopTrackNameEdit();
        } else if (this.batch.renamingId) {
            const batch = this.ctx.getBatch(this.batch.renamingId);
            if (name && batch) {
                batch.name = name;
            }
            this.batch.renamingId = null;
            this.updateOnTargetsChanged();
        }
    }

    _cancelNameEdit() {
        if (this.track.renamingId) {
            this._stopTrackNameEdit();
        } else if (this.batch.renamingId) {
            this.batch.renamingId = null;
            this.renderUniformPanel();
        }
    }

    _stopTrackNameEdit() {
        const trackId = this.track.renamingId;
        // Cleared before rendering, so the blur of the replaced input
        // does not commit a second time.
        this.track.renamingId = null;
        this.renderTrack(trackId);
    }

    /** Removes a target whose name was cleared. */
    _removeEmptyTarget(input) {
        const track = this.engine.getTrack(input.dataset.trackId);
        // The trailing "add" row has no target object and is never removed.
        const target = track?.targets[intAttr(input, 'targetIdx')];
        if (target && !target.uniformName.trim()) {
            track.removeTarget(target.uniformName);
            this.renderTrack(track.id);
        }
    }

    _onChange(e) {
        const el = e.target;

        if (el === this.ui.timeStart || el === this.ui.timeEnd) {
            // On change, not input: half-typed numbers must not zoom.
            this._timeZoom.applyTypedRange(
                parseFloat(this.ui.timeStart.value),
                parseFloat(this.ui.timeEnd.value)
            );
        } else if (el.classList.contains('speed-input')) {
            this.engine.speed = parseFloat(el.value) || 1.0;
            this._scheduleSave();
        } else if (el.classList.contains('target-enable')) {
            const {trackId} = el.dataset;
            const target = this.engine.getTrack(trackId)
                ?.targets[intAttr(el, 'targetIdx')];
            if (target) {
                target.enabled = el.checked;
                this.renderTrack(trackId);
            }
        } else if (el.closest('.batch-uniform-row')) {
            this._updateBatchUniformField(el);
        } else if (el.classList.contains('uniform-checkbox')) {
            this._toggleUniformInBatch(el.dataset.uniformName, el.checked);
        } else if (el.matches('.uniform-min, .uniform-max')) {
            this._setUniformOverwrite(
                el.dataset.uniformName,
                el.classList.contains('uniform-min') ? 'min' : 'max',
                parseRangeInput(el.value)
            );
        } else if (el === this.ui.timeSlider || el === this.ui.timeSubSlider) {
            sliderTooltip(el)?.classList.remove('dragging');
        }
    }

    _toggleUniformInBatch(name, active) {
        // While editing a batch, edit that one instead of the selected.
        const batch = this.ctx.getBatch(
            this.batch.renamingId || this.batch.selectedId
        );
        if (!batch) {
            return;
        }
        // Deactivating keeps the uniform's values in the batch.
        batch.toggleUniform(name, active);
        this.renderUniformPanel();
        this._scheduleSave();
    }

    /** Sets min/max of the uniform in every batch; invalid -> default. */
    _setUniformOverwrite(name, key, value) {
        for (const batch of this.ctx.allBatches()) {
            const entry = batch.uniforms.find(u => u.name === name);
            if (entry) {
                entry[key] = value ?? null;
            }
        }
        this._scheduleSave();
    }

    _onInput(e) {
        const el = e.target;

        if (el === this.ui.timeSlider || el === this.ui.timeSubSlider) {
            const time = parseFloat(el.value);
            this._seek(time);
            const tooltip = sliderTooltip(el);
            if (tooltip) {
                tooltip.textContent = time.toFixed(2) + 's';
                tooltip.classList.add('dragging');
            }
        } else if (el === this.ui.intensitySlider) {
            this.randomIntensity = parseFloat(el.value);
            this.ui.intensityValue.textContent =
                this.randomIntensity.toFixed(2);
            this._scheduleSave();
        } else if (el.matches(
            '.uniform-min, .uniform-max,'
            + ' .batch-uniform-row .min, .batch-uniform-row .max'
        )) {
            // Validate while typing; values are committed on change.
            el.classList.toggle(
                'invalid', parseRangeInput(el.value) === undefined
            );
        } else if (el.classList.contains('uniform-slider')) {
            const name = el.dataset.uniformName;
            const components = findAllUniformComponents(name, el);
            const value = components.length === 1 ? components[0] : components;
            this.engine.setActualUniformValue(name, value);
            const tooltip = sliderTooltip(el);
            if (tooltip) {
                tooltip.textContent = formatNumber(value);
            }
        } else if (el.classList.contains('target-selector')) {
            this._onTargetNameInput(el);
        }
    }

    _onTargetNameInput(input) {
        const {trackId} = input.dataset;
        const targetIdx = intAttr(input, 'targetIdx');
        const track = this.engine.getTrack(trackId);
        if (!track) {
            return;
        }
        const newName = input.value.trim();

        // Typing into the trailing "add" row creates a real target.
        if (newName && targetIdx === track.targets.length) {
            track.addTarget(newName);
            this.renderTrack(trackId);
            this._refocusTargetSelector(trackId, targetIdx);
            return;
        }

        const target = track.targets[targetIdx];
        if (!target || newName === target.uniformName) {
            return;
        }
        if (target.uniformName) {
            track.removeTarget(target.uniformName);
        }
        target.uniformName = newName;
        this._resetTargetRange(target);
        this._scheduleSave();
    }

    /** Puts the caret back into a target input after a re-render. */
    _refocusTargetSelector(trackId, targetIdx) {
        const input = this._queryInTrack(
            trackId, `.target-selector[data-target-idx="${targetIdx}"]`
        );
        if (input) {
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
        }
    }

    /** Scalar control ranges are taken over, vectors use -1..1. */
    _resetTargetRange(target) {
        const range = target.uniformName
            ? this.ctx.getControlRange(target.uniformName)
            : FALLBACK_RANGE;
        const scalarOr = (value, fallback) =>
            Array.isArray(value) ? fallback : value;
        target.minValue = scalarOr(range.min, FALLBACK_RANGE.min);
        target.maxValue = scalarOr(range.max, FALLBACK_RANGE.max);
    }

    _updateBatchUniformField(el) {
        const batch = this.ctx.getBatch(el.dataset.batchId);
        const index = intAttr(el, 'index');
        if (!batch?.uniforms[index]) {
            return;
        }

        if (el.classList.contains('name')) {
            const name = el.value.trim();
            batch.updateUniform(index, {name});
            // Update the range placeholders in place to keep the focus.
            const range = this.ctx.getControlRange(name);
            const row = el.closest('.batch-uniform-row');
            row.querySelector('.min').placeholder = formatRange(range.min);
            row.querySelector('.max').placeholder = formatRange(range.max);
        } else {
            const key = ['min', 'max', 'factor']
                .find(k => el.classList.contains(k));
            const value = parseRangeInput(el.value);
            el.classList.toggle('invalid', value === undefined);
            if (!key || value === undefined) {
                return;
            }
            batch.updateUniform(index, {[key]: value});
        }
        this._scheduleSave();
    }

    // ─── Actions ────────────────────────────────────────────────

    togglePlaying() {
        this.engine.playing = !this.engine.playing;
        this._syncPlayButton();
    }

    _syncPlayButton() {
        const {playBtn} = this.ui;
        const playing = this.engine.playing;
        playBtn.textContent = playing ? CHAR.PAUSE : CHAR.PLAY;
        playBtn.title = playing ? 'Pause (Space)' : 'Play (Space)';
    }

    /** Adds a keyframe at `time` with the first target's minimum. */
    _promptKeyframe(track, time) {
        const firstTarget = track.targets[0];
        const defaultVal = firstTarget?.enabled ? firstTarget.minValue : 0;
        track.addKeyframe(time, defaultVal);
        this.renderTrack(track.id);
    }

    /** Undo on the selected keyframe's track. */
    _doUndo() {
        const first = this._firstSelectedKey();
        if (this.engine.getTrack(first?.trackId)?.undo()) {
            this.renderTrack(first.trackId);
        }
    }

    /** Fills and places the context action bar for the selection. */
    _positionContextBar() {
        const selection = this._selection();
        renderContextActionBar(
            this.contextBar,
            selection?.kf,
            selection?.track,
            selection && this._neighbours(selection),
        );
        const anchor = selection && this._contextBarAnchor();
        if (anchor) {
            positionContextBar(this.contextBar, anchor);
        }
    }

    /** Rect of the first selected dot, else the playhead on the first strip. */
    _contextBarAnchor() {
        const first = this._firstSelectedKey();
        if (!first) {
            return null;
        }
        const dot = this._queryInTrack(
            first.trackId, `.keyframe-dot[data-kf-index="${first.kfIndex}"]`
        );
        if (dot) {
            return dot.getBoundingClientRect();
        }
        const strip = this.ui.trackRows.querySelector('.keyframe-strip');
        if (!strip) {
            return null;
        }
        const rect = strip.getBoundingClientRect();
        const {start, end} = this._timeView();
        const fraction = (this.engine.currentTime - start) / (end - start);
        return {
            left: rect.left + rect.width * fraction,
            width: 0,
            bottom: rect.bottom,
        };
    }

    _neighbours({track, index}) {
        return {
            prev: track.keyframes[index - 1] ?? null,
            next: track.keyframes[index + 1] ?? null,
        };
    }

    _exportTimeline() {
        downloadJson(this.engine.toJSON(), 'timeline.json');
    }

    _importTimeline() {
        // TODO: never tested; do that... one day.
        pickJsonFile()
            .then(json => {
                // Load into the existing engine so references stay valid.
                this.engine.loadTimelineFromJSON(json);
                this.track.selectedKeyframes.clear();
                this.syncUI();
                this.renderTimeline();
            })
            .catch(err => alert(`Invalid timeline file: ${err.message}`));
    }

    reset() {
        this._cancelPendingSave();

        this.engine.reset();
        this.track.selectedKeyframes.clear();
        this.track.collapsedIds.clear();
        this.batch.selectedId = null;
        this.randomIntensity = 1;
        this.zoom = null;
        this.drag.position = null;
        this.element.style.left = '';
        this.element.style.top = '';
        this.element.classList.remove('collapsed', 'selected');

        this.syncUI();
        this.renderTimeline();
        this.renderRandomizer();
        this.renderUniformPanel();

        // The renders above schedule a save; drop it before clearing.
        this._cancelPendingSave();
        try {
            localStorage.removeItem(STORAGE_KEY.PLAYGROUND_OVERLAY);
        } catch (error) {
            console.warn('Failed to clear the playground overlay state:',
                error);
        }
    }

    // ─── Persistence ────────────────────────────────────────────

    saveState() {
        this._cancelPendingSave();
        try {
            localStorage.setItem(
                STORAGE_KEY.PLAYGROUND_OVERLAY, collectStorageJson(this)
            );
        } catch (error) {
            console.warn('Failed to store the playground overlay state:',
                error);
        }
    }

    _scheduleSave() {
        if (this.timers.saveThrottle) {
            return;
        }
        this.timers.saveThrottle = setTimeout(
            () => this.saveState(),
            DELAY_MS.STORAGE_THROTTLE
        );
    }

    _cancelPendingSave() {
        clearTimeout(this.timers.saveThrottle);
        this.timers.saveThrottle = null;
    }

    restoreState() {
        const state = readStoredState();
        if (!state) {
            return;
        }
        if (state.timeline) {
            this.engine.loadTimelineFromJSON(state.timeline);
            this.engine.playing = false;
        }
        for (const [name, value] of Object.entries(state.overrides ?? {})) {
            if (isRangeValue(value)) {
                this.engine.setUniformOverride(name, value);
            }
        }
        this.ctx.loadCustomBatches(state.customBatches);
        this.batch.selectedId = state.selectedBatchId ?? null;
        const intensity = Number(state.randomIntensity);
        this.randomIntensity = Number.isFinite(intensity)
            ? clamp(intensity, 0, 1)
            : 1;
        this.track.selectedId = state.selectedTrackId ?? null;
        this.track.collapsedIds = new Set(state.collapsedTracks ?? []);
        this.zoom = ifValidTimeZoom(state.zoom);
        this.element.classList.toggle('collapsed', Boolean(state.collapsed));

        const {left, top} = state.position ?? {};
        if (Number.isFinite(left) && Number.isFinite(top)) {
            this._applyPosition(left, top);
        }
    }

    _applyPosition(left, top) {
        const rect = this.element.getBoundingClientRect();
        const headerHeight =
            this.element.querySelector('.panel-header').offsetHeight || 32;
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - headerHeight);
        const position = {
            left: Math.round(clamp(left, 0, maxLeft)),
            top: Math.round(clamp(top, 0, maxTop)),
        };
        this.drag.position = position;
        this.element.style.left = `${position.left}px`;
        this.element.style.top = `${position.top}px`;
    }

    syncUI() {
        this.ui.timeSlider.value = this.engine.currentTime;
        this.ui.speedInput.value = this.engine.speed;
        this._syncPlayButton();
        this.ui.intensitySlider.value = this.randomIntensity;
        this.ui.intensityValue.textContent = this.randomIntensity.toFixed(2);
    }

    // ─── Time zoom ──────────────────────────────────────────────

    setTimeZoom(zoom) {
        this.zoom = zoom;
        this.renderTimeline();
    }

    _timeView() {
        return visibleRange(this.zoom, timelineSpan(this.engine));
    }

    _seek(time) {
        this.engine.currentTime = time;
        this._renderPlayback();
        this._scheduleSave();
    }

    // ─── Rendering ──────────────────────────────────────────────

    renderTimeline() {
        this.render.renderedSpan = timelineSpan(this.engine);
        renderTimeZoom(this.ui, this.render.renderedSpan, this.zoom);
        renderAllTracks(this.ui, this.ctx, ...this._trackRenderState());
        this._refreshTargetRows();
        this._renderPlayback();
        this._renderPreview();
        this._positionContextBar();
        this._scheduleSave();
    }

    /**
     * Re-renders only the row of one track, e.g. after editing its
     * keyframes or targets. Falls back to renderTimeline() if the row
     * is missing or the timeline span changed, as that rescales all rows.
     */
    renderTrack(trackId) {
        const replaced = timelineSpan(this.engine) === this.render.renderedSpan
            && renderTrack(
                this.ui, this.ctx, trackId, ...this._trackRenderState()
            );
        if (!replaced) {
            this.renderTimeline();
            return;
        }
        this._refreshTargetRows();
        this._renderPreview();
        this._positionContextBar();
        this._scheduleSave();
    }

    _normalizeEasingLines() {
        const strips = this.ui.trackRows.querySelectorAll('.keyframe-strip');
        strips.forEach(strip => {
            const svg = strip.querySelector('.easing-line');
            if (!svg) return;
            const w = strip.clientWidth;
            const h = strip.clientHeight;
            if (w > 0 && h > 0) {
                svg.style.transform = `scale(${w / 100}, ${h / 100})`;
                svg.style.transformOrigin = '0 0';
            }
        });
    }

    _trackRenderState() {
        const {selectedId, renamingId, collapsedIds, selectedKeyframes} = this.track;
        return [selectedId, renamingId, collapsedIds, selectedKeyframes, this._timeView()];
    }

    _renderPreview() {
        renderPreview(this.ui, this.engine);
    }

    _renderPlayback() {
        renderPlayback(this.ui, this.engine, this._timeView());
    }

    renderRandomizer() {
        const {selectedBatchId} = renderRandomizerPanel(
            this.ui, this.ctx, this.batch.selectedId
        );
        this.batch.selectedId = selectedBatchId;
    }

    renderUniformPanel() {
        const {ui, ctx} = this;
        const {selectedId, renamingId} = this.batch;
        renderBatchList(ui, ctx, selectedId, renamingId);
        renderUniformList(ui, ctx, selectedId, renamingId);
    }

    /** Targets show up in nearly every section, so re-render them all. */
    updateOnTargetsChanged() {
        this.renderUniformPanel();
        this.renderTimeline();
        this.renderRandomizer();
        this._scheduleSave();
    }

    // ─── Public API ─────────────────────────────────────────────

    update() {
        if (this.engine.playing) {
            this._renderPlayback();
            this._scheduleSave();
        }
    }

    setVisible(visible) {
        this.element.hidden = !visible;
    }

    toggle() {
        this.setVisible(this.element.hidden);
    }
}

const sliderTooltip = (slider) =>
    slider.parentElement.querySelector('.slider-tooltip');
