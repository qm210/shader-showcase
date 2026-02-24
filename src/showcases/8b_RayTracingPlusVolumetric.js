import {startRenderLoop} from "../webgl/render.js";
import {initBasicState} from "./common.js";
import fragmentShaderSource from "../shaders/raytracingPlusVolumetricMarching.glsl";

export default {
    title: "Ray Tracing + Volumetric Marching",
    init: (gl, sources = {}) => {
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        // Anmerkung: das ganze Sammeln der Uniform-Locations wird inzwischen
        // innerhalb initBasicState() abgehandelt, war auf Dauer zuviel zu duplizieren.
        // Hier kommt also noch, was wir darüber hinaus initialisieren müssen (Texturen, Framebuffer, Sonstiges)

        state.modeDebugRendering = 0;

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            type: "float",
            name: "iFieldOfViewDegrees",
            defaultValue: 20,
            min: 0.01,
            max: 180,
        }, {
            type: "float",
            name: "iSceneRotation",
            defaultValue: 0,
            min: 0.,
            max: 6.28,
        }, {
            type: "float",
            name: "iScenePitch",
            defaultValue: 0,
            min: -0.5,
            max: 0.5,
        }, {
            type: "vec3",
            name: "vecDirectionalLight",
            defaultValue: [0.2, -0.4, 0.2],
            min: -1,
            max: 1,
            normalize: true,
        }, {
            type: "float",
            name: "iDiffuseAmount",
            defaultValue: 2.2,
            min: 0.,
            max: 10.,
        }, {
            type: "float",
            name: "iSpecularAmount",
            defaultValue: 3.,
            min: 0.,
            max: 10.,
        }, {
            type: "float",
            name: "iSpecularExponent",
            defaultValue: 21,
            min: 0.01,
            max: 100.,
        }, {
            type: "float",
            name: "iHalfwaySpecularMixing",
            defaultValue: 0,
            min: 0.,
            max: 1.,
        }, {
            type: "float",
            name: "iShadowSharpness",
            defaultValue: 8.,
            min: 0.,
            max: 20.,
        }, {
            type: "vec3",
            name: "vecSkyColor",
            defaultValue: [0.4, 0.6, 1],
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iBacklightAmount",
            defaultValue: 0.55,
            min: 0.,
            max: 10.,
        }, {
            type: "float",
            name: "iSubsurfaceAmount",
            defaultValue: 0.25,
            min: 0.,
            max: 40.,
        }, {
            type: "float",
            name: "iAmbientOcclusionRadius",
            defaultValue: 0.12,
            min: 0.,
            max: 2.,
        }, {
            type: "float",
            name: "iAmbientOcclusionScale",
            defaultValue: 0.95,
            min: 0.,
            max: 1.,
        }, {
            type: "float",
            name: "iAmbientOcclusionIterations",
            defaultValue: 5,
            min: 0.,
            max: 100.,
            step: 1.
        }, {
            type: "float",
            name: "iShadowCastIterations",
            defaultValue: 30,
            min: 1,
            max: 200,
            step: 1,
        }, {
            type: "float",
            name: "iRayMarchingIterations",
            defaultValue: 70,
            min: 1,
            max: 200,
            step: 1,
        }, {
            type: "float",
            name: "iMarchingMinDistance",
            defaultValue: 0.01,
            min: 0.0001,
            max: 2.,
            step: 0.001,
            log: true,
        }, {
            type: "float",
            name: "iMarchingMaxDistance",
            defaultValue: 10,
            min: 1,
            max: 40,
        }, {
            type: "float",
            name: "iRayTracingIterations",
            defaultValue: 5,
            min: 1,
            max: 20,
            step: 1,
        }, {
            type: "button",
            name: "modeDebugRendering",
            label: "Render Debug Values",
            onClick: (button) => {
                state.modeDebugRendering = (state.modeDebugRendering + 1) % 8;
                button.textContent =
                    state.modeDebugRendering === 1
                    ? "Rendering: #bounces / maximum"
                    : state.modeDebugRendering === 2
                    ? "Rendering: #steps / maximum (last marching)"
                    : state.modeDebugRendering === 3
                    ? "Rendering: Marching Distance / maximum"
                    : state.modeDebugRendering === 4
                    ? "Rendering: Remaining Throughput"
                    : state.modeDebugRendering === 5
                    ? "Rendering: #steps volumetric / maximum"
                    : state.modeDebugRendering === 6
                    ? "Rendering: accumulated volumetric color"
                    : state.modeDebugRendering === 7
                    ? "Rendering: accumulated volumetric alpha"
                    : "Rendering: fragColor";
            }
        }, {
            type: "float",
            name: "iMetalReflectance",
            defaultValue: 0.8,
            min: 0.,
            max: 1.,
        }, {
            type: "float",
            name: "iMetalNoisiness",
            defaultValue: 0.0,
            min: 0.,
            max: 0.1,
            step: 0.001,
        }, {
            type: "float",
            name: "iEtaGlassRefraction",
            defaultValue: 1.5,
            min: 0.01,
            max: 10.,
        }, {
            type: "float",
            name: "iCloudsMaxDensity",
            defaultValue: 0.,
            min: 0.0,
            max: 2.,
        }, {
            type: "float",
            name: "iCloudsAbsorptionCoeff",
            defaultValue: 0.2,
            min: 0.,
            max: 5.,
        }, {
            type: "float",
            name: "iCloudsShadowCoeff",
            defaultValue: 3.,
            min: 0.,
            max: 10.,
        }, {
            type: "float",
            name: "iCloudsScaleFactor",
            defaultValue: 1.,
            min: 0.01,
            max: 3.,
        }, {
            type: "float",
            name: "iCloudNoisiness",
            defaultValue: 3.5,
            min: 0.,
            max: 10.,
        }, {
            type: "vec2",
            name: "iCloudDistance",
            defaultValue: [17, 8],
            min: 0.,
            max: 50.,
        }, {
            type: "vec3",
            name: "iCloudDimensions",
            defaultValue: [1, .33, 1],
            min: 0.,
            max: 10,
        }, {
            type: "float",
            name: "iCloudVisitingFrequency",
            defaultValue: 0.,
            min: -2,
            max: 2,
        }, {
            type: "float",
            name: "iCloudMorphSpeed",
            defaultValue: 0.25,
            min: 0,
            max: 2.,
        }, {
            type: "float",
            name: "iVolumetricMarchingIterations",
            defaultValue: 128,
            min: 1,
            max: 1000,
            step: 1
        }, {
            type: "float",
            name: "iVolumetricMarchingStep",
            defaultValue: 0.1,
            min: 0.001,
            max: 1.,
        }, {
            type: "float",
            name: "iVolumetricAlphaThreshold",
            defaultValue: 0.95,
            min: 0.01,
            max: 1.,
        }, {
            type: "float",
            name: "iVolumetricShadowIterations",
            defaultValue: 12,
            min: 1,
            max: 100,
            step: 1
        }, {
            type: "float",
            name: "iVolumetricShadowStep",
            defaultValue: 0.1,
            min: 0.001,
            max: 1.,
        }, {
            type: "float",
            name: "iVolumetricJitterSpeed",
            defaultValue: 1.,
            min: 0.,
            max: 3.,
        }, {
            type: "float",
            name: "iVolumetricJitterAmount",
            defaultValue: 1.,
            min: 0.,
            max: 3.,
        }, {
            type: "float",
            name: "iGammaCorrection",
            defaultValue: 2.2,
            min: 0.,
            max: 4.,
        }, {
            type: "float",
            name: "iNoiseLevel",
            defaultValue: 0.,
            min: 0.,
            max: 0.5,
        }, {
            type: "float",
            name: "iNoiseFreq",
            defaultValue: 1,
            min: 0.001,
            max: 0.5,
            step: 0.001,
        }, {
            type: "float",
            name: "iNoiseOffset",
            defaultValue: 0,
            min: -1,
            max: 1,
        }, {
            type: "float",
            name: "iFractionalOctaves",
            defaultValue: 1,
            min: 1,
            max: 20.,
            step: 1,
        }, {
            type: "float",
            name: "iFractionalScaling",
            defaultValue: 2.,
            min: 1.,
            max: 4.,
        }, {
            type: "float",
            name: "iFractionalDecay",
            defaultValue: 0.5,
            min: 0.01,
            max: 2.,
        }, {
            type: "bool",
            name: "useNormalizedFBM",
            defaultValue: false,
        }, {
            type: "float",
            name: "iCalcNormalEpsilon",
            defaultValue: 0.0005,
            min: 0.00001,
            max: 0.1,
            step: 0.00001,
        }, {
            type: "float",
            name: "iFree0",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
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
        }]
    })
};

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform4fv(state.location.iMouse, state.iMouse);
    gl.uniform4fv(state.location.iMouseDrag, state.iMouseDrag);
    gl.uniform1f(state.location.iMouseWheel, state.iMouseWheel);
    gl.uniform1f(state.location.iFieldOfViewDegrees, state.iFieldOfViewDegrees);
    gl.uniform1f(state.location.iSceneRotation, state.iSceneRotation);
    gl.uniform1f(state.location.iScenePitch, state.iScenePitch);
    gl.uniform1i(state.location.iRayTracingIterations, state.iRayTracingIterations);
    gl.uniform1i(state.location.iRayMarchingIterations, state.iRayMarchingIterations);
    gl.uniform1f(state.location.iMarchingMinDistance, state.iMarchingMinDistance);
    gl.uniform1f(state.location.iMarchingMaxDistance, state.iMarchingMaxDistance);
    gl.uniform1i(state.location.iVolumetricMarchingIterations, state.iVolumetricMarchingIterations);
    gl.uniform1f(state.location.iVolumetricMarchingStep, state.iVolumetricMarchingStep);
    gl.uniform1i(state.location.iVolumetricShadowIterations, state.iVolumetricShadowIterations);
    gl.uniform1f(state.location.iVolumetricShadowStep, state.iVolumetricShadowStep);
    gl.uniform1f(state.location.iVolumetricAlphaThreshold, state.iVolumetricAlphaThreshold);
    gl.uniform1f(state.location.iVolumetricJitterSpeed, state.iVolumetricJitterSpeed);
    gl.uniform1f(state.location.iVolumetricJitterAmount, state.iVolumetricJitterAmount);
    gl.uniform3fv(state.location.vecDirectionalLight, state.vecDirectionalLight);
    gl.uniform1f(state.location.iDiffuseAmount, state.iDiffuseAmount);
    gl.uniform1f(state.location.iSpecularAmount, state.iSpecularAmount);
    gl.uniform1f(state.location.iSpecularExponent, state.iSpecularExponent);
    gl.uniform1f(state.location.iHalfwaySpecularMixing, state.iHalfwaySpecularMixing);
    gl.uniform1f(state.location.iShadowSharpness, state.iShadowSharpness);
    gl.uniform1f(state.location.iBacklightAmount, state.iBacklightAmount);
    gl.uniform3fv(state.location.vecSkyColor, state.vecSkyColor);
    gl.uniform1f(state.location.iSubsurfaceAmount, state.iSubsurfaceAmount);
    gl.uniform1f(state.location.iAmbientOcclusionScale, state.iAmbientOcclusionScale);
    gl.uniform1f(state.location.iAmbientOcclusionRadius, state.iAmbientOcclusionRadius);
    gl.uniform1f(state.location.iAmbientOcclusionIterations, state.iAmbientOcclusionIterations);
    gl.uniform1i(state.location.iShadowCastIterations, state.iShadowCastIterations);
    gl.uniform1f(state.location.iMetalReflectance, state.iMetalReflectance);
    gl.uniform1f(state.location.iMetalNoisiness, state.iMetalNoisiness);
    gl.uniform1f(state.location.iEtaGlassRefraction, state.iEtaGlassRefraction);
    gl.uniform1f(state.location.iCloudsMaxDensity, state.iCloudsMaxDensity);
    gl.uniform1f(state.location.iCloudsScaleFactor, state.iCloudsScaleFactor);
    gl.uniform1f(state.location.iCloudsAbsorptionCoeff, state.iCloudsAbsorptionCoeff);
    gl.uniform1f(state.location.iCloudsShadowCoeff, state.iCloudsShadowCoeff);
    gl.uniform1f(state.location.iCloudMorphSpeed, state.iCloudMorphSpeed);
    gl.uniform1f(state.location.iCloudNoisiness, state.iCloudNoisiness);
    gl.uniform2fv(state.location.iCloudDistance, state.iCloudDistance);
    gl.uniform1f(state.location.iCloudVisitingFrequency, state.iCloudVisitingFrequency);
    gl.uniform3fv(state.location.iCloudDimensions, state.iCloudDimensions);
    gl.uniform1f(state.location.iGammaCorrection, state.iGammaCorrection);
    gl.uniform1f(state.location.iNoiseLevel, state.iNoiseLevel);
    gl.uniform1f(state.location.iNoiseFreq, state.iNoiseFreq);
    gl.uniform1f(state.location.iNoiseOffset, state.iNoiseOffset);
    gl.uniform1i(state.location.iFractionalOctaves, state.iFractionalOctaves);
    gl.uniform1f(state.location.iFractionalScale, state.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1f(state.location.iCalcNormalEpsilon, state.iCalcNormalEpsilon);
    gl.uniform1i(state.location.modeDebugRendering, state.modeDebugRendering);
    gl.uniform1f(state.location.iFree0, state.iFree0);
    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);
    gl.uniform1f(state.location.iFree4, state.iFree4);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
