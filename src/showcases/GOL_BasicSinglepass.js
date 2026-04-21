import {
    createTextureFromImage,
    updateResolution
} from "../webgl/helpers.js";
import {initBasicState} from "./common.js";

import vertexShaderSource from "../shaders/vertex.basic.glsl"
import fragmentShaderSource from "../shaders/gol_basic_singlepass.glsl";
import initial from "../textures/gol_init.png";

export default {
    title: "Game Of Life - Singlepass",
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
                state.doInit = true;
                state.resetSignal = true;
            },
        });
        state.location.texInit = gl.getUniformLocation(state.program, "texInit");

        const {width, height} = updateResolution(state, gl);

        // Speicher für Textur allozieren (*4 wegen RGBA-vec4)
        state.cellState = new Uint8Array(width * height * 4);
        state.texPrevious = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, state.texPrevious);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA8, width, height,
            0, gl.RGBA, gl.UNSIGNED_BYTE, state.cellState
        );

        state.isRunning = true;
        state.doInit = true;
        state.doEvolve = false;
        state.spawnRandomly = false;
        state.drawByMouse = true;
        return state;
    },
    generateControls: (gl, state) => ({
        renderLoop: render,
        uniforms: uniformsFor(state),
        toggles: [{
            label: () =>
                "Running: " + state.isRunning,
            onClick: () => {
                state.isRunning = !state.isRunning;
            }
        }, {
            label: () =>
                "Init Fresh",
            onClick: () => {
                state.doInit = true;
            },
        }, {
            label: () =>
                "Spawn randomly...",
            onClick: () => {
                state.spawnRandomly = true;
            },
        }, {
            label: () =>
                "Draw by Mouse? " + state.drawByMouse,
            onClick: () => {
                state.drawByMouse = !state.drawByMouse;
            }
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
    gl.uniform1i(loc.texInit, 1);

    if (state.isRunning && state.iFrame % 50 === 0) {
        state.doEvolve = true;
    }

    gl.uniform1i(loc.doInit, state.doInit);
    gl.uniform1i(loc.doEvolve, state.doEvolve);
    gl.uniform1i(loc.drawByMouse, state.drawByMouse);
    gl.uniform1i(loc.spawnRandomly, state.spawnRandomly);
    state.doEvolve = false;
    state.spawnRandomly = false;
    state.doInit = false;

    // Single Pass - schreibt direkt aufs Bild (Back Buffer)
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(loc.texPrevious, 0);
    gl.bindTexture(gl.TEXTURE_2D, state.texPrevious);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // jetzt die Daten lesen... (ineffizient, weil Umweg über die CPU)
    const [width, height] = state.resolution;
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, state.cellState);
    // ... und wieder zur GPU reichen:
    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA8, width, height,
        0, gl.RGBA, gl.UNSIGNED_BYTE, state.cellState
    );
}

const uniformsFor = () => [{
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
