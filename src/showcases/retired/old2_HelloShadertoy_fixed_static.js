import {compile, createStaticVertexBuffer, initVertices} from "../../webgl/setup.js";

import vertexShaderSource from "../../shaders/retired-2025/basic.vertex.glsl";
import fragmentShaderSource from "../../shaders/retired-2025/shadertoyFixed.glsl";


export default {
    title: "Hello Shadertoy (static)",
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

        initVertices(gl, state, "aPosition");

        // oh hey, look at this! (optional)
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        state.location.iTime = gl.getUniformLocation(state.program, "iTime");
        state.location.iResolution = gl.getUniformLocation(state.program, "iResolution");

        // custom field, why not add right here.
        state.resolution = [gl.drawingBufferWidth, gl.drawingBufferHeight];

        return state;
    },
    generateControls: (gl, state, elements) => ({
        onRender: () => {
            gl.useProgram(state.program);

            gl.uniform1f(state.location.iTime, 0);
            gl.uniform2fv(state.location.iResolution, state.resolution);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    })
}
