import {compile, createStaticVertexBuffer, initVertices} from "../webgl/setup.js";

import vertexShaderSource from "../shaders/vertex.basic.glsl";
import fragmentShaderSource from "../shaders/colorPlayground.glsl";
import {startRenderLoop} from "../webgl/render.js";


export default {
    title: "Playground: Color",
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
        state.location.palA = gl.getUniformLocation(state.program, "palA");
        state.location.palB = gl.getUniformLocation(state.program, "palB");
        state.location.palC = gl.getUniformLocation(state.program, "palC");
        state.location.palD = gl.getUniformLocation(state.program, "palD");
        state.location.iWhatever = gl.getUniformLocation(state.program, "iWhatever");
        state.location.iGamma = gl.getUniformLocation(state.program, "iGamma");
        state.resolution = [gl.drawingBufferWidth, gl.drawingBufferHeight];

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            type: "float",
            name: "iSaturationOrChroma",
            defaultValue: 0.5,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iLightnessEquivalent",
            defaultValue: 0.5,
            min: 0,
            max: 1,
        }, {
            type: "bool",
            name: "demoHsvHsl",
            group: "demo",
            description: "Hue = Polarwinkel, S & V/L über entsprechende Uniforms",
            defaultValue: true,
        }, {
            type: "bool",
            name: "demoHsvOklch",
            group: "demo",
            description: "Analog zu demoHsvHsl mit OKLCh. Chroma ist ähnlich Sättigung " +
                "(referenziert den \"Farbgehalt\" vgl. zu Weiß), über ca. 0.37 meist durch Monitor limitiert",
            defaultValue: false,
        }, {
            type: "bool",
            name: "demoToneMapping",
            group: "demo",
            description: "2x HSV (S = Radius), Rechts inkl. ACES-Tonemap & Gammakorrektur",
            defaultValue: false,
        }, {
            type: "float",
            name: "iMixToneMapping",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iGamma",
            defaultValue: 1.0,
            min: 0.001,
            max: 10.,
            step: 0.001
        }, {
            type: "bool",
            name: "demoCosinePalette",
            group: "demo",
            description: "die Palette wird dann durch die 12 Einträge in palA...palD gebildet.\n" +
                " Links direkt, Rechts wieder mit Tone Mapping + Gammakorrektur.",
            defaultValue: false,
        }, {
            type: "vec3",
            name: "palA",
            defaultValue: [0.5, 0.5, 0.5],
            min: 0,
            max: 1
        }, {
            type: "vec3",
            name: "palB",
            defaultValue: [0.5, 0.5, 0.5],
            min: 0,
            max: 1
        }, {
            type: "vec3",
            name: "palC",
            defaultValue: [0.5, 0.5, 0.5],
            min: 0,
            max: 3
        }, {
            type: "vec3",
            name: "palD",
            defaultValue: [0.5, 0.5, 0.5],
            min: 0,
            max: 1
        }]
    })
}

function render(gl, state) {
    gl.useProgram(state.program);

    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform1f(state.location.iSaturationOrChroma, state.iSaturationOrChroma);
    gl.uniform1f(state.location.iLightnessEquivalent, state.iLightnessEquivalent);
    gl.uniform3fv(state.location.palA, state.palA);
    gl.uniform3fv(state.location.palB, state.palB);
    gl.uniform3fv(state.location.palC, state.palC);
    gl.uniform3fv(state.location.palD, state.palD);
    gl.uniform1f(state.location.iGamma, state.iGamma);
    gl.uniform1f(state.location.iMixToneMapping, state.iMixToneMapping);
    gl.uniform1i(state.location.demoHsvHsl, state.demoHsvHsl);
    gl.uniform1i(state.location.demoHsvOklch, state.demoHsvOklch);
    gl.uniform1i(state.location.demoToneMapping, state.demoToneMapping);
    gl.uniform1i(state.location.demoCosinePalette, state.demoCosinePalette);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
