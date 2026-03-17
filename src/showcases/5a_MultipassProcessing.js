import {
    createFramebufferWithTexture,
    createTextureFromImage,
    updateResolution
} from "../webgl/helpers.js";
import {initBasicState} from "./common.js";

import vertexShaderSource from "../shaders/vertex.basic.glsl"
import fragmentShaderSource from "../shaders/5a_multipassProcessing.glsl";
import imageFloofy from "../textures/goofy_floofy.png";
import imageWindow from "../textures/stained_glass_window.png";

export default {
    title: "Multipass",
    init: (gl, sources = {}) => {
        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        gl.useProgram(state.program);

        state.texFloofy = createTextureFromImage(gl, imageFloofy, {
            wrapS: gl.MIRRORED_REPEAT,
            wrapT: gl.REPEAT,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.location.texFloofy = gl.getUniformLocation(state.program, "texFloofy");

        state.texWindow = createTextureFromImage(gl, imageWindow, {
            wrapS: gl.REPEAT,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.location.texWindow = gl.getUniformLocation(state.program, "texWindow");

        const {width, height} = updateResolution(state, gl);

        const fbOptions = {
            width,
            height,
            attachment: gl.COLOR_ATTACHMENT0,
            dataFormat: gl.RGBA,
            // FLOAT erlaubt Ausgabewerte außerhalb [0; 1]!
            dataType: gl.FLOAT,
            internalFormat: gl.RGBA32F,
        };
        state.framebuffer = {
            passZero: createFramebufferWithTexture(gl, fbOptions),
            passOne: createFramebufferWithTexture(gl, fbOptions),
            passTwo: createFramebufferWithTexture(gl, fbOptions),
        };

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            type: "label",
            name: "iTime",
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

function render(gl, state) {
    const loc = state.location;
    gl.uniform1f(loc.iTime, state.time);
    gl.uniform2fv(loc.iResolution, state.resolution);
    gl.uniform2fv(loc.texelSize, state.texelSize);
    gl.uniform1i(loc.iFrame, state.iFrame);
    gl.uniform1f(loc.iNoiseLevel, state.iNoiseLevel);
    gl.uniform1f(loc.iNoiseFreq, state.iNoiseFreq);
    gl.uniform1f(loc.iNoiseOffset, state.iNoiseOffset);
    gl.uniform1f(loc.iFractionalOctaves, state.iFractionalOctaves);
    gl.uniform1f(loc.iFractionalScale, state.iFractionalScale);
    gl.uniform1f(loc.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1f(loc.iCloudMorph, state.iCloudMorph);
    gl.uniform1f(loc.iCloudVelX, state.iCloudVelX);
    gl.uniform3fv(loc.iFree0, state.iFree0);
    gl.uniform3fv(loc.iFree1, state.iFree1);
    gl.uniform3fv(loc.iFree2, state.iFree2);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.texFloofy);
    gl.uniform1i(state.location.texFloofy, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.texWindow);
    gl.uniform1i(state.location.texWindow, 1);

    gl.uniform1i(loc.iPass, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer.passZero.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.uniform1i(loc.iPass, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer.passOne.fbo);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.passZero.texture);
    gl.uniform1i(state.location.texPrevious, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.uniform1i(loc.iPass, 2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer.passTwo.fbo);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.passOne.texture);
    gl.uniform1i(state.location.texPrevious, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.uniform1i(loc.iPass, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.passTwo.texture);
    gl.uniform1i(state.location.texPrevious, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
