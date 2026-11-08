import STYLESHEET from './overlay.css?inline';
import {isRangeValue} from "../engine/randomizer.js";
import {
    createPlaygroundOverlayDOM,
    renderBatchListDOM as renderBatchList,
    renderPlaybackDOM as renderPlayback,
    renderPreviewDOM as renderPreview,
    renderRandomizerPanelDOM as renderRandomizerPanel,
    renderTracksDOM as renderTracks,
    renderUniformListDOM as renderUniformList
} from './overlay-dom.js';
import {STORAGE_KEY} from "../../app/layout/generate.js";
import {injectGlobalCss, isTypingTarget} from "./helpers.js";
import {percentOfSpan, timelineSpan} from "../engine/math.js";
import {runAction} from "../actions.js";

export {escapeHtml, formatRange, parseRangeInput} from './helpers.js';

const STATE_VERSION = 1;
const SAVE_DELAY_MS = 200;
const DBL_CLICK_DELAY_MS = 350;

function readStoredState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY.PLAYGROUND_OVERLAY);
        const state = raw ? JSON.parse(raw) : null;
        return state?.version === STATE_VERSION ? state : null;
    } catch (error) {
        console.warn('Failed to read the playground overlay state:', error);
        return null;
    }
}

export class Overlay {
    constructor(timelineEngine, randomizer) {
        this.engine = timelineEngine;
        this.randomizer = randomizer;
        this.element = null;
        this.selectedKeyframe = null;
        this.collapsedTrackIds = new Set();
        this.selectedBatchId = null;
        this.intensity = 1;
        this.position = null;

        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.origLeft = 0;
        this.origTop = 0;
        this._saveTimer = null;
        this._dblClickTimer = null;

        this._editingBatchId = null;
        this._editingTrackId = null;

        this.init();
    }

    init() {
        injectGlobalCss(STYLESHEET, 'overlay-style');
        this.createDOM();
        this.bindEvents();
        this.restoreState();
        this.syncUI();
        this.render();
        this.renderRandomizer();
    }

    createDOM() {
        const dom = createPlaygroundOverlayDOM();
        this.element = dom.element;
        this.ui = dom.ui;
        document.body.append(this.element);
    }

    bindEvents() {
        const overlay = this.element;

        // Dragging
        overlay.querySelector('[data-drag-handle]').addEventListener('mousedown', (e) => {
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
            if (!this.isDragging) return;
            this._applyPosition(
                this.origLeft + e.clientX - this.dragStartX,
                this.origTop + e.clientY - this.dragStartY,
            );
        });

        window.addEventListener('mouseup', () => {
            if (!this.isDragging) return;
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

        // Flush pending changes when the page goes away.
        window.addEventListener('pagehide', () => this.saveState());

        overlay.addEventListener('click', (e) => this._onClick(e));
        overlay.addEventListener('dblclick', (e) => this._onDoubleClick(e));
        overlay.addEventListener('change', (e) => this._onChange(e));
        overlay.addEventListener('input', (e) => this._onInput(e));
        overlay.addEventListener('focusout', (e) => this._onBlur(e), true);

        window.addEventListener('keydown', (e) => {
            if (isTypingTarget(e.target)) {
                return;
            }
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlaying();
            }
            if (e.code === 'Delete' && this.selectedKeyframe) {
                const track = this.engine.getTrack(this.selectedKeyframe.trackId);
                const kf = track?.keyframes[this.selectedKeyframe.kfIndex];
                if (kf) {
                    track.removeKeyframe(kf.time);
                    this.selectedKeyframe = null;
                    this.render();
                }
            }
        });
    }

    // ─── Event handlers ─────────────────────────────────────────

    _onClick(e) {
        const actionEl = e.target.closest('[data-action]');
        if (actionEl) {
            runAction(this, actionEl.dataset.action, actionEl.dataset);
            return;
        }

        const dot = e.target.closest('.keyframe-dot');
        if (dot) {
            this.selectedKeyframe = {
                trackId: dot.dataset.trackId,
                kfIndex: parseInt(dot.dataset.kfIndex, 10),
            };
            this.render();
            return;
        }

        // Click on strip background to add a keyframe
        const strip = e.target.closest('.keyframe-strip');
        if (strip) {
            const track = this.engine.getTrack(strip.dataset.trackId);
            if (!track) return;
            const rect = strip.getBoundingClientRect();
            const inset = parseFloat(getComputedStyle(strip).fontSize) * 0.5;
            const x = Math.min(1, Math.max(0, (e.clientX - rect.left - inset) / (rect.width - 2 * inset)));
            this._promptKeyframe(track, timelineSpan(this.engine, x));
            return;
        }

        const trackHeader = e.target.closest('.track-header');
        if (trackHeader) {
            const trackItem = trackHeader.closest('.track-wrapper');
            const id = trackItem.dataset.trackId;
            this._editingTrackId = id;
            clearTimeout(this._dblClickTimer);
            this._dblClickTimer = setTimeout(() => {
                this._dblClickTimer = null;
                const collapsed = trackItem.classList.toggle('collapsed');
                if (collapsed) {
                    this.collapsedTrackIds.add(id);
                } else {
                    this.collapsedTrackIds.delete(id);
                }
                this._scheduleSave();
            }, DBL_CLICK_DELAY_MS);
            return;
        }
        const batchHeader = e.target.closest('.batch-card-header');
        if (batchHeader) {
            this.selectedBatchId = batchHeader.closest('.batch-card').dataset.batchId;
            this._dblClickTimer = setTimeout(() => {
                this.renderRandomizer();
                this._scheduleSave();
            }, DBL_CLICK_DELAY_MS);
            return;
        }

        // Custom batch selector display.
        const selectorDisplay = e.target.closest('.target-selector-display');
        if (selectorDisplay) {
            const wrapper = selectorDisplay.closest('.target-selector-wrapper');
            const dropdown = wrapper.querySelector('.target-selector-dropdown');
            const isOpen = !dropdown.hidden;

            if (!isOpen) {
                // Position the fixed dropdown just below the display button.
                const rect = selectorDisplay.getBoundingClientRect();
                dropdown.style.top = `${rect.bottom + window.scrollY}px`;
                dropdown.style.left = `${rect.left + window.scrollX}px`;
                dropdown.style.width = `${rect.width}px`;
            }

            dropdown.hidden = isOpen;
            return;
        }

        // Selector item click.
        const selectorItem = e.target.closest('.selector-item');
        if (selectorItem) {
            this.selectedBatchId = selectorItem.dataset.targetId || null;
            this.renderRandomizer();
            this._scheduleSave();
            return;
        }

        // Close dropdown when clicking outside.
        const wrapper = e.target.closest('.target-selector-wrapper');
        if (!wrapper) {
            document.querySelectorAll('.target-selector-dropdown:not([hidden])').forEach(dd => {
                dd.hidden = true;
            });
        }

        const groupHeader = e.target.closest('.uniform-group-header');
        if (groupHeader) {
            groupHeader.classList.toggle('collapsed');
        }
    }

    _onDoubleClick(e) {
        clearTimeout(this._dblClickTimer);
        this._dblClickTimer = null;

        // Edit keyframe value; cancelling the prompt removes the keyframe.
        const dot = e.target.closest('.keyframe-dot');
        if (dot) {
            const track = this.engine.getTrack(dot.dataset.trackId);
            const kf = track?.keyframes[parseInt(dot.dataset.kfIndex, 10)];
            if (!kf) return;

            const newVal = prompt(`Edit keyframe at ${kf.time.toFixed(1)}s (cancel to remove):`, String(kf.value));
            if (newVal === null) {
                track.removeKeyframe(kf.time);
                this.selectedKeyframe = null;
            } else if (!isNaN(parseFloat(newVal))) {
                kf.value = parseFloat(newVal);
            }
            this.render();
            return;
        }

        if (e.target.classList.contains('target-name')) {
            const track = this.engine.getTrack(e.target.dataset.trackId);
            const target = track?.targets[parseInt(e.target.dataset.targetIdx, 10)];
            const newName = target && prompt('Uniform name:', target.uniformName);
            if (newName?.trim()) {
                target.uniformName = newName.trim();
                this.render();
            }
            return;
        }

        const trackHeader = e.target.closest('.track-header');
        if (trackHeader && !e.target.closest('button, input')) {
            const trackItem = trackHeader.closest('.track-wrapper');
            const id = trackItem.dataset.trackId;
            console.log("clicked track id", id);
            this._editingTrackId = id;
            requestAnimationFrame(() => {
                this.element
                    .querySelector(
                        `.track-wrapper[data-track-id="${CSS.escape(id)}"] .name`
                    )
                    ?.focus();
            });
            return;
        }

        const batchHeader = e.target.closest('.batch-card-header');
        if (batchHeader && !e.target.closest('button, input')) {
            const batchId = batchHeader.closest('.batch-card').dataset.batchId;
            this._editingBatchId = batchId;
            this.renderUniformPanel();
            requestAnimationFrame(() => {
                this.element
                    .querySelector(`.batch-card[data-batch-id="${CSS.escape(batchId)}"] .name`)
                    ?.focus();
            });
            return;
        }
    }

    _onKeyDown(e) {
        // Inline-edit track name: Enter to confirm, Escape to cancel.
        if (this._editingTrackId && e.target.classList.contains('name')) {
            if (e.code === 'Enter') {
                const newName = e.target.value.trim();
                if (newName) {
                    this.engine.getTrack(this._editingTrackId).name = newName;
                }
                this._editingTrackId = null;
                this.render();
            } else if (e.code === 'Escape') {
                this._editingTrackId = null;
                this.render();
            }
            return;
        }

        // Inline-edit batch name: Enter to confirm, Escape to cancel.
        if (this._editingBatchId && e.target.classList.contains('name')) {
            if (e.code === 'Enter') {
                const newName = e.target.value.trim();
                if (newName) {
                    const batch = this.randomizer.getBatch(this._editingBatchId);
                    if (batch) batch.name = newName;
                }
                this._editingBatchId = null;
                this.renderRandomizer();
                this._scheduleSave();
            } else if (e.code === 'Escape') {
                this._editingBatchId = null;
                this.renderRandomizer();
            }

        // Handle target selector: Escape to remove empty targets (except the last placeholder)
        } else if (e.target.classList.contains('target-selector')) {
            const trackId = e.target.dataset.trackId;
            const targetIdx = parseInt(e.target.dataset.targetIdx, 10);
            const track = this.engine.getTrack(trackId);
            if (!track) return;
            
            // Don't remove the last placeholder row
            if (targetIdx === track.targets.length - 1) return;
            
            if (e.code === 'Escape') {
                const target = track.targets[targetIdx];
                if (target && !target.uniformName.trim()) {
                    track.removeTarget(target.uniformName);
                    this.render();
                }
            }
        }
    }

    _onBlur(e) {
        // Confirm inline-edit on blur (click outside).
        if (this._editingTrackId && e.target.classList.contains('name')) {
            const newName = e.target.value.trim();
            if (newName) {
                this.engine.getTrack(this._editingTrackId).name = newName;
            }
            this._editingTrackId = null;
            this.render();
        } else if (this._editingBatchId && e.target.classList.contains('name')) {
            const newName = e.target.value.trim();
            if (newName) {
                const batch = this.randomizer.getBatch(this._editingBatchId);
                if (batch) batch.name = newName;
            }
            this._editingBatchId = null;
            this.renderRandomizer();
            this._scheduleSave();
        } else if (e.target.classList.contains('target-selector')) {
            // Remove empty targets on blur (except the last placeholder row)
            const trackId = e.target.dataset.trackId;
            const targetIdx = parseInt(e.target.dataset.targetIdx, 10);
            const track = this.engine.getTrack(trackId);
            if (!track) return;
            
            const target = track.targets[targetIdx];
            // Don't remove the last placeholder row
            if (targetIdx === track.targets.length - 1) return;
            
            if (target && !target.uniformName.trim()) {
                track.removeTarget(target.uniformName);
                this.render();
            }
        }
    }

    _onChange(e) {
        const el = e.target;
        const {trackId, targetIdx, kfIndex} = el.dataset;

        if (el.classList.contains('speed-input')) {
            this.engine.speed = parseFloat(el.value) || 1.0;
            this._scheduleSave();
            return;
        }

        if (el.classList.contains('target-enable')) {
            const target = this.engine.getTrack(trackId)?.targets[parseInt(targetIdx, 10)];
            if (target) {
                target.enabled = el.checked;
                this.render();
            }
            return;
        }

        if (el.classList.contains('target-min') || el.classList.contains('target-max')) {
            const track = this.engine.getTrack(trackId);
            const idx = parseInt(targetIdx, 10);
            const target = track?.targets[idx];
            const val = parseFloat(el.value);
            if (!target || isNaN(val)) return;

            if (el.classList.contains('target-min')) {
                target.minValue = val;
            } else {
                target.maxValue = val;
            }
            // Re-clamp existing keyframes
            for (const kf of track.keyframes) {
                if (Array.isArray(kf.value)) {
                    kf.value[idx] = Math.max(target.minValue, Math.min(target.maxValue, kf.value[idx]));
                }
            }
            this._renderPreview();
            this._scheduleSave();
            return;
        }

        if (el.classList.contains('transition-select')) {
            const kf = this.engine.getTrack(trackId)?.keyframes[parseInt(kfIndex, 10)];
            if (kf) {
                kf.transition = el.value;
                this.render();
            }
            return;
        }

        if (el.closest('.batch-uniform-row')) {
            this._updateBatchUniformField(el);
            return;
        }

        if (el.classList.contains('uniform-checkbox')) {
            const name = el.dataset.uniformName;
            // When editing a batch, use that batch; otherwise use selectedBatchId.
            const batchId = this._editingBatchId || this.selectedBatchId;
            if (!batchId) return;
            const batch = this.randomizer.getBatch(batchId);
            if (!batch) return;
            if (el.checked) {
                // Add/activate uniform in batch.
                batch.toggleUniform(name, true);
            } else {
                // Deactivate uniform in batch (preserves values).
                batch.toggleUniform(name, false);
            }
            this.renderRandomizer();
            this._scheduleSave();
        }

        if (el.classList.contains('uniform-min') || el.classList.contains('uniform-max')) {
            const name = el.dataset.uniformName;
            const isMin = el.classList.contains('uniform-min');
            // Find the uniform in any batch to update its min/max.
            for (const batch of this.randomizer.getAllBatches()) {
                const entry = batch.uniforms.find(u => u.name === name);
                if (entry) {
                    const value = parseRangeInput(el.value);
                    if (value !== undefined) {
                        entry[isMin ? 'min' : 'max'] = value;
                    } else {
                        entry[isMin ? 'min' : 'max'] = null;
                    }
                }
            }
            this._scheduleSave();
        }
    }

    _onInput(e) {
        const el = e.target;

        if (el === this.ui.timeSlider) {
            this.engine.currentTime = parseFloat(el.value);
            this._renderPlayback();
            this._scheduleSave();
            return;
        }

        if (el === this.ui.intensitySlider) {
            this.intensity = parseFloat(el.value);
            this.ui.intensityValue.textContent = this.intensity.toFixed(2);
            this._scheduleSave();
            return;
        }

        // Validate overwrite fields while typing; values are committed on change.
        if (el.matches('.batch-uniform-row .min, .batch-uniform-row .max')) {
            el.classList.toggle('invalid', parseRangeInput(el.value) === undefined);
        }

        // Validate uniform-list min/max inputs.
        if (el.classList.contains('uniform-min') || el.classList.contains('uniform-max')) {
            el.classList.toggle('invalid', parseRangeInput(el.value) === undefined);
        }

        // Handle target selector input - update ranges when name changes
        if (el.classList.contains('target-selector')) {
            const trackId = el.dataset.trackId;
            const targetIdx = parseInt(el.dataset.targetIdx, 10);
            const track = this.engine.getTrack(trackId);
            if (!track) return;
            
            const newName = el.value.trim();
            
            // If this is the last row and it has a value, add it as a real target
            if (newName && targetIdx === track.targets.length) {
                track.addTarget(newName, -1, 1);
                this.render();
                // Re-focus the newly added selector
                const selectors = this.ui.trackList.querySelectorAll('.target-selector');
                const lastSelector = selectors[selectors.length - 2]; // second to last (last is the new empty one)
                if (lastSelector) {
                    lastSelector.focus();
                    lastSelector.select();
                }
                return;
            }
            
            const target = track.targets[targetIdx];
            if (!target) return;
            
            if (newName !== target.uniformName) {
                // Rename the target
                if (target.uniformName) {
                    track.removeTarget(target.uniformName);
                }
                target.uniformName = newName;
                if (newName) {
                    const range = this.randomizer.getControlRange(newName);
                    target.minValue = Array.isArray(range.min) ? -1 : range.min;
                    target.maxValue = Array.isArray(range.max) ? 1 : range.max;
                } else {
                    target.minValue = -1;
                    target.maxValue = 1;
                }
                this._scheduleSave();
            }
        }
    }

    _updateBatchUniformField(el) {
        const batch = this.randomizer.getBatch(el.dataset.batchId);
        const index = parseInt(el.dataset.index, 10);
        if (!batch?.uniforms[index]) return;

        if (el.classList.contains('name')) {
            const name = el.value.trim();
            batch.updateUniform(index, {name});
            // Placeholders show the control's range; update them in place to keep focus/tab order.
            const range = this.randomizer.getControlRange(name);
            const row = el.closest('.batch-uniform-row');
            row.querySelector('.min').placeholder = formatRange(range.min);
            row.querySelector('.max').placeholder = formatRange(range.max);
        } else {
            const value = parseRangeInput(el.value);
            el.classList.toggle('invalid', value === undefined);
            if (value === undefined) return;
            batch.updateUniform(index, {[el.classList.contains('min') ? 'min' : 'max']: value});
        }
        this._scheduleSave();
    }

    // ─── Actions ────────────────────────────────────────────────

    togglePlaying() {
        this.engine.playing = !this.engine.playing;
        this._syncPlayButton();
    }

    _syncPlayButton() {
        if (!this.ui.playBtn) return;
        this.ui.playBtn.textContent = this.engine.playing ? '⏸' : '▶';
        this.ui.playBtn.title = this.engine.playing ? 'Pause (Space)' : 'Play (Space)';
    }

    _promptKeyframe(track, time) {
        const firstTarget = track.targets[0];
        const defaultVal = firstTarget?.enabled ? firstTarget.minValue : 0;
        const value = prompt(`Keyframe value at ${time.toFixed(1)}s:`, String(defaultVal));
        if (value === null) return;
        const numVal = parseFloat(value);
        if (!isNaN(numVal)) {
            track.addKeyframe(time, numVal);
            this.render();
        }
    }

    _exportTimeline() {
        const json = JSON.stringify(this.engine.toJSON(), null, 2);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timeline.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    _importTimeline() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    // Load into the existing engine so external references stay valid.
                    this.engine.loadJSON(JSON.parse(ev.target.result));
                    this.selectedKeyframe = null;
                    this.syncUI();
                    this.render();
                } catch (err) {
                    alert('Invalid timeline file: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /** Clear all values and the stored state, and restore the default layout. */
    reset() {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;

        this.engine.reset();
        this.randomizer.clearCustomBatches();
        this.selectedKeyframe = null;
        this.collapsedTrackIds.clear();
        this.selectedBatchId = null;
        this.intensity = 1;
        this.position = null;
        this.element.style.left = '';
        this.element.style.top = '';
        this.element.classList.remove('collapsed');

        this.syncUI();
        this.render();
        this.renderRandomizer();

        // Rendering schedules a save; drop it so nothing is stored until the next change.
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        try {
            localStorage.removeItem(STORAGE_KEY.PLAYGROUND_OVERLAY);
        } catch (error) {
            console.warn('Failed to clear the playground overlay state:', error);
        }
    }

    // ─── Persistence ────────────────────────────────────────────

    _collectState() {
        return {
            version: STATE_VERSION,
            position: this.position,
            collapsed: this.element.classList.contains('collapsed'),
            collapsedTracks: [...this.collapsedTrackIds].filter(id => this.engine.getTrack(id)),
            timeline: {...this.engine.toJSON(), playing: false},
            overrides: this.engine.getOverrides(),
            randomizer: {
                selectedBatchId: this.selectedBatchId,
                intensity: this.intensity,
                customBatches: this.randomizer.toJSON(),
            },
        };
    }

    saveState() {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        try {
            localStorage.setItem(STORAGE_KEY.PLAYGROUND_OVERLAY, JSON.stringify(this._collectState()));
        } catch (error) {
            console.warn('Failed to store the playground overlay state:', error);
        }
    }

    /** Throttled save: at most one write per SAVE_DELAY_MS, also during playback. */
    _scheduleSave() {
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => this.saveState(), SAVE_DELAY_MS);
    }

    restoreState() {
        const state = readStoredState();
        if (!state) return;

        if (state.timeline) {
            this.engine.loadJSON(state.timeline);
            this.engine.playing = false;
        }
        for (const [name, value] of Object.entries(state.overrides ?? {})) {
            if (isRangeValue(value)) {
                this.engine.setUniformValue(name, value);
            }
        }

        this.randomizer.loadJSON(state.randomizer?.customBatches);
        this.selectedBatchId = state.randomizer?.selectedBatchId ?? null;
        const intensity = Number(state.randomizer?.intensity);
        this.intensity = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 1;

        this.collapsedTrackIds = new Set(state.collapsedTracks ?? []);
        this.element.classList.toggle('collapsed', Boolean(state.collapsed));

        const {left, top} = state.position ?? {};
        if (Number.isFinite(left) && Number.isFinite(top)) {
            this._applyPosition(left, top);
        }
    }

    _applyPosition(left, top) {
        const rect = this.element.getBoundingClientRect();
        const headerHeight = this.element.querySelector('.panel-header').offsetHeight || 32;
        const clampedLeft = Math.min(Math.max(0, left), Math.max(0, window.innerWidth - rect.width));
        const clampedTop = Math.min(Math.max(0, top), Math.max(0, window.innerHeight - headerHeight));
        this.position = {left: Math.round(clampedLeft), top: Math.round(clampedTop)};
        this.element.style.left = `${this.position.left}px`;
        this.element.style.top = `${this.position.top}px`;
    }

    syncUI() {
        this.ui.timeSlider.max = timelineSpan(this.engine);
        this.ui.timeSlider.value = this.engine.currentTime;
        this.ui.timeDisplay.textContent = `${this.engine.currentTime.toFixed(1)}s`;
        this.ui.speedInput.value = this.engine.speed;
        this._syncPlayButton();
        this.ui.intensitySlider.value = this.intensity;
        this.ui.intensityValue.textContent = this.intensity.toFixed(2);
        this._syncPlayButton();
    }

    render() {
        renderTracks(
            this.ui,
            this.engine,
            this.collapsedTrackIds,
            this.selectedKeyframe,
            this._editingTrackId,
            timelineSpan,
            percentOfSpan,
        );

        // Playback update.
        renderPlayback(this.ui, this.engine, timelineSpan, percentOfSpan);
        this._scheduleSave();
    }

    _renderPreview() {
        renderPreview(this.ui, this.engine);
    }

    _renderPlayback() {
        renderPlayback(this.ui, this.engine, timelineSpan, percentOfSpan);
    }

    renderRandomizer() {
        const result = renderRandomizerPanel(this.ui, this.randomizer, this.selectedBatchId, this._editingBatchId);
        if (result) {
            this.selectedBatchId = result.selectedBatchId;
        }

        // NOTE: unclear whether needed, might be a legacy relic.
        this.renderUniformPanel();
    }

    renderUniformPanel() {
        renderBatchList(this.ui, this.randomizer, this.selectedBatchId, this._editingBatchId);
        renderUniformList(this.ui, this.randomizer, this.selectedBatchId, this._editingBatchId);
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
        const types = this._getUniformTypes(gl, state.program);
        for (const [name, value] of Object.entries(this.getUniformValues())) {
            const loc = state.location[name];
            const type = types.get(name);
            if (loc === undefined || loc === null || type === undefined) continue;

            if (type === gl.FLOAT) {
                gl.uniform1f(loc, value);
            } else if (type === gl.FLOAT_VEC2) {
                gl.uniform2fv(loc, value);
            } else if (type === gl.FLOAT_VEC3) {
                gl.uniform3fv(loc, value);
            } else if (type === gl.FLOAT_VEC4) {
                gl.uniform4fv(loc, value);
            } else if (type === gl.INT) {
                gl.uniform1i(loc, Math.round(value));
            } else if (type === gl.INT_VEC2) {
                gl.uniform2iv(loc, value.map(Math.round));
            } else if (type === gl.INT_VEC3) {
                gl.uniform3iv(loc, value.map(Math.round));
            } else if (type === gl.INT_VEC4) {
                gl.uniform4iv(loc, value.map(Math.round));
            }
        }
    }

    /** getActiveUniform() takes an index, not a location, so map names to types once per program. */
    _getUniformTypes(gl, program) {
        this._uniformTypeCache ??= new WeakMap();
        let types = this._uniformTypeCache.get(program);
        if (!types) {
            types = new Map();
            const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
            for (let i = 0; i < count; i++) {
                const info = gl.getActiveUniform(program, i);
                if (info) {
                    types.set(info.name.replace(/\[0]$/, ''), info.type);
                }
            }
            this._uniformTypeCache.set(program, types);
        }
        return types;
    }

    setVisible(visible) {
        this.element.hidden = !visible;
    }

    toggle() {
        this.setVisible(this.element.hidden);
    }
}
