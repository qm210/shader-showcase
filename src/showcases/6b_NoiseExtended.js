import {startRenderLoop} from "../webgl/render.js";

import fragmentShaderSource from "../shaders/noisePlaygroundExtended.glsl";
import {initBasicState, readPixelsAndEvaluate} from "./common.js";

export default {
    title: "Noise Playground Extended",
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
    gl.uniform1f(state.location.iNoiseLevelA, state.iNoiseLevelA);
    gl.uniform1f(state.location.iNoiseLevelB, state.iNoiseLevelB);
    gl.uniform1f(state.location.iNoiseLevelC, state.iNoiseLevelC);
    gl.uniform1f(state.location.iNoiseScaleA, state.iNoiseScaleA);
    gl.uniform1f(state.location.iNoiseScaleB, state.iNoiseScaleB);
    gl.uniform1f(state.location.iNoiseScaleC, state.iNoiseScaleC);
    gl.uniform1f(state.location.iNoiseMorphingA, state.iNoiseMorphingA);
    gl.uniform1f(state.location.iNoiseMorphingB, state.iNoiseMorphingB);
    gl.uniform1f(state.location.iNoiseMorphingC, state.iNoiseMorphingC);
    gl.uniform1i(state.location.iFractionalOctaves, state.iFractionalOctaves);
    gl.uniform1f(state.location.iFractionalScale, state.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1f(state.location.iTurbulenceNormFactor, state.iTurbulenceNormFactor);
    gl.uniform1f(state.location.iTurbulenceMeanOffset, state.iTurbulenceMeanOffset);
    gl.uniform2fv(state.location.iMarbleSqueeze, state.iMarbleSqueeze);
    gl.uniform1f(state.location.iMarbleGranularity, state.iMarbleGranularity);
    gl.uniform1f(state.location.iMarbleGradingExponent, state.iMarbleGradingExponent);
    gl.uniform1f(state.location.iMarbleRange, state.iMarbleRange);
    gl.uniform1f(state.location.iColorStrength, state.iColorStrength);
    gl.uniform3fv(state.location.iColorCosineFreq, state.iColorCosineFreq);
    gl.uniform3fv(state.location.iColorCosinePhase, state.iColorCosinePhase);
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
        defaultValue: 0.0,
        min: 0,
        max: 1,
    }, {
        type: "float",
        name: "iNoiseLevelA",
        defaultValue: 0.6,
        min: -1,
        max: 1,
    }, {
        type: "float",
        name: "iNoiseLevelB",
        defaultValue: 0.6,
        min: -1,
        max: 1,
    }, {
        type: "float",
        name: "iNoiseLevelC",
        defaultValue: 0,
        min: -1,
        max: 1,
    }, {
        type: "float",
        name: "iNoiseScaleA",
        defaultValue: 1,
        min: 0.01,
        max: 10,
    }, {
        type: "float",
        name: "iNoiseScaleB",
        defaultValue: 1,
        min: 0.01,
        max: 10,
    }, {
        type: "float",
        name: "iNoiseScaleC",
        defaultValue: 1,
        min: 0.01,
        max: 10,
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
        name: "iNoiseMorphingA",
        defaultValue: 0,
        min: 0,
        max: 6.28,
    }, {
        type: "float",
        name: "iNoiseMorphingB",
        defaultValue: 1.,
        min: 0,
        max: 6.28,
    }, {
        type: "float",
        name: "iNoiseMorphingC",
        defaultValue: 2.,
        min: 0,
        max: 6.28,
    }, {
        type: "float",
        name: "iOverallHashOffset",
        defaultValue: 0,
        min: -1,
        max: 1,
        step: 0.01
    }, {
        type: "int",
        name: "iFractionalOctaves",
        defaultValue: 5,
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
        name: "iTurbulenceNormFactor",
        defaultValue: 0.33,
        min: 0.001,
        max: 1.,
    }, {
        type: "float",
        name: "iTurbulenceMeanOffset",
        defaultValue: 0.18,
        min: 0.,
        max: 0.5,
    }, {
        type: "vec2",
        name: "iMarbleSqueeze",
        defaultValue: [0, 0],
        min: 0.0,
        max: 20.,
        step: 0.01
    }, {
        type: "float",
        name: "iMarbleGranularity",
        defaultValue: 7.5,
        min: 0.01,
        max: 50,
    }, {
        type: "float",
        name: "iMarbleGradingExponent",
        defaultValue: 1,
        min: 0.01,
        max: 5.,
    }, {
        type: "float",
        name: "iMarbleRange",
        defaultValue: 0.5,
        min: 0.01,
        max: 1.,
    }, {
        type: "float",
        name: "iColorStrength",
        defaultValue: 0.,
        min: 0,
        max: 1,
    }, {
        type: "vec3",
        name: "iColorCosineFreq",
        defaultValue: [11, 20, 30],
        min: 0,
        max: 31.42,
        step: 0.01,
    }, {
        type: "vec3",
        name: "iColorCosinePhase",
        defaultValue: [0, 1, 0.5],
        min: 0,
        max: 6.283,
        step: 0.01,
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
