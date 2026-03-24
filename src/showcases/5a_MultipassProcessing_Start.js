import {initBasicState} from "./common.js";
import {createFramebufferWithTexture, createTextureFromImage, updateResolution} from "../webgl/helpers.js";

import vertexShaderSource from "../shaders/vertex.basic.glsl"
import fragmentShaderSource from "../shaders/5a_multipassProcessingStart.glsl";
import imageFloofy from "../textures/goofy_floofy.png";
import imageWindow from "../textures/stained_glass_window.png";

export default {
    title: "Multipass Processing",
    init: (gl, sources = {}) => {
        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        gl.useProgram(state.program);

        state.texFloofy = createTextureFromImage(gl, imageFloofy, {
            wrapS: gl.MIRRORED_REPEAT,
            wrapT: gl.REPEAT,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.location.texFloofy = gl.getUniformLocation(state.program, "texFloofy");

        state.texWindow = createTextureFromImage(gl, imageWindow, {
            wrapS: gl.REPEAT,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.location.texWindow = gl.getUniformLocation(state.program, "texWindow");

        const {width, height} = updateResolution(state, gl);

        const fbOptions = {
            width,
            height,
            attachment: gl.COLOR_ATTACHMENT0,
            dataFormat: gl.RGBA,
            // FLOAT erlaubt Ausgabewerte außerhalb [0; 1]!
            dataType: gl.FLOAT,
            internalFormat: gl.RGBA32F,
        };
        state.framebuffer = {
            pass0: createFramebufferWithTexture(gl, fbOptions),
            pass1: createFramebufferWithTexture(gl, fbOptions),
            pass2: createFramebufferWithTexture(gl, fbOptions),
        };

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            type: "label",
            name: "iTime",
        }, {
            type: "boolean",
            name: "compareOriginal",
            defaultValue: false,
            description: "Originalbild(-textur) auf linker Seite",
        }, {
            type: "boolean",
            name: "alternativeImage",
            defaultValue: false,
            description: "Anderes Bild wählen (Bananenfenster statt Floof-im-Wald)",
        }, {
            separator: "Gauss Blur / Bloom Filter"
        }, {
            type: "int",
            name: "iBlurSamples",
            defaultValue: 0,
            min: 0,
            max: 64,
        }, {
            type: "float",
            name: "iBlurPixels",
            defaultValue: 1,
            min: 0.,
            max: 50.,
        }, {
            type: "float",
            name: "iBlurGaussWidth",
            defaultValue: 0.5,
            min: 0.01,
            max: 2.,
        }, {
            type: "boolean",
            name: "enableBlurDithering",
            defaultValue: false,
            description: "offset blur sampling points by pseudorandom \"jitter\"",
        }, {
            type: "float",
            name: "iBlurDithering",
            defaultValue: 0.1,
            min: 0,
            max: 1,
        }, {
            type: "boolean",
            name: "showOnlyDithered",
            defaultValue: false,
            description: "",
        }, {
            type: "boolean",
            name: "useBloomFilterInsteadOfBlur",
            defaultValue: false,
            description: "uses the blur loop for the \"Bloom\" filter only",
        }, {
            type: "boolean",
            name: "showOnlyBloom",
            defaultValue: false,
            description: "comparison: show only the Bloom color layer",
        }, {
            type: "float",
            name: "iBloomIntensity",
            defaultValue: 0.0,
            min: 0,
            max: 5,
        }, {
            type: "float",
            name: "iBloomThreshold",
            defaultValue: 0.6,
            min: 0,
            max: 1,
        }, {
            separator: "Tone Mapping / Gamma Grading"
        }, {
            type: "boolean",
            name: "useReinhardMapping",
            group: "tonemapping",
            defaultValue: false,
            description: "apply the (most simple) \"Reinhard\" Tone Mapping",
        }, {
            type: "boolean",
            name: "useACESMapping",
            group: "tonemapping",
            defaultValue: false,
            description: "... or the \"ACES\" Tone Mapping",
        }, {
            type: "boolean",
            name: "useHableMapping",
            group: "tonemapping",
            defaultValue: false,
            description: "... or the \"John Hable / Uncharted 2\" Tone Mapping",
        }, {
            type: "float",
            name: "iToneMapExposure",
            defaultValue: 1,
            min: 0,
            max: 10,
        }, {
            type: "float",
            name: "iGamma",
            defaultValue: 1,
            min: 0.1,
            max: 5,
            log: true,
        }, {
            separator: "Ein bisschen HSV-Transformation"
        }, {
            type: "float",
            name: "iHueShift",
            defaultValue: 0,
            min: -1,
            max: 1,
        }, {
            type: "float",
            name: "iSaturationGrading",
            defaultValue: 1,
            min: 0.33,
            max: 3,
            log: true,
        }, {
            type: "float",
            name: "iCutValueMin",
            defaultValue: 0,
            min: 0,
            max: 0.5,
        }, {
            type: "float",
            name: "iCutValueMax",
            defaultValue: 1,
            min: 0.5,
            max: 1,
        }, {
            separator: "Farbfehler: Chromatic Aberration"
        }, {
            type: "float",
            name: "iChrAberrStrength",
            defaultValue: 0,
            min: -.2,
            max: .2,
        }, {
            type: "float",
            name: "iChrAberrRadialShape",
            defaultValue: 0,
            min: 0,
            max: 2,
        }, {
            separator: "Retro-Effekt: Rauschen (Perlin Noise) + Scan Lines + Grünstich"
        }, {
            type: "float",
            name: "iNoise",
            defaultValue: 0,
            min: 0.,
            max: 1.,
        }, {
            type: "float",
            name: "iNoiseScale",
            defaultValue: 64,
            min: 1,
            max: 256,
            step: 0.1,
        }, {
            type: "boolean",
            name: "animateNoise",
            defaultValue: false,
            description: "Zeit als Pseudorandom-Seed verwenden"
        }, {
            type: "float",
            name: "iScanLineScale",
            defaultValue: 0.,
            min: 0.,
            max: 1.,
        }, {
            type: "float",
            name: "iScanLineGrading",
            defaultValue: 2.,
            min: 0.5,
            max: 4.,
            log: true,
        }, {
            type: "float",
            name: "iPhosphorGlowing",
            defaultValue: 0.,
            min: 0.,
            max: 1.,
        }, {
            separator: "Fassverzerrung"
        }, {
            type: "boolean",
            name: "showBarrelDistortion",
            defaultValue: false,
            description: "Nichtlineare Koordinatenverzerrung (anhand Abstand von Mitte)",
        }, {
            type: "float",
            name: "iBarrelDistortion",
            defaultValue: 0.2,
            min: -1,
            max: 1,
        }, {
            type: "float",
            name: "iBarrelDistortionExponent",
            defaultValue: 2,
            min: -2,
            max: 40,
        }, {
            separator: "Vignette"
        }, {
            type: "boolean",
            name: "showVignette",
            defaultValue: false,
            description: "Ecken abdunkeln (das heißt Vignette)",
        }, {
            type: "float",
            name: "iVignetteInner",
            defaultValue: 0.8,
            min: 0.5,
            max: 1,
        }, {
            type: "float",
            name: "iVignetteOuter",
            defaultValue: 1.3,
            min: 0.9,
            max: 2.,
        }, {
            separator: "..."
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
        }]
    })
};

function render(gl, state) {
    const loc = state.location;
    gl.uniform1f(loc.iTime, state.time);
    gl.uniform2fv(loc.iResolution, state.resolution);
    gl.uniform2fv(loc.texelSize, state.texelSize);
    gl.uniform1i(loc.iFrame, state.iFrame);
    gl.uniform1i(loc.compareOriginal, state.compareOriginal);
    gl.uniform1i(loc.alternativeImage, state.alternativeImage);
    gl.uniform1i(loc.iBlurSamples, state.iBlurSamples);
    gl.uniform1f(loc.iBlurPixels, state.iBlurPixels);
    gl.uniform1f(loc.iBlurGaussWidth, state.iBlurGaussWidth);
    gl.uniform1i(loc.enableBlurDithering, state.enableBlurDithering);
    gl.uniform1f(loc.iBlurDithering, state.iBlurDithering);
    gl.uniform1i(loc.showOnlyDithered, state.showOnlyDithered);
    gl.uniform1i(loc.useBloomFilterInsteadOfBlur, state.useBloomFilterInsteadOfBlur);
    gl.uniform1i(loc.showOnlyBloom, state.showOnlyBloom);
    gl.uniform1f(loc.iBloomIntensity, state.iBloomIntensity);
    gl.uniform1f(loc.iBloomThreshold, state.iBloomThreshold);
    gl.uniform1i(loc.useReinhardMapping, state.useReinhardMapping);
    gl.uniform1i(loc.useACESMapping, state.useACESMapping);
    gl.uniform1i(loc.useHableMapping, state.useHableMapping);
    gl.uniform1f(loc.iToneMapExposure, state.iToneMapExposure);
    gl.uniform1f(loc.iGamma, state.iGamma);
    gl.uniform1f(loc.iChrAberrStrength, state.iChrAberrStrength);
    gl.uniform1f(loc.iChrAberrRadialShape, state.iChrAberrRadialShape);
    gl.uniform1f(loc.iHueShift, state.iHueShift);
    gl.uniform1f(loc.iSaturationGrading, state.iSaturationGrading);
    gl.uniform1f(loc.iCutValueMin, state.iCutValueMin);
    gl.uniform1f(loc.iCutValueMax, state.iCutValueMax);
    gl.uniform1f(loc.iNoise, state.iNoise);
    gl.uniform1f(loc.iNoiseScale, state.iNoiseScale);
    gl.uniform1i(loc.animateNoise, state.animateNoise);
    gl.uniform1f(loc.iScanLineScale, state.iScanLineScale);
    gl.uniform1f(loc.iScanLineGrading, state.iScanLineGrading);
    gl.uniform1f(loc.iPhosphorGlowing, state.iPhosphorGlowing);
    gl.uniform1i(loc.showBarrelDistortion, state.showBarrelDistortion);
    gl.uniform1f(loc.iBarrelDistortion, state.iBarrelDistortion);
    gl.uniform1f(loc.iBarrelDistortionExponent, state.iBarrelDistortionExponent);
    gl.uniform1i(loc.showVignette, state.showVignette);
    gl.uniform1f(loc.iVignetteInner, state.iVignetteInner);
    gl.uniform1f(loc.iVignetteOuter, state.iVignetteOuter);

    gl.uniform1f(loc.iFree0, state.iFree0);
    gl.uniform1f(loc.iFree1, state.iFree1);
    gl.uniform1f(loc.iFree2, state.iFree2);
    gl.uniform1f(loc.iFree3, state.iFree3);
    gl.uniform3fv(loc.vecFree0, state.vecFree0);
    gl.uniform3fv(loc.vecFree1, state.vecFree1);
    gl.uniform3fv(loc.vecFree2, state.vecFree2);

    ////////

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.texFloofy);
    gl.uniform1i(state.location.texFloofy, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.texWindow);
    gl.uniform1i(state.location.texWindow, 1);

    gl.uniform1i(loc.iPass, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer.pass0.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.uniform1i(loc.iPass, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer.pass1.fbo);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.pass0.texture);
    gl.uniform1i(state.location.texPrevious, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.uniform1i(loc.iPass, 2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer.pass2.fbo);
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.pass1.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.uniform1i(loc.iPass, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.pass2.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
