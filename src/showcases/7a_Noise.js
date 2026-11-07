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
        uniforms: uniformsFor(state)
    })
};

function render(gl, state, elements) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform1f(state.location.iGridOpacity, state.uni.iGridOpacity);
    gl.uniform2fv(state.location.iOverallNoiseShift, state.uni.iOverallNoiseShift);
    gl.uniform1f(state.location.iOverallScale, state.uni.iOverallScale);
    gl.uniform1f(state.location.iOverallHashOffset, state.uni.iOverallHashOffset);
    gl.uniform1f(state.location.iOverallHashMorphing, state.uni.iOverallHashMorphing);
    gl.uniform1f(state.location.iNoiseLevelA, state.uni.iNoiseLevelA);
    gl.uniform1f(state.location.iNoiseLevelB, state.uni.iNoiseLevelB);
    gl.uniform1i(state.location.iFractionalOctaves, Math.floor(state.uni.iFractionalOctaves));
    gl.uniform1f(state.location.iFractionalScale, state.uni.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.uni.iFractionalDecay);
    gl.uniform1f(state.location.iNormFactorForNoiseA, state.uni.iNormFactorForNoiseA);
    gl.uniform1f(state.location.iMeanOffsetForNoiseA, state.uni.iMeanOffsetForNoiseA);
    gl.uniform1f(state.location.iNormFactorForNoiseB, state.uni.iNormFactorForNoiseB);
    gl.uniform1f(state.location.iMeanOffsetForNoiseB, state.uni.iMeanOffsetForNoiseB);
    gl.uniform3fv(state.location.vecFree, state.uni.vecFree);
    gl.uniform1f(state.location.iFree0, state.uni.iFree0);
    gl.uniform1f(state.location.iFree1, state.uni.iFree1);
    gl.uniform1f(state.location.iFree2, state.uni.iFree2);
    gl.uniform1f(state.location.iFree3, state.uni.iFree3);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (state.reading.doRead) {
        state.reading.doRead = false;
        void readPixelsAndEvaluate(gl,
        state.resolution,
            state.reading.buffer,
            elements.buttons.readPixels.content
        );
    }
}

function uniformsFor(state) {
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
