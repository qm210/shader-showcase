import {compile, createStaticVertexBuffer, initVertices} from "../webgl/setup.js";
import {createTextureFromImage} from "../webgl/helpers.js";

import fragmentShaderSource from "../shaders/3b_colorModelPlayground.glsl";
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
            separator: "Manipulation auf Hintergrundbild"
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
            name: "iGammaPre",
            defaultValue: 1,
            min: 0.1,
            max: 10,
            log: true
        }, {
            type: "vec2",
            name: "iSqueeze",
            defaultValue: [0, 1],
            min: 0,
            max: 1,
        }, {
            separator: "HSV / HSL / OkLCh - Farbmanipulationen",
        }, {
            type: "bool",
            name: "transformHSV",
            group: "colorModel",
            description: "HSV-Modell transformieren",
            defaultValue: true,
        }, {
            type: "bool",
            name: "transformHSL",
            group: "colorModel",
            description: "HSL-Modell transformieren",
            defaultValue: false,
        }, {
            // type: "bool",
            // name: "transformYCh",
            // group: "colorModel",
            // description: "YCh-Modell transformieren",
            // defaultValue: false,
        }, {
            type: "bool",
            name: "transformOKLCh",
            group: "colorModel",
            description: "OKLCh-Modell transformieren",
            defaultValue: false,
        }, {
            type: "float",
            name: "iLightnessFactor",
            defaultValue: 1,
            min: 0,
            max: 2,
        }, {
            type: "float",
            name: "iLightnessShift",
            defaultValue: 0,
            min: -1,
            max: +1,
        }, {
            type: "float",
            name: "iChromaFactor",
            defaultValue: 1,
            min: 0,
            max: 2,
        }, {
            type: "float",
            name: "iChromaShift",
            defaultValue: 0,
            min: -1,
            max: +1,
        }, {
            type: "float",
            name: "iHueFactor",
            defaultValue: 1,
            min: 0,
            max: 2,
        }, {
            type: "float",
            name: "iHueShift",
            defaultValue: 0,
            min: -1,
            max: +1,
        }, {
            separator: "\"Komposition\" und Nachbearbeitung"
        }, {
            type: "bool",
            name: "drawExtraOnTop",
            description: "",
            defaultValue: false,
        }, {
            type: "float",
            name: "iAlphaGrading",
            defaultValue: 1,
            min: 0.1,
            max: 5,
            log: true,
        }, {
            type: "float",
            name: "iExtraScale",
            defaultValue: 1,
            min: 0.2,
            max: 5,
            log: true,
        }, {
            type: "float",
            name: "iExtraFactor",
            defaultValue: 1,
            min: 0.01,
            max: 100.,
            log: true,
        }, {
            type: "float",
            name: "iToneMapping",
            defaultValue: 0,
            min: 0,
            max: 2,
        }, {
            type: "float",
            name: "iToneMappingExposure",
            defaultValue: 1,
            min: 0.01,
            max: 100,
            log: true,
        }, {
            type: "float",
            name: "iGammaPost",
            defaultValue: 1,
            min: 0.1,
            max: 10,
            log: true
        }, {
            separator: "Andere"
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
    gl.useProgram(state.program);
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform1f(state.location.iGammaPre, state.iGammaPre);
    gl.uniform1f(state.location.iContrast, state.iContrast);
    gl.uniform1f(state.location.iGray, state.iGray);
    gl.uniform3fv(state.location.iFactor, state.iFactor);
    gl.uniform2fv(state.location.iSqueeze, state.iSqueeze);
    gl.uniform1i(state.location.drawExtraOnTop, state.drawExtraOnTop);
    gl.uniform1f(state.location.iAlphaGrading, state.iAlphaGrading);
    gl.uniform1f(state.location.iGammaPost, state.iGammaPost);

    gl.uniform1f(state.location.iLightnessFactor, state.iLightnessFactor);
    gl.uniform1f(state.location.iLightnessShift, state.iLightnessShift);
    gl.uniform1f(state.location.iChromaFactor, state.iChromaFactor);
    gl.uniform1f(state.location.iChromaShift, state.iChromaShift);
    gl.uniform1f(state.location.iHueFactor, state.iHueFactor);
    gl.uniform1f(state.location.iHueShift, state.iHueShift);
    gl.uniform1i(state.location.transformHSV, state.transformHSV);
    gl.uniform1i(state.location.transformHSL, state.transformHSL);
    gl.uniform1i(state.location.transformYCh, state.transformYCh);
    gl.uniform1i(state.location.transformOKLCh, state.transformOKLCh);

    gl.uniform1f(state.location.iExtraScale, state.iExtraScale);
    gl.uniform1f(state.location.iExtraFactor, state.iExtraFactor);
    gl.uniform1f(state.location.iToneMapping, state.iToneMapping)
    gl.uniform1f(state.location.iToneMappingExposure, state.iToneMappingExposure);

    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);
    gl.uniform1f(state.location.iFree4, state.iFree4);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.texture0);
    gl.uniform1i(state.location.iTexture0, 0);
    // <-- letzter Parameter <n> muss zu Texture Unit gl.TEXTURE<n> passen

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
