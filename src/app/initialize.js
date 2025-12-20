import {maybeAdjustForCompatibility} from "../webgl/helpers/compatibility.js";
import {takeMilliSeconds} from "./measuring.js";

export function createInitialState(sources) {
    sources.fragment = maybeAdjustForCompatibility(sources.fragment);
    const state = {
        source: {
            vertex: sources.vertex,
            fragment: sources.fragment,
        },
        error: {
            vertex: "",
            fragment: "",
            linker: "",
        },
        program: undefined,
        activeUniforms: [],
        location: {},
        framebuffer: [],
        createdAt: takeMilliSeconds(),
    };
    return withPlaybackFeatures(state);
}

function withPlaybackFeatures(state) {
    state.time = 0;
    state.play = {
        dt: 0,
        running: undefined,
        fps: "?",
        range: {
            max: 60,
            autoExtendMargin: 10,
        },
        loop: {
            start: null,
            end: null,
            active: false,
        },
        markers: [], // yet unused
        sync: {
            bpm: null // yet unused
        },
        signal: {
            reset: false,
            stop: false,
            takeRenderTime: false,
            reachedStop: false
        },
        previousTimestamp: null,
        rememberedTime: null,
        animate: void 0,
        animationFrame: null,
    };
    return state;
}
