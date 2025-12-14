import {compile, initVertices} from "../webgl/setup.js";
import {createStaticVertexBuffer} from "../webgl/helpers/setup.js";
import {REGEX} from "../glslCode/definitions.js";
import {evaluateReadData} from "../app/algorithms.js";

export {startRenderLoop} from "../app/playback.js";


const basicVertexShaderSource =
    `#version 300 es

    in vec4 aPosition;
    
    void main() {
        gl_Position = aPosition;
    }`;

export function initBasicState(gl, sources) {
    /**
     *  The common WebGL initialization code for a showcase
     *  with our super-basic vertex shader (rectangle from 2 triangles)
     *  and fragment shader uniforms {iTime, iResolution, iMouse}
     *  but no textures, extra frame buffers etc.
     */
    createStaticVertexBuffer(
        gl,
        [-1, -1, +1, -1, -1, 1, -1, +1, +1, -1, +1, +1]
    );

    sources.vertex ??= basicVertexShaderSource;
    const state = compile(gl, sources);
    if (!state.program) {
        return state;
    }

    initVertices(gl, state, "aPosition");

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(state.program);

    return state;
}

export function overwriteDefines(shaderSource, defineMap) {
    /** Die Funktion dient dazu, in Shadern, in denen Optionen über #define-Flags geschaffen wurden
     *  (gibt es in den frühen Showcases teilweise mit sehr viel unterschiedlichen Resultaten),
     *  direkt im Schritt vor dem Compilieren die #defines einfach zu ersetzen.
     *  Man gibt also die defineMap ein, die einem definierten Symbol (in GENAU dieser Schreibweise!) dann
     *  - einen beliebigen Wert (numerisch oder String, bool wird zu 0/1) zuordnet
     *    (dieser Wert wird dann genauso da hingesetzt, d.h. komplexe Macros sind möglich, aber wozu würde man das...)
     *    oder
     *  - "null" zuordnet: Dann wird der #define in diesem Showcase entfernt (auskommentiert)
     *    oder
     *  - auslässt (oder "undefined" zuordnet, das ist für JS gleich), dann wird dieser #define nicht verändert.
     */
    return shaderSource.replaceAll(REGEX.DEFINE_DIRECTIVE, (match, name, ...rest) => {
        let overwrite = defineMap[name];
        if (overwrite === undefined) {
            return match;
        }
        if (overwrite === null) {
            return "///" + match;
        }
        if (typeof (overwrite) === "boolean") {
            overwrite = +overwrite;
        }
        return `#define ${name} ${overwrite}`;
    });
}

export async function readPixelsAndEvaluate(gl, resolution, resultBuffer, targetElement) {
    const startedAt = performance.now();
    const [width, height] = resolution;
    gl.readPixels(
        0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, resultBuffer
    );
    const readMillis = performance.now() - startedAt;

    // Notiz: Vom Screen ("Back Buffer") können wir nur höchst ungenau die Unsigned Bytes lesen.
    // Für genauere Informationen verwendet man hierfür Framebuffer, aber die heben wir uns noch auf.
    const data = await evaluateReadData(
        resultBuffer,
        byte => (byte / 255)
    );

    const totalMillis = performance.now() - startedAt;
    targetElement.innerHTML = `
            <div class="readout-stats">
                <div>Read Pixel Values (to CPU)</div>
                <div>AVG = ${data.formatted.avg}</div>
                <div>MIN = ${data.formatted.min}</div>
                <div>MAX = ${data.formatted.max}</div>
                <span>See Browser Console for details</span>
            </div>`;
    console.info(
        "Read Data", data,
        "- Reading took", readMillis, "ms,",
        " Total with numerical evaluation", totalMillis, "ms"
    );
}

