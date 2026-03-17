import {startRenderLoop} from "../webgl/render.js";
import {initBasicState, readPixelsAndEvaluate} from "./common.js";

import fragmentShaderSource from "../shaders/noisePlayground.glsl";

export default {
    title: "Noise Playground",
    init: (gl, sources = {}) => {
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        state.reading = {
            doRead: false,
            buffer: new Uint8Array(
                4 * gl.drawingBufferWidth * gl.drawingBufferHeight
            ),
        };

        return state;
    },
    generateControls: (state) => ({
        renderLoop: render,
        uniforms: defineUniformControls(state)
    })
};

function render(gl, state, elements) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform1f(state.location.iGridOpacity, state.iGridOpacity);
    gl.uniform2fv(state.location.iOverallNoiseShift, state.iOverallNoiseShift);
    gl.uniform1f(state.location.iOverallScale, state.iOverallScale);
    gl.uniform1f(state.location.iOverallHashOffset, state.iOverallHashOffset);
    gl.uniform1f(state.location.iOverallHashMorphing, state.iOverallHashMorphing);
    gl.uniform1f(state.location.iNoiseLevelA, state.iNoiseLevelA);
    gl.uniform1f(state.location.iNoiseLevelB, state.iNoiseLevelB);
    gl.uniform1i(state.location.iFractionalOctaves, Math.floor(state.iFractionalOctaves));
    gl.uniform1f(state.location.iFractionalScale, state.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1f(state.location.iNormFactorForNoiseA, state.iNormFactorForNoiseA);
    gl.uniform1f(state.location.iMeanOffsetForNoiseA, state.iMeanOffsetForNoiseA);
    gl.uniform1f(state.location.iNormFactorForNoiseB, state.iNormFactorForNoiseB);
    gl.uniform1f(state.location.iMeanOffsetForNoiseB, state.iMeanOffsetForNoiseB);
    gl.uniform3fv(state.location.vecFree, state.vecFree);
    gl.uniform1f(state.location.iFree0, state.iFree0);
    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (state.reading.doRead) {
        state.reading.doRead = false;
        void readPixelsAndEvaluate(gl,
            state.resolution,
            state.reading.buffer,
            elements.readPixels.content
        );
    }
}

function defineUniformControls(state) {
    return [{
        type: "float",
        name: "iGridOpacity",
        defaultValue: 0.1,
        min: 0,
        max: 1,
    }, {
        type: "float",
        name: "iNoiseLevelA",
        defaultValue: 0,
        min: -1,
        max: 1,
    }, {
        type: "float",
        name: "iNoiseLevelB",
        defaultValue: 0.,
        min: -1,
        max: 1,
    }, {
        type: "vec2",
        name: "iOverallNoiseShift",
        defaultValue: [1, 1],
        min: 0,
        max: 10,
    }, {
        type: "float",
        name: "iOverallScale",
        defaultValue: 2,
        min: 0.01,
        max: 10.,
    }, {
        type: "float",
        name: "iOverallHashOffset",
        defaultValue: 0,
        min: -1,
        max: 1,
        step: 0.01
    }, {
        type: "float",
        name: "iOverallHashMorphing",
        defaultValue: 0.,
        min: 0,
        max: 6.28,
    }, {
        type: "int",
        name: "iFractionalOctaves",
        defaultValue: 1,
        min: 1,
        max: 20.,
    }, {
        type: "float",
        name: "iFractionalScale",
        defaultValue: 2.,
        min: 0.01,
        max: 10.,
    }, {
        type: "float",
        name: "iFractionalDecay",
        defaultValue: 0.5,
        min: 0.01,
        max: 0.99,
    }, {
        type: "float",
        name: "iNormFactorForNoiseA",
        defaultValue: 0.75,
        min: 0.01,
        max: 10.,
    }, {
        type: "float",
        name: "iMeanOffsetForNoiseA",
        defaultValue: 0.667,
        min: -1,
        max: 1,
        step: 0.001,
    }, {
        type: "float",
        name: "iNormFactorForNoiseB",
        defaultValue: 3.0,
        min: 0.01,
        max: 10,
    }, {
        type: "float",
        name: "iMeanOffsetForNoiseB",
        defaultValue: -0.18,
        min: -1,
        max: 1,
        step: 0.001,
    }, {
        type: "vec3",
        name: "vecFree",
        defaultValue: [0, 0, 0],
        min: 0,
        max: 1,
    }, {
        type: "float",
        name: "iFree0",
        defaultValue: 0,
        min: 0,
        max: 1,
    }, {
        type: "float",
        name: "iFree1",
        defaultValue: 0,
        min: 0,
        max: 1,
    }, {
        type: "float",
        name: "iFree2",
        defaultValue: 0,
        min: 0,
        max: 1,
    }, {
        type: "float",
        name: "iFree3",
        defaultValue: 0,
        min: 0,
        max: 1,
    }, {
        type: "button",
        name: "readPixels",
        label: "Read Pixels from Screen to CPU",
        onClick: () => {
            state.reading.doRead = true;
        }
    }]
}
