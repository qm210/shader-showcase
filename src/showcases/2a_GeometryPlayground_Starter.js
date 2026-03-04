import {compile, createStaticVertexBuffer, initVertices} from "../webgl/setup.js";

import vertexShaderSource from "../shaders/vertex.basic.glsl";
import fragmentShaderSource from "../shaders/geometryPlaygroundStarter.glsl";

export default {
    title: "Geometry Playground",
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

        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        state.location.iTime = gl.getUniformLocation(state.program, "iTime");
        state.location.iResolution = gl.getUniformLocation(state.program, "iResolution");
        state.resolution = [gl.drawingBufferWidth, gl.drawingBufferHeight];

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            separator: "Kreis & Rechteck"
        }, {
            type: "float",
            name: "iCircleRadius",
            defaultValue: 0.02,
            min: 0,
            max: 1,
        }, {
            type: "vec2",
            name: "iBoxOffset",
            defaultValue: [0.75, -0.25],
            min: [-2, -1],
            max: [2, 1],
        }, {
            type: "vec2",
            name: "iBoxHalfSize",
            defaultValue: [0.25, 0.5],
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iBoxExtend",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            separator: "Bézierkurve",
        }, {
            type: "vec2",
            name: "iBezierPoint1",
            defaultValue: [0, 0.5],
            min: [-2, -1],
            max: [2, 1],
        }, {
            type: "vec2",
            name: "iBezierPoint2",
            defaultValue: [0, 0.5],
            min: [-2, -1],
            max: [2, 1],
        }, {
            type: "vec2",
            name: "iBezierPoint3",
            defaultValue: [-1, 0],
            min: [-2, -1],
            max: [2, 1],
        }, {
            type: "float",
            name: "iBezierThickness",
            defaultValue: 0.02,
            min: 0.0,
            max: 0.1,
            step: 0.001,
        }, {
            type: "bool",
            name: "point2byMouse",
            description: "iBezierPoint2 per Maus setzen",
            defaultValue: false,
        }, {
            separator: "Kombinieren zweier SDF"
        }, {
            type: "float",
            name: "iSmoothing",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            separator: "Zum Rumprobieren nach Laune..."
        }, {
            type: "float",
            name: "free0",
            defaultValue: 0,
        }, {
            type: "float",
            name: "free1",
            defaultValue: 0,
        }, {
            type: "float",
            name: "free2",
            defaultValue: 0,
        }, {
            type: "vec2",
            name: "vecFree0",
            defaultValue: [0, 0],
            min: -1,
            max: 1,
        }, {
            type: "vec2",
            name: "vecFree1",
            defaultValue: [0, 0],
            min: -1,
            max: 1,
        }, {
            type: "vec2",
            name: "vecFree2",
            defaultValue: [0, 0],
            min: -1,
            max: 1,
        }]
    })
}

function render(gl, state) {
    gl.useProgram(state.program);

    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform4fv(state.location.iMouse, state.iMouse);
    gl.uniform4fv(state.location.iMouseDrag, state.iMouseDrag);

    gl.uniform1f(state.location.iCircleRadius, state.iCircleRadius);
    gl.uniform2fv(state.location.iBoxOffset, state.iBoxOffset);
    gl.uniform2fv(state.location.iBoxHalfSize, state.iBoxHalfSize);
    gl.uniform1f(state.location.iBoxExtend, state.iBoxExtend);
    gl.uniform2fv(state.location.iBezierPoint1, state.iBezierPoint1);
    gl.uniform2fv(state.location.iBezierPoint2, state.iBezierPoint2);
    gl.uniform2fv(state.location.iBezierPoint3, state.iBezierPoint3);
    gl.uniform1f(state.location.iBezierThickness, state.iBezierThickness);
    gl.uniform1i(state.location.point2byMouse, state.point2byMouse);
    gl.uniform1f(state.location.iSmoothing, state.iSmoothing);

    gl.uniform1f(state.location.free0, state.free0);
    gl.uniform1f(state.location.free1, state.free1);
    gl.uniform1f(state.location.free2, state.free2);
    gl.uniform2fv(state.location.vecFree0, state.vecFree0);
    gl.uniform2fv(state.location.vecFree1, state.vecFree1);
    gl.uniform2fv(state.location.vecFree2, state.vecFree2);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
