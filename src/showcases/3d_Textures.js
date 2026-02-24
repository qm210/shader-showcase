import {startRenderLoop} from "../webgl/render.js";
import {createTextureFromImage} from "../webgl/helpers.js";

import fragmentShaderSource from "../shaders/texturePlayground_mehrUniforms.glsl";
import vertexShaderSource from "../shaders/vertex.basic.glsl";
import image0 from "../textures/frame.png";
import image1 from "../textures/hubble_extreme_deep_field.jpg";
import image2 from "../textures/mysterious_capybara.png";
import {initBasicState} from "./common.js";

export default {
    title: "Texture Playground: Blendingmethoden",
    init: (gl, sources = {}) => {

        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);
        if (!state.program) {
            return state;
        }

        state.texture0 = createTextureFromImage(gl, image0, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.texture1 = createTextureFromImage(gl, image1, {
            wrapS: gl.REPEAT,
            wrapT: gl.MIRRORED_REPEAT,
            minFilter: gl.LINEAR,
        });
        state.texture2 = createTextureFromImage(gl, image2, {
            wrapS: gl.REPEAT,
            wrapT: gl.REPEAT,
            minFilter: gl.NEAREST,
            magFilter: gl.NEAREST
        });

        gl.useProgram(state.program);

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            type: "bool",
            name: "mistakeUVforST",
            defaultValue: false,
            description: ""
        }, {
            type: "bool",
            name: "forgetAspectRatioCorrection",
            defaultValue: false,
            description: ""
        }, {
            type: "bool",
            name: "forgetYDirectionConvention",
            defaultValue: false,
            description: ""
        }, {
            type: "bool",
            name: "onlyBlendLinearly",
            defaultValue: false,
            description: ""
        }, {
            type: "float",
            name: "iMixingForLinearBlending",
            defaultValue: 0.5,
            min: -2,
            max: 2,
        }, {
            type: "bool",
            name: "onlyTakeMaximum",
            defaultValue: false,
            description: ""
        }, {
            type: "bool",
            name: "onlyTakeMinimum",
            defaultValue: false,
            description: ""
        }, {
            type: "bool",
            name: "onlyBlendByMultiply",
            defaultValue: false,
            description: ""
        }, {
            type: "bool",
            name: "onlyBlendByDivision",
            defaultValue: false,
            description: ""
        }, {
            type: "bool",
            name: "onlyBlendByScreen",
            defaultValue: false,
            description: ""
        }, {
            type: "float",
            name: "iMixingForScreenBlending",
            defaultValue: 0.0,
            min: -2,
            max: 2,
        }, {
            type: "bool",
            name: "onlyBlendBySoftLight",
            defaultValue: false,
            description: ""
        }, {
            type: "float",
            name: "iMixingForSoftLightBlending",
            defaultValue: 0.0,
            min: -2,
            max: 2,
        }, {
            type: "bool",
            name: "onlyBlendByOverlay",
            defaultValue: false,
            description: ""
        }, {
            type: "float",
            name: "iMixingForOverlayBlending",
            defaultValue: 0.0,
            min: -2,
            max: 2,
        }, {
            type: "bool",
            name: "showABadIdeaOfDoingAHueShift",
            defaultValue: false,
            description: ""
        }, {
            type: "float",
            name: "iGamma",
            defaultValue: 1,
            min: 0.01,
            max: 10.,
        }, {
            type: "float",
            name: "iContrast",
            defaultValue: 1.,
            min: -1.,
            max: 9.,
        }, {
            type: "float",
            name: "iGray",
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
        }, {
            type: "float",
            name: "iFree4",
            defaultValue: 0,
            min: -2,
            max: +2,
        }]
    })
};

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform1i(state.location.mistakeUVforST, state.mistakeUVforST);
    gl.uniform1i(state.location.forgetAspectRatioCorrection, state.forgetAspectRatioCorrection);
    gl.uniform1i(state.location.forgetYDirectionConvention, state.forgetYDirectionConvention);
    gl.uniform1i(state.location.onlyBlendLinearly, state.onlyBlendLinearly);
    gl.uniform1f(state.location.iMixingForLinearBlending, state.iMixingForLinearBlending);
    gl.uniform1f(state.location.iMixingForOverlayBlending, state.iMixingForOverlayBlending);
    gl.uniform1f(state.location.iMixingForSoftLightBlending, state.iMixingForSoftLightBlending);
    gl.uniform1f(state.location.iMixingForScreenBlending, state.iMixingForScreenBlending);
    gl.uniform1i(state.location.onlyTakeMaximum, state.onlyTakeMaximum);
    gl.uniform1i(state.location.onlyTakeMinimum, state.onlyTakeMinimum);
    gl.uniform1i(state.location.onlyBlendByMultiply, state.onlyBlendByMultiply);
    gl.uniform1i(state.location.onlyBlendByDivision, state.onlyBlendByDivision);
    gl.uniform1i(state.location.onlyBlendByScreen, state.onlyBlendByScreen);
    gl.uniform1i(state.location.onlyBlendBySoftLight, state.onlyBlendBySoftLight);
    gl.uniform1i(state.location.onlyBlendByOverlay, state.onlyBlendByOverlay);
    gl.uniform1i(state.location.showABadIdeaOfDoingAHueShft, state.showABadIdeaOfDoingAHueShft);
    gl.uniform1f(state.location.iGamma, state.iGamma);
    gl.uniform1f(state.location.iContrast, state.iContrast);
    gl.uniform1f(state.location.iGray, state.iGray);
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
