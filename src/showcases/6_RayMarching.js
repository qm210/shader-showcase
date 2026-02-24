import {startRenderLoop} from "../webgl/render.js";
import {initBasicState} from "./common.js";
import fragmentShaderSource from "../shaders/raymarchingFirstSteps.glsl";

export default {
    title: "Ray Marching: Primitives",
    init: (gl, sources = {}) => {
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        // Denselben gleichen Setup-Code immer zu wiederholen, hat schon auch wenig didaktischen Nutzen
        // -> daher jetzt in initBasicState() ausgelagert.

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            type: "bool",
            name: "showJustASphere",
            description: "Bei Bedarf erstmal ein bisschen Übersicht verschaffen...",
            defaultValue: false,
        }, {
            type: "float",
            name: "iSphereSize",
            defaultValue: 0.25,
            min: 0.05,
            max: 1.,
        }, {
            type: "bool",
            name: "makeSphereColorful",
            description: "Individuelle Einfärbung der Kugel. An dem Beispiel sieht man\n" +
                "dem Code aber an, dass das eher nicht ins bisherige Konzept passt.",
            defaultValue: false,
        }, {
            type: "int",
            name: "iMarchingSteps",
            defaultValue: 70,
            min: 1,
            max: 200,
        }, {
            type: "float",
            name: "iMarchingPrecision",
            defaultValue: 0.001,
            min: 1e-5,
            max: 0.2,
            log: true,
        }, {
            type: "bool",
            name: "useAdaptiveMarchingPrecision",
            description: "Vergleicht beim Marching, ob wir auf längere Strecken die Treffergenauigkeit noch brauchen",
            defaultValue: true,
            hidden: true
        }, {
            type: "float",
            name: "iFocalLength",
            defaultValue: 2.5,
            min: 0.001,
            max: 20,
        }, {
            type: "vec3",
            name: "iCameraTargetOffset",
            defaultValue: [0, 0, 0],
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iCameraCenterDistance",
            defaultValue: 4.5,
            min: 0.01,
            max: 10,
        }, {
            type: "float",
            name: "iCameraHeight",
            defaultValue: 2.1,
            min: 0.01,
            max: 10,
        }, {
            type: "float",
            name: "iCameraRotationFrequency",
            defaultValue: 0.02,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iCameraRotationAngle",
            defaultValue: 0,
            min: 0,
            max: 6.283,
        }, {
            type: "vec3",
            name: "vecDirectionalLight",
            defaultValue: [-0.4, 0.8, -0.4],
            min: -1,
            max: 1,
            normalize: true
        }, {
            type: "float",
            name: "iDiffuseAmount",
            defaultValue: 2.2,
            min: 0,
            max: 20,
        }, {
            type: "float",
            name: "iSpecularAmount",
            defaultValue: 1.0,
            min: 0,
            max: 20,
        }, {
            type: "float",
            name: "iSpecularExponent",
            defaultValue: 25,
            min: 0.1,
            max: 40,
        }, {
            type: "bool",
            name: "useBlinnPhongSpecular",
            defaultValue: false,
            description: "specular ~ \"dot(normal, halfway)\" statt \"dot(rayDir, reflected)\"\n" +
                "Skaliert außerdem noch den Exponenten * 3, dass es vergleichbar bleibt.",
        }, {
            type: "float",
            name: "iFloorSpecularCoefficient",
            defaultValue: 0.4,
            min: 0.,
            max: 2.,
        }, {
            type: "float",
            name: "iShadowHardness",
            defaultValue: 8,
            min: 0.,
            max: 20.,
        }, {
            type: "int",
            name: "iShadowMarchingSteps",
            defaultValue: 80,
            min: 0.,
            max: 200.,
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
        }, {
            type: "float",
            name: "iFree5",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree6",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree7",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree8",
            defaultValue: 0,
            min: -9.99,
            max: +9.99,
        }, {
            type: "float",
            name: "iFree9",
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

    gl.uniform1f(state.location.iMarchingPrecision, state.iMarchingPrecision);
    gl.uniform1i(state.location.iMarchingSteps, state.iMarchingSteps);
    gl.uniform1i(state.location.useAdaptiveMarchingPrecision, state.useAdaptiveMarchingPrecision);
    gl.uniform1i(state.location.showJustASphere, state.showJustASphere);
    gl.uniform1f(state.location.iSphereSize, state.iSphereSize);
    gl.uniform1i(state.location.makeSphereColorful, state.makeSphereColorful);
    gl.uniform1f(state.location.iFocalLength, state.iFocalLength);
    gl.uniform3fv(state.location.iCameraTargetOffset, state.iCameraTargetOffset);
    gl.uniform1f(state.location.iCameraCenterDistance, state.iCameraCenterDistance);
    gl.uniform1f(state.location.iCameraHeight, state.iCameraHeight);
    gl.uniform1f(state.location.iCameraRotationFrequency, state.iCameraRotationFrequency);
    gl.uniform1f(state.location.iCameraRotationAngle, state.iCameraRotationAngle);
    gl.uniform3fv(state.location.vecDirectionalLight, state.vecDirectionalLight);
    gl.uniform1f(state.location.iDiffuseAmount, state.iDiffuseAmount);
    gl.uniform1f(state.location.iSpecularAmount, state.iSpecularAmount);
    gl.uniform1f(state.location.iSpecularExponent, state.iSpecularExponent);
    gl.uniform1i(state.location.useBlinnPhongSpecular, state.useBlinnPhongSpecular);
    gl.uniform1f(state.location.iFloorSpecularCoefficient, state.iFloorSpecularCoefficient);
    gl.uniform1f(state.location.iShadowHardness, state.iShadowHardness);
    gl.uniform1i(state.location.iShadowMarchingSteps, state.iShadowMarchingSteps);

    gl.uniform1f(state.location.iFree0, state.iFree0);
    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);
    gl.uniform1f(state.location.iFree4, state.iFree4);
    gl.uniform1f(state.location.iFree5, state.iFree5);
    gl.uniform1f(state.location.iFree6, state.iFree6);
    gl.uniform1f(state.location.iFree7, state.iFree7);
    gl.uniform1f(state.location.iFree8, state.iFree8);
    gl.uniform1f(state.location.iFree9, state.iFree9);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
