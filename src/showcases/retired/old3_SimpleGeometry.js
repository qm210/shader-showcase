import {compile, createStaticVertexBuffer, initVertices} from "../../webgl/setup.js";

import vertexShaderSource from "../../shaders/retired-2025/basic.vertex.glsl";
import defaultFragmentShaderSource from "../../shaders/retired-2025/simpleGeometry.glsl";
import {startRenderLoop} from "../../webgl/render.js";

export default {
    title: "Simple Geometry",
    init: (gl, fragmentShaderSource = defaultFragmentShaderSource) => {
        createStaticVertexBuffer(
            gl,
            [-1, -1, +1, -1, -1, +1, -1, +1, +1, -1, +1, +1]
        );

        const state = compile(gl, {
            vertex: vertexShaderSource,
            fragment: fragmentShaderSource,
        });
        if (!state.program) {
            // remember: need to exist because otherwise we cannot display any errors...
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
            startRenderLoop(
                state => render(gl, state),
                state,
                elements
            );
        },
        uniforms: [{
            type: "label",
            name: "iTime",
        }]
    })
};

function render(gl, state) {
    gl.useProgram(state.program);

    gl.uniform1f(state.location.iTime, state.time);
    try {
        gl.uniform2fv(state.location.iResolution, state.resolution);
    } catch (err) {
        console.warn(err, state);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
