import {TimelineEngine} from "./timeline-engine.js";
import STYLESHEET from './playground-overlay.css?inline';
import {getUniformRandomizer, isRangeValue} from "./uniform-randomizer.js";
import {STORAGE_KEY} from "../app/layout/generate.js";

const STATE_VERSION = 1;
const SAVE_DELAY_MS = 300;
const MIN_TIMELINE_SPAN = 60;
const UNIFORM_DATALIST_ID = 'playground-uniform-names';
// Written by the previous randomizer version; cleared on reset.
const LEGACY_RANDOMIZER_KEY = 'uniform-randomizer-sets';

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatRange(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return Array.isArray(value) ? value.join(', ') : String(value);
}

function parseRangeInput(text) {
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

function isTypingTarget(target) {
    return Boolean(target?.closest?.('input, select, textarea, button, [contenteditable="true"]'));
}

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

export class PlaygroundOverlay {
    constructor(timelineEngine, {randomizer} = {}) {
        this.engine = timelineEngine || new TimelineEngine();
        this.randomizer = randomizer || getUniformRandomizer();
        this.element = null;
        this.selectedKeyframe = null; // { trackId, kfIndex }
        this.collapsedTrackIds = new Set();
        this.selectedSetId = null;
        this.intensity = 1;
        this.position = null; // { left, top } in px, null = stylesheet default

        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.origLeft = 0;
        this.origTop = 0;
        this._saveTimer = null;

        this.init();
    }

    init() {
        this._injectCSS();
        this.createDOM();
        this.bindEvents();
        this.restoreState();
        this.syncUI();
        this.render();
        this.renderRandomizer();
    }

    _injectCSS() {
        // makeshift, weil halt noch experimentell. well.
        if (!document.getElementById('playground-overlay-css')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'playground-overlay-css';
            styleEl.textContent = STYLESHEET;
            document.head.appendChild(styleEl);
        }
    }

    createDOM() {
        const overlay = document.createElement('div');
        overlay.id = 'playground-overlay';
        overlay.innerHTML = `
            <div class="panel-header" data-drag-handle>
                <span class="title">Uniform Playground</span>
                <button type="button" class="minimize-btn" data-action="minimize" title="Minimize">−</button>
            </div>
            <div class="timeline-controls">
                <button type="button" class="btn icon play-btn" data-action="play" title="Play/Pause (Space)">▶</button>
                <input type="range" class="time-slider" min="0" max="${MIN_TIMELINE_SPAN}" step="0.1" value="0">
                <span class="time-display">0.0s</span>
                <div class="speed-control">
                    <label for="playground-speed">x</label>
                    <input type="number" id="playground-speed" class="field num speed-input" min="0.1" max="5" step="0.1" value="1.0">
                </div>
            </div>
            <div class="track-list"></div>
            <div class="value-preview"></div>
            <section class="randomizer-panel">
                <div class="randomizer-header">
                    <span class="randomizer-title">Randomize</span>
                    <button type="button" class="btn" data-action="add-set" title="Create a new uniform set">+ Set</button>
                </div>
                <div class="randomizer-run">
                    <select class="field set-selector" title="Uniform set to randomize"></select>
                </div>
                <div class="intensity-control">
                    <button type="button" class="btn randomize-btn" data-action="randomize">Randomize</button>
                    <span class="intensity-label">by Amount</span>
                    <input type="range" class="intensity-slider" min="0" max="1" step="0.01" value="1">
                    <span class="intensity-value">1.00</span>
                </div>
                <div class="set-list"></div>
                <datalist id="${UNIFORM_DATALIST_ID}"></datalist>
            </section>
            <div class="overlay-footer">
                <button type="button" class="btn" data-action="add-track">+ Track</button>
                <button type="button" class="btn" data-action="export">Export</button>
                <button type="button" class="btn" data-action="import">Import</button>
                <button type="button" class="btn danger reset-btn" data-action="reset"
                        title="Clear all tracks, sets, values and the stored overlay state">Reset</button>
            </div>
        `;

        this.element = overlay;
        this.ui = {
            playBtn: overlay.querySelector('.play-btn'),
            timeSlider: overlay.querySelector('.time-slider'),
            timeDisplay: overlay.querySelector('.time-display'),
            speedInput: overlay.querySelector('.speed-input'),
            trackList: overlay.querySelector('.track-list'),
            preview: overlay.querySelector('.value-preview'),
            setSelector: overlay.querySelector('.set-selector'),
            randomizeBtn: overlay.querySelector('.randomize-btn'),
            intensitySlider: overlay.querySelector('.intensity-slider'),
            intensityValue: overlay.querySelector('.intensity-value'),
            setList: overlay.querySelector('.set-list'),
            uniformNames: overlay.querySelector(`#${UNIFORM_DATALIST_ID}`),
        };
        document.body.appendChild(overlay);
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

        // Keyboard shortcuts
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
            this._runAction(actionEl.dataset.action, actionEl.dataset);
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
            this._promptKeyframe(track, x * this._timelineSpan());
            return;
        }

        const trackHeader = e.target.closest('.track-header');
        if (trackHeader) {
            const trackItem = trackHeader.closest('.track-item');
            const id = trackItem.dataset.trackId;
            const collapsed = trackItem.classList.toggle('collapsed');
            if (collapsed) {
                this.collapsedTrackIds.add(id);
            } else {
                this.collapsedTrackIds.delete(id);
            }
            this._scheduleSave();
            return;
        }

        const setHeader = e.target.closest('.set-card-header');
        if (setHeader) {
            this.selectedSetId = setHeader.closest('.set-card').dataset.setId;
            this.renderRandomizer();
            this._scheduleSave();
        }
    }

    _runAction(action, data) {
        switch (action) {
            case 'minimize':
                this.element.classList.toggle('collapsed');
                this._scheduleSave();
                break;
            case 'play':
                this.togglePlaying();
                break;
            case 'add-track': {
                const name = prompt('Track name:', `Track ${this.engine.getAllTracks().length + 1}`);
                if (name?.trim()) {
                    this.engine.addTrack(name.trim());
                    this.render();
                }
                break;
            }
            case 'export':
                this._exportTimeline();
                break;
            case 'import':
                this._importTimeline();
                break;
            case 'reset':
                if (confirm('Reset the playground? This clears all tracks, sets and values, including the stored ones.')) {
                    this.reset();
                }
                break;
            case 'delete-track':
                if (confirm('Delete this track?')) {
                    this.engine.removeTrack(data.trackId);
                    this.collapsedTrackIds.delete(data.trackId);
                    this.selectedKeyframe = null;
                    this.render();
                }
                break;
            case 'add-target': {
                const track = this.engine.getTrack(data.trackId);
                const name = track && prompt('Uniform name:', '');
                if (name?.trim()) {
                    const {min, max} = this.randomizer.getControlRange(name.trim());
                    track.addTarget(name.trim(), Array.isArray(min) ? -1 : min, Array.isArray(max) ? 1 : max);
                    this.render();
                }
                break;
            }
            case 'remove-target': {
                const track = this.engine.getTrack(data.trackId);
                const target = track?.targets[parseInt(data.targetIdx, 10)];
                if (target) {
                    track.removeTarget(target.uniformName);
                    this.render();
                }
                break;
            }
            case 'add-keyframe': {
                const track = this.engine.getTrack(data.trackId);
                if (track) {
                    this._promptKeyframe(track, this.engine.currentTime);
                }
                break;
            }
            case 'add-set': {
                const name = prompt('Set name:', `Set ${this.randomizer.customSets.length + 1}`);
                if (name?.trim()) {
                    const set = this.randomizer.addSet(name.trim());
                    this.selectedSetId = set.id;
                    this.renderRandomizer();
                    this._scheduleSave();
                }
                break;
            }
            case 'remove-set': {
                const set = this.randomizer.getSet(data.setId);
                if (set && confirm(`Delete the set "${set.name}"?`)) {
                    this.randomizer.removeSet(set.id);
                    this.renderRandomizer();
                    this._scheduleSave();
                }
                break;
            }
            case 'add-uniform': {
                const set = this.randomizer.getSet(data.setId);
                if (set) {
                    set.addUniform('');
                    this.selectedSetId = set.id;
                    this.renderRandomizer();
                    this.element
                        .querySelector(`.set-card[data-set-id="${CSS.escape(set.id)}"] .set-uniform-row:last-child .name`)
                        ?.focus();
                    this._scheduleSave();
                }
                break;
            }
            case 'remove-uniform': {
                const set = this.randomizer.getSet(data.setId);
                if (set) {
                    set.removeUniform(parseInt(data.index, 10));
                    this.renderRandomizer();
                    this._scheduleSave();
                }
                break;
            }
            case 'randomize':
                if (this.selectedSetId) {
                    this.randomizer.randomizeSet(this.selectedSetId, this.intensity, this.engine);
                    this._renderPreview();
                    this._scheduleSave();
                }
                break;
        }
    }

    _onDoubleClick(e) {
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

        const setName = e.target.closest('.set-name');
        if (setName) {
            const set = this.randomizer.getSet(setName.closest('.set-card').dataset.setId);
            const newName = set && prompt('Set name:', set.name);
            if (newName?.trim()) {
                set.name = newName.trim();
                this.renderRandomizer();
                this._scheduleSave();
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

        if (el.classList.contains('set-selector')) {
            this.selectedSetId = el.value || null;
            this.renderRandomizer();
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

        if (el.closest('.set-uniform-row')) {
            this._updateSetUniformField(el);
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
        if (el.matches('.set-uniform-row .min, .set-uniform-row .max')) {
            el.classList.toggle('invalid', parseRangeInput(el.value) === undefined);
        }
    }

    _updateSetUniformField(el) {
        const set = this.randomizer.getSet(el.dataset.setId);
        const index = parseInt(el.dataset.index, 10);
        if (!set?.uniforms[index]) return;

        if (el.classList.contains('name')) {
            const name = el.value.trim();
            set.updateUniform(index, {name});
            // Placeholders show the control's range; update them in place to keep focus/tab order.
            const range = this.randomizer.getControlRange(name);
            const row = el.closest('.set-uniform-row');
            row.querySelector('.min').placeholder = formatRange(range.min);
            row.querySelector('.max').placeholder = formatRange(range.max);
        } else {
            const value = parseRangeInput(el.value);
            el.classList.toggle('invalid', value === undefined);
            if (value === undefined) return;
            set.updateUniform(index, {[el.classList.contains('min') ? 'min' : 'max']: value});
        }
        this._scheduleSave();
    }

    // ─── Actions ────────────────────────────────────────────────

    togglePlaying() {
        this.engine.playing = !this.engine.playing;
        this._syncPlayButton();
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
        this.randomizer.clearCustomSets();
        this.selectedKeyframe = null;
        this.collapsedTrackIds.clear();
        this.selectedSetId = null;
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
            localStorage.removeItem(LEGACY_RANDOMIZER_KEY);
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
                selectedSetId: this.selectedSetId,
                intensity: this.intensity,
                customSets: this.randomizer.toJSON(),
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

        this.randomizer.loadJSON(state.randomizer?.customSets);
        this.selectedSetId = state.randomizer?.selectedSetId ?? null;
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

    // ─── Rendering ──────────────────────────────────────────────

    _timelineSpan() {
        return Math.max(MIN_TIMELINE_SPAN, ...this.engine.getAllTracks().map(t => t.duration));
    }

    _percentOfSpan(time) {
        // Inset by half a keyframe dot so dots at the ends are not clipped.
        const fraction = Math.min(1, Math.max(0, time / this._timelineSpan()));
        return `calc(0.5em + (100% - 1em) * ${fraction})`;
    }

    _syncPlayButton() {
        this.ui.playBtn.textContent = this.engine.playing ? '⏸' : '▶';
        this.ui.playBtn.classList.toggle('active', this.engine.playing);
    }

    syncUI() {
        this.ui.timeSlider.max = this._timelineSpan();
        this.ui.timeSlider.value = this.engine.currentTime;
        this.ui.timeDisplay.textContent = `${this.engine.currentTime.toFixed(1)}s`;
        this.ui.speedInput.value = this.engine.speed;
        this.ui.intensitySlider.value = this.intensity;
        this.ui.intensityValue.textContent = this.intensity.toFixed(2);
        this._syncPlayButton();
    }

    render() {
        const {trackList} = this.ui;
        trackList.innerHTML = '';
        this.ui.timeSlider.max = this._timelineSpan();

        for (const track of this.engine.getAllTracks()) {
            const id = escapeHtml(track.id);
            const trackEl = document.createElement('div');
            trackEl.className = 'track-item' + (this.collapsedTrackIds.has(track.id) ? ' collapsed' : '');
            trackEl.dataset.trackId = track.id;

            const targetRows = track.targets.map((target, i) => `
                <div class="target-row">
                    <span class="target-name" data-track-id="${id}" data-target-idx="${i}"
                          title="Double-click to rename">${escapeHtml(target.uniformName)}</span>
                    <div class="target-inputs">
                        <input type="number" class="field num target-min" data-track-id="${id}" data-target-idx="${i}"
                               value="${target.minValue}" step="0.01" title="Min value">
                        <span class="target-arrow">→</span>
                        <input type="number" class="field num target-max" data-track-id="${id}" data-target-idx="${i}"
                               value="${target.maxValue}" step="0.01" title="Max value">
                    </div>
                    <input type="checkbox" class="target-enable" data-track-id="${id}" data-target-idx="${i}"
                           ${target.enabled ? 'checked' : ''} title="Enable/disable">
                    <button type="button" class="btn icon subtle" data-action="remove-target"
                            data-track-id="${id}" data-target-idx="${i}" title="Remove target">×</button>
                </div>
            `).join('');

            const dots = track.keyframes.map((kf, i) => {
                const selected = this.selectedKeyframe?.trackId === track.id && this.selectedKeyframe.kfIndex === i;
                const title = escapeHtml(`t=${kf.time.toFixed(1)}s, val=${kf.value}, ${kf.transition}`);
                return `<div class="keyframe-dot${selected ? ' selected' : ''}" data-track-id="${id}"
                             data-kf-index="${i}" style="left:${this._percentOfSpan(kf.time)}" title="${title}"></div>`;
            }).join('');

            trackEl.innerHTML = `
                <div class="track-header">
                    <span class="track-name">${escapeHtml(track.name)}</span>
                    <div class="track-toggle ${track.targets.some(t => t.enabled) ? 'active' : ''}"></div>
                </div>
                <div class="track-body">
                    ${targetRows}
                    <div class="keyframe-strip" data-track-id="${id}" title="Click to add a keyframe">
                        <div class="strip-bg"></div>
                        ${dots}
                        <div class="playhead" style="left:${this._percentOfSpan(this.engine.currentTime)}"></div>
                    </div>
                    <div class="track-actions">
                        <button type="button" class="btn" data-action="add-target" data-track-id="${id}">+ Target</button>
                        <button type="button" class="btn grow" data-action="add-keyframe" data-track-id="${id}">+ Keyframe</button>
                        <button type="button" class="btn icon danger" data-action="delete-track" data-track-id="${id}"
                                title="Delete track">×</button>
                    </div>
                </div>
            `;
            trackList.appendChild(trackEl);
        }

        this._renderPlayback();
        this._scheduleSave();
    }

    /** Cheap per-frame update: time, playheads and value preview, without rebuilding inputs. */
    _renderPlayback() {
        const time = this.engine.currentTime;
        this.ui.timeSlider.value = time;
        this.ui.timeDisplay.textContent = `${time.toFixed(1)}s`;
        const left = this._percentOfSpan(time);
        for (const playhead of this.ui.trackList.querySelectorAll('.playhead')) {
            playhead.style.left = left;
        }
        this._renderPreview();
    }

    _renderPreview() {
        const lines = Object.entries(this.engine.getAllUniformValues()).map(([name, val]) => {
            const displayVal = Array.isArray(val) ? `[${val.map(v => v.toFixed(3)).join(', ')}]` : val.toFixed(4);
            return `<div class="val-line"><span class="val-name">${escapeHtml(name)}</span><span class="val-num">${displayVal}</span></div>`;
        });
        this.ui.preview.innerHTML = lines.length > 0
            ? lines.join('')
            : '<div class="val-empty">No active tracks</div>';
    }

    renderRandomizer() {
        const {setSelector, setList, randomizeBtn, uniformNames} = this.ui;
        const {customSets, autoSets} = this.randomizer;

        if (!this.randomizer.getSet(this.selectedSetId)) {
            this.selectedSetId = customSets[0]?.id ?? autoSets[0]?.id ?? null;
        }

        // Set selector
        const options = (sets) => sets
            .map(set => `<option value="${escapeHtml(set.id)}">${escapeHtml(set.name)}</option>`)
            .join('');
        setSelector.innerHTML = [
            customSets.length ? `<optgroup label="Custom sets">${options(customSets)}</optgroup>` : '',
            autoSets.length ? `<optgroup label="From controls">${options(autoSets)}</optgroup>` : '',
            !customSets.length && !autoSets.length ? '<option value="">No sets – use “+ Set”</option>' : '',
        ].join('');
        setSelector.value = this.selectedSetId ?? '';
        randomizeBtn.disabled = !this.selectedSetId;

        // Uniform name suggestions
        uniformNames.innerHTML = this.randomizer.getKnownUniformNames()
            .map(name => `<option value="${escapeHtml(name)}"></option>`)
            .join('');

        // Custom set editors
        setList.innerHTML = customSets.map(set => {
            const setId = escapeHtml(set.id);
            const rows = set.uniforms.map((entry, index) => {
                const range = this.randomizer.getControlRange(entry.name);
                return `
                    <div class="set-uniform-row">
                        <input class="field name" list="${UNIFORM_DATALIST_ID}" placeholder="uniform"
                               value="${escapeHtml(entry.name)}" data-set-id="${setId}" data-index="${index}"
                               spellcheck="false" autocomplete="off">
                        <input class="field min" placeholder="${escapeHtml(formatRange(range.min))}"
                               value="${escapeHtml(formatRange(entry.min))}" data-set-id="${setId}" data-index="${index}"
                               title="Min overwrite (empty = control default)" inputmode="decimal">
                        <input class="field max" placeholder="${escapeHtml(formatRange(range.max))}"
                               value="${escapeHtml(formatRange(entry.max))}" data-set-id="${setId}" data-index="${index}"
                               title="Max overwrite (empty = control default)" inputmode="decimal">
                        <button type="button" class="btn icon subtle" data-action="remove-uniform"
                                data-set-id="${setId}" data-index="${index}" title="Remove uniform">×</button>
                    </div>
                `;
            }).join('');

            return `
                <div class="set-card${set.id === this.selectedSetId ? ' selected' : ''}" data-set-id="${setId}">
                    <div class="set-card-header" title="Click to select, double-click the name to rename">
                        <span class="set-name">${escapeHtml(set.name)}</span>
                        <span class="set-count">${set.uniforms.length}</span>
                        <button type="button" class="btn" data-action="add-uniform" data-set-id="${setId}">+ Uniform</button>
                        <button type="button" class="btn icon danger" data-action="remove-set" data-set-id="${setId}"
                                title="Delete set">×</button>
                    </div>
                    <div class="set-uniforms">${rows}</div>
                </div>
            `;
        }).join('');
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

    refreshRandomizerSets() {
        this.renderRandomizer();
    }
}

// ─── Singleton instance (optional convenience) ──────────────────

let _instance = null;

export function getTimelineOverlay(engine) {
    if (!_instance || _instance.engine !== engine) {
        _instance = new PlaygroundOverlay(engine);
    }
    return _instance;
}
