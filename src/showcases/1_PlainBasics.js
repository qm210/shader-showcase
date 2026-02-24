import {compile, createStaticVertexBuffer, initVertices} from "../webgl/setup.js";

import vertexShaderSource from "../shaders/vertex.basic.glsl";
import fragmentShaderSource from "../shaders/firstBasics.glsl";

export default {
    title: "Very First Basics",
    init: (gl, sources = {}) => {
        createStaticVertexBuffer(
            gl,
            [-1, -1, +1, -1, -1, 1, -1, +1, +1, -1, +1, +1]
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
    })
}

function render(gl, state) {
    gl.useProgram(state.program);

    // gl.uniform1f(state.location.iTime, state.time);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
