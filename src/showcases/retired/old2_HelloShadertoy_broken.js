import {compile, createStaticVertexBuffer, initVertices} from "../../webgl/setup.js";

import vertexShaderSource from "../../shaders/retired-2025/basic.vertex.glsl";
import fragmentShaderSource from "../../shaders/retired-2025/shadertoyAsIs.glsl";


export default {
    title: "Hello Shadertoy (broken)",
    init: (gl) => {
        createStaticVertexBuffer(
            gl,
            [-1, -1, +1, -1, -1, +1, -1, +1, +1, -1, +1, +1]
        );

        const state = compile(gl, {
            vertex: vertexShaderSource,
            fragment: fragmentShaderSource,
        });
        if (!state.program) {
            return state;
        }

        // ... how does that relate to the vertex buffer?
        initVertices(gl, state, "aPosition");

        return state;
    },
    generateControls: (gl, state, elements) => ({
        onRender: () => {
            gl.useProgram(state.program);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    })
}
