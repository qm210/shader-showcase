import {startRenderLoop} from "../../webgl/render.js";
import {createFramebufferWithTexture} from "../../webgl/helpers.js";

import fragmentShaderSource from "../../shaders/performancePlayground.glsl";
import {initBasicState} from "../common.js";

export default {
    title: "Performance Considerations",
    init: (gl, sources = {}) => {
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        gl.ext.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
        if (!gl.ext.timer) {
            console.error("For querying, we need the \"EXT_disjoint_timer_query_webgl2\" WebGL2 extension.");
        }

        state.framebuffer = [0, 1].map(() =>
            createFramebufferWithTexture(gl, {
                width: gl.drawingBufferWidth,
                height: gl.drawingBufferHeight,
                attachment: gl.COLOR_ATTACHMENT0,
            })
        );
        state.location.texture = [
            state.location.textureA,
            state.location.textureB
        ];
        state.query = {
            obj: [
                gl.createQuery(),
                gl.createQuery()
            ],
            doExecute: false,
        }

        return state;
    },
    generateControls: (gl, state, elements) => ({
        onRender: () => {
            startRenderLoop(
                state => render(gl, state, elements),
                state,
                elements
            );
        },
        uniforms: [{
            type: "button",
            name: "executeQueries",
            label: "Query Rendering",
            onClick: () => {
                state.query.doExecute = true;
            }
        }, {
            type: "int",
            name: "iQueryRepetitions",
            defaultValue: 1,
            min: 1,
            max: 100_000,
            log: true
        }, {
            type: "bool",
            name: "onlyPassA",
            defaultValue: false,
            description: "Nur Fall \"A\" berechnen",
            group: "onePass"
        }, {
            type: "bool",
            name: "onlyPassB",
            defaultValue: false,
            description: "Nur Fall \"B\" berechnen",
            group: "onePass"
        }, {
            type: "int",
            name: "nMarchingSteps",
            defaultValue: 70,
            min: 1,
            max: 100,
        }, {
            type: "int",
            name: "nShadowMarchingSteps",
            defaultValue: 50,
            min: 1,
            max: 100,
        }, {
            type: "float",
            name: "iResultMin",
            defaultValue: 0,
        }, {
            type: "float",
            name: "iResultMin",
            defaultValue: 0,
        }, {
            type: "float",
            name: "iResultMax",
            defaultValue: 1,
        }, {
            type: "float",
            name: "iCutoffMin",
            defaultValue: -3,
            min: -3,
            max: 3
        }, {
            type: "float",
            name: "iCutoffMax",
            defaultValue: 3,
            min: -3,
            max: 3
        }, {
            type: "float",
            name: "iScale",
            defaultValue: 1,
            min: 0.001,
            max: 100,
            log: true,
        }, {
            type: "float",
            name: "iStepLength",
            defaultValue: 0.1,
            min: 0.001,
            max: 1,
        }, {
            type: "int",
            name: "iStepIterations",
            defaultValue: 10,
            min: 1,
            max: 999,
        }, {
            separator: "Szene vereinfachen / erschweren..."
        }, {
            type: "int",
            name: "nObjectsProDim",
            defaultValue: 4,
            min: 1,
            max: 20,
        }, {
            type: "float",
            name: "iNoiseLevel",
            defaultValue: 0,
            min: 0.,
            max: 2,
            step: 0.01,
        }, {
            type: "float",
            name: "iNoiseFreq",
            defaultValue: 1,
            min: 0.1,
            max: 10,
            step: 0.01,
        }, {
            type: "int",
            name: "iNoiseOctaves",
            defaultValue: 3,
            min: 1,
            max: 10,
        }, {
            type: "float",
            name: "iNoiseScale",
            defaultValue: 1,
            min: 0.1,
            max: 30,
            step: 0.01,
        }, {
            separator: "Zur freien Verwendung..."
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
        }]
    })
};

function render(gl, state, elements) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform4fv(state.location.iMouseDrag, state.iMouseDrag);
    gl.uniform1i(state.location.iFrame, state.iFrame);

    gl.uniform1i(state.location.onlyPassA, state.onlyPassA);
    gl.uniform1i(state.location.onlyPassB, state.onlyPassB);
    gl.uniform1f(state.location.nObjectsProDim, state.nObjectsProDim);
    gl.uniform1f(state.location.iResultMin, state.iResultMin);
    gl.uniform1f(state.location.iResultMax, state.iResultMax);
    gl.uniform1f(state.location.iCutoffMin, state.iCutoffMin);
    gl.uniform1f(state.location.iCutoffMax, state.iCutoffMax);
    gl.uniform1f(state.location.iScale, state.iScale);
    gl.uniform1f(state.location.iStepLength, state.iStepLength);
    gl.uniform1i(state.location.iStepIterations, state.iStepIterations);
    gl.uniform1f(state.location.iNoiseScale, state.iNoiseScale);
    gl.uniform1f(state.location.iNoiseLevel, state.iNoiseLevel);
    gl.uniform1f(state.location.iNoiseFreq, state.iNoiseFreq);
    gl.uniform1i(state.location.iNoiseOctaves, state.iNoiseOctaves);
    gl.uniform1i(state.location.nMarchingSteps, state.nMarchingSteps);
    gl.uniform1i(state.location.nShadowMarchingSteps, state.nShadowMarchingSteps);

    gl.uniform1f(state.location.iFree0, state.iFree0);
    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);
    gl.uniform1f(state.location.iFree4, state.iFree4);
    gl.uniform1f(state.location.iFree5, state.iFree5);
    gl.uniform3fv(state.location.vecFree0, state.vecFree0);
    gl.uniform3fv(state.location.vecFree1, state.vecFree1);
    gl.uniform3fv(state.location.vecFree2, state.vecFree2);

    state.framebuffer.forEach((fb, index) => {
        if (state.onlyPassB && index === 0) {
            return;
        }
        if (state.onlyPassA && index === 1) {
            return;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo);
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.uniform1i(state.location.iPassIndex, index);

        if (state.query.doExecute) {
            gl.uniform1i(state.location.iQueryRepetitions, state.iQueryRepetitions);
            gl.beginQuery(gl.ext.timer.TIME_ELAPSED_EXT, state.query.obj[index]);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.endQuery(gl.ext.timer.TIME_ELAPSED_EXT);
        } else {
            gl.uniform1i(state.location.iQueryRepetitions, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    state.framebuffer.forEach((fb, index) => {
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, fb.texture);
        gl.uniform1i(state.location.texture[index], index);
    });
    gl.uniform1i(state.location.iPassIndex, -1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    checkQueries(gl, state, elements);
}

function checkQueries(gl, state, elements) {
    if (!state.query.doExecute) {
        return;
    }
    state.query.doExecute = false;

    Promise.all(
        state.query.obj.map((query, index) =>
            evaluateQuery(query, gl)
                .then(time => {
                    console.log("Query Pass", index, "took", time / state.iQueryRepetitions / 1e6, "ms per repetition");
                    return time / state.iQueryRepetitions;
                })
        )
    ).then(time => {
        const ratio = time[0] / time[1];
        elements.controlButtons.executeQueries.innerHTML = `
            <div class="readout-stats">
                <div>Queried Rendering Times</div>
                <div>Pass A: ${(time[0] / 1e6).toFixed(6)} ms</div>
                <div>Pass B: ${(time[1] / 1e6).toFixed(6)} ms</div>
                <div>Ratio A/B = ${(ratio*100).toFixed(3)} %</div>
            </div>`;
        console.log("Query Pass 0 over 1 Ratio:", ratio);
    });
}

async function evaluateQuery(query, gl) {
    while (true) {
        const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
        const disjoint = gl.getParameter(gl.ext.timer.GPU_DISJOINT_EXT);
        if (available && !disjoint) {
            return gl.getQueryParameter(query, gl.QUERY_RESULT);
        }
        await new Promise(requestAnimationFrame);
    }
}
