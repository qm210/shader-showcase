import {collectStorageJson, downloadJson, pickJsonFile, readStoredState} from "../persistence.js";
import {isRangeValue} from "../engine/valueRanges.js";
import {ACTION, runAction} from "../actions.js";
import {CHAR, clamp, DEBUG, DELAY_MS, STORAGE_KEY} from "./index.js";
import {KeyframeBoxSelect} from "./boxSelect.js";
import {TimeZoomControl} from "./timeZoomControl.js";
import {ifValidTimeZoom, timelineSpan, visibleRange} from "../engine/timeZoom.js";
import {createPlaygroundOverlay} from "./dom/scaffold.js";
import {renderPlayback, renderPreview, renderTimeZoom,} from "./dom/timeline.js";
import {renderAllLanes, renderLane, stripFraction} from "./dom/lanes.js";
import {renderAudioWaveforms} from "./dom/audioTrack.js";
import {isTypingTarget, sibling} from "./dom/html.js";
import {openLaneOptions} from "./dom/laneOptions.js";
import {formatNumber} from "./format.js";
import {KeyframeEditor} from "./keyframeEditor.js";
import {UniformPanelController} from "./uniformPanel.js";
import {LaneTargetEditor} from "./laneTargets.js";
import {InlineRename} from "./inlineRename.js";

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
            renamingId: null
        };
        this.lane = {
            selectedId: null,
            renamingId: null,
            collapsedIds: new Set(),
            selectedKeyframes: new Set(),
        };
        this.randomize = {
            intensity: 1,
            targetId: null,
        };
        this.selectedUniforms = new Set();

        // Dragging the panel by its header; position is {left, top}.
        this.drag = {
            position: null,
            active: false,
            startX: 0,
            startY: 0,
            origLeft: 0,
            origTop: 0,
        };

        // Target rows of the rendered tracks, refreshed on every render.
        this.render = {
            targetRows: [],
            highlightedUniform: null,
            renderedSpan: null,
        };

        this.timers = {
            saveThrottle: null,
        };

        // Zoomed time window {start, end} of the timeline, or null.
        this.zoom = null;
        // Copy/paste state for lane keyframes.
        this.clipboard = { lane: null };

        // for syncing state changes
        this._previously = {
            playing: false
        };

        // Handle of the open lane options popup, or null.
        this._laneOptions = null;
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
        // Before the box select: the keyframe drag's mousedown must run first.
        this._createControllers();

        // Flush pending changes when the page goes away.
        window.addEventListener("pagehide", () => this.saveState());
        window.addEventListener("keydown", (e) => this._onGlobalKeyDown(e));

        overlay.addEventListener("click", (e) => this._onClick(e));
        overlay.addEventListener("dblclick", (e) => this._onDoubleClick(e));
        overlay.addEventListener("change", (e) => this._onChange(e));
        overlay.addEventListener("input", (e) => this._onInput(e));
        overlay.addEventListener("keydown", (e) => this._onKeyDown(e));
        overlay.addEventListener("focusout", (e) => this._onBlur(e), true);
        overlay.addEventListener("contextmenu",
            (e) => this.uniformPanel.handleContextMenu(e));
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
    }

    /** The state stays here (persistence reads it), the logic moves out. */
    _createControllers() {
        const getLane = (id) => this.engine.getLane(id);
        const getControl = (name) => this.ctx.getControl(name);
        const queryInLane =
            (laneId, selector) => this._queryInLane(laneId, selector);
        const renderLane = (id) => this.renderLane(id);
        const requestSave = () => this._scheduleSave();

        this.keyframes = new KeyframeEditor(
            {root: this.element, popup: this.ui.keyframePopup},
            {
                getLane,
                getSelectedKeys: () => this.lane.selectedKeyframes,
                queryInLane,
                firstStrip: () =>
                    this.ui.laneRows.querySelector(".keyframe-strip"),
                pointerOnStrip: (strip, e) => this._pointerOnStrip(strip, e),
                time: () => this.engine.time(),
                timeView: () => this._timeView(),
                seek: (time) => this._seek(time),
                renderLane,
                renderTimeline: () => this.renderTimeline(),
            }
        );

        this.rename = new InlineRename({
            lane: {
                trigger: ".lane-name",
                container: ".lane-wrapper",
                idKey: "laneId",
                getRenamingId: () => this.lane.renamingId,
                setRenamingId: (id) => { this.lane.renamingId = id; },
                get: getLane,
                render: renderLane,
                keepOnBlur: (related) => Boolean(related?.closest(
                    `[data-action="${ACTION.CANCEL_LANE_NAME}"]`
                )),
            },
            batch: {
                trigger: ".batch-card-header",
                container: ".batch-card",
                idKey: "batchId",
                getRenamingId: () => this.batch.renamingId,
                setRenamingId: (id) => { this.batch.renamingId = id; },
                get: (id) => this.ctx.getBatch(id),
                render: () => this.renderUniformPanel(),
                afterCommit: () => this.updateOnTargetsChanged(),
            },
        });

        this.uniformPanel = new UniformPanelController(
            {root: this.element, ui: this.ui},
            {
                ctx: this.ctx,
                engine: this.engine,
                batch: this.batch,
                randomize: this.randomize,
                getSelectedUniforms: () => this.selectedUniforms,
                ifSingleClick: (callback) =>
                    this.rename.ifSingleClick(callback),
                renderPreview: () => this._renderPreview(),
                onTargetsChanged: () => this.updateOnTargetsChanged(),
                requestSave,
            }
        );

        this.targets = new LaneTargetEditor({
            getLane, getControl, queryInLane, renderLane, requestSave,
        });
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
            this.keyframes.deleteSelected();
        }
        // Ctrl+Z / Cmd+Z for undo on the selected lane
        if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
            e.preventDefault();
            this.keyframes.undo();
        }
    }

    _onTimelineMouseMove(e) {
        const tooltip = this.ui.timelineTooltip;

        const drag = this.keyframes.dragging;
        if (drag) {
            const value = drag.lane.mapToRange(drag.kf.value);
            this._setTooltipText(drag.kf.time, value);
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

        const {time, value} = this._pointerOnStrip(strip, e);
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

    _pointerOnStrip(strip, e) {
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
        this.renderTimeline();
        this._scheduleSave();
    }

    /** Show the lane options popup with rescale/shift sliders. */
    _showLaneOptions(laneId) {
        const lane = this.engine.getLane(laneId);
        if (!lane?.keyframes.length) {
            return;
        }
        this._hideLaneOptions();
        const anchor = this._queryInLane(laneId, ".lane-actions-col");
        this._laneOptions = openLaneOptions(lane, anchor, {
            onChanged: () => {
                this.renderTimeline();
                this._scheduleSave();
            },
        });
    }

    _hideLaneOptions() {
        this._laneOptions?.close();
        this._laneOptions = null;
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

    _onClick(e) {
        if (this._boxSelect.active || this.keyframes.drag.consumeClick()) {
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
            this.keyframes.onDotClick(dot, e);
            return;
        }

        const strip = e.target.closest(".keyframe-strip");
        if (strip) {
            this.keyframes.addAtPointer(strip, e);
            return;
        }

        const laneName = e.target.closest(".lane-name");
        if (laneName) {
            const row = laneName.closest(".lane-wrapper");
            this.rename.ifSingleClick(() => this._selectLaneRow(row));
            return;
        }

        const laneWidget = e.target.closest(".lane-widget");
        if (laneWidget) {
            this._selectLaneRow(laneWidget.closest(".lane-wrapper"));
            return;
        }

        if (this.uniformPanel.handleClick(e)) {
            return;
        }

        // Handle clicks on range labels (min/max/default).
        const rangeLabel = e.target.closest(".range-label[data-range-part]");
        if (rangeLabel) {
            const laneId = rangeLabel.closest(".keyframe-strip")?.dataset.laneId;
            const part = rangeLabel.dataset.rangePart;
            if (laneId && part) {
                this._promptRangeEdit(laneId, part, rangeLabel);
            }
        }
    }

    _onDoubleClick(e) {
        this.rename.cancelSingleClick();

        const dot = e.target.closest(".keyframe-dot");
        if (dot) {
            this.keyframes.focusValue(dot);
            return;
        }
        if (this.uniformPanel.handleDoubleClick(e)) {
            return;
        }
        if (e.target.closest("button, input")) {
            return;
        }
        if (this.rename.handleDoubleClick(e)) {
            return;
        }
        if (e.target.closest(".preview-btn")) {
            this._renderPreview({debug: true});
        }
    }

    _onKeyDown(e) {
        if (!this.rename.handleKeyDown(e)) {
            this.targets.handleKeyDown(e);
        }
    }

    _onBlur(e) {
        if (!this.rename.handleBlur(e)) {
            this.targets.handleBlur(e);
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
            return;
        }
        if (this.targets.handleChange(e) || this.uniformPanel.handleChange(e)) {
            return;
        }
        if (el === this.ui.timeSlider || el === this.ui.timeSubSlider) {
            sibling(el, ".slider-tooltip")
                ?.classList.remove("dragging");
        } else if (el === this.ui.audioFileInput && el.files?.length) {
            const file = el.files[0];
            el.value = "";
            void this._loadAudioFile(file);
        }
    }

    _onInput(e) {
        const el = e.target;

        if (el === this.ui.timeSlider || el === this.ui.timeSubSlider) {
            const time = parseFloat(el.value);
            this._seek(time);
            const tooltip = sibling(el, ".slider-tooltip");
            if (tooltip) {
                tooltip.textContent = time.toFixed(1) + "\u2009s";
                tooltip.classList.add("dragging");
            }
            return;
        }
        if (!this.uniformPanel.handleInput(e)) {
            this.targets.handleInput(e);
        }
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
        this.selectedUniforms = new Set(
            stored.selectedUniforms ?? []
        );
        this.randomize.targetId = stored.randomBatchId ?? null;
        const intensity = Number(stored.randomIntensity);
        this.randomize.intensity = Number.isFinite(intensity)
            ? clamp(intensity, 0, 1)
            : 1;
        this.lane.selectedId = stored.selectedLaneId ?? null;
        this.lane.selectedKeyframes = new Set(
            stored.selectedKeyframes ?? []
        );
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
        this.keyframes.renderPopup();
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
        this.keyframes.renderPopup();
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
        this.uniformPanel.renderRandomizer();
    }

    renderUniformPanel() {
        this.uniformPanel.render();
    }

    updateOnTargetsChanged() {
        this.renderUniformPanel();
        this.renderTimeline();
        this.renderRandomizer();
        this._scheduleSave();
    }

    // ─── Old names, possibly called from actions.js ─────────────
    // Delete every forwarder that actions.js does not use.

    _deleteSelectedKeyframes() {
        this.keyframes.deleteSelected();
    }

    _removeKeyframe(laneId, kfId) {
        this.keyframes.remove(laneId, kfId);
    }

    _doUndo() {
        this.keyframes.undo();
    }

    _cancelNameEdit() {
        this.rename.cancel();
    }

    _stopTrackNameEdit() {
        this.rename.cancel("lane");
    }

    _updateUniform(name, value) {
        this.uniformPanel.updateUniform(name, value);
    }

    _toggleUniform(name, active) {
        this.uniformPanel.toggleUniform(name, active);
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
