// we now take the end state of VL3 as a basis
import standardSetup from "./old3_SimpleGeometry.js";

import fragmentShaderSource from "../../shaders/retired-2025/cubeRayMarchingExtended.glsl";

export default {
    title: "Ray Tracing",
    init: (gl) =>
        standardSetup.init(gl, fragmentShaderSource),
    generateControls:
        standardSetup.generateControls
};
