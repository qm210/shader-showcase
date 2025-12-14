import {initBasicState, startRenderLoop} from "./common.js";
import {createTextureFromImage} from "../webgl/helpers/textures.js";

import vertexShaderSource from "../shaders/vertex.fonts.glsl"
import fragmentShaderSource from "../shaders/fonts.proofofconcept.glsl";
import spiceSaleMsdfPng from "../textures/dream210/SpicySale.msdf.png";
import spiceSaleMsdfJson from "../textures/dream210/SpicySale.msdf.json";
import {createUboForArray} from "../webgl/helpers/uniformbuffers.js";
import {createGlyphDef, toAscii} from "../app/algorithms.js";

export default {
    title: "What about Fonts?",
    init: (gl, sources = {}) => {
        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        const maxFragmentTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        console.log("MAX_TEXTURE_IMAGE_UNITS", maxFragmentTextureUnits);

        const {glyphDef, glyphDebug} = createGlyphDef(spiceSaleMsdfJson);
        const ubo = createUboForArray(gl, state.program, glyphDef, "Glyphs");
        state.msdf = {
            tex: createTextureFromImage(gl, spiceSaleMsdfPng, {
                wrapS: gl.CLAMP_TO_EDGE,
                wrapT: gl.CLAMP_TO_EDGE,
                minFilter: gl.LINEAR,
                maxFilter: gl.LINEAR,
                internalFormat: gl.RGBA8,
                dataFormat: gl.RGBA,
                dataType: gl.UNSIGNED_BYTE,
            }),
            json: spiceSaleMsdfJson,
            ubo,
            glyphDef,
            debug: glyphDebug,
        }

        const someText = "QM says hi \\o/";
        console.log(
            `[DEVEL] ASCII for \"${someText}\"`, toAscii(someText),
            "and maybe useful:", state.msdf
        );

        return state;
    },
    generateControls: (gl, state, elements) => ({
        onRender: () => {
            startRenderLoop(
                state => render(gl, state, elements),
                state,
                elements
            );
        },
        uniforms: [
            // type: "button",
            // name: "executeQueries",
            // label: "Query Rendering",
            // onClick: () => {
            //     state.query.doExecute = true;
            // }
        // }, {
        {
            separator: "Fragment Shader Uniforms"
        }, {
            type: "vec3",
            name: "iTextColor",
            defaultValue: [1, 0.3, 0.5],
            min: 0,
            max: 1
        }, {
            separator: "Zur freien Verwendung..."
        }, {
            type: "float",
            name: "iFree0",
            defaultValue: 0,
            min: 0.01,
            max: 100,
            log: true
        }, {
            type: "float",
            name: "iFree1",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree2",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree3",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree4",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree5",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }]
    })
};

function render(gl, state, elements) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform4fv(state.location.iMouseDrag, state.iMouseDrag);
    gl.uniform1i(state.location.iFrame, state.iFrame);

    gl.uniform1f(state.location.iFree0, state.iFree0);
    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);
    gl.uniform1f(state.location.iFree4, state.iFree4);
    gl.uniform1f(state.location.iFree5, state.iFree5);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.msdf.tex);
    gl.uniform1i(state.location.glyphTex, 0);
    gl.uniform4fv(state.location.glyphDefM, state.msdf.glyphDef.slice(4 * 44, 4*45));

    gl.uniform3fv(state.location.iTextColor, state.iTextColor);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
