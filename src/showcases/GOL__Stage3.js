import {
    createFramebufferWithTexture,
    createPingPongFramebuffersWithTexture,
    createTextureFromImage, updateResolution,
} from "../webgl/helpers.js";
import {initBasicState} from "./common.js";

import vertexShaderSource from "../shaders/vertex.basic.glsl"
import fragmentShaderSource from "../shaders/gol__stage3.glsl";
import initial from "../textures/gol_init.png";

export default {
    title: "Game Of Life - 3",
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
            minFilter: gl.LINEAR,
            magFilter: gl.NEAREST,
            onLoaded: () => {
                state.doInit = true;
                state.resetSignal = true;
            },
        });
        state.location.texInit = gl.getUniformLocation(state.program, "texInit");

        const {width, height} = updateResolution(state, gl);

        const fbOptions = {
            width,
            height,
            attachment: gl.COLOR_ATTACHMENT0,
            dataFormat: gl.RGBA,
            dataType: gl.UNSIGNED_BYTE,
            internalFormat: gl.RGBA8,
        };
        state.gameBuffers = [
            createFramebufferWithTexture(gl, fbOptions),
            createFramebufferWithTexture(gl, fbOptions)
        ];
        state.ping = 0;

        state.doInit = true;
        return state;
    },
    generateControls: (gl, state) => ({
        renderLoop: render,
        uniforms: uniformsFor(state),
        toggles: [{
            label: () =>
                "Init Fresh",
            onClick: () => {
                state.doInit = true;
            },
        }]
    })
};

function render(gl, state) {
    const loc = state.location;
    gl.uniform1f(loc.iTime, state.time);
    gl.uniform1f(state.location.iDeltaTime, state.deltaTime);
    gl.uniform2fv(loc.iResolution, state.resolution);
    gl.uniform2fv(loc.texelSize, state.texelSize);
    gl.uniform1i(loc.iFrame, state.iFrame);
    gl.uniform3fv(loc.iMouseHover, state.iMouseHover);
    gl.uniform1i(loc.iMouseDown, state.iMouseDown);
    gl.uniform1i(loc.showGrid, state.showGrid);

    gl.uniform1f(loc.iFree0, state.iFree0);
    gl.uniform1f(loc.iFree1, state.iFree1);
    gl.uniform1f(loc.iFree2, state.iFree2);
    gl.uniform1f(loc.iFree3, state.iFree3);
    gl.uniform1f(loc.iFree4, state.iFree4);
    gl.uniform1f(loc.iFree5, state.iFree5);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.texInit);
    gl.uniform1i(state.location.texInit, 1);

    // Initialisiere per Flag (weil Bild async lädt...)
    gl.uniform1i(loc.doInit, state.doInit);
    state.doInit = false;

    // Framebuffer Ping Pong
    let write = state.gameBuffers[state.ping];
    let read = state.gameBuffers[1 - state.ping];
    state.ping = 1. - state.ping;

    gl.uniform1i(state.location.iPassIndex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(state.location.texPrevious, 0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Zuletzt nur one-way zum Backbuffer
    read = write;
    gl.uniform1i(state.location.iPassIndex, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(state.location.texPrevious, 0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

const uniformsFor = () => [{
    type: "boolean",
    name: "showGrid",
    defaultValue: true,
    description: "Vergleich mit Auflösung der gol_init.png",
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
    type: "float",
    name: "iFree4",
    defaultValue: 0,
    min: -1,
    max: 1,
}, {
    type: "float",
    name: "iFree5",
    defaultValue: 0,
    min: -1,
    max: 1,
}];
