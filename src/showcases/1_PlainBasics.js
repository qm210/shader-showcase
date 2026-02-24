import {compile, createStaticVertexBuffer, initVertices} from "../webgl/setup.js";

import vertexShaderSource from "../shaders/spring-2025/basic.vertex.glsl";
import fragmentShaderSource from "../shaders/firstBasics.glsl";

export default {
    title: "Very simple example",
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
    generateControls: (gl, state) => ({
        onRender: () => {
            gl.useProgram(state.program);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    })
}
