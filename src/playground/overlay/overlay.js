import {collectStorageJson, downloadJson, pickJsonFile, readStoredState} from "../persistence.js";
import {FALLBACK_RANGE, isRangeValue} from "../engine/valueRanges.js";
import {keyframeKey, parseKeyframeKey} from "../engine/keyframes.js";
import {ACTION, runAction} from "../actions.js";
import {CHAR, clamp, DEBUG, DELAY_MS, STORAGE_KEY} from "./index.js";
import {KeyframeBoxSelect} from "./boxSelect.js";
import {TimeZoomControl} from "./timeZoomControl.js";
import {ifValidTimeZoom, MIN_TIME_STEP, timelineSpan, visibleRange} from "../engine/timeZoom.js";
import {createPlaygroundOverlay} from "./dom/scaffold.js";
import {renderPlayback, renderPreview, renderTimeZoom,} from "./dom/timeline.js";
import {renderAllLanes, renderLane, stripFraction} from "./dom/lanes.js";
import {collectUniformComponents, renderUniformList, updateUniformRow} from "./dom/uniformList.js";
import {renderBatchList} from "./dom/batchList.js";
import {renderRandomizerPanel} from "./dom/randomizer.js";
import {positionKeyframePopup, renderKeyframePopup} from "./dom/keyframePopup.js";
import {renderAudioWaveforms} from "./dom/audioTrack.js";
import {intAttr, isTypingTarget, setShown} from "./dom/html.js";
import {formatNumber, formatRange, parseRangeInput} from "./format.js";
import {toggleTargetDropdown} from "./dom/targetSelector.js";

// Default audio file for development (Vite asset import).
// Place your audio file in the public/ directory and update the path below.
const DEFAULT_AUDIO_FILE =
    "/DreamySchilfester2024_3_2025-12-11_2128.ogg";


export class Overlay {
    constructor(contextProvider) {
        this.ctx = contextProvider;
        this.engine = contextProvider.engine;
        this.element = null;
        this.ui = null;

        this.batch = {
            selectedId: null,
            editingId: null
        };
        this.lane = {
            selectedId: null,
            renamingId: null,
            collapsedIds: new Set(),
            selectedKeyframes: new Set(),
        };
        this.randomize = {
            intensity: 1,
            batchId: null,
        }

        // Dragging the panel by its header; position is {left, top}.
        this.drag = {
            position: null,
            active: false,
            startX: 0,
            startY: 0,
            origLeft: 0,
            origTop: 0,
        };
        // Dragging a keyframe dot: {lane, kf, lockTime, moved}.
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
        // Copy/paste state for lane keyframes.
        this.clipboard = { lane: null };

        // for syncing state changes
        this._previously = {
            playing: false
        };
    }

    async init() {
        this.createDOM();
        this.bindEvents();
        this.restoreFromStorage();
        await this._loadDefaultAudio();
        this.syncUI();
        this.renderTimeline();
        this.renderRandomizer();
        this.renderUniformPanel();
    }

    createDOM() {
        const dom = createPlaygroundOverlay();
        this.element = dom.element;
        this.ui = dom.ui;
        this.ui.onSeek = (time) => this._seek(time);
        document.body.append(this.element);
    }

    /**
     * Load the default audio file if it exists.
     */
    async _loadDefaultAudio() {
        if (!DEFAULT_AUDIO_FILE) {
            return;
        }
        try {
            const response = await fetch(DEFAULT_AUDIO_FILE);
            if (!response.ok) {
                DEBUG.log("[AUDIO] Default audio file not found, skipping.");
                return;
            }
            const blob = await response.blob();
            const file = audioFile(blob, DEFAULT_AUDIO_FILE);
            const lane = await this.engine.loadAudioTrack(file);

            DEBUG.log("[AUDIO] Loaded default audio:", {file, lane});
        } catch (err) {
            console.warn("[AUDIO] Failed to load default audio:", err.message);
            console.error(err);
        }

        function audioFile(blob, filepath, fallbackType = "audio/ogg") {
            const filename = filepath.split("/").pop();
            const type = blob.type || fallbackType;
            return new File([blob], filename, {type});
        }
    }

    bindEvents() {
        const overlay = this.element;
        this._bindPanelDrag();
        this._bindKeyframeDrag();

        // Flush pending changes when the page goes away.
        window.addEventListener("pagehide", () => this.saveState());
        window.addEventListener("keydown", (e) => this._onGlobalKeyDown(e));

        overlay.addEventListener("click", (e) => this._onClick(e));
        overlay.addEventListener("dblclick", (e) => this._onDoubleClick(e));
        overlay.addEventListener("change", (e) => this._onChange(e));
        overlay.addEventListener("input", (e) => this._onInput(e));
        overlay.addEventListener("keydown", (e) => this._onKeyDown(e));
        overlay.addEventListener("focusout", (e) => this._onBlur(e), true);
        overlay.addEventListener("contextmenu", (e) => this._onContextMenu(e));
        overlay.addEventListener("mousemove", (e) => this._onTimelineMouseMove(e));

        this._boxSelect = new KeyframeBoxSelect(overlay, (selection) => {
            if (selection) {
                this.lane.selectedKeyframes = new Set(selection);
            }
            this.renderTimeline();
        });

        this._timeZoom = new TimeZoomControl(this.ui, {
            span: () => timelineSpan(this.engine),
            zoom: () => this.zoom,
            setZoom: (zoom) => this.setTimeZoom(zoom),
            seek: (time) => this._seek(time),
        });

        this._bindKeyframePopup();
    }

    _bindPanelDrag() {
        const overlay = this.element;
        const handle = overlay.querySelector("[data-drag-handle]");
        const drag = this.drag;

        handle.addEventListener("mousedown", (e) => {
            if (e.button !== 0 || e.target.closest("button")) {
                return;
            }
            const rect = overlay.getBoundingClientRect();
            drag.active = true;
            drag.startX = e.clientX;
            drag.startY = e.clientY;
            drag.origLeft = rect.left;
            drag.origTop = rect.top;
            overlay.classList.add("dragging");
            e.preventDefault();
        });

        window.addEventListener("mousemove", (e) => {
            if (!drag.active) {
                return;
            }
            this._applyPosition(
                drag.origLeft + e.clientX - drag.startX,
                drag.origTop + e.clientY - drag.startY,
            );
        });

        window.addEventListener("mouseup", () => {
            if (!drag.active) {
                return;
            }
            drag.active = false;
            overlay.classList.remove("dragging");
            this._scheduleSave();
        });

        // Keep a stored position reachable when the window shrinks.
        window.addEventListener("resize", () => {
            if (drag.position) {
                this._applyPosition(drag.position.left, drag.position.top);
            }
        });
    }

    _bindKeyframeDrag() {
        this.element.addEventListener("mousedown", (e) => {
            this._ignoreNextClick = false;
            this._onKeyframeMouseDown(e);
        });
        window.addEventListener("mousemove", (e) => this._onKeyframeDrag(e));
        window.addEventListener("mouseup", () => this._onKeyframeDragEnd());
    }

    _bindKeyframePopup() {
        const popup = this.ui.keyframePopup;
        popup.addEventListener("click", (e) => {
            if (e.target.classList.contains("kf-undo-btn")) {
                this._doUndo();
            } else if (e.target.classList.contains("kf-seek-btn")) {
                const kfId = popup.dataset.kfId;
                if (kfId) {
                    this._seekFromKeyframe(kfId);
                }
            } else if (e.target.classList.contains("kf-remove-btn")) {
                const kfId = popup.dataset.kfId;
                if (kfId) {
                    this._removeKeyframeFromKeyframePopup(kfId);
                }
            }
        });
        popup.querySelector(".kf-ease-select")
            .addEventListener("change", (e) => {
                this._editSelectedKeyframe(kf => {
                    kf.ease = e.target.value;
                });
            });
        popup.querySelector(".kf-current-val")
            .addEventListener("change", (e) => {
                const displayValue = parseFloat(e.target.value);
                if (isNaN(displayValue)) {
                    return;
                }
                this._editSelectedKeyframe(({lane, kf}) => {
                    kf.value = lane.normalizeToFirstTarget(displayValue);
                });
            });
    }

    // ─── Selection helpers ──────────────────────────────────────

    _selectedKeys() {
        return [...this.lane.selectedKeyframes].map(parseKeyframeKey);
    }

    _firstSelectedKey() {
        return this._selectedKeys()[0] ?? null;
    }

    _selection() {
        const first = this._firstSelectedKey();
        if (!first) {
            return null;
        }
        const lane = this.engine.getLane(first.laneId);
        const kf = lane?.findKeyframe(first.kfId);
        return kf ? {lane, kf} : null;
    }

    _selectOnly(laneId, kfId) {
        const selected = this.lane.selectedKeyframes;
        selected.clear();
        selected.add(keyframeKey(laneId, kfId));
    }

    /** Drops the selection of one lane, e.g. as its indices shifted. */
    _deselectTrack(laneId) {
        const selected = this.lane.selectedKeyframes;
        for (const key of [...selected]) {
            if (parseKeyframeKey(key).laneId === laneId) {
                selected.delete(key);
            }
        }
    }

    _editSelectedKeyframe(edit) {
        const selection = this._selection();
        if (selection) {
            edit(selection.kf);
            this.renderLane(selection.lane.id);
        }
    }

    /** Seek to a keyframe by ID (from context bar seek button). */
    _seekFromKeyframe(kfId) {
        // Find the keyframe in the selection or first selected.
        const first = this._firstSelectedKey();
        if (!first) return;
        const lane = this.engine.getLane(first.laneId);
        const kf = lane?.findKeyframe(kfId);
        if (kf) {
            this._seek(kf.time);
        }
    }

    /** Remove a keyframe by ID (from context bar remove button). */
    _removeKeyframeFromKeyframePopup(kfId) {
        const first = this._firstSelectedKey();
        if (!first) return;
        const lane = this.engine.getLane(first.laneId);
        if (lane?.findKeyframe(kfId)) {
            this._removeKeyframe(first.laneId, kfId);
        }
    }

    _selectLaneRow(row) {
        this.lane.selectedId = row.dataset.laneId;
        this.element.querySelectorAll(".lane-wrapper.selected")
            .forEach(el => el.classList.remove("selected"));
        row.classList.add("selected");
        this._scheduleSave();
    }

    _queryInLane(laneId, selector) {
        laneId = CSS.escape(laneId);
        return this.ui.laneRows.querySelector(
            `.lane-wrapper[data-lane-id="${laneId}"] ${selector}`
        );
    }

    // ─── Event handlers ─────────────────────────────────────────

    _onGlobalKeyDown(e) {
        if (isTypingTarget(e.target)) {
            return;
        }
        if (e.code === "Space") {
            e.preventDefault();
            this.togglePlaying();
        }
        if (e.code === "Delete") {
            this._deleteSelectedKeyframes();
        }
        // Ctrl+Z / Cmd+Z for undo on the selected lane
        if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
            e.preventDefault();
            this._doUndo();
        }
    }

    /** Deletes the selected keyframes on the first selected lane. */
    _deleteSelectedKeyframes() {
        const selection = this._selection();
        if (!selection) {
            return;
        }
        const lane = selection.lane;
        // Collect times first, removing shifts the indices.
        const times = this._selectedKeys()
            .filter(k => k.laneId === lane.id)
            .map(k => lane.findKeyframe(k.kfId)?.time)
            .filter(time => time !== undefined);
        for (const time of times) {
            lane.removeKeyframe(time);
        }
        this.lane.selectedKeyframes.clear();
        this.renderTimeline();
    }

    _updateUniform(name, value) {
        this.engine.setActualUniformValue(name, value);
        const range = this.ctx.getControl(name);
        updateUniformRow(this.element, name, value, range);
        this._renderPreview();
    }

    /** Right-click on a uniform row logs its data for debugging. */
    _onContextMenu(e) {
        const slider = e.target.closest(".uniform-slider");
        if (slider) {
            e.preventDefault();
            const name = slider.dataset.uniformName;
            const snapshot = this.engine.latestSnapshot;
            if (snapshot && name in snapshot) {
                this._updateUniform(name, snapshot[name]);
            }
            return;
        }
        const row = e.target.closest(".uniform-row");
        if (!row) {
            return;
        }
        e.preventDefault();

        const name =
            row.querySelector("[data-uniform-name]")
            ?.dataset.uniformName;
        if (!name) {
            return;
        }
        console.group(`Uniform: ${name}`);
        console.log("Entry:", this._findUniformEntry(name)
            ?? "(not in any batch)");
        console.log("Control Range:", this.ctx.getControl(name));
        console.groupEnd();
    }

    _onTimelineMouseMove(e) {
        const tooltip = this.ui.timelineTooltip;

        if (this._keyframeDrag) {
            const {kf, lane} = this._keyframeDrag;
            const value = lane.scaleToFirstTargetRange(kf.value);
            this._setTooltipText(kf.time, value);
            tooltip.classList.add("visible");
            return;
        }

        if (this.ui.onAudioTooltip?.(e)) {
            return;
        }

        const strip = e.target.closest(".keyframe-strip");
        if (!strip) {
            this._highlightValueLine(null);
            tooltip.classList.remove("visible");
            return;
        }

        const lane = this.engine.getLane(strip.dataset.laneId);
        const {time, value} = this._pointerOnStrip(strip, lane, e);
        const editorRect = this.element.getBoundingClientRect();
        this._setTooltipText(time, value);
        tooltip.style.left = `${e.clientX - editorRect.left + 12}px`;
        tooltip.style.top = `${e.clientY - editorRect.top - 28}px`;
        tooltip.classList.add("visible");

        // Use elementFromPoint to detect value-line under cursor
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const valueLine = el?.closest(".value-line");
        this._highlightValueLine(valueLine?.dataset.uniformName ?? null);
    }

    _pointerOnStrip(strip, lane, e) {
        const rect = strip.getBoundingClientRect();
        const yRatio = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
        const {start, end} = this._timeView();
        return {
            time: start + stripFraction(strip, e.clientX) * (end - start),
            value: 2 * yRatio - 1,
        };
    }

    _setTooltipText(time, value) {
        this.ui.timelineTooltip.innerHTML = [
            `t = ${time.toFixed(2).padStart(7)} s`,
            `y = ${formatNumber(value).padStart(7)}`
        ].join("<br>");
    }

    /** Prompt the user to edit a lane's range (min/max/default). */
    _promptRangeEdit(laneId, part, labelEl) {
        const lane = this.engine.getLane(laneId);
        if (!lane?.range) return;
        const current = lane.range[part];
        const str = prompt(`Enter new ${part} for lane "${lane.name}":`, current.toFixed(4));
        if (str === null) return;
        const val = parseFloat(str);
        if (isNaN(val)) return;
        // Enforce ordering: min < default < max.
        if (part === "min") {
            lane.range.min = Math.min(val, lane.range.default - 0.01);
        } else if (part === "max") {
            lane.range.max = Math.max(val, lane.range.default + 0.01);
        } else {
            lane.range.default = clamp(val, lane.range.min + 0.01, lane.range.max - 0.01);
        }
        this.renderTimeline();
        this._scheduleSave();
    }

    /** Show the lane options popup with rescale/shift sliders. */
    _showLaneOptions(laneId) {
        const lane = this.engine.getLane(laneId);
        if (!lane || !lane.keyframes.length) return;

        // Remove existing popup if any.
        this._hideLaneOptions();

        const popup = document.createElement("div");
        popup.className = "lane-options-popup";
        popup.innerHTML = `
            <div class="popup-title">Lane Options</div>
            <div class="popup-row">
                <span class="popup-label">Rescale values</span>
                <input class="popup-field" type="range" id="lane-rescale-val"
                       min="0" max="100" step="1" value="50">
                <span class="popup-value" id="lane-rescale-val-display">1.0</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Shift values</span>
                <input class="popup-field" type="range" id="lane-shift-val"
                       min="-1" max="1" step="0.01" value="0">
                <span class="popup-value" id="lane-shift-val-display">0.00</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Time range</span>
                <button class="popup-btn" id="lane-time-reset">Reset</button>
            </div>
            <div class="popup-row">
                <button class="popup-btn" id="lane-options-apply">Apply</button>
                <button class="popup-btn" id="lane-options-cancel">Cancel</button>
            </div>
        `;

        // Set slider ranges based on lane's value range.
        const {min, max} = lane.range;
        const shiftSlider = popup.querySelector("#lane-shift-val");
        shiftSlider.min = (-1 - min).toFixed(4);
        shiftSlider.max = (1 - max).toFixed(4);

        const applyBtn = popup.querySelector("#lane-options-apply");
        const cancelBtn = popup.querySelector("#lane-options-cancel");
        const timeResetBtn = popup.querySelector("#lane-time-reset");
        const rescaleValSlider = popup.querySelector("#lane-rescale-val");
        const shiftValDisplay = popup.querySelector("#lane-shift-val-display");
        const rescaleValDisplay = popup.querySelector("#lane-rescale-val-display");

        // Logarithmic scale: map 0-100 slider to 0.1-10 range.
        function sliderToRescale(val) {
            const t = val / 100;
            return 0.1 * Math.pow(100, t);
        }
        function rescaleToSlider(val) {
            if (val <= 0) return 0;
            return (Math.log(val / 0.1) / Math.log(100)) * 100;
        }
        // Initialize slider position.
        rescaleValSlider.value = rescaleToSlider(1);
        // Update display values on slider input.
        rescaleValSlider.addEventListener("input", () => {
            const val = sliderToRescale(parseFloat(rescaleValSlider.value));
            rescaleValDisplay.textContent = val.toFixed(1);
        });
        shiftSlider.addEventListener("input", () => {
            shiftValDisplay.textContent = parseFloat(shiftSlider.value).toFixed(2);
        });

        // Time range reset.
        timeResetBtn.addEventListener("click", () => {
            // Reset keyframe times to default [0, duration].
            const oldStart = lane.keyframes[0].time;
            const oldEnd = lane.keyframes[lane.keyframes.length - 1].time;
            const range = oldEnd - oldStart;
            if (range <= 0) return;
            for (const kf of lane.keyframes) {
                const t = (kf.time - oldStart) / range;
                kf.time = t * lane.duration;
            }
            lane.updateDuration();
            this.renderTimeline();
            this._scheduleSave();
        });

        // Apply changes to keyframes.
        applyBtn.addEventListener("click", () => {
            const rescaleFactor = sliderToRescale(parseFloat(rescaleValSlider.value));
            const shiftAmount = parseFloat(shiftSlider.value);
            for (const kf of lane.keyframes) {
                // Rescale value: map from [-1,1] to [min,max], apply rescale+shift, map back.
                const normalized = lane.normalizeToFirstTarget(kf.value);
                const rescaled = normalized * rescaleFactor;
                const shifted = clamp(rescaled + shiftAmount, -1, 1);
                kf.value = lane.scaleToFirstTargetRange(shifted);
            }
            lane.updateDuration();
            this.renderTimeline();
            this._hideLaneOptions();
            this._scheduleSave();
        });

        // Cancel: just close.
        cancelBtn.addEventListener("click", () => {
            this._hideLaneOptions();
        });

        // Store reference for cleanup.
        this._laneOptionsPopup = popup;

        // Position the popup near the lane actions.
        const laneWrapper = this.element.querySelector(`.lane-wrapper[data-lane-id="${laneId}"]`);
        const actionsCol = laneWrapper?.querySelector(".lane-actions-col");
        if (actionsCol) {
            const rect = actionsCol.getBoundingClientRect();
            popup.style.left = `${rect.right + 8 + window.scrollX}px`;
            popup.style.top = `${rect.top + window.scrollY}px`;
        }

        document.body.append(popup);
    }

    _hideLaneOptions() {
        this._laneOptionsPopup?.remove();
        this._laneOptionsPopup = null;
    }

    /** Re-reads the target rows; call after every lane render. */
    _refreshTargetRows() {
        this.render.targetRows = [
            ...this.ui.laneRows.querySelectorAll(".target-row")
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
            const selector = row.querySelector(".target-selector");
            row.classList.toggle(
                "highlighted", name !== null && selector?.value === name
            );
        }
    }

    _onKeyframeMouseDown(e) {
        if (e.button !== 0) {
            return;
        }
        const dot = e.target.closest(".keyframe-dot");
        if (!dot) {
            return;
        }
        e.stopPropagation();
        const lane = this.engine.getLane(dot.dataset.laneId);
        const kf = lane?.findKeyframe(dot.dataset.kfId);
        if (!kf) {
            return;
        }
        // The keyframe at t=0 may only move vertically.
        this._keyframeDrag = {lane, kf, lockTime: kf.time === 0, moved: false};
    }

    _onKeyframeDrag(e) {
        const drag = this._keyframeDrag;
        if (!drag) {
            return;
        }
        // Re-query, as every move replaces the row of the lane.
        const strip = this._queryInLane(drag.lane.id, ".keyframe-strip");
        if (!strip) {
            return;
        }
        const {time, value} = this._pointerOnStrip(strip, drag.lane, e);
        DEBUG.log("[DRAG]", time, value, drag.kf);
        if (!drag.lockTime) {
            drag.kf.time =
                this._timeBetweenNeighbours(drag.lane, drag.kf, time);
        }
        drag.kf.value = value;
        drag.moved = true;
        this.renderLane(drag.lane.id);
    }

    /** Keeps the keyframe order, so indices and curves stay valid. */
    _timeBetweenNeighbours(lane, kf, time) {
        const kfs = lane.keyframes;
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

        const actionData = e.target.closest("[data-action]")?.dataset;
        if (actionData) {
            runAction(this, actionData);
            this._scheduleSave();
            return;
        }

        const dot = e.target.closest(".keyframe-dot");
        if (dot) {
            this._onKeyframeDotClick(dot, e);
            return;
        }

        const strip = e.target.closest(".keyframe-strip");
        if (strip) {
            this._addKeyframeAtPointer(strip, e);
            this._removeKeyframePopups();
            return;
        }

        const laneName = e.target.closest(".lane-name");
        if (laneName) {
            const row = laneName.closest(".lane-wrapper");
            this._ifSingleClick(() => this._selectLaneRow(row));
            return;
        }

        const laneWidget = e.target.closest(".lane-widget");
        if (laneWidget) {
            this._selectLaneRow(laneWidget.closest(".lane-wrapper"));
            return;
        }

        const batchHeader = e.target.closest(".batch-card-header");
        if (batchHeader) {
            const {batchId} = batchHeader.closest(".batch-card").dataset;
            this._ifSingleClick(() => {
                this.batch.selectedId = batchId;
                this.updateOnTargetsChanged();
            });
            return;
        }

        const targetSelector = e.target.closest(
            ".target-selector > .selector-display"
        );
        if (targetSelector) {
            toggleTargetDropdown(
                targetSelector, this.ui.randomize.targetDropdown
            );
            return;
        }

        const selectorItem = e.target.closest(".selector-item");
        if (selectorItem) {
            this.batch.selectedId = selectorItem.dataset.targetId || null;
            this.updateOnTargetsChanged();
            return;
        }

        if (!e.target.closest(".target-selector")) {
            this.ui.randomize.targetDropdown.hidden = true;
        }

        e.target.closest(".uniform-group-header")
            ?.classList.toggle("collapsed");

        // Handle clicks on range labels (min/max/default).
        const rangeLabel = e.target.closest(".range-label[data-range-part]");
        if (rangeLabel) {
            const laneId = rangeLabel.closest(".keyframe-strip")?.dataset.laneId;
            const part = rangeLabel.dataset.rangePart;
            if (laneId && part) {
                this._promptRangeEdit(laneId, part, rangeLabel);
            }
            return;
        }
    }

    _onKeyframeDotClick(dot, e) {
        const mode = {
            toggle: e.shiftKey,
            range: e.ctrlKey || e.metaKey
        };
        const laneId = dot.dataset.laneId;
        const kfId = dot.dataset.kfId;
        const key = keyframeKey(laneId, kfId);
        const selected = this.lane.selectedKeyframes;

        if (mode.toggle) {
            this._selectRange(laneId, kfId);
        } else if (mode.range) {
            if (selected.has(key)) {
                selected.delete(key);
            } else {
                selected.add(key);
            }
        } else {
            this._selectOnly(laneId, kfId);
        }

        this._debugKeyFrames(laneId);

        // Selection may change on several tracks, so render them all.
        this.renderTimeline();
    }

    _debugKeyFrames(laneId) {
        const lane = this.engine.getLane(laneId);
        console.group("[KEYFRAMES] on Track", laneId, lane, " - Keyframes:");
        console.table(lane.keyframes);
        console.log("Selected:", this.lane.selectedKeyframes);
        console.groupEnd();
    }

    _addKeyframe(lane, time, value) {
        const lengthBefore = lane.keyframes.length;
        if (lengthBefore === 0 && time > MIN_TIME_STEP) {
            lane.addKeyframe(0, 0);
        }
        const kf = lane.addKeyframe(time, value);
        this.lane.selectedKeyframes.clear();
        this.lane.selectedKeyframes.add(
            keyframeKey(lane.id, kf.id)
        );
        this.renderLane(lane.id);
    }

    _addKeyframeAtPointer(strip, e) {
        const lane = this.engine.getLane(strip.dataset.laneId);
        if (!lane) {
            return;
        }
        const {time, value} = this._pointerOnStrip(strip, lane, e);
        this._addKeyframe(lane, time, value);
    }

    _onDoubleClick(e) {
        this._resetClickTimer();

        const dot = e.target.closest(".keyframe-dot");
        if (dot) {
            this._focusKeyframeValue(dot);
            return;
        }

        const slider = e.target.closest(".uniform-slider");
        if (slider) {
            const name = slider.dataset.uniformName;
            const control = this.ctx.getControl(name);
            if (control?.defaultValue !== undefined) {
                this._updateUniform(name, control.defaultValue);
            }
            return;
        }

        if (e.target.closest("button, input")) {
            return;
        }

        const laneName = e.target.closest(".lane-name");
        if (laneName) {
            const id = laneName.closest(".lane-wrapper").dataset.laneId;
            requestAnimationFrame(() => {
                this.lane.renamingId = id;
                this.renderLane(id);
                this._focusName(".lane-wrapper", "lane-id", id);
            });
            return;
        }

        const batchHeader = e.target.closest(".batch-card-header");
        if (batchHeader) {
            const {batchId} = batchHeader.closest(".batch-card").dataset;
            this.batch.editingId = batchId;
            this.renderUniformPanel();
            requestAnimationFrame(() =>
                this._focusName(".batch-card", "batch-id", batchId)
            );
        }

        if (e.target.closest(".preview-btn")) {
            this._renderPreview({debug: true});
        }
    }

    _focusKeyframeValue(dot) {
        const {laneId} = dot.dataset;
        const kfId = dot.dataset.kfId;
        if (!this.engine.getLane(laneId)?.findKeyframe(kfId)) {
            return;
        }
        this.lane.selectedKeyframes.add(keyframeKey(laneId, kfId));
        this.renderTimeline();
        requestAnimationFrame(() => {
            const input = this.ui.keyframePopup.querySelector(".kf-current-val");
            input.focus();
            input.select();
        });
    }

    _selectRange(laneId, kfId) {
        if (!this.engine.getLane(laneId)) {
            return;
        }
        const first = this._firstSelectedKey();
        if (first?.laneId !== laneId) {
            this._selectOnly(laneId, kfId);
            return;
        }
        const lane = this.engine.getLane(laneId);
        const firstKf = lane.findKeyframe(first.kfId);
        const targetKf = lane.findKeyframe(kfId);
        if (!firstKf || !targetKf) {
            return;
        }
        const fromIdx = lane.keyframes.indexOf(firstKf);
        const toIdx = lane.keyframes.indexOf(targetKf);
        const from = Math.min(fromIdx, toIdx);
        const to = Math.max(fromIdx, toIdx);
        const selected = this.lane.selectedKeyframes;
        selected.clear();
        for (let i = from; i <= to; i++) {
            selected.add(keyframeKey(laneId, lane.keyframes[i].id));
        }
    }

    _removeKeyframe(laneId, kfId) {
        const lane = this.engine.getLane(laneId);
        const kf = lane?.findKeyframe(kfId);
        if (!kf) {
            return;
        }
        lane.removeKeyframe(kf.time);
        this._deselectTrack(laneId);
        this.renderLane(laneId);
    }

    _focusName(containerSelector, dataKey, id) {
        const dataAttr = `[data-${dataKey}="${CSS.escape(id)}"]`;
        this.element.querySelector(
            `${containerSelector}${dataAttr} .name`
        )?.focus();
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
        return el.classList.contains("name")
            && Boolean(this.lane.renamingId || this.batch.editingId);
    }

    _onKeyDown(e) {
        const el = e.target;
        if (this._isEditingName(el)) {
            if (e.code === "Enter") {
                this._commitNameEdit(el);
            } else if (e.code === "Escape") {
                this._cancelNameEdit();
            }
            return;
        }
        if (el.classList.contains("target-selector") && e.code === "Escape") {
            this._removeEmptyTarget(el);
        }
    }

    _onBlur(e) {
        const el = e.target;
        if (this._isEditingName(el)) {
            const cancelling = e.relatedTarget?.closest(
                `[data-action="${ACTION.CANCEL_LANE_NAME}"]`
            );
            if (!(this.lane.renamingId && cancelling)) {
                this._commitNameEdit(el);
            }
            return;
        }
        if (el.classList.contains("target-selector")) {
            this._removeEmptyTarget(el);
        }
    }

    /** Applies the inline-edited lane or batch name and leaves editing. */
    _commitNameEdit(input) {
        const name = input.value.trim();
        if (this.lane.renamingId) {
            const lane = this.engine.getLane(this.lane.renamingId);
            if (name && lane) {
                lane.name = name;
            }
            this._stopTrackNameEdit();
        } else if (this.batch.editingId) {
            const batch = this.ctx.getBatch(this.batch.editingId);
            if (name && batch) {
                batch.name = name;
            }
            this.batch.editingId = null;
            this.updateOnTargetsChanged();
        }
    }

    _cancelNameEdit() {
        if (this.lane.renamingId) {
            this._stopTrackNameEdit();
        } else if (this.batch.editingId) {
            this.batch.editingId = null;
            this.renderUniformPanel();
        }
    }

    _stopTrackNameEdit() {
        const laneId = this.lane.renamingId;
        // Cleared before rendering, so the blur of the replaced input
        // does not commit a second time.
        this.lane.renamingId = null;
        this.renderLane(laneId);
    }

    /** Removes a target whose name was cleared. */
    _removeEmptyTarget(input) {
        const lane = this.engine.getLane(input.dataset.laneId);
        // The trailing "add" row has no target object and is never removed.
        const target = lane?.targets[intAttr(input, "targetIdx")];
        if (target && !target.uniformName.trim()) {
            lane.removeTarget(target.uniformName);
            this.renderLane(lane.id);
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
        } else if (el.classList.contains("target-enable")) {
            const {laneId} = el.dataset;
            const targetIdx = intAttr(el, "targetIdx");
            const lane = this.engine.getLane(laneId);
            const target = lane?.targets[targetIdx];
            if (target) {
                const wasEnabled = target.enabled;
                target.enabled = el.checked;
                if (el.checked && !wasEnabled) {
                    this._resetTargetRange(lane, targetIdx, target);
                }
                this.renderLane(laneId);
            }
        } else if (el.closest(".batch-uniform-row")) {
            this._updateBatchUniformField(el);
        } else if (el.classList.contains("uniform-checkbox")) {
            this._toggleUniformInBatch(el.dataset.uniformName, el.checked);
        } else if (el.matches(".uniform-min, .uniform-max")) {
            this._setUniformOverwrite(
                el.dataset.uniformName,
                el.classList.contains("uniform-min") ? "min" : "max",
                parseRangeInput(el.value)
            );
        } else if (el === this.ui.timeSlider || el === this.ui.timeSubSlider) {
            sliderTooltip(el)?.classList.remove("dragging");
        } else if (el === this.ui.audioFileInput && el.files?.length) {
            const file = el.files[0];
            el.value = "";
            void this._loadAudioFile(file);
        }
    }

    _toggleUniformInBatch(name, active) {
        // While editing a batch, edit that one instead of the selected.
        const batch = this.ctx.getBatch(
            this.batch.editingId || this.batch.selectedId
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
                tooltip.textContent = time.toFixed(1) + "\u2009s";
                tooltip.classList.add("dragging");
            }
        } else if (el === this.ui.randomize.intensitySlider) {
            this.randomize.intensity = parseFloat(el.value);
            this.ui.randomize.intensityValue.textContent =
                this.randomize.intensity.toFixed(2);
            this._scheduleSave();
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
            const normalized = collectUniformComponents(name, el);
            const range = this.ctx.getControl(name);
            const value = Array.isArray(normalized)
                ? normalized.map((v, i) => {
                    const min = Array.isArray(range.min) ? range.min[i] : range.min;
                    const max = Array.isArray(range.max) ? range.max[i] : range.max;
                    return min + (v + 1) * (max - min) / 2;
                })
                : range.min + (normalized + 1) * (range.max - range.min) / 2;
            this.engine.setActualUniformValue(name, value);
            const tooltip = sliderTooltip(el);
            if (tooltip) {
                tooltip.textContent = formatNumber(value);
            }
            this._renderPreview();
        } else if (el.classList.contains("target-selector")) {
            this._onTargetNameInput(el);
        }
    }

    _onTargetNameInput(input) {
        const {laneId} = input.dataset;
        const targetIdx = intAttr(input, "targetIdx");
        const lane = this.engine.getLane(laneId);
        if (!lane) {
            return;
        }
        const newName = input.value.trim();

        // Typing into the trailing "add" row creates a real target.
        if (newName && targetIdx === lane.targets.length) {
            const control = this.ctx.getControl(newName);
            lane.addTarget(newName, undefined, undefined, control);
            this.renderLane(laneId);
            this._refocusTargetSelector(laneId, targetIdx);
            return;
        }

        const target = lane.targets[targetIdx];
        if (!target || newName === target.uniformName) {
            return;
        }
        if (target.uniformName) {
            lane.removeTarget(target.uniformName);
        }
        target.uniformName = newName;
        DEBUG.log("[TARGET INPUT]", {lane, targetIdx, target});
        this._resetTargetRange(lane, targetIdx, target);
        this._scheduleSave();
    }

    /** Puts the caret back into a target input after a re-render. */
    _refocusTargetSelector(laneId, targetIdx) {
        const input = this._queryInLane(
            laneId, `.target-selector[data-target-idx="${targetIdx}"]`
        );
        if (input) {
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
        }
    }

    /** Scalar control ranges are taken over, vectors use -1..1. */
    _resetTargetRange(lane, targetIdx, target) {
        const range = target.uniformName
            ? this.ctx.getControl(target.uniformName)
            : FALLBACK_RANGE;
        const scalarOr = (value, fallback) =>
            Array.isArray(value) ? fallback : value;
        target.minValue = scalarOr(range.min, FALLBACK_RANGE.min);
        target.maxValue = scalarOr(range.max, FALLBACK_RANGE.max);
        // Update lane range if it's still at fallback.
        if (lane.range.min === FALLBACK_RANGE.min && lane.range.max === FALLBACK_RANGE.max
            && lane.targets.length === 1 && targetIdx === 0) {
            lane.initRangeFromControl(target.uniformName ? this.ctx.getControl(target.uniformName) : null);
        }
    }

    _updateBatchUniformField(el) {
        const batch = this.ctx.getBatch(el.dataset.batchId);
        const index = intAttr(el, "index");
        if (!batch?.uniforms[index]) {
            return;
        }

        if (el.classList.contains("name")) {
            const name = el.value.trim();
            batch.updateUniform(index, {name});
            // Update the range placeholders in place to keep the focus.
            const range = this.ctx.getControl(name);
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
        this._scheduleSave();
    }

    togglePlaying() {
        const wasPlaying = this.engine.playing();
        this.engine.setPlaying(!wasPlaying);
        this._syncPlayButton();
        if (wasPlaying) {
            this._renderPlayback();
        }
    }

    _syncPlayButton() {
        const {playBtn} = this.ui;
        const playing = this.engine.playing();
        playBtn.textContent = playing ? CHAR.PAUSE : CHAR.PLAY;
        playBtn.title = playing ? "Pause" : "Play";
    }

    _doUndo() {
        const first = this._firstSelectedKey();
        if (this.engine.getLane(first?.laneId)?.undo()) {
            this.renderLane(first.laneId);
        }
    }

    _positionKeyframePopup() {
        const selection = this._selection();
        renderKeyframePopup(
            this.ui.keyframePopup,
            selection?.kf,
            selection?.lane,
            selection && this._neighbours(selection),
        );
        const anchor = selection && this._keyframePopupAnchor();
        if (anchor) {
            positionKeyframePopup(this.ui.keyframePopup, anchor);
        }
    }

    /** Rect of the first selected dot, else the playhead on the first strip. */
    _keyframePopupAnchor() {
        const first = this._firstSelectedKey();
        if (!first) {
            return null;
        }
        const dot = this._queryInLane(
            first.laneId, `.keyframe-dot[data-kf-id="${first.kfId}"]`
        );
        if (dot) {
            return dot.getBoundingClientRect();
        }
        const strip = this.ui.laneRows.querySelector(".keyframe-strip");
        if (!strip) {
            return null;
        }
        const rect = strip.getBoundingClientRect();
        const {start, end} = this._timeView();
        const fraction = (this.engine.time() - start) / (end - start);
        return {
            left: rect.left + rect.width * fraction,
            width: 0,
            bottom: rect.bottom,
        };
    }

    _neighbours({lane, index}) {
        return {
            prev: lane.keyframes[index - 1] ?? null,
            next: lane.keyframes[index + 1] ?? null,
        };
    }

    _exportTimeline() {
        downloadJson(this.engine.toJSON(), "timeline.json");
    }

    _importTimeline() {
        // TODO: never tested; do that... one day.
        pickJsonFile()
            .then(json => {
                // Load into the existing engine so references stay valid.
                this.engine.loadTimelineFromJSON(json);
                this.lane.selectedKeyframes.clear();
                this.syncUI();
                this.renderTimeline();
            })
            .catch(err => alert(`Invalid timeline file: ${err.message}`));
    }

    async _loadAudioFile(file) {
        try {
            await this.engine.loadAudioTrack(file);
            const audioTracks = this.engine.getAllAudioTracks();
            if (audioTracks.length > 0) {
                const maxDuration = Math.max(
                    ...audioTracks.map(t => t.duration)
                );
                const currentEnd = parseFloat(this.ui.timeEnd.value);
                if (maxDuration > currentEnd) {
                    this.ui.timeEnd.value = maxDuration.toFixed(2);
                    this._timeZoom.applyTypedRange(
                        parseFloat(this.ui.timeStart.value),
                        maxDuration
                    );
                }
            }
            this.renderTimeline();
        } catch (err) {
            alert(`Failed to load audio: ${err.message}`);
        }
    }

    reset() {
        this._cancelPendingSave();

        this.engine.reset();
        this.lane.selectedKeyframes.clear();
        this.lane.collapsedIds.clear();
        this.batch.selectedId = null;
        this.randomize.intensity = 1;
        this.zoom = null;
        this.drag.position = null;
        this.element.style.left = "";
        this.element.style.top = "";
        this.element.classList.remove("collapsed", "selected");

        this.syncUI();
        this.renderTimeline();
        this.renderRandomizer();
        this.renderUniformPanel();

        // The renders above schedule a save; drop it before clearing.
        this._cancelPendingSave();
        try {
            localStorage.removeItem(STORAGE_KEY.PLAYGROUND_OVERLAY);
        } catch (error) {
            console.warn("Failed to clear the playground overlay state:",
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
            console.warn("Overlay failed saveState()", error);
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

    restoreFromStorage() {
        const stored = readStoredState();
        if (!stored) {
            return;
        }
        if (stored.timeline) {
            this.engine.loadTimelineFromJSON(stored.timeline);
        }
        for (const [name, value] of Object.entries(stored.overrides ?? {})) {
            if (isRangeValue(value)) {
                this.engine.setUniformOverride(name, value);
            }
        }
        this.ctx.loadCustomBatches(stored.customBatches);
        this.batch.selectedId = stored.selectedBatchId ?? null;
        this.randomize.batchId = stored.randomBatchId ?? null;
        const intensity = Number(stored.randomIntensity);
        this.randomize.intensity = Number.isFinite(intensity)
            ? clamp(intensity, 0, 1)
            : 1;
        this.lane.selectedId = stored.selectedLaneId ?? null;
        this.lane.collapsedIds = new Set(stored.collapsedTracks ?? []);
        this.zoom = ifValidTimeZoom(stored.zoom);
        this.element.classList.toggle("collapsed", Boolean(stored.collapsed));

        const {left, top} = stored.position ?? {};
        if (Number.isFinite(left) && Number.isFinite(top)) {
            this._applyPosition(left, top);
        }
    }

    _applyPosition(left, top) {
        const rect = this.element.getBoundingClientRect();
        const headerHeight =
            this.element.querySelector(".panel-header")
                ?.offsetHeight || 32;
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
        this.ui.timeSlider.value = this.engine.time();
        this._syncPlayButton();
        this.ui.randomize.intensitySlider.value = this.randomize.intensity;
        this.ui.randomize.intensityValue.textContent = this.randomize.intensity.toFixed(2);
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
        this.engine.setTime(time);
        this._renderPlayback();
        this._scheduleSave();
    }

    // ─── Rendering ──────────────────────────────────────────────

    renderTimeline() {
        this.render.renderedSpan = timelineSpan(this.engine);
        renderTimeZoom(this.ui, this.render.renderedSpan, this.zoom);
        renderAllLanes(this.ui, this.ctx, ...this._lanesRenderState());
        this._refreshTargetRows();
        this._renderPlayback();
        const view = visibleRange(this.zoom, this.render.renderedSpan);
        renderAudioWaveforms(this.ui, this.engine, view);
        this._renderPreview();
        this._positionKeyframePopup();
        this._scheduleSave();
    }

    /**
     * Re-renders only the row of one lane, e.g. after editing its
     * keyframes or targets. Falls back to renderTimeline() if the row
     * is missing or the timeline span changed, as that rescales all rows.
     */
    renderLane(laneId) {
        const replaced =
            timelineSpan(this.engine) === this.render.renderedSpan
            && renderLane(
                this.ui, this.ctx, laneId, ...this._lanesRenderState()
            );
        if (!replaced) {
            this.renderTimeline();
            return;
        }
        this._refreshTargetRows();
        this._renderPreview();
        this._positionKeyframePopup();
        this._scheduleSave();
    }

    _lanesRenderState() {
        return [
            this.lane.selectedId,
            this.lane.renamingId,
            this.lane.collapsedIds,
            this.lane.selectedKeyframes,
            this._timeView()
        ];
    }

    _renderPreview(opts) {
        renderPreview(this.ui, this.engine, opts);
    }

    _renderPlayback() {
        renderPlayback(this.ui, this.engine, this._timeView());
    }

    renderRandomizer() {
        const {selectedBatchId} = renderRandomizerPanel(
            this.ui, this.ctx, this.randomize.batchId
        );
        this.randomize.batchId = selectedBatchId;
    }

    renderUniformPanel() {
        const {ui, ctx} = this;
        renderBatchList(ui, ctx, this.batch);
        renderUniformList(ui, ctx, this.batch);

        this.element.querySelectorAll(
            `button[data-action="${ACTION.DESELECT_BATCHES}"]`
        ).forEach(button =>
            setShown(button, !!this.batch.selectedId)
        );
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
        const playing = this.engine.playing();
        if (playing) {
            this._renderPlayback();
            // this._scheduleSave();
        }
        if (playing !== this._previously.playing) {
            this._syncPlayButton();
            this._previously.playing = playing;
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
    slider.parentElement.querySelector(".slider-tooltip");
