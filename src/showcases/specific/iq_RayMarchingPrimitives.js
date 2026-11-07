import {initBasicState} from "../common.js";
import fragmentShaderSource from "../../shaders/specific/raymarchingPrimitivesIq.glsl";

export default {
    title: "Ray Marching: iq's Primitives",
    init: (gl, sources = {}) => {
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        state.location.iFree0 = gl.getUniformLocation(state.program, "iFree0");
        state.location.iFree1 = gl.getUniformLocation(state.program, "iFree1");
        state.location.iFree2 = gl.getUniformLocation(state.program, "iFree2");
        state.location.iFree3 = gl.getUniformLocation(state.program, "iFree3");
        state.location.iFree4 = gl.getUniformLocation(state.program, "iFree4");
        state.location.iFree5 = gl.getUniformLocation(state.program, "iFree5");
        state.location.iFree6 = gl.getUniformLocation(state.program, "iFree6");
        state.location.iFree7 = gl.getUniformLocation(state.program, "iFree7");
        state.location.iFree8 = gl.getUniformLocation(state.program, "iFree8");
        state.location.iFree9 = gl.getUniformLocation(state.program, "iFree9");

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            type: "float",
            name: "iFree0",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iFree1",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iFree2",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iFree3",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iFree4",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iFree5",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iFree6",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iFree7",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iFree8",
            defaultValue: 0,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iFree9",
            defaultValue: 0,
            min: 0,
            max: 1,
        }]
    })
};

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform4fv(state.location.iMouse, state.iMouse);

    gl.uniform1f(state.location.iFree0, state.uni.iFree0);
    gl.uniform1f(state.location.iFree1, state.uni.iFree1);
    gl.uniform1f(state.location.iFree2, state.uni.iFree2);
    gl.uniform1f(state.location.iFree3, state.uni.iFree3);
    gl.uniform1f(state.location.iFree4, state.uni.iFree4);
    gl.uniform1f(state.location.iFree5, state.uni.iFree5);
    gl.uniform1f(state.location.iFree6, state.uni.iFree6);
    gl.uniform1f(state.location.iFree7, state.uni.iFree7);
    gl.uniform1f(state.location.iFree8, state.uni.iFree8);
    gl.uniform1f(state.location.iFree9, state.uni.iFree9);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
