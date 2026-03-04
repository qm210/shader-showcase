import standardSetup from "./old3_SimpleGeometry.js";
import {startRenderLoop} from "../../webgl/render.js";

import fragmentShaderSource from "../../shaders/retired-2025/colorMixing.glsl";

export default {
    title: "Color Mixing",
    init: (gl) => {
        const state = standardSetup.init(gl, fragmentShaderSource);

        if (!state.program) {
            return state;
        }

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
            type: "label",
            name: "iTime",
        }],
    })
};

function render(gl, state) {
    gl.useProgram(state.program);

    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

}
