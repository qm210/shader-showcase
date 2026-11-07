import {
    compile,
    initVertices,
    createStaticVertexBuffer
} from "../index.js";

import vertexShaderSource from "../../shaders/vertex.basic.glsl";
import fragmentShaderSource from "../../shaders/specific/schlosslichtspiel.fragment.glsl";
import {initTimeline} from "../../experimental/timeline-integration.js";

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

        state.timeline = initTimeline(state);

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
    state.timeline?.update(state.play.dt);

    gl.useProgram(state.program);

    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);

    gl.uniform1f(state.location.iNoiseScaleA, state.iNoiseScaleA);
    gl.uniform1f(state.location.iNoiseMorphingA, state.iNoiseMorphingA);
    gl.uniform1i(state.location.iFractionalOctaves, state.iFractionalOctaves);
    gl.uniform1f(state.location.iFractionalScale, state.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1f(state.location.iNoiseScaleC, state.iNoiseScaleC);
    gl.uniform1f(state.location.iNoiseMorphingC, state.iNoiseMorphingC);
    gl.uniform1f(state.location.iMarbleGranularity, state.iMarbleGranularity);
    gl.uniform2fv(state.location.iMarbleSqueeze, state.iMarbleSqueeze);
    gl.uniform1f(state.location.iMarbleGradingExponent, state.iMarbleGradingExponent);
    gl.uniform1f(state.location.iMarbleRange, state.iMarbleRange);
    gl.uniform1f(state.location.iMarbleDrift, state.iMarbleDrift);

    gl.uniform1f(state.location.iOverallScale, state.iOverallScale);
    gl.uniform2fv(state.location.iOverallNoiseShift, state.iOverallNoiseShift);
    gl.uniform2fv(state.location.iWallDrift, state.iWallDrift);
    gl.uniform1f(state.location.iNoiseLevelA, state.iNoiseLevelA);
    gl.uniform1f(state.location.iNoiseLevelC, state.iNoiseLevelC);
    gl.uniform1f(state.location.iNoiseLevelAC, state.iNoiseLevelAC);
    gl.uniform1f(state.location.iColorStrength, state.iColorStrength);
    gl.uniform1f(state.location.iColorContrast, state.iColorContrast);
    gl.uniform1f(state.location.iColorOffset, state.iColorOffset);
    gl.uniform1f(state.location.iColorCycle, state.iColorCycle);
    gl.uniform1f(state.location.iPaletteMix, state.iPaletteMix);
    gl.uniform3fv(state.location.iColorCosineFreq, state.iColorCosineFreq);
    gl.uniform3fv(state.location.iColorCosinePhase, state.iColorCosinePhase);
    gl.uniform1f(state.location.iStructureOpacity, state.iStructureOpacity);

    gl.uniform1f(state.location.iFlowPush, state.iFlowPush);
    gl.uniform1f(state.location.iFlowRadius, state.iFlowRadius);
    gl.uniform1f(state.location.iWrapRadius, state.iWrapRadius);
    gl.uniform1f(state.location.iWallAO, state.iWallAO);
    gl.uniform1f(state.location.iWallAORadius, state.iWallAORadius);
    gl.uniform1f(state.location.iLitFraction, state.iLitFraction);
    gl.uniform1f(state.location.iLightSwitchRate, state.iLightSwitchRate);
    gl.uniform1f(state.location.iLightSpill, state.iLightSpill);
    gl.uniform1f(state.location.iGlassReflect, state.iGlassReflect);
    gl.uniform1f(state.location.iVignetteStrength, state.iVignetteStrength);
    gl.uniform1f(state.location.iGamma, state.iGamma);

    gl.uniform4fv(state.location.iEventStart, state.iEventStart);
    gl.uniform4fv(state.location.iEventPathY, state.iEventPathY);
    gl.uniform4fv(state.location.iEventDirection, state.iEventDirection);
    gl.uniform1f(state.location.iEventDuration, state.iEventDuration);
    gl.uniform1f(state.location.iEventRepeat, state.iEventRepeat);
    gl.uniform1f(state.location.iEventSize, state.iEventSize);
    gl.uniform2fv(state.location.iEventWobble, state.iEventWobble);
    gl.uniform1f(state.location.iEventSpin, state.iEventSpin);
    gl.uniform3fv(state.location.iEventColor, state.iEventColor);
    gl.uniform1f(state.location.iEventOpacity, state.iEventOpacity);
    gl.uniform1f(state.location.iEventOutline, state.iEventOutline);
    gl.uniform1f(state.location.iEventWarp, state.iEventWarp);
    gl.uniform1f(state.location.iEventOverWindows, state.iEventOverWindows);

    gl.uniform1f(state.location.iGlowStart, state.iGlowStart);
    gl.uniform1f(state.location.iGlowRamp, state.iGlowRamp);
    gl.uniform3fv(state.location.iGlowColor, state.iGlowColor);
    gl.uniform1f(state.location.iGlowIntensity, state.iGlowIntensity);
    gl.uniform1f(state.location.iGlowRadius, state.iGlowRadius);
    gl.uniform1f(state.location.iGlowFlicker, state.iGlowFlicker);
    gl.uniform1f(state.location.iGlowHueCycle, state.iGlowHueCycle);

    gl.uniform1f(state.location.uLayoutNCols, state.uLayoutNCols);
    gl.uniform1f(state.location.uLayoutNRows, state.uLayoutNRows);
    gl.uniform1f(state.location.uLayoutPanesX, state.uLayoutPanesX);
    gl.uniform1f(state.location.uLayoutPanesY, state.uLayoutPanesY);
    gl.uniform1f(state.location.uLayoutGapBottomMid, state.uLayoutGapBottomMid);
    gl.uniform1f(state.location.uLayoutGapMidTop, state.uLayoutGapMidTop);
    gl.uniform1f(state.location.uLayoutMarginX, state.uLayoutMarginX);
    gl.uniform1f(state.location.uLayoutMarginY, state.uLayoutMarginY);
    gl.uniform1f(state.location.uLayoutBlockShiftY, state.uLayoutBlockShiftY);
    gl.uniform1f(state.location.uLayoutFrameW, state.uLayoutFrameW);
    gl.uniform1f(state.location.uLayoutMullionW, state.uLayoutMullionW);
    gl.uniform1f(state.location.uLayoutSillH, state.uLayoutSillH);
    gl.uniform1f(state.location.uLayoutSillOverhang, state.uLayoutSillOverhang);
    gl.uniform1f(state.location.uLayoutPlinthH, state.uLayoutPlinthH);
    gl.uniform1f(state.location.uLayoutCorniceH, state.uLayoutCorniceH);
    gl.uniform1f(state.location.uLayoutWrapSmooth, state.uLayoutWrapSmooth);

    gl.uniform3fv(state.location.uColPlaster, state.uColPlaster);
    gl.uniform3fv(state.location.uColFrame, state.uColFrame);
    gl.uniform3fv(state.location.uColMullion, state.uColMullion);
    gl.uniform3fv(state.location.uColSill, state.uColSill);
    gl.uniform3fv(state.location.uColPlinth, state.uColPlinth);
    gl.uniform3fv(state.location.uColCornice, state.uColCornice);
    gl.uniform3fv(state.location.uColGlassLo, state.uColGlassLo);
    gl.uniform3fv(state.location.uColGlassHi, state.uColGlassHi);
    gl.uniform3fv(state.location.uColLitLo, state.uColLitLo);
    gl.uniform3fv(state.location.uColLitHi, state.uColLitHi);

    // Debugging
    gl.uniform1i(state.location.uDebugView, state.uDebugView || 0);

    state.timeline?.syncToShader(gl, state);

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
    { type: "int", name: "uDebugView", defaultValue: 0, min: 0, max: 5, step: 1 },
];
