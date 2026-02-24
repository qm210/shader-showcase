import {startRenderLoop} from "../../webgl/render.js";
import {
    createPingPongFramebuffersWithTexture, createTextureFromImage, updateResolutionInState
} from "../../webgl/helpers.js";

import vertexShaderSource from "../../shaders/vertex.basicWithDifferentials.glsl"
import fragmentShaderSource from "../../shaders/moreProcessingPlayground.glsl";
import {initBasicState} from "../common.js";
import image from "../../textures/210_schnoerkel.png";

export default {
    title: "Framebuffer Postprocessing",
    init: (gl, sources = {}) => {
        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        // TODO: check difference with IndexBuffer / drawElements() some day...

        if (!state.program) {
            return state;
        }

        // TODO: Resizing the canvas DOES NOT scale the framebuffers / textures yet!! MUST DO
        const {width, height} = updateResolutionInState(state, gl);

        state.framebuffer = {
            image: createPingPongFramebuffersWithTexture(gl, {
                width,
                height,
                attachment: gl.COLOR_ATTACHMENT0,
            }),
            post: {},
        };

        state.imageTexture = createTextureFromImage(gl, image, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.NEAREST,
        });

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
        uniforms: [{
            type: "float",
            name: "iColorDissipation",
            defaultValue: 0.3,
            min: 0.,
            max: 2.,
        }, {
            type: "float",
            name: "iVelocityDissipation",
            defaultValue: 0.1,
            min: 0.,
            max: 2.,
        }, {
            type: "float",
            name: "iMaxInitialVelocity",
            defaultValue: 1,
            min: -500,
            max: 500,
        }, {
            type: "float",
            name: "iCurlStrength",
            defaultValue: 0,
            min: -0.5,
            max: 1.5,
        }, {
            type: "float",
            name: "iSunraysWeight",
            defaultValue: 1.,
            min: 0.,
            max: 20.,
        }, {
            type: "float",
            name: "iSunraysIterations",
            defaultValue: 5,
            min: 1,
            max: 30,
            step: 1,
        }, {
            type: "float",
            name: "iNoiseLevel",
            defaultValue: 1,
            min: 0.,
            max: 2.,
        }, {
            type: "float",
            name: "iNoiseFreq",
            defaultValue: 1,
            min: 0.01,
            max: 10.,
        }, {
            type: "float",
            name: "iNoiseOffset",
            defaultValue: 0,
            min: -1,
            max: 1,
        }, {
            type: "float",
            name: "iFractionalOctaves",
            defaultValue: 1,
            min: 1,
            max: 10.,
            step: 1,
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
            max: 2.,
        }, {
            type: "float",
            name: "iCloudMorph",
            defaultValue: 0,
            min: 0,
            max: 2,
        }, {
            type: "float",
            name: "iCloudVelX",
            defaultValue: 0,
            min: -2.,
            max: 2,
        }, {
            type: "vec3",
            name: "iFree0",
            defaultValue: [0, 0, 0],
            min: -9.99,
            max: +9.99,
        }, {
            type: "vec3",
            name: "iFree1",
            defaultValue: [0, 0, 0],
            min: -9.99,
            max: +9.99,
        }, {
            type: "vec3",
            name: "iFree2",
            defaultValue: [0, 0, 0],
            min: -9.99,
            max: +9.99,
        }]
    })
};

let write, read;

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform1f(state.location.deltaTime, state.deltaTime);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform2fv(state.location.texelSize, state.texelSize);
    gl.uniform1i(state.location.iFrame, state.iFrame);

    gl.uniform1f(state.location.iColorDissipation, state.iColorDissipation);
    gl.uniform1f(state.location.iVelocityDissipation, state.iVelocityDissipation);
    gl.uniform1f(state.location.iMaxInitialVelocity, state.iMaxInitialVelocity);
    gl.uniform1f(state.location.iCurlStrength, state.iCurlStrength);
    gl.uniform1i(state.location.doDebugRender, state.doDebugRender);
    gl.uniform1f(state.location.iSunraysWeight, state.iSunraysWeight);
    gl.uniform1f(state.location.iSunraysIterations, state.iSunraysIterations);

    gl.uniform1f(state.location.iNoiseLevel, state.iNoiseLevel);
    gl.uniform1f(state.location.iNoiseFreq, state.iNoiseFreq);
    gl.uniform1f(state.location.iNoiseOffset, state.iNoiseOffset);
    gl.uniform1i(state.location.iFractionalOctaves, Math.floor(state.iFractionalOctaves));
    gl.uniform1f(state.location.iFractionalScale, state.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1f(state.location.iCloudMorph, state.iCloudMorph);
    gl.uniform1f(state.location.iCloudVelX, state.iCloudVelX);
    gl.uniform3fv(state.location.iFree0, state.iFree0);
    gl.uniform3fv(state.location.iFree1, state.iFree1);
    gl.uniform3fv(state.location.iFree2, state.iFree2);

    gl.uniform1i(state.location.texPrevious, 0);
    gl.uniform1i(state.location.texImage, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.imageTexture);

    // gl.uniform1i(state.location.texPostSunrays, 3);
    // gl.uniform1i(state.location.texPostBloom, 4);

    /////////////

    gl.uniform1i(state.location.passIndex, 0);
    [write, read] = state.framebuffer.image.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.image.doPingPong();

    gl.uniform1i(state.location.passIndex, 1);
    [, read] = state.framebuffer.image.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
