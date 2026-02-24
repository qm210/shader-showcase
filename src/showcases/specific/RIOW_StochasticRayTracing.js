import standardSetup from "../retired/old3_SimpleGeometry.js";
import {startRenderLoop} from "../../webgl/render.js";
import {createFramebufferWithTexture, takePingPongFramebuffers} from "../../webgl/helpers.js";

// dieses Beispiel basiert auf dem bekannten "Ray Tracing In One Weekend" von Peter Shirley
// https://raytracing.github.io/books/RayTracingInOneWeekend.html#wherenext?
// bzw. seiner Shader-Toy-Implementierung, big credits an "reinder":
import fragmentShaderSource from "../../shaders/specific/stochasticRayTracing_RIOW.glsl";

export default {
    title: "Stochastic Ray Tracing",
    init: (gl) => {
        const state = standardSetup.init(gl, fragmentShaderSource);

        if (!state.program) {
            return state;
        }

        state.framebuffer = [0, 1].map(() =>
            createFramebufferWithTexture(gl, {
                width: gl.drawingBufferWidth,
                height: gl.drawingBufferHeight,
                attachment: gl.COLOR_ATTACHMENT0,
                internalFormat: gl.RGBA32F,
                dataFormat: gl.RGBA,
                dataType: gl.FLOAT,
            })
        );

        state.location.previousRender = gl.getUniformLocation(state.program, "iChannel0");
        state.location.passIndex = gl.getUniformLocation(state.program, "iPassIndex");
        state.location.iFrame = gl.getUniformLocation(state.program, "iFrame");

        gl.useProgram(state.program);

        return state;
    },
    generateControls: (gl, state, elements) => ({
        onRender: () => {
            startRenderLoop(
                state => render(gl, state),
                state,
                elements
            );
        },
        uniforms: [{
            separator: "Stochastic Ray Tracing"
        }, {
            type: "int",
            name: "iMaxRecursion",
            defaultValue: 6,
            min: 1,
            max: 20
        }, {
            type: "bool",
            name: "disableVariationWithTime",
            defaultValue: false,
            description: "Strahlrichtung-Variation zu jeder Zeit gleich wählen",
            group: "variation"
        }, {
            type: "bool",
            name: "disableVariationOverall",
            defaultValue: false,
            description: "Strahlrichtung-Variation abschalten",
            group: "variation"
        }, {
            type: "bool",
            name: "disableAccumulation",
            defaultValue: false,
            description: "Keine Akkumulation: Frames direkt anzeigen",
        }, {
            type: "button",
            label: "Frame-Akkumulation zurücksetzen",
            onClick: () => {
                state.iFrame = -1;
            }
        }, {
            separator: "Szene -> vereinfachen für mehr FPS"
        }, {
            type: "int",
            name: "iMaxDistance",
            defaultValue: 25,
            min: 1,
            max: 40,
        }, {
            type: "int",
            name: "nSmallSpheresX",
            defaultValue: 22,
            min: 1,
            max: 30,
        }, {
            type: "int",
            name: "nSmallSpheresZ",
            defaultValue: 22,
            min: 1,
            max: 30,
        }, {
            type: "bool",
            name: "demonstrateMovement",
            defaultValue: false,
            description: "Akkumulieren ist schwierig mit bewegten Objekten..."
        }, {
            separator: "Materialparameter der großen Kugeln"
        }, {
            type: "float",
            name: "iDielectricEta",
            defaultValue: 1.5,
            min: 1.,
            max: 5.,
        }, {
            type: "float",
            name: "iDielectricRandomizeDir",
            defaultValue: 0,
            min: 0.,
            max: 1.,
        }, {
            type: "vec3",
            name: "colMetalReflectance",
            defaultValue: [1,1,1],
            min: 0.,
            max: 2.,
        }, {
            type: "float",
            name: "iMetalRandomizeDir",
            defaultValue: 0,
            min: 0.,
            max: 1.,
        }, {
            separator: "Nachbearbeitung"
        }, {
            type: "float",
            name: "iGamma",
            defaultValue: 2.0,
            min: 0.1,
            max: 4,
        }]
    })
};

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform1i(state.location.iFrame, state.iFrame);

    gl.uniform1f(state.location.iMaxDistance, state.iMaxDistance);
    gl.uniform1f(state.location.nSmallSpheresX, state.nSmallSpheresX);
    gl.uniform1f(state.location.nSmallSpheresZ, state.nSmallSpheresZ);
    gl.uniform1i(state.location.iMaxRecursion, state.iMaxRecursion);
    gl.uniform1i(state.location.disableVariationWithTime, state.disableVariationWithTime);
    gl.uniform1i(state.location.disableVariationOverall, state.disableVariationOverall);
    gl.uniform1i(state.location.disableAccumulation, state.disableAccumulation);
    gl.uniform1i(state.location.demonstrateMovement, state.demonstrateMovement);
    gl.uniform1f(state.location.iDielectricEta, state.iDielectricEta);
    gl.uniform1f(state.location.iDielectricRandomizeDir, state.iDielectricRandomizeDir);
    gl.uniform3fv(state.location.colMetalReflectance, state.colMetalReflectance);
    gl.uniform1f(state.location.iMetalRandomizeDir, state.iMetalRandomizeDir);
    gl.uniform1f(state.location.iGamma, state.iGamma);

    const {write, read} = takePingPongFramebuffers(state);

    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.uniform1i(state.location.previousRender, 0);
    gl.uniform1i(state.location.passIndex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.uniform1i(state.location.passIndex, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
