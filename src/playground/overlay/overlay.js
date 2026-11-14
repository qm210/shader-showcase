import {formatRange, isTypingTarget, parseRangeInput} from './utils.js';
import {collectStorageJson, downloadJson, pickJsonFile, readStoredState} from '../persistence.js';
import {calcTrackValueRange, isRangeValue} from '../engine/valueRanges.js';
import {ACTION, runAction} from '../actions.js';
import {CHAR, clamp, DEBUG, DELAY_MS, STORAGE_KEY} from './index.js';
import {KeyframeBoxSelect} from './boxSelect.js';
import {TimeZoomControl} from './timeZoomControl.js';
import {MIN_TIME_STEP, timelineSpan, visibleRange} from '../engine/timeZoom.js';
import {uploadUniforms} from './glUniforms.js';
import {createPlaygroundOverlay} from './dom/shell.js';
import {renderPlayback, renderPreview, renderTimeZoom,} from './dom/timeline.js';
import {renderTracks, stripFraction} from './dom/tracks.js';
import {renderUniformList} from './dom/uniformList.js';
import {renderBatchList} from './dom/batchList.js';
import {renderRandomizerPanel} from './dom/randomizer.js';
import {createContextActionBar, positionContextBar, renderContextActionBar,} from './dom/contextBar.js';

const DEFAULT_TARGET_RANGE = {min: -1, max: 1};

const intAttr = (el, key) => parseInt(el.dataset[key], 10);

/** A stored {start, end} zoom, or null if missing or malformed. */
function parseTimeZoom(zoom) {
    const {start, end} = zoom ?? {};
    return Number.isFinite(start) && Number.isFinite(end) && start < end
        ? {start, end}
        : null;
}

export class Overlay {
    constructor(contextProvider) {
        this.ctx = contextProvider;
        this.engine = contextProvider.engine;
        this.element = null;
        this.selectedKeyframe = null;
        this.collapsedTrackIds = new Set();
        this.selectedBatchId = null;
        this.selectedTrackId = null;
        this.randomIntensity = 1;
        this.position = null;

        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.origLeft = 0;
        this.origTop = 0;
        this._saveThrottle = null;
        this._clickTimer = null;

        this._editingBatchId = null;
        this._editingTrackId = null;

        // Zoomed time window {start, end} of the timeline, or null.
        this.timeZoom = null;

        // Copy/paste state for track keyframes
        this._copiedTrack = null;

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
        overlay.addEventListener('mousemove', (e) => this._onValueLineHover(e));

        this._boxSelect = new KeyframeBoxSelect(overlay, (selection) => {
            if (selection) {
                this.selectedKeyframe = selection;
            }
            this.renderTimeline();
        });

        this._timeZoom = new TimeZoomControl(this.ui, {
            span: () => timelineSpan(this.engine),
            zoom: () => this.timeZoom,
            setZoom: (zoom) => this.setTimeZoom(zoom),
            seek: (time) => this._seek(time),
        });

        this._bindContextBar();
    }

    _bindPanelDrag() {
        const overlay = this.element;
        const handle = overlay.querySelector('[data-drag-handle]');

        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.closest('button')) {
                return;
            }
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            const rect = overlay.getBoundingClientRect();
            this.origLeft = rect.left;
            this.origTop = rect.top;
            overlay.classList.add('dragging');
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) {
                return;
            }
            this._applyPosition(
                this.origLeft + e.clientX - this.dragStartX,
                this.origTop + e.clientY - this.dragStartY,
            );
        });

        window.addEventListener('mouseup', () => {
            if (!this.isDragging) {
                return;
            }
            this.isDragging = false;
            overlay.classList.remove('dragging');
            this._scheduleSave();
        });

        // Keep a stored position reachable when the window shrinks.
        window.addEventListener('resize', () => {
            if (this.position) {
                this._applyPosition(this.position.left, this.position.top);
            }
        });
    }

    _bindContextBar() {
        const bar = this.contextBar;
        bar.addEventListener('click', (e) => {
            if (e.target.classList.contains('kf-undo-btn')) {
                this._doUndo();
            }
        });
        bar.querySelector('.kf-transition-select')
            .addEventListener('change', (e) => {
                this._editSelectedKeyframe(kf => {
                    kf.transition = e.target.value;
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

    /** The selected keyframe with its track and index, or null. */
    _selection() {
        const selected = this.selectedKeyframe;
        const track = selected && this.engine.getTrack(selected.trackId);
        const kf = track?.keyframes[selected.kfIndex];
        return kf ? {track, kf, index: selected.kfIndex} : null;
    }

    _editSelectedKeyframe(edit) {
        const selection = this._selection();
        if (selection) {
            edit(selection.kf);
            this.renderTimeline();
        }
    }

    _selectTrackRow(row) {
        this.selectedTrackId = row.dataset.trackId;
        this.element.querySelectorAll('.track-wrapper.selected')
            .forEach(el => el.classList.remove('selected'));
        row.classList.add('selected');
        this._scheduleSave();
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
            const selection = this._selection();
            if (selection) {
                selection.track.removeKeyframe(selection.kf.time);
                this.selectedKeyframe = null;
                this.renderTimeline();
            }
        }
        // Ctrl+Z / Cmd+Z for undo on the selected track
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
            e.preventDefault();
            this._doUndo();
        }
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

    _onValueLineHover(e) {
        const strip = e.target.closest('.keyframe-strip');
        const targetRows = this.ui.trackRows.querySelectorAll('.target-row');
        if (!strip) {
            for (const row of targetRows) {
                row.classList.remove('highlighted');
            }
            return;
        }
        // Use elementFromPoint to detect value-line under cursor
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const valueLine = el?.closest('.value-line');
        const name = valueLine?.dataset.uniformName;
        if (name) {
            for (const row of targetRows) {
                const selector = row.querySelector('.target-selector');
                if (selector?.value === name) {
                    row.classList.add('highlighted');
                } else {
                    row.classList.remove('highlighted');
                }
            }
        } else {
            for (const row of targetRows) {
                row.classList.remove('highlighted');
            }
        }
    }

    /** Looks in the selected batch first, then in the auto batches. */
    _findUniformEntry(name) {
        const batches = [
            this.ctx.getBatch(this.selectedBatchId),
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

        const actionData = e.target.closest('[data-action]')?.dataset;
        if (actionData) {
            runAction(this, actionData);
            return;
        }

        const dot = e.target.closest('.keyframe-dot');
        if (dot) {
            this.selectedKeyframe = {
                trackId: dot.dataset.trackId,
                kfIndex: intAttr(dot, 'kfIndex'),
            };
            this.renderTimeline();
            return;
        }

        const strip = e.target.closest('.keyframe-strip');
        if (strip) {
            this._addKeyframeAtPointer(strip, e);
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
                this.selectedBatchId = batchId;
                this.updateOnTargetsChanged();
            });
            return;
        }

        const selectorDisplay = e.target.closest('.target-selector-display');
        if (selectorDisplay) {
            this._toggleTargetDropdown(selectorDisplay);
            return;
        }

        const selectorItem = e.target.closest('.selector-item');
        if (selectorItem) {
            this.selectedBatchId = selectorItem.dataset.targetId || null;
            this.updateOnTargetsChanged();
            return;
        }

        if (!e.target.closest('.target-selector-wrapper')) {
            this.ui.batchSelectorDropdown.hidden = true;
        }

        e.target.closest('.uniform-group-header')
            ?.classList.toggle('collapsed');
    }

    _addKeyframe(track, time, value) {
        DEBUG.log("[KEYFRAMES] length before adding =", track.keyframes.length);
        if (track.keyframes.length === 0 && time > MIN_TIME_STEP) {
            track.addKeyframe(0, value);
        }
        const kf = track.addKeyframe(time, value);
        DEBUG.log("[KEYFRAMES] After adding: ", track.keyframes);
        this.selectedKeyframe = {
            trackId: track.id,
            kfIndex: track.keyframes.indexOf(kf),
        };
        this.renderTimeline();
    }

    _addKeyframeAtPointer(strip, e) {
        const track = this.engine.getTrack(strip.dataset.trackId);
        if (!track) {
            return;
        }
        const [minVal, maxVal] = calcTrackValueRange(track, this.ctx);
        const rect = strip.getBoundingClientRect();
        const yRatio = 1 - (e.clientY - rect.top) / rect.height;
        const value = minVal + yRatio * (maxVal - minVal);

        const {start, end} = this._timeView();
        const time = start + stripFraction(strip, e.clientX) * (end - start);

        DEBUG.table({track: track.id, minVal, maxVal, yRatio, value, time, start, end});

        this._addKeyframe(track, time, value);
    }

    _toggleTargetDropdown(display) {
        const dropdown = this.ui.batchSelectorDropdown;
        const isOpen = !dropdown.hidden;
        if (!isOpen) {
            const rect = display.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + window.scrollY}px`;
            dropdown.style.left = `${rect.left + window.scrollX}px`;
            dropdown.style.width = `${rect.width}px`;
        }
        dropdown.hidden = isOpen;
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
                this._editingTrackId = id;
                this._renderTracks();
                this._focusName('.track-wrapper', 'track-id', id);
            });
            return;
        }

        const batchHeader = e.target.closest('.batch-card-header');
        if (batchHeader) {
            const {batchId} = batchHeader.closest('.batch-card').dataset;
            this._editingBatchId = batchId;
            this.renderUniformPanel();
            requestAnimationFrame(() =>
                this._focusName('.batch-card', 'batch-id', batchId)
            );
        }
    }

    /** Selects the keyframe and focuses the value input of the bar. */
    _focusKeyframeValue(dot) {
        this.selectedKeyframe = {
            trackId: dot.dataset.trackId,
            kfIndex: intAttr(dot, 'kfIndex'),
        };
        if (!this._selection()) {
            this.selectedKeyframe = null;
            return;
        }
        this.renderTimeline();
        requestAnimationFrame(() => {
            const input = this.contextBar.querySelector('.kf-current-val');
            input.focus();
            input.select();
        });
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
        clearTimeout(this._clickTimer);
        this._clickTimer = setTimeout(() => {
            this._clickTimer = null;
            callback();
        }, DELAY_MS.DOUBLE_CLICK);
    }

    _resetClickTimer() {
        clearTimeout(this._clickTimer);
        this._clickTimer = null;
    }

    _isEditingName(el) {
        return el.classList.contains('name')
            && Boolean(this._editingTrackId || this._editingBatchId);
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
            if (!(this._editingTrackId && cancelling)) {
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
        if (this._editingTrackId) {
            const track = this.engine.getTrack(this._editingTrackId);
            if (name && track) {
                track.name = name;
            }
            this._editingTrackId = null;
            this.renderTimeline();
        } else if (this._editingBatchId) {
            const batch = this.ctx.getBatch(this._editingBatchId);
            if (name && batch) {
                batch.name = name;
            }
            this._editingBatchId = null;
            this.updateOnTargetsChanged();
        }
    }

    _cancelNameEdit() {
        if (this._editingTrackId) {
            this._editingTrackId = null;
            this.renderTimeline();
        } else if (this._editingBatchId) {
            this._editingBatchId = null;
            this.renderUniformPanel();
        }
    }

    /** Removes a target whose name was cleared. */
    _removeEmptyTarget(input) {
        const track = this.engine.getTrack(input.dataset.trackId);
        // The trailing "add" row has no target object and is never removed.
        const target = track?.targets[intAttr(input, 'targetIdx')];
        if (target && !target.uniformName.trim()) {
            track.removeTarget(target.uniformName);
            this.renderTimeline();
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
            const target = this.engine.getTrack(el.dataset.trackId)
                ?.targets[intAttr(el, 'targetIdx')];
            if (target) {
                target.enabled = el.checked;
                this.renderTimeline();
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
            const tooltip = el.parentElement.querySelector('.slider-tooltip');
            if (tooltip) {
                tooltip.classList.remove('dragging');
            }
        }
    }

    _toggleUniformInBatch(name, active) {
        // While editing a batch, edit that one instead of the selected.
        const batch = this.ctx.getBatch(
            this._editingBatchId || this.selectedBatchId
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
            const tooltip = el.parentElement.querySelector('.slider-tooltip');
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
            const tooltip = el.parentElement.querySelector('.slider-tooltip');
            if (tooltip) {
                tooltip.textContent = parseFloat(el.value).toFixed(2);
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
            track.addTarget(
                newName, DEFAULT_TARGET_RANGE.min, DEFAULT_TARGET_RANGE.max
            );
            this.renderTimeline();
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
        const input = this.ui.trackRows.querySelector(
            `.target-selector[data-track-id="${CSS.escape(trackId)}"]`
            + `[data-target-idx="${targetIdx}"]`
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
            : DEFAULT_TARGET_RANGE;
        const scalarOr = (value, fallback) =>
            Array.isArray(value) ? fallback : value;
        target.minValue = scalarOr(range.min, DEFAULT_TARGET_RANGE.min);
        target.maxValue = scalarOr(range.max, DEFAULT_TARGET_RANGE.max);
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
        this.renderTimeline();
    }

    /** Undo on the selected keyframe's track. */
    _doUndo() {
        const track = this.selectedKeyframe
            && this.engine.getTrack(this.selectedKeyframe.trackId);
        if (track?.undo()) {
            this.renderTimeline();
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

    /** Rect of the selected dot, else the playhead on the first strip. */
    _contextBarAnchor() {
        const {trackId, kfIndex} = this.selectedKeyframe;
        const dot = this.ui.trackRows.querySelector(
            `.keyframe-dot[data-track-id="${CSS.escape(trackId)}"]`
            + `[data-kf-index="${kfIndex}"]`
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
        pickJsonFile()
            .then(json => {
                // Load into the existing engine so references stay valid.
                this.engine.loadJSON(json);
                this.selectedKeyframe = null;
                this.syncUI();
                this.renderTimeline();
            })
            .catch(err => alert(`Invalid timeline file: ${err.message}`));
    }

    reset() {
        this._cancelPendingSave();

        this.engine.reset();
        this.selectedKeyframe = null;
        this.collapsedTrackIds.clear();
        this.selectedBatchId = null;
        this.randomIntensity = 1;
        this.timeZoom = null;
        this.position = null;
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
        if (this._saveThrottle) {
            return;
        }
        this._saveThrottle = setTimeout(
            () => this.saveState(),
            DELAY_MS.STORAGE_THROTTLE
        );
    }

    _cancelPendingSave() {
        clearTimeout(this._saveThrottle);
        this._saveThrottle = null;
    }

    restoreState() {
        const state = readStoredState();
        if (!state) {
            return;
        }

        if (state.timeline) {
            this.engine.loadJSON(state.timeline);
            this.engine.playing = false;
        }
        for (const [name, value] of Object.entries(state.overrides ?? {})) {
            if (isRangeValue(value)) {
                this.engine.setUniformValue(name, value);
            }
        }
        this.ctx.loadCustomBatches(state.customBatches);
        this.selectedBatchId = state.selectedBatchId ?? null;
        const intensity = Number(state.randomIntensity);
        this.randomIntensity = Number.isFinite(intensity)
            ? clamp(intensity, 0, 1)
            : 1;
        this.selectedTrackId = state.selectedTrackId ?? null;
        this.collapsedTrackIds = new Set(state.collapsedTracks ?? []);
        this.timeZoom = parseTimeZoom(state.timeZoom);
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
        this.position = {
            left: Math.round(clamp(left, 0, maxLeft)),
            top: Math.round(clamp(top, 0, maxTop)),
        };
        this.element.style.left = `${this.position.left}px`;
        this.element.style.top = `${this.position.top}px`;
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
        this.timeZoom = zoom;
        this.renderTimeline();
    }

    _timeView() {
        return visibleRange(this.timeZoom, timelineSpan(this.engine));
    }

    _seek(time) {
        this.engine.currentTime = time;
        this._renderPlayback();
        this._scheduleSave();
    }

    // ─── Rendering ──────────────────────────────────────────────

    renderTimeline() {
        renderTimeZoom(this.ui, timelineSpan(this.engine), this.timeZoom);
        this._renderTracks();
        this._renderPlayback();
        this._renderPreview();
        this._positionContextBar();
        this._scheduleSave();
    }

    _renderTracks() {
        renderTracks(
            this.ui,
            this.ctx,
            this.selectedTrackId,
            this._editingTrackId,
            this.collapsedTrackIds,
            this.selectedKeyframe,
            this._timeView(),
        );
    }

    _renderPreview() {
        renderPreview(this.ui, this.engine);
    }

    _renderPlayback() {
        renderPlayback(this.ui, this.engine, this._timeView());
    }

    renderRandomizer() {
        const {selectedBatchId} = renderRandomizerPanel(
            this.ui, this.ctx, this.selectedBatchId
        );
        this.selectedBatchId = selectedBatchId;
    }

    renderUniformPanel() {
        const {ui, ctx, selectedBatchId, _editingBatchId} = this;
        renderBatchList(ui, ctx, selectedBatchId, _editingBatchId);
        renderUniformList(ui, ctx, selectedBatchId, _editingBatchId);
    }

    /** Targets show up in nearly every section, so re-render them all. */
    updateOnTargetsChanged() {
        this.renderUniformPanel();
        this.renderTimeline();
        this.renderRandomizer();
        this._scheduleSave();
    }

    // ─── Public API ─────────────────────────────────────────────

    getUniformValues() {
        return this.engine.getAllUniformValues();
    }

    update(dt) {
        this.engine.update(dt);
        if (this.engine.playing) {
            this._renderPlayback();
            this._scheduleSave();
        }
    }

    syncToShader(gl, state) {
        DEBUG.log("syncToShader()")
        uploadUniforms(
            gl, state.program, state.location, this.getUniformValues()
        );
    }

    setVisible(visible) {
        this.element.hidden = !visible;
    }

    toggle() {
        this.setVisible(this.element.hidden);
    }
}
