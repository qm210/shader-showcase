import {compile, createStaticVertexBuffer, initVertices} from "../webgl/setup.js";

import vertexShaderSource from "../shaders/vertex.basic.glsl";
import fragmentShaderSource from "../shaders/4_textureBlending.glsl";
import {createTextureFromImage} from "../webgl/helpers.js";
import image0 from "../textures/goofy_floofy_framed.png";
import image1 from "../textures/stained_glass_window.png";

export default {
    title: "Playground: Texture Processing",
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

        state.texture1 = createTextureFromImage(gl, image1, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.location.iTexture1 = gl.getUniformLocation(state.program, "iTexture1");

        gl.useProgram(state.program);
        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            separator: "Vorbereitung der Quellen zum Mischen"
        }, {
            type: "vec2",
            name: "iSqueezeLeft",
            defaultValue: [0, 1],
            min: -2,
            max: 2,
        }, {
            type: "vec2",
            name: "iSqueezeRight",
            defaultValue: [0, 1],
            min: -2,
            max: 2,
        }, {
            type: "bool",
            name: "useColorfulRight",
            description: "",
            defaultValue: true,
        }, {
            type: "bool",
            name: "drawSwirlRight",
            description: "",
            defaultValue: false,
        }, {
            type: "bool",
            name: "decodeSRGB",
            group: "srgb",
            description: "",
            defaultValue: true,
        }, {
            type: "bool",
            name: "compareDecodeSRGB",
            group: "srgb",
            description: "",
            defaultValue: false,
        }, {
            separator: "Blend Mode (von links & rechts -> zur Mitte)"
        }, {
            type: "bool",
            name: "blendMixHalf",
            group: "blendMode",
            description: "",
            defaultValue: true,
        }, {
            type: "bool",
            name: "blendMixByLumi",
            group: "blendMode",
            description: "",
            defaultValue: false,
        }, {
            type: "bool",
            name: "blendMultiply",
            group: "blendMode",
            description: "",
            defaultValue: false,
        }, {
            type: "bool",
            name: "blendMinimum",
            group: "blendMode",
            description: "",
            defaultValue: false,
        }, {
            type: "bool",
            name: "blendMaximum",
            group: "blendMode",
            description: "",
            defaultValue: false,
        }, {
            type: "bool",
            name: "blendScreen",
            group: "blendMode",
            description: "",
            defaultValue: false,
        }, {
            type: "bool",
            name: "blendOverlay",
            group: "blendMode",
            description: "",
            defaultValue: false,
        }, {
            type: "bool",
            name: "blendAdditive",
            group: "blendMode",
            description: "",
            defaultValue: false,
        }, {
            type: "bool",
            name: "blendSoftLight",
            group: "blendMode",
            description: "",
            defaultValue: false,
        }, {
            separator: "zur Freien Verwendung..."
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
    gl.uniform2fv(state.location.iSqueezeLeft, state.iSqueezeLeft);
    gl.uniform2fv(state.location.iSqueezeRight, state.iSqueezeRight);

    gl.uniform1i(state.location.blendMixHalf, state.blendMixHalf);
    gl.uniform1i(state.location.blendMixByLumi, state.blendMixByLumi);
    gl.uniform1i(state.location.blendMultiply, state.blendMultiply);
    gl.uniform1i(state.location.blendMinimum, state.blendMinimum);
    gl.uniform1i(state.location.blendMaximum, state.blendMaximum);
    gl.uniform1i(state.location.blendScreen, state.blendScreen);
    gl.uniform1i(state.location.blendOverlay, state.blendOverlay);
    gl.uniform1i(state.location.blendAdditive, state.blendAdditive);
    gl.uniform1i(state.location.blendSoftLight, state.blendSoftLight);
    gl.uniform1i(state.location.useColorfulRight, state.useColorfulRight);
    gl.uniform1i(state.location.drawSwirlRight, state.drawSwirlRight);
    gl.uniform1i(state.location.decodeSRGB, state.decodeSRGB);
    gl.uniform1i(state.location.compareDecodeSRGB, state.compareDecodeSRGB);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.texture0);
    gl.uniform1i(state.location.iTexture0, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.texture1);
    gl.uniform1i(state.location.iTexture1, 1);
    // ... man erkenne ein Muster...?

    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);
    gl.uniform1f(state.location.iFree4, state.iFree4);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
