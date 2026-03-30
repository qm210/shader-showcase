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

export function resetRenderLoop(renderFunction, state, elements) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
    state.startTime = null;
    state.timeRunning = true;
    state.deltaTime = 0;
    state.iFrame ??= -1;
    state.resetSignal = false;
    state.stopSignal = false;
    state.stopReached = false;
    state.debugSignal = false;
    state.fps = null;
    state.animation = (timestamp) =>
        runLoop(renderFunction, state, elements, timestamp);
}

export function startRenderLoop(renderFunction, state, elements) {
    resetRenderLoop(renderFunction, state, elements);
    state.animationFrame = requestAnimationFrame(state.animation);
}

// TODO: unused because framebuffers need care on resizing
export function whilePausingRendering(state, callFunction) {
    state.stopSignal = true;
    let safetyIndex = 0;
    while (!state.stopReached) {
        safetyIndex++;
        if (safetyIndex > 10000) {
            console.error("whilePausingRendering() / runLoop() broken, stopSignal never reached!");
            break;
        }
    }
    callFunction();
    const continueAt = 0.001 * performance.now();
    state.startTime += continueAt - state.time;
    state.stopSignal = state.stopReached = false;
    state.animationFrame = requestAnimationFrame(state.animation);
}

function runLoop(renderFunction, state, elements, timestamp) {
    if (state.resetSignal) {
        resetLoop(state);
    }
    if (state.startTime === null) {
        state.startTime = timestamp;
    }
    if (state.timeRunning) {
        const previousTime = state.time;
        state.time = 0.001 * (timestamp - state.startTime);
        state.deltaTime = previousTime ? (state.time - previousTime) : 0;
        state.iFrame = state.iFrame + 1;
        doFpsMeasurement(state);
    }

    if (state.debugSignal) {
        console.time("render");
    }

    renderFunction(state);

    if (state.debugSignal) {
        console.timeEnd("render");
        console.info(state);
        state.debugSignal = false;
    }

    elements.iTime.value.textContent = state.time.toFixed(2) + " sec";
    elements.fps.display.textContent = state.fps;

    if (state.stopSignal) {
        state.stopReached = true;
        resetFpsMeasurement(state);
        return;
    }

    requestAnimationFrame(state.animation);
}

export function shiftTime(state, seconds) {
    state.time += seconds;
    state.startTime -= 1000 * seconds;
}

function resetLoop(state) {
    // trigger via state.resetSignal in runLoop, not directly
    state.startTime = null;
    state.time = 0;
    state.iFrame = -1;
    state.timeRunning = true;
    state.resetSignal = false;
    state.stopSignal = false;
    state.stopReached = false;
}

const fpsMeter = {
    frames: null,
    measureAtTime: null,
    durationSeconds: 1,
    measuredFps: null,
    direct: {
        lastTime: null,
        lastFrame: null,
        fps: null,
    }
};

function resetFpsMeasurement(state) {
    state.fps = null;
    fpsMeter.frames = null;
    fpsMeter.measureAtTime = null;
    fpsMeter.measuredFps = null;
    fpsMeter.direct.lastTime = null;
    fpsMeter.direct.lastFrame = null;
}

function doFpsMeasurement(state) {
    // counting method
    if (fpsMeter.measureAtTime === null) {
        fpsMeter.measureAtTime = state.time + fpsMeter.durationSeconds;
        fpsMeter.frames = 0;
    } else {
        fpsMeter.frames++;
        if (state.time > fpsMeter.measureAtTime) {
            fpsMeter.measuredFps = fpsMeter.frames / fpsMeter.durationSeconds;
            fpsMeter.measureAtTime = null;
        }
    }
    // direct rate
    if (fpsMeter.direct.lastTime !== null) {
        fpsMeter.direct.fps =
            (state.iFrame - fpsMeter.direct.lastFrame)
            / (state.time - fpsMeter.direct.lastTime);
    }
    fpsMeter.direct.lastTime = state.time;
    fpsMeter.direct.lastFrame = state.iFrame;

    state.fps = 0;
    let weight = 0;
    if (fpsMeter.direct.fps !== null) {
        state.fps += fpsMeter.direct.fps;
        weight += 1.;
    }
    if (fpsMeter.measuredFps !== null) {
        state.fps += 4. * fpsMeter.measuredFps;
        weight += 4.;
    }
    state.fps = weight > 0 ? (state.fps / weight).toFixed(0) : "?";
}
