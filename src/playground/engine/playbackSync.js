/**
 * Synchronizes the PlaygroundEngine playback with the main page state.play.
 *
 * Two-way sync:
 *   - Main page play/pause/seek → overlay engine
 *   - Overlay play/pause/seek → main page state
 *
 * Usage:
 *   const sync = new PlaybackSync(mainState, engine);
 *   sync.connectOverlay(overlay);
 *   // Call sync.updateFromEngine() from overlay.update() if needed
 */

export class PlaybackSync {
    /**
     * @param {object} mainState - The main page state object (state.play, state.time)
     * @param {PlaygroundEngine} engine - The playground engine
     */
    constructor(mainState, engine) {
        this._mainState = mainState;
        this._engine = engine;
        this._overlay = null;
        this._lastEngineTime = 0;
        this._lastMainTime = 0;
        this._syncingFromMain = false;
        this._syncingFromOverlay = false;
    }

    /**
     * Connect to the overlay instance to intercept its time/playback changes.
     * @param {Overlay} overlay
     */
    connectOverlay(overlay) {
        this._overlay = overlay;
    }

    // ─── Main → Overlay ───────────────────────────────────────

    /**
     * Call when main page play/pause changes.
     */
    onMainPlayChanged() {
        if (this._syncingFromMain) return;
        this._syncingFromMain = true;
        this._engine.playing = Boolean(this._mainState.play.running);
        this._syncingFromMain = false;
    }

    /**
     * Call when main page time changes (seek).
     */
    onMainTimeChanged() {
        if (this._syncingFromMain) return;
        this._syncingFromMain = true;
        this._engine.currentTime = this._mainState.time;
        this._syncingFromMain = false;
    }

    /**
     * Call when main page loop state changes.
     */
    onMainLoopChanged() {
        // Loop state is per-track in the engine, not global.
        // The engine auto-loops tracks individually.
    }

    /**
     * Call when main page resets.
     */
    onMainReset() {
        if (this._syncingFromMain) return;
        this._syncingFromMain = true;
        this._engine.currentTime = 0;
        this._engine.playing = false;
        this._syncingFromMain = false;
    }

    // ─── Overlay → Main ──────────────────────────────────────

    /**
     * Call from overlay when user seeks via timeline/slider.
     */
    onOverlaySeek(time) {
        if (this._syncingFromOverlay) return;
        this._syncingFromOverlay = true;
        this._mainState.time = time;
        this._lastMainTime = time;
        this._syncingFromOverlay = false;
    }

    /**
     * Call from overlay when play/pause button is toggled.
     */
    onOverlayPlayToggled(playing) {
        if (this._syncingFromOverlay) return;
        this._syncingFromOverlay = true;
        this._mainState.play.running = playing;
        if (playing) {
            this._mainState.play.previousTimestamp = null;
        }
        this._syncingFromOverlay = false;
    }

    /**
     * Call from overlay when speed changes.
     */
    onOverlaySpeedChanged(speed) {
        // Main page doesn't have a speed control, but we store it on the engine.
    }

    // ─── Engine update hook ──────────────────────────────────

    /**
     * Call this from the overlay's update() loop to keep both sides in sync.
     * Handles:
     *   - Main play → overlay play
     *   - Main seek → overlay time
     *   - Overlay play → main play
     *   - Overlay seek → main time
     */
    updateFromEngine() {
        // Main → Overlay: play state
        if (!this._syncingFromOverlay &&
            this._mainState.play.running !== this._engine.playing) {
            this._syncingFromMain = true;
            this._engine.playing = this._mainState.play.running;
            this._syncingFromMain = false;
        }

        // Main → Overlay: time (only when main is not running, or significant drift)
        if (!this._syncingFromOverlay) {
            const mainTime = this._mainState.time;
            const engineTime = this._engine.currentTime;
            const mainRunning = this._mainState.play.running;

            // When main is paused, sync any seek changes
            // When main is running, only sync if drift is significant
            const drift = Math.abs(engineTime - mainTime);
            const shouldSync = !mainRunning || drift > 0.05;

            if (shouldSync && drift > 0.001) {
                this._syncingFromMain = true;
                this._engine.currentTime = mainTime;
                this._syncingFromMain = false;
            }
        }

        // Overlay → Main: time
        if (!this._syncingFromMain) {
            const engineTime = this._engine.currentTime;
            const mainTime = this._mainState.time;

            if (Math.abs(engineTime - mainTime) > 0.001) {
                this._syncingFromOverlay = true;
                this._mainState.time = engineTime;
                this._syncingFromOverlay = false;
            }
        }

        // Overlay → Main: play state
        if (!this._syncingFromMain &&
            this._engine.playing !== this._mainState.play.running) {
            this._syncingFromOverlay = true;
            this._mainState.play.running = this._engine.playing;
            if (this._engine.playing) {
                this._mainState.play.previousTimestamp = null;
            }
            this._syncingFromOverlay = false;
        }
    }

    // ─── Utility ─────────────────────────────────────────────

    /**
     * Force sync both directions to a target time.
     * @param {number} time
     * @param {boolean} [playing=false]
     */
    syncTo(time, playing = false) {
        this._syncingFromMain = true;
        this._engine.currentTime = time;
        this._engine.playing = playing;
        this._mainState.time = time;
        this._mainState.play.running = playing;
        this._mainState.play.previousTimestamp = null;
        this._syncingFromMain = false;
    }

    /**
     * Disconnect all handlers.
     */
    disconnect() {
        this._overlay = null;
    }
}
