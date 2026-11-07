import {createTextureFromImage} from "./index.js";
import {initBasicState} from "./common.js";

import fragmentShaderSource from "../shaders/8a_raymarchingStart.glsl";
import image0 from "../textures/goofy_floofy.png";
import image1 from "../textures/hubble_extreme_deep_field.jpg"

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

    gl.uniform1f(state.location.iMarchingPrecision, state.uni.iMarchingPrecision);
    gl.uniform1i(state.location.iMarchingSteps, state.uni.iMarchingSteps);
    gl.uniform1f(state.location.iMarchingMin, state.uni.iMarchingMin);
    gl.uniform1f(state.location.iMarchingMax, state.uni.iMarchingMax);
    gl.uniform1f(state.location.iSphereSize, state.uni.iSphereSize);
    gl.uniform1i(state.location.makeSphereColorful, state.uni.makeSphereColorful);
    gl.uniform1i(state.location.makeSphereTextured, state.uni.makeSphereTextured);
    gl.uniform1f(state.location.iFocalLength, state.uni.iFocalLength);
    gl.uniform3fv(state.location.iCameraOffset, state.uni.iCameraOffset);
    gl.uniform3fv(state.location.iCameraRotate, state.uni.iCameraRotate);
    gl.uniform3fv(state.location.vecDirectionalLight, state.uni.vecDirectionalLight);
    gl.uniform1f(state.location.iDiffuseAmount, state.uni.iDiffuseAmount);
    gl.uniform1f(state.location.iAmbientAmount, state.uni.iAmbientAmount);
    gl.uniform1f(state.location.iSpecularAmount, state.uni.iSpecularAmount);
    gl.uniform1f(state.location.iSpecularShininess, state.uni.iSpecularShininess);
    gl.uniform1i(state.location.useBlinnPhongSpecular, state.uni.useBlinnPhongSpecular);
    gl.uniform1f(state.location.iFloorSpecularCoefficient, state.uni.iFloorSpecularCoefficient);
    gl.uniform1f(state.location.iShadowHardness, state.uni.iShadowHardness);
    gl.uniform1i(state.location.iShadowMarchingSteps, state.uni.iShadowMarchingSteps);
    gl.uniform1f(state.location.iPyramidDisturbAmount, state.uni.iPyramidDisturbAmount);
    gl.uniform1f(state.location.iPyramidDisturbScale, state.uni.iPyramidDisturbScale);
    gl.uniform1f(state.location.iPostGamma, state.uni.iPostGamma);
    gl.uniform1i(state.location.useBackgroundTexture, state.uni.useBackgroundTexture);
    gl.uniform1f(state.location.iDistanceFogDensity, state.uni.iDistanceFogDensity);

    gl.uniform1f(state.location.iFree0, state.uni.iFree0);
    gl.uniform1f(state.location.iFree1, state.uni.iFree1);
    gl.uniform1f(state.location.iFree2, state.uni.iFree2);
    gl.uniform1f(state.location.iFree3, state.uni.iFree3);
    gl.uniform1f(state.location.iFree4, state.uni.iFree4);
    gl.uniform1f(state.location.iFree5, state.uni.iFree5);
    gl.uniform1f(state.location.iFree6, state.uni.iFree6);
    gl.uniform1f(state.location.iFree7, state.uni.iFree7);
    gl.uniform1f(state.location.iFree8, state.uni.iFree8);
    gl.uniform1f(state.location.iFree9, state.uni.iFree9);

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
