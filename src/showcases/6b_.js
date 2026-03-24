import {createFramebufferWithTexture, createTextureFromImage, updateResolution} from "../webgl/helpers.js";
import {initBasicState} from "./common.js";

import vertexShaderSource from "../shaders/vertex.basic.glsl"
import fragmentShaderSource from "../shaders/6b_gol.glsl";
import initial from "../textures/gol_init.png";

export default {
    title: "Game Of Life",
    init: (gl, sources = {}) => {
        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        state.texInit = createTextureFromImage(gl, initial, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.NEAREST,
            magFilter: gl.NEAREST,
        });
        state.location.texInit = gl.getUniformLocation(state.program, "texInit");

        const {width, height} = updateResolution(state, gl);

        console.log(state.texInit);
        const fbOptions = {
            width,
            height,
            attachment: gl.COLOR_ATTACHMENT0,
            dataFormat: gl.RGBA,
            // UNSIGNED_BYTE ist Standard -> 8-bit RGB, im Shader als float 0..1
           dataType: gl.UNSIGNED_BYTE,
           internalFormat: gl.RGBA8,
        };
        state.framebuffer = [
            createFramebufferWithTexture(gl, fbOptions),
            createFramebufferWithTexture(gl, fbOptions)
        ];
        state.ping = 0;

        return state;
    },
    generateControls: (_, state) => ({
        renderLoop: render,
        uniforms: uniformsFor(state)
    })
};

let write, read;

function render(gl, state) {
    const loc = state.location;
    gl.uniform1f(loc.iTime, state.time);
    gl.uniform1f(state.location.iDeltaTime, state.deltaTime);
    gl.uniform2fv(loc.iResolution, state.resolution);
    gl.uniform2fv(loc.texelSize, state.texelSize);
    gl.uniform1i(loc.iFrame, state.iFrame);
    gl.uniform1i(loc.initialState, state.initialState);
    gl.uniform1f(loc.iHashSeed, state.iHashSeed);
    gl.uniform1f(loc.iFadeFactor, state.iFadeFactor);
    gl.uniform1f(loc.iCircleSize, state.iCircleSize);
    gl.uniform1f(loc.iCircleSizeVariation, state.iCircleSizeVariation);

    gl.uniform1f(loc.iFree0, state.iFree0);
    gl.uniform1f(loc.iFree1, state.iFree1);
    gl.uniform1f(loc.iFree2, state.iFree2);
    gl.uniform1f(loc.iFree3, state.iFree3);
    gl.uniform3fv(loc.vecFree0, state.vecFree0);
    gl.uniform3fv(loc.vecFree1, state.vecFree1);
    gl.uniform3fv(loc.vecFree2, state.vecFree2);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.texInit);
    gl.uniform1i(state.location.texInit, 1);

    // FRAMEBUFFER PING-PONG!
    let write = state.framebuffer[state.ping];
    let read = state.framebuffer[1 - state.ping];
    state.ping = 1. - state.ping;

    gl.uniform1i(state.location.passIndex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.uniform1i(state.location.texPrevious, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // für Backbuffer müssen wir nun nicht mehr ping-pongen.
    read = write;

    gl.uniform1i(state.location.passIndex, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

const uniformsFor = (state) => [{
    type: "label",
    name: "iTime",
}, {
    type: "boolean",
    name: "initialState",
    defaultValue: true,
    description: "State auf initiale Textur setzen",
}, {
    type: "float",
    name: "iFadeFactor",
    defaultValue: 0.98,
    min: 0.9,
    max: 1.,
    log: true
}, {
    type: "float",
    name: "iCircleSize",
    defaultValue: 0.06,
    min: 0.01,
    max: 0.2,
}, {
    type: "float",
    name: "iCircleSizeVariation",
    defaultValue: 0.5,
    min: 0.0,
    max: 1.,
}, {
    type: "float",
    name: "iHashSeed",
    defaultValue: 0,
    min: 0,
    max: 100,
    step: 0.1,
}, {
    separator: "... zur freien Laune ..."
}, {
    type: "float",
    name: "iFree0",
    defaultValue: 0,
    min: -1,
    max: 1,
}, {
    type: "float",
    name: "iFree1",
    defaultValue: 0,
    min: -1,
    max: 1,
}, {
    type: "float",
    name: "iFree2",
    defaultValue: 0,
    min: -1,
    max: 1,
}, {
    type: "float",
    name: "iFree3",
    defaultValue: 0,
    min: -1,
    max: 1,
}, {
    type: "vec3",
    name: "vecFree0",
    defaultValue: [0, 0, 0],
    min: -9.99,
    max: +9.99,
}, {
    type: "vec3",
    name: "vecFree1",
    defaultValue: [0, 0, 0],
    min: -9.99,
    max: +9.99,
}, {
    type: "vec3",
    name: "vecFree2",
    defaultValue: [0, 0, 0],
    min: -9.99,
    max: +9.99,
}];
