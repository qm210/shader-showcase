import {initBasicState} from "./common.js";
import {createPingPongFramebuffersWithTexture, createTextureFromImage, updateResolution} from "../webgl/helpers.js";
import fragmentShaderSource from "../shaders/gol_torus3d.glsl";
import imageFloof from "../textures/goofy_floofy.png"
import imageBG from "../textures/hubble_extreme_deep_field.jpg"
import initial from "../textures/gol_init.png";

export default {
    title: "Game of Life @ Torus",
    init: (gl, sources = {}) => {
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        state.texFloof = createTextureFromImage(gl, imageFloof, {
            wrapS: gl.REPEAT,
            wrapT: gl.REPEAT,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.texSpace = createTextureFromImage(gl, imageBG, {
            wrapS: gl.REPEAT,
            wrapT: gl.REPEAT,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });

        state.texInit = createTextureFromImage(gl, initial, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.NEAREST,
            magFilter: gl.NEAREST,
            onLoaded: () => {
                state.doInit = true;
                state.resetSignal = true;
            },
        });

        const {width, height} = updateResolution(state, gl);

        state.gameBuffers = createPingPongFramebuffersWithTexture(gl, {
            width,
            height,
            attachment: gl.COLOR_ATTACHMENT0,
            dataFormat: gl.RGBA,
            dataType: gl.UNSIGNED_BYTE,
            internalFormat: gl.RGBA8,
            wrapS: gl.REPEAT,
            wrapT: gl.REPEAT,
        });

        state.isRunning = true;
        state.doInit = true;
        state.doEvolve = false;
        state.spawnRandomly = false;
        state.debugFlag = false;
        state.drawByMouse = false;
        return state;
    },
    generateControls: (gl, state) => ({
        renderLoop: render,
        toggles: toggles(state),
        uniforms,
    })
};

function render(gl, state) {
    const loc = state.location;

    gl.uniform1f(loc.iTime, state.time);
    gl.uniform2fv(loc.iResolution, state.resolution);
    gl.uniform4fv(loc.iMouse, state.iMouse);
    gl.uniform3fv(loc.iMouseHover, state.iMouseHover);
    gl.uniform1i(loc.iMouseDown, state.iMouseDown);
    gl.uniform1f(loc.iMarchingPrecision, state.iMarchingPrecision);
    gl.uniform1i(loc.iMarchingSteps, state.iMarchingSteps);
    gl.uniform1f(loc.iMarchingMin, state.iMarchingMin);
    gl.uniform1f(loc.iMarchingMax, state.iMarchingMax);
    gl.uniform2fv(loc.iTorusRadii, state.iTorusRadii);
    gl.uniform1f(loc.iTorusRotate, state.iTorusRotate);
    gl.uniform2fv(loc.iTorusSpin, state.iTorusSpin);
    gl.uniform2fv(loc.iTorusRepeat, state.iTorusRepeat);
    gl.uniform1f(loc.iSphereSize, state.iSphereSize);
    gl.uniform1i(loc.makeSphereColorful, state.makeSphereColorful);
    gl.uniform1i(loc.makeSphereTextured, state.makeSphereTextured);
    gl.uniform1f(loc.iFocalLength, state.iFocalLength);
    gl.uniform3fv(loc.iCameraOffset, state.iCameraOffset);
    gl.uniform3fv(loc.vecDirectionalLight, state.vecDirectionalLight);
    gl.uniform1f(loc.iDiffuseAmount, state.iDiffuseAmount);
    gl.uniform1f(loc.iAmbientAmount, state.iAmbientAmount);
    gl.uniform1f(loc.iSpecularAmount, state.iSpecularAmount);
    gl.uniform1f(loc.iSpecularShininess, state.iSpecularShininess);
    gl.uniform1i(loc.useBlinnPhongSpecular, state.useBlinnPhongSpecular);
    gl.uniform1f(loc.iFloorSpecularCoefficient, state.iFloorSpecularCoefficient);
    gl.uniform1f(loc.iShadowHardness, state.iShadowHardness);
    gl.uniform1i(loc.iShadowMarchingSteps, state.iShadowMarchingSteps);
    gl.uniform1f(loc.iPyramidDisturbAmount, state.iPyramidDisturbAmount);
    gl.uniform1f(loc.iPyramidDisturbScale, state.iPyramidDisturbScale);
    gl.uniform1f(loc.iPostGamma, state.iPostGamma);
    gl.uniform1i(loc.useBackgroundTexture, state.useBackgroundTexture);
    gl.uniform1f(loc.iDistanceFogDensity, state.iDistanceFogDensity);
    gl.uniform1f(loc.iHashSeed, state.iHashSeed);

    gl.uniform1i(loc.debugFlag, state.debugFlag);
    gl.uniform1i(loc.drawByMouse, state.drawByMouse);

    gl.uniform1f(loc.iFree0, state.iFree0);
    gl.uniform1f(loc.iFree1, state.iFree1);
    gl.uniform1f(loc.iFree2, state.iFree2);
    gl.uniform1f(loc.iFree3, state.iFree3);
    gl.uniform1f(loc.iFree4, state.iFree4);
    gl.uniform1f(loc.iFree5, state.iFree5);
    gl.uniform1f(loc.iFree6, state.iFree6);
    gl.uniform1f(loc.iFree7, state.iFree7);
    gl.uniform1f(loc.iFree8, state.iFree8);
    gl.uniform1f(loc.iFree9, state.iFree9);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, state.texSpace);
    gl.uniform1i(loc.texSpace, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, state.texFloof);
    gl.uniform1i(loc.texFloof, 3);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.texInit);
    gl.uniform1i(loc.texInit, 1);

    if (state.iFrame % state.evolveEveryNthFrame === 0) {
        state.doEvolve = true;
    }

    gl.uniform1i(loc.doInit, state.doInit);
    gl.uniform1i(loc.doEvolve, state.doEvolve);
    gl.uniform1i(loc.spawnRandomly, state.spawnRandomly);
    state.doEvolve = false;
    state.spawnRandomly = false;
    state.doInit = false;

    // Framebuffer Ping Pong
    let [write, read] = state.gameBuffers.currentWriteReadOrder();
    state.gameBuffers.doPingPong();

    gl.uniform1i(loc.iPassIndex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(loc.texPrevious, 0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // -> nur noch zum Backbuffer
    read = write;

    gl.uniform1i(loc.iPassIndex, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(loc.texPrevious, 0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

const uniforms = [{
    type: "int",
    name: "evolveEveryNthFrame",
    defaultValue: 30,
    min: 1,
    max: 200,
    notAnUniform: true,
}, {
    separator: "Parameter der Szene"
}, {
    type: "vec2",
    name: "iTorusRadii",
    defaultValue: [0.54,  0.33],
    min: 0,
    max: 1.,
}, {
    type: "float",
    name: "iTorusRotate",
    defaultValue: -80,
    min: -180,
    max: 180,
}, {
    type: "vec2",
    name: "iTorusSpin",
    defaultValue: [-42, 49],
    min: -90,
    max: 90,
}, {
    type: "vec2",
    name: "iTorusRepeat",
    defaultValue: [2, 2],
    min: 1,
    max: 16,
    step: 1
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
    defaultValue: [0.54, 0.22, 0.81],
    min: -1,
    max: 1,
    normalize: true
}, {
    type: "float",
    name: "iDiffuseAmount",
    defaultValue: 3.2,
    min: 0,
    max: 20,
}, {
    type: "float",
    name: "iSpecularAmount",
    defaultValue: 2.0,
    min: 0,
    max: 20,
}, {
    type: "float",
    name: "iSpecularShininess",
    defaultValue: 7,
    min: 0.1,
    max: 40,
}, {
    type: "float",
    name: "iAmbientAmount",
    defaultValue: 0.05,
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
    defaultValue: 1e-5,
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

const toggles = (state) => [{
    label: () =>
        "Init Fresh",
    onClick: () => {
        state.doInit = true;
    },
}, {
    label: () =>
        "Spawn randomly...",
    onClick: () => {
        state.spawnRandomly = true;
    },
}, {
    label: () =>
        "Debug Mode: " + state.debugFlag,
    onClick: () => {
        state.debugFlag = !state.debugFlag;
    }
}, {
    label: () =>
        "Draw by Mouse? " + state.drawByMouse,
    onClick: () => {
        state.drawByMouse = !state.drawByMouse;
    }
}];
