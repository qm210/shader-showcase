import {startRenderLoop} from "../webgl/render.js";
import {initBasicState} from "./common.js";
import {createTextureFromImage} from "../webgl/helpers.js";
import fragmentShaderSource from "../shaders/raymarchingPlusVariousConcepts.glsl";
import imageFrame from "../textures/frame.png";
import imageSpace from "../textures/hubble_extreme_deep_field.jpg";
import imageRock from "../textures/Rock032_1K-JPG_Color.jpg";

export default {
    title: "Various 3D Concepts",
    init: (gl, sources = {}) => {
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        state.textureFrame = createTextureFromImage(gl, imageFrame, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.textureSpace = createTextureFromImage(gl, imageSpace, {
            wrapS: gl.REPEAT,
            wrapT: gl.REPEAT,
            minFilter: gl.LINEAR,
            internalFormat: gl.SRGB8_ALPHA8,
        });
        state.textureRock = createTextureFromImage(gl, imageRock, {
            wrapS: gl.REPEAT,
            wrapT: gl.REPEAT,
            minFilter: gl.LINEAR,
            internalFormat: gl.SRGB8_ALPHA8,
        });

        gl.useProgram(state.program);

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: defineUniformControlsBelow()
    })
};

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform4fv(state.location.iMouseDrag, state.iMouseDrag);
    // <-- PS: habe mir ausgedacht, dass das neue iMouseDrag nützlicher ist als das iMouse a la Shadertoy.
    gl.uniform3fv(state.location.iCamOffset, state.iCamOffset);
    gl.uniform3fv(state.location.iCamLookOffset, state.iCamLookOffset);
    gl.uniform1f(state.location.iCamRoll, state.iCamRoll);
    gl.uniform1f(state.location.iCamFocalLength, state.iCamFocalLength);
    gl.uniform3fv(state.location.vecDirectionalLight, state.vecDirectionalLight);
    gl.uniform1f(state.location.iDirectionalLightStrength, state.iDirectionalLightStrength);
    gl.uniform1f(state.location.iPointLightStrength, state.iPointLightStrength);
    gl.uniform1f(state.location.iLightPointPaletteColor, state.iLightPointPaletteColor);
    gl.uniform1f(state.location.iPathSpeed, state.iPathSpeed);
    gl.uniform1f(state.location.iPathOffset, state.iPathOffset);
    gl.uniform1i(state.location.useCentripetalCatmullRomSplines, state.useCentripetalCatmullRomSplines);
    gl.uniform1i(state.location.useLinearSplines, state.useLinearSplines);
    gl.uniform1i(state.location.tryLinearSplineSpeedApproximation, state.tryLinearSplineSpeedApproximation);
    gl.uniform1f(state.location.iAmbientAmount, state.iAmbientAmount);
    gl.uniform1f(state.location.iDiffuseAmount, state.iDiffuseAmount);
    gl.uniform1f(state.location.iSpecularAmount, state.iSpecularAmount);
    gl.uniform1f(state.location.iSpecularExponent, state.iSpecularExponent);
    gl.uniform1f(state.location.iBacklightAmount, state.iBacklightAmount);
    gl.uniform1f(state.location.iSubsurfaceAmount, state.iSubsurfaceAmount);
    gl.uniform1f(state.location.iSubsurfaceExponent, state.iSubsurfaceExponent);
    gl.uniform1f(state.location.iAmbientOcclusionScale, state.iAmbientOcclusionScale);
    gl.uniform1f(state.location.iAmbientOcclusionRadius, state.iAmbientOcclusionRadius);
    gl.uniform1f(state.location.iAmbientOcclusionSamples, state.iAmbientOcclusionSamples);
    gl.uniform1i(state.location.justTheBoxes, state.justTheBoxes);
    gl.uniform1i(state.location.drawGridOnFloor, state.drawGridOnFloor);
    gl.uniform1i(state.location.showPyramidTextureGrid, state.showPyramidTextureGrid);
    gl.uniform1i(state.location.applyPyramidTextureSkewing, state.applyPyramidTextureSkewing);
    gl.uniform1i(state.location.applyPyramidTextureNarrowing, state.applyPyramidTextureNarrowing);
    gl.uniform1i(state.location.applyPyramidTextureTopDown, state.applyPyramidTextureTopDown);
    gl.uniform1i(state.location.takeBoxTextureForPyramid, state.takeBoxTextureForPyramid);
    gl.uniform1i(state.location.doUseCameraPath, state.doUseCameraPath);
    gl.uniform1i(state.location.displayCameraPathPoints, state.displayCameraPathPoints);
    gl.uniform1i(state.location.displayCameraRotationAxes, state.displayCameraRotationAxes);
    gl.uniform1i(state.location.doUseCameraTargetPath, state.doUseCameraTargetPath);
    gl.uniform1i(state.location.doShowPointLightSource, state.doShowPointLightSource);
    gl.uniform1f(state.location.iDistanceFogExponent, state.iDistanceFogExponent);
    gl.uniform1f(state.location.iToneMapExposure, state.iToneMapExposure);
    gl.uniform1f(state.location.iToneMapACESMixing, state.iToneMapACESMixing);
    gl.uniform1f(state.location.iToneMapACESExposure, state.iToneMapACESExposure);
    gl.uniform1f(state.location.iGammaExponent, state.iGammaExponent);
    gl.uniform1f(state.location.iNoiseLevel, state.iNoiseLevel);
    gl.uniform1f(state.location.iNoiseFreq, state.iNoiseFreq);
    gl.uniform1f(state.location.iNoiseOffset, state.iNoiseOffset);
    gl.uniform1i(state.location.iFractionalOctaves, Math.floor(state.iFractionalOctaves));
    gl.uniform1f(state.location.iFractionalScaling, state.iFractionalScaling);
    gl.uniform1f(state.location.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1i(state.location.useNormalizedFBM, state.useNormalizedFBM);
    gl.uniform1f(state.location.iCylinderRotateYSpeed, state.iCylinderRotateYSpeed);
    gl.uniform1f(state.location.iCylinderThenRotateZSpeed, state.iCylinderThenRotateZSpeed);
    gl.uniform1f(state.location.iCylinderThenRotateNewYSpeed, state.iCylinderThenRotateNewYSpeed);

    gl.uniform1f(state.location.iFree0, state.iFree0);
    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);
    gl.uniform1f(state.location.iFree4, state.iFree4);
    gl.uniform1f(state.location.iFree5, state.iFree5);
    gl.uniform3fv(state.location.vecFree0, state.vecFree0);
    gl.uniform3fv(state.location.vecFree1, state.vecFree1);
    gl.uniform3fv(state.location.vecFree2, state.vecFree2);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.textureFrame);
    gl.uniform1i(state.location.texFrame, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.textureSpace);
    gl.uniform1i(state.location.texSpace, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, state.textureRock);
    gl.uniform1i(state.location.texRock, 2);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function defineUniformControlsBelow() {
    return [{
        type: "separator",
        title: "Kamera - Transformation"
    }, {
        type: "cursorInput",
        name: "iCamOffset",
        keys: ["w", "a", "s", "d", "r", "f", "q"],
        defaultValue: [0, 0, 0],
        step: 0.25,
    }, {
        type: "vec3",
        name: "iCamLookOffset",
        defaultValue: [0, 0, 0],
        min: -5,
        max: +5,
    }, {
        type: "float",
        name: "iCamRoll",
        defaultValue: 0,
        min: -3.141,
        max: +3.141,
        step: 0.001,
    }, {
        type: "float",
        name: "iCamFocalLength",
        defaultValue: 2.5,
        min: 0.001,
        max: 20,
    }, {
        type: "separator",
        title: "Kamera - Pfad-Automatisierung"
    }, {
        type: "bool",
        name: "doUseCameraPath",
        description: "Kamera auf Spline-Pfad bewegen",
        defaultValue: true,
    }, {
        type: "bool",
        name: "doUseCameraTargetPath",
        defaultValue: false,
        description: "Kamera-Blickpunkt auf (eigenem) Spline-Pfad bewegen"
    }, {
        type: "bool",
        name: "displayCameraPathPoints",
        description: "Spline-Kamera-Kontrollpunkte als kleine Kugeln rendern",
        defaultValue: false,
    }, {
        type: "bool",
        name: "displayCameraRotationAxes",
        description: "Kamera-Achsen-Miniaturansicht dazurendern.",
        defaultValue: false,
    }, {
        type: "float",
        name: "iPathSpeed",
        defaultValue: 0,
        min: 0.,
        max: 2.,
    }, {
        type: "float",
        name: "iPathOffset",
        defaultValue: 0,
        min: 0.,
        max: 14.,
    }, {
        type: "bool",
        name: "useCentripetalCatmullRomSplines",
        defaultValue: false,
        description: "Vergleich: Zentripetale Catmull-Rom-Splines für Kamera-Pfad.\n" +
            ""
    }, {
        type: "bool",
        name: "useLinearSplines",
        defaultValue: false,
        description: "Vergleich: Lineare Interpolation für Kamera-Pfad.\n",
    }, {
        type: "bool",
        name: "tryLinearSplineSpeedApproximation",
        defaultValue: false,
        description: "Kamera-Geschwindigkeit näherungsweise konstant anpassen.\n" +
            "(weil die Gesamtlänge des Pfads vereinfacht nur linear bestimmt wird...)",
    }, {
        type: "separator",
        title: "Szene - Troubleshooting"
    }, {
        type: "bool",
        name: "justTheBoxes",
        defaultValue: false,
        description: "Szene auf die beiden Quader reduzieren (für weniger Ablenkung)"
    }, {
        type: "bool",
        name: "drawGridOnFloor",
        defaultValue: false,
        description: "Für die Orientierung (Abstand je 0.5 in Richtung X/Z\)",
    }, {
        type: "separator",
        title: "Beleuchtungsmodell"
    }, {
        type: "float",
        name: "iDirectionalLightStrength",
        defaultValue: 1,
        min: 0,
        max: 2,
    }, {
        type: "float",
        name: "iPointLightStrength",
        defaultValue: 1,
        min: 0,
        max: 2,
    }, {
        type: "bool",
        name: "doShowPointLightSource",
        defaultValue: false,
        description: "Die Quelle des Punktlichts ist nur sichtbar, wenn wir sie eigens rendern."
    }, {
        type: "vec3",
        name: "vecDirectionalLight",
        defaultValue: [-0.2, 1.4, -0.4],
        min: -2,
        max: 2,
    }, {
        type: "float",
        name: "iLightPointPaletteColor",
        defaultValue: 0,
        min: 0.,
        max: 10.,
    }, {
        type: "float",
        name: "iAmbientAmount",
        defaultValue: 0.01,
        min: 0.,
        max: 1.,
    }, {
        type: "float",
        name: "iDiffuseAmount",
        defaultValue: 1,
        min: 0.,
        max: 10.,
    }, {
        type: "float",
        name: "iSpecularAmount",
        defaultValue: 1,
        min: 0.,
        max: 10.,
    }, {
        type: "float",
        name: "iSpecularExponent",
        defaultValue: 21,
        min: 0.1,
        max: 40.,
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
        max: 100.,
    }, {
        type: "float",
        name: "iSubsurfaceExponent",
        defaultValue: 2,
        min: 0.1,
        max: 10.,
    }, {
        type: "float",
        name: "iAmbientOcclusionSamples",
        defaultValue: 5,
        min: 0.,
        max: 100.,
        step: 1.
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
        type: "separator",
        title: "Textur Pyramide"
    }, {
        type: "bool",
        name: "showPyramidTextureGrid",
        defaultValue: false,
        description: "Um die Bereiche Texturkoordinaten \"st\" auf jede Pyramidenseite zu sehen:\n" +
            "Cyan (st.x → 0), Orange (st.x → 1), Grün (st.y → 0), Magenta (st.y → 1),\n" +
            "Blaue Linie (st.x == 0.5) und Rotes Gitter in Schritten von je 0.1"
    }, {
        type: "bool",
        name: "takeBoxTextureForPyramid",
        defaultValue: false,
        description: "Zum Vergleich der Wahl in Texturkoordinaten: Textur aus Bilddatei anbringen\n" +
            "(die im unverzerrten Fall auf den Quadern auch zu sehen ist)",
    }, {
        type: "bool",
        name: "applyPyramidTextureSkewing",
        defaultValue: false,
        description: "Pyramidentextur mit linkem Rand (st.x = 0) an Pyramidenkanten ausrichten,\n" +
            "anstatt beidseitig um die Mittellinie abschneiden."
    }, {
        type: "bool",
        name: "applyPyramidTextureNarrowing",
        defaultValue: false,
        description: "Pyramidentextur zur Spitze hin immer weiter verschmälern.\n" +
            "Schneidet nichts ab, verzerrt aber entsprechend stark."
    }, {
        type: "bool",
        name: "applyPyramidTextureTopDown",
        defaultValue: false,
        description: "Andere Idee: Die Texturkoordinaten schlicht Grundriss gleichsetzen.\n" +
            "(entspricht Interpretation als Draufsicht; wird auch stark verzerrt.)"
    }, {
        type: "separator",
        title: "Eulerwinkel-Drehung am Zylinder"
    }, {
        type: "float",
        name: "iCylinderRotateYSpeed",
        defaultValue: 0,
        min: -2,
        max: 2,
    }, {
        type: "float",
        name: "iCylinderThenRotateZSpeed",
        defaultValue: 0,
        min: -2,
        max: 2,
    }, {
        type: "float",
        name: "iCylinderThenRotateNewYSpeed",
        defaultValue: 0,
        min: -2,
        max: 2,
    }, {
        type: "separator",
        title: "Post-Processing"
    }, {
        type: "float",
        name: "iDistanceFogExponent",
        defaultValue: 2.9,
        min: 0,
        max: 5,
    }, {
        type: "float",
        name: "iToneMapExposure",
        defaultValue: 1,
        min: -1.,
        max: 3.,
    }, {
        type: "float",
        name: "iToneMapACESExposure",
        defaultValue: 1,
        min: 0.1,
        max: 20.,
        log: true
    }, {
        type: "float",
        name: "iToneMapACESMixing",
        defaultValue: 0,
        min: 0,
        max: 1.,
    }, {
        type: "float",
        name: "iGammaExponent",
        defaultValue: 2.2,
        min: 0.25,
        max: 4.,
        log: true,
    }, {
        type: "separator",
        title: "Pseudo-Noise-Berge"
    }, {
        type: "float",
        name: "iNoiseLevel",
        defaultValue: 0.,
        min: 0.,
        max: 1,
        step: 0.01
    }, {
        type: "float",
        name: "iNoiseFreq",
        defaultValue: 1,
        min: 0.001,
        max: 1,
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
        type: "separator",
        title: "Zur freien Verwendung..."
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
    } , {
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
    }];
}