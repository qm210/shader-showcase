import {
    createPingPongFramebuffersWithTexture,
    createTextureFromImage,
    updateResolution
} from "../webgl/helpers.js";
import {initBasicState} from "./common.js";

import vertexShaderSource from "../shaders/vertex.basic.glsl"
import fragmentShaderSource from "../shaders/6b_gol_next.glsl";
import initial from "../textures/gol_init.png";

export default {
    title: "Game Of Life ++",
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
            onLoaded: () => {
                state.resetSignal = true;
            },
        });
        state.location.texInit = gl.getUniformLocation(state.program, "texInit");

        const {width, height} = updateResolution(state, gl);

        // Struktur fürs erste:
        // - Game-Of-Life-Textur wird evolviert
        //   -> braucht Ping Pong, weil gleichzeitig lesen und schreiben
        // - Render-Pass zeichnet einfach aufs Bild

        state.gameBuffer = createPingPongFramebuffersWithTexture(gl, {
            width,
            height,
            attachment: gl.COLOR_ATTACHMENT0,
            dataFormat: gl.RGBA,
            dataType: gl.FLOAT,
            internalFormat: gl.RGBA32F,
        });

        state.doInit = true;
        state.doEvolve = false;
        state.spawnRandomly = false;
        state.drawByMouse = true;
        state.displayMode = 0;
        return state;
    },
    generateControls: (gl, state) => ({
        renderLoop: render,
        uniforms,
        toggles: [{
            label: () =>
                "Init Fresh",
            onClick: () => {
                state.doInit = true;
            },
        }, {
            label: () =>
                "Random Spawn (once)",
            onClick: () => {
                state.spawnRandomly = true;
            },
        }, {
            label: () =>
                "Draw by Mouse? " + state.drawByMouse,
            onClick: () => {
                state.drawByMouse = !state.drawByMouse;
            }
        }, {
            label: () =>
                state.displayMode === 0
                    ? "Standard Mode"
                    : "... other mode.",
            onClick: () => {
                state.displayMode = (state.displayMode++) % 2;
            }
        }]
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
    gl.uniform3fv(loc.iMouseHover, state.iMouseHover);
    gl.uniform1i(loc.iMouseDown, state.iMouseDown);
    gl.uniform1i(loc.debugMode, state.debugMode);
    gl.uniform1f(loc.iHashSeed, state.iHashSeed);

    gl.uniform1f(loc.iFree0, state.iFree0);
    gl.uniform1f(loc.iFree1, state.iFree1);
    gl.uniform1f(loc.iFree2, state.iFree2);
    gl.uniform1f(loc.iFree3, state.iFree3);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.texInit);
    gl.uniform1i(state.location.texInit, 1);

    if (state.iFrame % state.evolveEveryNthFrame === 0) {
        state.doEvolve = true;
    }

    gl.uniform1i(loc.doInit, state.doInit);
    gl.uniform1i(loc.doEvolve, state.doEvolve);
    gl.uniform1i(loc.spawnRandomly, state.spawnRandomly);
    gl.uniform1i(loc.drawByMouse, state.drawByMouse);

    // Framebuffer Ping Pong - in eigene Struktur ausgelagert
    [write, read] = state.gameBuffers.currentWriteReadOrder();
    state.gameBuffers.doPingPong();

    gl.uniform1i(state.location.iPassIndex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(state.location.texPrevious, 0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Backbuffer: Read-Buffer ist jetzt der andere.
    // -> Müssen wir auch nicht mehr pingpongen, nur beim Feedback.
    read = write;

    gl.uniform1i(state.location.iPassIndex, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(state.location.texPrevious, 0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    state.doEvolve = false;
    state.spawnRandomly = false;
    state.doInit = false;
}

const uniforms = [{
    type: "label",
    name: "iTime",
}, {
    type: "int",
    name: "evolveEveryNthFrame",
    defaultValue: 30,
    min: 1,
    max: 100,
    notAnUniform: true,
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
