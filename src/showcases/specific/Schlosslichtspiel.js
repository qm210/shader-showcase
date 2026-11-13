import {compile, createStaticVertexBuffer, initVertices} from "../index.js";

import vertexShaderSource from "../../shaders/vertex.basic.glsl";
import fragmentShaderSource from "../../shaders/specific/schlosslichtspiel.fragment.glsl";

export default {
    title: "Schlosslichtspiel",
    init: (gl, sources = {}) => {
        createStaticVertexBuffer(
            gl, [-1, -1, +1, -1, -1, 1, -1, +1, +1, -1, +1, +1]
        );

        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = compile(gl, sources);
        if (!state.program) {
            return state;
        }

        initVertices(gl, state, "aPosition");

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: createUniforms(),
    })
}

let printDebug = false;

function render(gl, state) {
    if (printDebug) {
        console.info("[DEBUG STATE]", state);
        printDebug = false;
    }
    state.playground?.update(state.play.dt);

    gl.useProgram(state.program);

    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);

    gl.uniform1f(state.location.iNoiseScaleA, state.uni.iNoiseScaleA);
    gl.uniform1f(state.location.iNoiseMorphingA, state.uni.iNoiseMorphingA);
    gl.uniform1i(state.location.iFractionalOctaves, state.uni.iFractionalOctaves);
    gl.uniform1f(state.location.iFractionalScale, state.uni.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.uni.iFractionalDecay);
    gl.uniform1f(state.location.iNoiseScaleC, state.uni.iNoiseScaleC);
    gl.uniform1f(state.location.iNoiseMorphingC, state.uni.iNoiseMorphingC);
    gl.uniform1f(state.location.iMarbleGranularity, state.uni.iMarbleGranularity);
    gl.uniform2fv(state.location.iMarbleSqueeze, state.uni.iMarbleSqueeze);
    gl.uniform1f(state.location.iMarbleGradingExponent, state.uni.iMarbleGradingExponent);
    gl.uniform1f(state.location.iMarbleRange, state.uni.iMarbleRange);
    gl.uniform1f(state.location.iMarbleDrift, state.uni.iMarbleDrift);

    gl.uniform1f(state.location.iOverallScale, state.uni.iOverallScale);
    gl.uniform2fv(state.location.iOverallNoiseShift, state.uni.iOverallNoiseShift);
    gl.uniform2fv(state.location.iWallDrift, state.uni.iWallDrift);
    gl.uniform1f(state.location.iNoiseLevelA, state.uni.iNoiseLevelA);
    gl.uniform1f(state.location.iNoiseLevelC, state.uni.iNoiseLevelC);
    gl.uniform1f(state.location.iNoiseLevelAC, state.uni.iNoiseLevelAC);
    gl.uniform1f(state.location.iColorStrength, state.uni.iColorStrength);
    gl.uniform1f(state.location.iColorContrast, state.uni.iColorContrast);
    gl.uniform1f(state.location.iColorOffset, state.uni.iColorOffset);
    gl.uniform1f(state.location.iColorCycle, state.uni.iColorCycle);
    gl.uniform1f(state.location.iPaletteMix, state.uni.iPaletteMix);
    gl.uniform3fv(state.location.iColorCosineFreq, state.uni.iColorCosineFreq);
    gl.uniform3fv(state.location.iColorCosinePhase, state.uni.iColorCosinePhase);
    gl.uniform1f(state.location.iStructureOpacity, state.uni.iStructureOpacity);

    gl.uniform1f(state.location.iFlowPush, state.uni.iFlowPush);
    gl.uniform1f(state.location.iFlowRadius, state.uni.iFlowRadius);
    gl.uniform1f(state.location.iWrapRadius, state.uni.iWrapRadius);
    gl.uniform1f(state.location.iWallAO, state.uni.iWallAO);
    gl.uniform1f(state.location.iWallAORadius, state.uni.iWallAORadius);
    gl.uniform1f(state.location.iLitFraction, state.uni.iLitFraction);
    gl.uniform1f(state.location.iLightSwitchRate, state.uni.iLightSwitchRate);
    gl.uniform1f(state.location.iLightSpill, state.uni.iLightSpill);
    gl.uniform1f(state.location.iGlassReflect, state.uni.iGlassReflect);
    gl.uniform1f(state.location.iVignetteStrength, state.uni.iVignetteStrength);
    gl.uniform1f(state.location.iGamma, state.uni.iGamma);

    gl.uniform4fv(state.location.iEventStart, state.uni.iEventStart);
    gl.uniform4fv(state.location.iEventPathY, state.uni.iEventPathY);
    gl.uniform4fv(state.location.iEventDirection, state.uni.iEventDirection);
    gl.uniform1f(state.location.iEventDuration, state.uni.iEventDuration);
    gl.uniform1f(state.location.iEventRepeat, state.uni.iEventRepeat);
    gl.uniform1f(state.location.iEventSize, state.uni.iEventSize);
    gl.uniform2fv(state.location.iEventWobble, state.uni.iEventWobble);
    gl.uniform1f(state.location.iEventSpin, state.uni.iEventSpin);
    gl.uniform3fv(state.location.iEventColor, state.uni.iEventColor);
    gl.uniform1f(state.location.iEventOpacity, state.uni.iEventOpacity);
    gl.uniform1f(state.location.iEventOutline, state.uni.iEventOutline);
    gl.uniform1f(state.location.iEventWarp, state.uni.iEventWarp);
    gl.uniform1f(state.location.iEventOverWindows, state.uni.iEventOverWindows);
    gl.uniform1f(state.location.iEventWindowAvoid, state.uni.iEventWindowAvoid);
    gl.uniform1f(state.location.iEventWindowGap, state.uni.iEventWindowGap);
    gl.uniform1f(state.location.iEventWindowReach, state.uni.iEventWindowReach);

    gl.uniform1f(state.location.iGlowStart, state.uni.iGlowStart);
    gl.uniform1f(state.location.iGlowRamp, state.uni.iGlowRamp);
    gl.uniform3fv(state.location.iGlowColor, state.uni.iGlowColor);
    gl.uniform1f(state.location.iGlowIntensity, state.uni.iGlowIntensity);
    gl.uniform1f(state.location.iGlowRadius, state.uni.iGlowRadius);
    gl.uniform1f(state.location.iGlowFlicker, state.uni.iGlowFlicker);
    gl.uniform1f(state.location.iGlowHueCycle, state.uni.iGlowHueCycle);

    gl.uniform1f(state.location.uLayoutNCols, state.uni.uLayoutNCols);
    gl.uniform1f(state.location.uLayoutNRows, state.uni.uLayoutNRows);
    gl.uniform1f(state.location.uLayoutPanesX, state.uni.uLayoutPanesX);
    gl.uniform1f(state.location.uLayoutPanesY, state.uni.uLayoutPanesY);
    gl.uniform1f(state.location.uLayoutGapBottomMid, state.uni.uLayoutGapBottomMid);
    gl.uniform1f(state.location.uLayoutGapMidTop, state.uni.uLayoutGapMidTop);
    gl.uniform1f(state.location.uLayoutMarginX, state.uni.uLayoutMarginX);
    gl.uniform1f(state.location.uLayoutMarginY, state.uni.uLayoutMarginY);
    gl.uniform1f(state.location.uLayoutBlockShiftY, state.uni.uLayoutBlockShiftY);
    gl.uniform1f(state.location.uLayoutFrameW, state.uni.uLayoutFrameW);
    gl.uniform1f(state.location.uLayoutMullionW, state.uni.uLayoutMullionW);
    gl.uniform1f(state.location.uLayoutSillH, state.uni.uLayoutSillH);
    gl.uniform1f(state.location.uLayoutSillOverhang, state.uni.uLayoutSillOverhang);
    gl.uniform1f(state.location.uLayoutPlinthH, state.uni.uLayoutPlinthH);
    gl.uniform1f(state.location.uLayoutCorniceH, state.uni.uLayoutCorniceH);
    gl.uniform1f(state.location.uLayoutWrapSmooth, state.uni.uLayoutWrapSmooth);

    gl.uniform3fv(state.location.uColPlaster, state.uni.uColPlaster);
    gl.uniform3fv(state.location.uColFrame, state.uni.uColFrame);
    gl.uniform3fv(state.location.uColMullion, state.uni.uColMullion);
    gl.uniform3fv(state.location.uColSill, state.uni.uColSill);
    gl.uniform3fv(state.location.uColPlinth, state.uni.uColPlinth);
    gl.uniform3fv(state.location.uColCornice, state.uni.uColCornice);
    gl.uniform3fv(state.location.uColGlassLo, state.uni.uColGlassLo);
    gl.uniform3fv(state.location.uColGlassHi, state.uni.uColGlassHi);
    gl.uniform3fv(state.location.uColLitLo, state.uni.uColLitLo);
    gl.uniform3fv(state.location.uColLitHi, state.uni.uColLitHi);

    // Debugging
    gl.uniform1i(state.location.uDebugView, state.uni.uDebugView || 0);

    state.playground?.syncToShader(gl, state);
    state.playground?.syncToState(state);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

const createUniforms = () => [
    { separator: "Wall pattern: morphing fBm" },
    { type: "float", name: "iNoiseScaleA", defaultValue: 1.0, min: 0.01, max: 10, step: 0.01 },
    { type: "float", name: "iNoiseMorphingA", defaultValue: 0.35, min: -3, max: 3, step: 0.01 },
    { type: "int", name: "iFractionalOctaves", defaultValue: 5, min: 1, max: 8, step: 1 },
    { type: "float", name: "iFractionalScale", defaultValue: 2.1, min: 0.1, max: 4, step: 0.01 },
    { type: "float", name: "iFractionalDecay", defaultValue: 0.55, min: 0, max: 1, step: 0.01 },

    { separator: "Wall pattern: marble stripes" },
    { type: "float", name: "iNoiseScaleC", defaultValue: 0.7, min: 0.01, max: 10, step: 0.01 },
    { type: "float", name: "iNoiseMorphingC", defaultValue: 0.22, min: -3, max: 3, step: 0.01 },
    { type: "float", name: "iMarbleGranularity", defaultValue: 5.0, min: 0, max: 20, step: 0.01 },
    { type: "vec2", name: "iMarbleSqueeze", defaultValue: [6.5, 4.5], min: -20, max: 20, step: 0.01 },
    { type: "float", name: "iMarbleGradingExponent", defaultValue: 1.6, min: 0.1, max: 8, step: 0.01 },
    { type: "float", name: "iMarbleRange", defaultValue: 0.9, min: 0, max: 3, step: 0.01 },
    { type: "float", name: "iMarbleDrift", defaultValue: 0.25, min: -3, max: 3, step: 0.01 },

    { separator: "Wall pattern: placement and mixing" },
    { type: "float", name: "iOverallScale", defaultValue: 2.2, min: 0.05, max: 10, step: 0.01 },
    { type: "vec2", name: "iOverallNoiseShift", defaultValue: [3.1, 7.4], min: -20, max: 20, step: 0.01 },
    { type: "vec2", name: "iWallDrift", defaultValue: [0.0, 0.0], min: -1, max: 1, step: 0.001 },
    { type: "float", name: "iNoiseLevelA", defaultValue: 1.0, min: -2, max: 2, step: 0.01 },
    { type: "float", name: "iNoiseLevelC", defaultValue: 0.15, min: -2, max: 2, step: 0.01 },
    { type: "float", name: "iNoiseLevelAC", defaultValue: 0.30, min: -2, max: 2, step: 0.01 },

    { separator: "Wall pattern: palette" },
    { type: "float", name: "iColorStrength", defaultValue: 1.0, min: 0, max: 1, step: 0.01 },
    { type: "float", name: "iColorContrast", defaultValue: 1.6, min: 0, max: 5, step: 0.01 },
    { type: "float", name: "iColorOffset", defaultValue: 0.0, min: -2, max: 2, step: 0.01 },
    { type: "float", name: "iColorCycle", defaultValue: 0.0, min: -1, max: 1, step: 0.001 },
    { type: "float", name: "iPaletteMix", defaultValue: 0.0, min: 0, max: 1, step: 0.01 },
    { type: "vec3", name: "iColorCosineFreq", defaultValue: [6.2832, 6.2832, 6.2832], min: 0, max: 25.1328, step: 0.01 },
    { type: "vec3", name: "iColorCosinePhase", defaultValue: [0.0, 2.0944, 4.1888], min: -6.2832, max: 6.2832, step: 0.01 },
    { type: "float", name: "iStructureOpacity", defaultValue: 1.0, min: 0, max: 1, step: 0.01 },

    { separator: "Flow around windows and shapes" },
    // For a smooth, non-folding warp keep iFlowPush < 0.5*iFlowRadius.
    { type: "float", name: "iFlowPush", defaultValue: 0.15, min: 0, max: 0.4, step: 0.005 },
    { type: "float", name: "iFlowRadius", defaultValue: 0.8, min: 0.1, max: 2, step: 0.01 },
    { type: "float", name: "iWrapRadius", defaultValue: 0.6, min: 0.01, max: 3, step: 0.01 },
    { type: "float", name: "iWallAO", defaultValue: 0.35, min: 0, max: 1, step: 0.01 },
    { type: "float", name: "iWallAORadius", defaultValue: 0.18, min: 0.01, max: 1, step: 0.01 },

    { separator: "Window lighting and post" },
    { type: "float", name: "iLitFraction", defaultValue: 0.35, min: 0, max: 1, step: 0.01 },
    { type: "float", name: "iLightSwitchRate", defaultValue: 0.08, min: 0, max: 2, step: 0.01 },
    { type: "float", name: "iLightSpill", defaultValue: 0.22, min: 0, max: 2, step: 0.01 },
    { type: "float", name: "iGlassReflect", defaultValue: 0.10, min: 0, max: 1, step: 0.01 },
    { type: "float", name: "iVignetteStrength", defaultValue: 0.25, min: 0, max: 1, step: 0.01 },
    { type: "float", name: "iGamma", defaultValue: 1.0, min: 0.1, max: 3, step: 0.01 },

    { separator: "Events: circle / square / triangle / hexagon" },
    // vec4 components always follow the shape order in the separator.
    // A negative start disables that shape; repeat=0 plays the sequence once.
    { type: "vec4", name: "iEventStart", defaultValue: [4.0, 12.0, 20.0, 28.0], min: -1, max: 120, step: 0.1 },
    { type: "vec4", name: "iEventPathY", defaultValue: [0.55, -0.1, 0.3, -0.6], min: -1.5, max: 1.5, step: 0.01 },
    // Use -1 or +1; zero is not a useful direction.
    { type: "vec4", name: "iEventDirection", defaultValue: [1.0, -1.0, 1.0, -1.0], min: -1, max: 1, step: 2 },
    { type: "float", name: "iEventDuration", defaultValue: 8.0, min: 0.1, max: 60, step: 0.1 },
    { type: "float", name: "iEventRepeat", defaultValue: 40.0, min: 0, max: 180, step: 0.1 },
    { type: "float", name: "iEventSize", defaultValue: 0.9, min: 0.05, max: 4, step: 0.01 },
    { type: "vec2", name: "iEventWobble", defaultValue: [0.15, 0.25], min: [0, 0], max: [1, 4], step: 0.01 },
    { type: "float", name: "iEventSpin", defaultValue: 0.6, min: -6.2832, max: 6.2832, step: 0.01 },
    { type: "vec3", name: "iEventColor", defaultValue: [0.08, 0.07, 0.10], min: 0, max: 1, step: 0.01 },
    { type: "float", name: "iEventOpacity", defaultValue: 1.0, min: 0, max: 1, step: 0.01 },
    { type: "float", name: "iEventOutline", defaultValue: 0.0, min: 0, max: 1, step: 0.01 },
    { type: "float", name: "iEventWarp", defaultValue: 1.0, min: 0, max: 2, step: 0.01 },
    // These are float uniforms in GLSL, including this layer switch.
    { type: "float", name: "iEventOverWindows", defaultValue: 1.0, min: 0, max: 1, step: 1 },
    { type: "float", name: "iEventWindowAvoid", defaultValue: 1.0, min: 0, max: 2, step: 0.01 },
    { type: "float", name: "iEventWindowGap", defaultValue: 0.05, min: 0, max: 0.5, step: 0.001 },
    { type: "float", name: "iEventWindowReach", defaultValue: 0.45, min: 0, max: 2, step: 0.01 },

    { separator: "Events: delayed neon / radioactive glow" },
    { type: "float", name: "iGlowStart", defaultValue: 24.0, min: 0, max: 180, step: 0.1 },
    { type: "float", name: "iGlowRamp", defaultValue: 6.0, min: 0.01, max: 60, step: 0.01 },
    { type: "vec3", name: "iGlowColor", defaultValue: [0.2, 1.0, 0.3], min: 0, max: 1, step: 0.01 },
    { type: "float", name: "iGlowIntensity", defaultValue: 1.1, min: 0, max: 5, step: 0.01 },
    { type: "float", name: "iGlowRadius", defaultValue: 0.6, min: 0.01, max: 3, step: 0.01 },
    { type: "float", name: "iGlowFlicker", defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
    { type: "float", name: "iGlowHueCycle", defaultValue: 0.08, min: -1, max: 1, step: 0.001 },



    { separator: "Layout dimensions (uniforms)" },
    { type: "float", name: "uLayoutNCols", defaultValue: 8.0, min: 1, max: 20, step: 1 },
    { type: "float", name: "uLayoutNRows", defaultValue: 3.0, min: 1, max: 10, step: 1 },
    { type: "float", name: "uLayoutPanesX", defaultValue: 2.0, min: 1, max: 8, step: 1 },
    { type: "float", name: "uLayoutPanesY", defaultValue: 4.0, min: 1, max: 12, step: 1 },
    { type: "float", name: "uLayoutGapBottomMid", defaultValue: 0.5, min: 0, max: 3, step: 0.01 },
    { type: "float", name: "uLayoutGapMidTop", defaultValue: 0.333, min: 0, max: 3, step: 0.01 },
    { type: "float", name: "uLayoutMarginX", defaultValue: 1.0, min: 0, max: 5, step: 0.01 },
    { type: "float", name: "uLayoutMarginY", defaultValue: 0.75, min: 0, max: 5, step: 0.01 },
    { type: "float", name: "uLayoutBlockShiftY", defaultValue: 0.12, min: -2, max: 2, step: 0.01 },
    { type: "float", name: "uLayoutFrameW", defaultValue: 0.07, min: 0, max: 0.5, step: 0.001 },
    { type: "float", name: "uLayoutMullionW", defaultValue: 0.035, min: 0, max: 0.2, step: 0.001 },
    { type: "float", name: "uLayoutSillH", defaultValue: 0.09, min: 0, max: 0.5, step: 0.001 },
    { type: "float", name: "uLayoutSillOverhang", defaultValue: 0.10, min: 0, max: 1, step: 0.001 },
    { type: "float", name: "uLayoutPlinthH", defaultValue: 0.55, min: 0, max: 2, step: 0.01 },
    { type: "float", name: "uLayoutCorniceH", defaultValue: 0.35, min: 0, max: 2, step: 0.01 },
    { type: "float", name: "uLayoutWrapSmooth", defaultValue: 0.25, min: 0.01, max: 2, step: 0.01 },

    { separator: "Layout colors in OKLCH (L, C, H)" },
    { type: "vec3", name: "uColPlaster", defaultValue: [0.86, 0.80, 0.70], min: 0, max: 1, step: 0.01 },
    { type: "vec3", name: "uColFrame", defaultValue: [0.93, 0.91, 0.86], min: 0, max: 1, step: 0.01 },
    { type: "vec3", name: "uColMullion", defaultValue: [0.90, 0.88, 0.84], min: 0, max: 1, step: 0.01 },
    { type: "vec3", name: "uColSill", defaultValue: [0.78, 0.74, 0.68], min: 0, max: 1, step: 0.01 },
    { type: "vec3", name: "uColPlinth", defaultValue: [0.30, 0.30, 0.34], min: 0, max: 1, step: 0.01 },
    { type: "vec3", name: "uColCornice", defaultValue: [0.26, 0.24, 0.26], min: 0, max: 1, step: 0.01 },
    { type: "vec3", name: "uColGlassLo", defaultValue: [0.06, 0.09, 0.17], min: 0, max: 1, step: 0.01 },
    { type: "vec3", name: "uColGlassHi", defaultValue: [0.22, 0.34, 0.48], min: 0, max: 1, step: 0.01 },
    { type: "vec3", name: "uColLitLo", defaultValue: [0.95, 0.55, 0.20], min: 0, max: 1, step: 0.01 },
    { type: "vec3", name: "uColLitHi", defaultValue: [1.00, 0.85, 0.50], min: 0, max: 1, step: 0.01 },

    { separator: "Debug" },
    { type: "int", name: "uDebugView", defaultValue: 0, min: 0, max: 6, step: 1 },
];
