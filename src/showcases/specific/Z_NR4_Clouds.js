import {startRenderLoop} from "../../webgl/render.js";
import {initBasicState} from "../common.js";
import fragmentShaderSource from "../../shaders/specific/nr4_clouds.glsl";
import {
    clearFramebuffers,
    createPingPongFramebuffersWithTexture,
    evaluateReadData,
    updateResolutionInState
} from "../../webgl/helpers.js";

export default {
    title: "NR4's Clouds",
    init: (gl, sources = {}) => {
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        const {width, height} = updateResolutionInState(state, gl);
        state.framebuffer =
            createPingPongFramebuffersWithTexture(gl, {
                width,
                height,
                attachment: gl.COLOR_ATTACHMENT0,
                internalFormat: gl.RGBA32F,
                dataFormat: gl.RGBA,
                dataType: gl.FLOAT,
            });
        state.framebuffer.readData = new Float32Array(width * height * 4);
        // <-- not stable against rescaling, but anyway.
        state.passIndex = 0;

        state.debugOption = +(sessionStorage.getItem("qm.clouds.debug") ?? 0);
        state.toggleDebugOption = (index) => {
            state.debugOption ^= 1 << index;
            sessionStorage.setItem("qm.clouds.debug", state.debugOption);
        }
        state.hasDebugOption = (index) =>
            (state.debugOption & (1 << index)) !== 0;
        state.accumulate = false;
        state.lastQueryNanos = undefined;
        state.readNextPixels = false;

        return state;
    },
    generateControls: (gl, state, elements) => ({
        onRender: () => {
            startRenderLoop(
                state => render(gl, state),
                state,
                elements
            );
        },
        toggles: [
            {
                label: () =>
                    "Using FBM " + (state.hasDebugOption(1) ? "B" : "A"),
                onClick: () =>
                    state.toggleDebugOption(1)
            }, {
                label: () =>
                    state.hasDebugOption(2) ? "Modded fbm" : "Original fbm",
                onClick: () => {
                    state.toggleDebugOption(2)
                }
            }, {
                label: () =>
                    "Accumulate: " + (state.accumulate ? "On" : "Off"),
                onClick: () => {
                    clearFramebuffers(gl, state);
                    state.iFrame = 0;
                    state.toggleDebugOption(0);
                    state.accumulate = state.hasDebugOption(0);
                }
            }, {
                label: () => {
                    if (!state.lastQueryNanos) {
                        return "Query";
                    }
                    const millis = (1e-6 * state.lastQueryNanos).toFixed(2);
                    return `${millis} ms`;
                },
                onClick: async () => {
                    const nanos = await gl.timer.executeWithQuery(() =>
                        render(gl, state)
                    );
                    const comparison = !state.lastQueryNanos ? [] :
                        ["- Ratio to last query:", nanos / state.lastQueryNanos];
                    console.log("Query took", nanos, "ns", ...comparison);
                    state.lastQueryNanos = nanos;
                }
            }, {
                label: () => "Read",
                onClick: () => {
                    state.readNextPixels = true;
                },
                style: { flex: 0 }
            }
        ],
        uniforms: [{
            type: "float",
            name: "iCloudYDisplacement",
            defaultValue: -12.43,
            min: -50,
            max: 10,
        }, {
            type: "float",
            name: "iCloudLayerDistance",
            defaultValue: 4.46,
            min: 0.01,
            max: 10,
        }, {
            type: "float",
            name: "iLightLayerDistance",
            defaultValue: 3.00,
            min: 0.01,
            max: 10,
        }, {
            type: "float",
            name: "iCloudSeed",
            defaultValue: 11.07,
            min: 0,
            max: 100,
        }, {
            type: "float",
            name: "iSkyQuetschung",
            defaultValue: 0.72,
            min: 0,
            max: 10,
        }, {
            type: "float",
            name: "iSampleCount",
            defaultValue: 1,
            min: 1,
            max: 20,
            step: 1,
        }, {
            type: "int",
            name: "iCloudLayerCount",
            defaultValue: 60,
            min: 1,
            max: 200,
        }, {
            type: "int",
            name: "iLightLayerCount",
            defaultValue: 6,
            min: 1,
            max: 100,
        }, {
            type: "int",
            name: "iCloudNoiseCount",
            defaultValue: 6,
            min: 1,
            max: 10,
        }, {
            type: "int",
            name: "iLightNoiseCount",
            defaultValue: 3,
            min: 1,
            max: 10,
        }, {
            type: "vec3",
            name: "iNoiseScale",
            defaultValue: [1, 1, 1],
            min: 0.01,
            max: 3,
            step: 0.01,
        }, {
            type: "float",
            name: "iNoiseScaleB",
            defaultValue: 2.8,
            min: 0.01,
            max: 10,
        }, {
            type: "float",
            name: "iCloudAbsorptionCoeff",
            defaultValue: 0.9,
            min: 0.001,
            max: 3,
        }, {
            type: "float",
            name: "iCloudAnisoScattering",
            defaultValue: 0.3,
            min: 0,
            max: 2,
        }, {
            type: "vec3",
            name: "vecSunPosition",
            defaultValue: [1, 0, 0],
            min: -1,
            max: 1,
            normalize: true,
        }, {
            type: "vec3",
            name: "vecSunColorYCH",
            defaultValue: [0.6267, 0.5051, 0.1466], // YIQ [0.6267, 0.3622, 0.0535], RGB [1, 0.5, 0.3]
            min: [0, 0.00, -3.142],
            max: [1, 0.78, +3.142],
        }, {
            type: "float",
            name: "iSunExponent",
            defaultValue: 10,
            min: 0.01,
            max: 100,
        }, {
            type: "vec3",
            name: "vecTone1",
            defaultValue: [2.51, 0.03, 2.43],
            min: 0,
            max: 5,
        }, {
            type: "vec3",
            name: "vecTone2",
            defaultValue: [0.59, 0.14, 1.],
            min: 0,
            max: 5,
        }, {
            type: "float",
            name: "iAccumulateMix",
            defaultValue: 1.,
            min: 0.,
            max: 1,
        }, {
            type: "float",
            name: "iFree0",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree1",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree2",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree3",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree4",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }]
    })
};

let write, read;

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform1i(state.location.iFrame, state.iFrame);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform4fv(state.location.iMouse, state.iMouse);
    gl.uniform4fv(state.location.iMouseDrag, state.iMouseDrag);
    gl.uniform1f(state.location.iMouseWheel, state.iMouseWheel);
    gl.uniform1i(state.location.passIndex, state.passIndex);

    gl.uniform1f(state.location.iCloudYDisplacement, state.iCloudYDisplacement);
    gl.uniform1f(state.location.iCloudLayerDistance, state.iCloudLayerDistance);
    gl.uniform1f(state.location.iLightLayerDistance, state.iLightLayerDistance);
    gl.uniform1f(state.location.iCloudSeed, state.iCloudSeed);
    gl.uniform1f(state.location.iSkyQuetschung, state.iSkyQuetschung);
    gl.uniform1i(state.location.iSampleCount, state.iSampleCount);
    gl.uniform1i(state.location.iCloudLayerCount, state.iCloudLayerCount);
    gl.uniform1i(state.location.iLightLayerCount, state.iLightLayerCount);
    gl.uniform1i(state.location.iCloudNoiseCount, state.iCloudNoiseCount);
    gl.uniform1i(state.location.iLightNoiseCount, state.iLightNoiseCount);
    gl.uniform3fv(state.location.iNoiseScale, state.iNoiseScale);
    gl.uniform1f(state.location.iNoiseScaleB, state.iNoiseScaleB);
    gl.uniform1f(state.location.iCloudAbsorptionCoeff, state.iCloudAbsorptionCoeff);
    gl.uniform1f(state.location.iCloudAnisoScattering, state.iCloudAnisoScattering);
    gl.uniform3fv(state.location.vecSunPosition, state.vecSunPosition);
    gl.uniform3fv(state.location.vecSunColorYCH, state.vecSunColorYCH);
    gl.uniform1f(state.location.iSunExponent, state.iSunExponent);
    gl.uniform3fv(state.location.vecTone1, state.vecTone1);
    gl.uniform3fv(state.location.vecTone2, state.vecTone2);
    gl.uniform1f(state.location.iAccumulateMix, state.iAccumulateMix);

    gl.uniform1i(state.location.debugOption, state.debugOption);
    gl.uniform1f(state.location.iFree0, state.iFree0);
    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);
    gl.uniform1f(state.location.iFree4, state.iFree4);

    // there's only one texture (prevImage), so this stays the same
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(state.location.prevImage, 0);

    [write, read] = state.framebuffer.currentWriteReadOrder();
    gl.uniform1i(state.location.passIndex, 0);
    if (state.readNextPixels) {
        state.readNextPixels = false;
        state.toggleDebugOption(3);
        gl.uniform1i(state.location.debugOption, state.debugOption);
        state.toggleDebugOption(3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, write.fbo);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.reading(0, 0, write.width, write.height, gl.RGBA, gl.FLOAT, state.framebuffer.readData);
        evaluateReadData(state.framebuffer.readData)
            .then(result => console.log("Read Data", result));

        state.framebuffer.doPingPong();
    } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        state.framebuffer.doPingPong();
    }
    gl.uniform1i(state.location.passIndex, 1);
    [, read] = state.framebuffer.currentWriteReadOrder();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
