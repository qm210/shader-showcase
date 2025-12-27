import {executeAndMaybeMeasureMilliseconds} from "./measuring.js";

/**
 * This is our basic structure to call a render function repeatedly
 * and have the time value displayed on our main page
 *
 * in general, your render Function should
 *  - call useProgram()
 *  - set uniforms
 *  - call a drawing function like drawArrays()
 *
 *  this does not support advanced stuff like custom framebuffers etc. yet
 *
 * @param renderFunction - pass your actual render function
 * @param state
 * @param elements
 */


export function startRenderLoop(renderFunction, state, elements) {
    if (!state.program) {
        console.error("Cannot startRenderLoop() with errors-instead-of-a-program:", state.error);
        return;
    }
    cancelAnimationFrame(state.play.animationFrame);
    state.play.running ??= true;
    state.iFrame = -1;
    state.play.previousTimestamp = null;
    state.play.dt = 0;
    state.play.fps = null;
    state.play.signal.reset = false;
    state.play.signal.stop = false;
    state.play.signal.reachedStop = false;
    state.play.signal.takeRenderTime = false;

    function actuallyStartRendering() {
        const clock =
            state.track?.useAsTimer
                ? moveInTime.byAudio
                : moveInTime.byAnimation;
        state.play.animate = (timestamp) => {
            runLoop(renderFunction, clock, state, elements, timestamp);
        };
        state.play.animationFrame = requestAnimationFrame(state.play.animate);
    }

    // TODO: merge all this logic into the state.track
    // that should even exist as some facade in no-track-states.
    if (!state.track || state.track.disabled) {
        actuallyStartRendering();
        return;
    }
    state.track.useAsTimer = true;
    state.track.actions.initialize(state.play)
        .catch(() => {
            state.track.useAsTimer = false;
        })
        .finally(actuallyStartRendering);
}

const moveInTime = {
    byAnimation: (state, timestamp) => {
        state.play.dt = 0.001 * (timestamp - state.play.previousTimestamp);
    },
    byAudio: (state, timestamp) => {
        state.play.dt = state.track.audio.currentTime - state.time;
        state.play.running = state.track.is.playing();
    }
};

function runLoop(renderFunction, clock, state, elements, timestamp) {
    advanceTime(clock, state, timestamp);
    renderAndFinalizeLoop(renderFunction, state, elements);
}

function advanceTime(moveTimestep, state, timestamp) {
    if (state.play.signal.reset) {
        resetLoop(state);
        return;
    }

    state.iFrame = state.iFrame + 1;

    if (state.play.previousTimestamp === null) {
        state.play.previousTimestamp = timestamp;
    }
    if (!state.play.running) {
        state.play.dt = 0;
        return;
    }

    moveTimestep(state, timestamp);
    state.time += state.play.dt;

    doFpsMeasurement(state);

    if (state.play.loop.active && !state.track.useAsTimer) {
        // TODO: handle unified like the "moveTimestep" clock, not asking about useAsTimer...
        const lastSecond = state.play.loop.end ?? state.play.range.max;
        if (state.time >= lastSecond) {
            state.play.actions.jump({
                to: state.play.loop.start ?? 0
            });
        }
    }

    state.play.previousTimestamp = timestamp;
    state.play.rememberedTime = state.time;
}

function renderAndFinalizeLoop(renderFunction, state, elements) {
    executeAndMaybeMeasureMilliseconds(
        () => renderFunction(state),
        state.play.signal.takeRenderTime,
    );
    state.play.signal.takeRenderTime = false;

    elements.controlBar.time.update();
    elements.fps.display.textContent = state.play.fps;

    if (state.play.signal.stop) {
        state.play.reachedStop = true;
        resetFpsMeasurement(state);
        return;
    }

    requestAnimationFrame(state.play.animate);
}

export function resetLoop(state) {
    state.play.previousTimestamp = null;
    state.play.signal.reset = false;
    state.play.signal.stop = false;
    state.play.reachedStop = false;
    state.play.running = true;
    state.time = 0;
    state.iFrame = -1;

    if (state.track) {
        state.track.actions.seek(0);
    }
}

const createFpsAverager = (sampleSize) => ({
    samples: Array(sampleSize).fill(0),
    index: 0,
    taken: 0,
    sum: 0,
    fps: null,
});

const fpsMeter = {
    current: null,
    last: {
        time: null,
        frame: null,
    },
    avg: createFpsAverager(100)
};

function resetFpsMeasurement(state) {
    state.play.fps = null;
    fpsMeter.last = {
        time: null,
        frame: null,
    };
    fpsMeter.avg = createFpsAverager(fpsMeter.avg.samples.length);
}

function doFpsMeasurement(state) {
    const dt = fpsMeter.last.time === null ? 0
        : state.time - fpsMeter.last.time;
    if (dt > 0) {
        fpsMeter.current = (state.iFrame - fpsMeter.last.frame) / dt;
        fpsMeter.avg.sum -= fpsMeter.avg.samples[fpsMeter.avg.index];
        fpsMeter.avg.samples[fpsMeter.avg.index] = fpsMeter.current;
        fpsMeter.avg.sum += fpsMeter.current;
        if (fpsMeter.avg.taken < fpsMeter.avg.samples.length) {
            fpsMeter.avg.taken++;
        }
        fpsMeter.avg.index = (fpsMeter.avg.index + 1) % fpsMeter.avg.taken;
        fpsMeter.avg.fps = fpsMeter.avg.sum / fpsMeter.avg.taken;
        if (isNaN(fpsMeter.avg.fps)) {
            console.log("[FPS NAN?]", fpsMeter.avg, fpsMeter.last.time);
        } else if (!isFinite(fpsMeter.avg.fps)) {
            console.log("[FPS INF?]", fpsMeter);
        }
    }
    fpsMeter.last.time = state.time;
    fpsMeter.last.frame = state.iFrame;

    state.play.fps = (fpsMeter.avg.fps ?? fpsMeter.current)
        ?.toFixed(1) ?? "?";
}

export function whilePausingRendering(state, callFunction) {
    state.play.signal.stop = true;
    let safetyIndex = 0;
    while (!state.play.reachedStop) {
        safetyIndex++;
        if (safetyIndex > 10000) {
            console.error("whilePausingRendering() / runLoop() broken, Stop Signal never reached!");
            break;
        }
    }
    callFunction();
    const continueAt = 0.001 * performance.now();
    state.play.previousTimestamp += continueAt - state.time;
    state.play.signal.stop = state.play.reachedStop = false;
    state.animationFrame = requestAnimationFrame(state.play.animate);
}
