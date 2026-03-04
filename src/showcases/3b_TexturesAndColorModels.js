import {compile, createStaticVertexBuffer, initVertices} from "../webgl/setup.js";
import {createTextureFromImage} from "../webgl/helpers.js";

import fragmentShaderSource from "../shaders/colorSimplePlayground.glsl";
import vertexShaderSource from "../shaders/vertex.basic.glsl";
import image0 from "../textures/goofy_floofy.png";

export default {
    title: "Colors & Textures",
    init: (gl, sources = {}) => {
        createStaticVertexBuffer(
            gl,
            [-1, -1, +1, -1, -1, 1, -1, +1, +1, -1, +1, +1]
        );

        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = compile(gl, sources);
        if (!state.program) {
            return state;
        }

        initVertices(gl, state, "aPosition");

        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        state.location.iTime = gl.getUniformLocation(state.program, "iTime");
        state.location.iResolution = gl.getUniformLocation(state.program, "iResolution");
        state.resolution = [gl.drawingBufferWidth, gl.drawingBufferHeight];

        state.texture0 = createTextureFromImage(gl, image0, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.location.iTexture0 = gl.getUniformLocation(state.program, "iTexture0");

        gl.useProgram(state.program);

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            separator: "Manipulation auf RGB-Farben"
        }, {
            type: "vec3",
            name: "iFactor",
            defaultValue: [1, 1, 1],
            min: 0,
            max: 2,
        }, {
            type: "float",
            name: "iGray",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iContrast",
            defaultValue: 1.,
            min: -2,
            max: 2,
        }, {
            type: "float",
            name: "iGamma",
            defaultValue: 1,
            min: 0.1,
            max: 10,
            log: true
        }, {
            type: "vec2",
            name: "iClamp",
            defaultValue: [0, 1],
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iCutOut",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iFree1",
            defaultValue: 0,
            min: -2,
            max: +2,
        }, {
            type: "float",
            name: "iFree2",
            defaultValue: 0,
            min: -2,
            max: +2,
        }, {
            type: "float",
            name: "iFree3",
            defaultValue: 0,
            min: -2,
            max: +2,
        }]
    })
};

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform1f(state.location.iGamma, state.iGamma);
    gl.uniform1f(state.location.iContrast, state.iContrast);
    gl.uniform1f(state.location.iGray, state.iGray);
    gl.uniform3fv(state.location.iFactor, state.iFactor);
    gl.uniform2fv(state.location.iClamp, state.iClamp);
    gl.uniform1f(state.location.iCutOut, state.iCutOut);
    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);
    gl.uniform1f(state.location.iFree4, state.iFree4);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.texture0);
    gl.uniform1i(state.location.iTexture0, 0);
    // <-- letzter Parameter <n> muss zu Texture Unit gl.TEXTURE<n> passen

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.texture1);
    gl.uniform1i(state.location.iTexture1, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, state.texture2);
    gl.uniform1i(state.location.iTexture2, 2);
    gl.uniform1f(state.location.iTexture2AspectRatio, 0.728);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
