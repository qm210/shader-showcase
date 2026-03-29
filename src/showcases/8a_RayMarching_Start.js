import {initBasicState} from "./common.js";
import fragmentShaderSource from "../shaders/8a_raymarchingStart.glsl";
import image0 from "../textures/goofy_floofy.png";
import image1 from "../textures/hubble_extreme_deep_field.jpg"
import {createTextureFromImage} from "../webgl/helpers.js";

export default {
    title: "Ray Marching: First Steps",
    init: (gl, sources = {}) => {
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        state.texFloof = createTextureFromImage(gl, image0, {
            wrapS: gl.REPEAT,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.texSpace = createTextureFromImage(gl, image1, {
            wrapS: gl.REPEAT,
            wrapT: gl.REPEAT,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms,
    })
};

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform4fv(state.location.iMouse, state.iMouse);

    gl.uniform1f(state.location.iMarchingPrecision, state.iMarchingPrecision);
    gl.uniform1i(state.location.iMarchingSteps, state.iMarchingSteps);
    gl.uniform1f(state.location.iMarchingMin, state.iMarchingMin);
    gl.uniform1f(state.location.iMarchingMax, state.iMarchingMax);
    gl.uniform1f(state.location.iSphereSize, state.iSphereSize);
    gl.uniform1i(state.location.makeSphereColorful, state.makeSphereColorful);
    gl.uniform1i(state.location.makeSphereTextured, state.makeSphereTextured);
    gl.uniform1f(state.location.iFocalLength, state.iFocalLength);
    gl.uniform3fv(state.location.iCameraOffset, state.iCameraOffset);
    gl.uniform3fv(state.location.iCameraRotate, state.iCameraRotate);
    gl.uniform3fv(state.location.vecDirectionalLight, state.vecDirectionalLight);
    gl.uniform1f(state.location.iDiffuseAmount, state.iDiffuseAmount);
    gl.uniform1f(state.location.iAmbientAmount, state.iAmbientAmount);
    gl.uniform1f(state.location.iSpecularAmount, state.iSpecularAmount);
    gl.uniform1f(state.location.iSpecularShininess, state.iSpecularShininess);
    gl.uniform1i(state.location.useBlinnPhongSpecular, state.useBlinnPhongSpecular);
    gl.uniform1f(state.location.iFloorSpecularCoefficient, state.iFloorSpecularCoefficient);
    gl.uniform1f(state.location.iShadowHardness, state.iShadowHardness);
    gl.uniform1i(state.location.iShadowMarchingSteps, state.iShadowMarchingSteps);
    gl.uniform1f(state.location.iPyramidDisturbAmount, state.iPyramidDisturbAmount);
    gl.uniform1f(state.location.iPyramidDisturbScale, state.iPyramidDisturbScale);
    gl.uniform1f(state.location.iPostGamma, state.iPostGamma);
    gl.uniform1i(state.location.useBackgroundTexture, state.useBackgroundTexture);
    gl.uniform1f(state.location.iDistanceFogDensity, state.iDistanceFogDensity);

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

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.texFloof);
    gl.uniform1i(state.location.texFloof, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.texSpace);
    gl.uniform1i(state.location.texSpace, 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

const uniforms = [{
    separator: "Parameter der Szene"
}, {
    type: "float",
    name: "iSphereSize",
    defaultValue: 0.25,
    min: 0.05,
    max: 2.,
}, {
    type: "bool",
    name: "makeSphereColorful",
    description: "Individuelle Einfärbung der Kugel",
    defaultValue: false,
}, {
    type: "bool",
    name: "makeSphereTextured",
    description: "Wie wird eine Textur kugelförmig?",
    defaultValue: false,
}, {
    type: "float",
    name: "iPyramidDisturbAmount",
    defaultValue: 0,
    min: 0,
    max: 0.1,
}, {
    type: "float",
    name: "iPyramidDisturbScale",
    defaultValue: 1,
    min: 0.,
    max: 5.,
}, {
    separator: "Camera Setup (Ray Origin & Direction)"
}, {
    type: "vec3",
    name: "iCameraOffset",
    defaultValue: [0, 1, -2],
    min: -9.99,
    max: +9.99,
}, {
    type: "float",
    name: "iFocalLength",
    defaultValue: 2.5,
    min: 0.001,
    max: 20,
}, {
    type: "vec3",
    name: "iCameraRotate",
    defaultValue: [0, 0, 0],
    min: -6.28,
    max: 6.28,
}, {
    separator: "Ray Marching Parameters"
}, {
    type: "int",
    name: "iMarchingSteps",
    defaultValue: 70,
    min: 1,
    max: 500,
}, {
    type: "float",
    name: "iMarchingMin",
    defaultValue: 0.1,
    min: 0.001,
    max: 5,
}, {
    type: "float",
    name: "iMarchingMax",
    defaultValue: 20,
    min: 1,
    max: 200,
}, {
    type: "float",
    name: "iMarchingPrecision",
    defaultValue: 0.001,
    min: 1e-5,
    max: 0.3,
    log: true,
}, {
    separator: "Beleuchtung: \"Phong\"-Modell"
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
    name: "iSpecularShininess",
    defaultValue: 25,
    min: 0.1,
    max: 40,
}, {
    type: "float",
    name: "iFloorSpecularCoefficient",
    defaultValue: 0.4,
    min: 0.,
    max: 2.,
}, {
    type: "float",
    name: "iAmbientAmount",
    defaultValue: 0.0,
    min: 0.,
    max: 1.,
}, {
    separator: "Shadow Cast / Marching"
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
    separator: "Sonstige"
}, {
    type: "float",
    name: "iDistanceFogDensity",
    defaultValue: 1e-4,
    min: 1e-7,
    max: 1e-2,
    log: true,
}, {
    type: "float",
    name: "iPostGamma",
    defaultValue: 2.3,
    min: 0.5,
    max: 4.,
    log: true,
}, {
    type: "bool",
    name: "useBackgroundTexture",
    description: "",
    defaultValue: false,
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
}];
