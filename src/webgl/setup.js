import {loadExtensions} from "./extensions.js";
import {takeMilliSeconds} from "../app/measuring.js";
import {initialOrStoredResolution, storeResolution} from "./helpers/resolution.js";
import {collectActiveUniforms, createShader} from "./helpers/setup.js";
import {createInitialState} from "../app/initialize.js";

/**
 *
 * @param canvas - You need a <canvas> element to initialize WebGl context
 *                 Also, your browser needs to support this.
 *                 See: https://caniuse.com/webgl2
 * @param geometry {{width, height, aspectRatio}} - canvas dimensions, specify either two
 */

export function setupWebGl(canvas, geometry) {

    const gl = canvas.getContext("webgl2", {
        // Anti-Aliasing is nice, but enables Multisampling which
        antialias: false,
    });
    if (!gl) {
        window.alert("We need WebGL2 and your Browser does not support that, sadly.");
        // now the rest will fail badly, but that doesn't matter for me now,
        // because the application can not be used either way -- we need WebGL2!
        // https://caniuse.com/webgl2
    }

    gl.ext = {};
    gl.timer = {};
    // Grafikprogrammierung ist (egal welche Grafik-API man zugrundelegt) recht hardwareabhängig,
    // und WebGL2 ist ein Kompromiss zwischen Grundvoraussetzungen, die man inzwischen von den
    // meisten real verwendeten Grafikkarten verlangen kann.
    // Einige Grundfunktionen sind aber erst durch das Nachladen spezifischer "Extensions" verfügbar,
    // die zwar auch in den meisten Geräten verfügbar sind, aber das gilt es extra zu überprüfen.
    // Wer hier Fehlermeldungen in der Browser-Konsole findet -> besprechen wir dann im Einzelfall.
    // Manche Extensions sind für manche der Showcases unabdingbar, andere nur nice-to-have.
    // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Using_Extensions
    loadExtensions(gl, [
        "EXT_color_buffer_float",
        "OES_texture_float_linear",
        "KHR_parallel_shader_compile",
        "EXT_disjoint_timer_query_webgl2",
    ]);

    const {width, height} = initialOrStoredResolution(canvas, geometry);
    setCanvasResolution(canvas, gl, width, height);
    return gl;
}

export function setCanvasResolution(canvas, glContext, width, height) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    // TODO: need to think about window.devicePixelRatio here?
    canvas.width = width;
    canvas.height = height;
    glContext.viewport(0, 0, width, height);
    storeResolution(width, height);
}

/**
 *
 * @param gl - the WebGl context (browser needs to support this)
 * @param {{vertex: string, fragment, string}} sources - the Fragment and Vertex Shader Source
 */
export function compile(gl, sources) {
    const result = createInitialState(sources);
    result.resolution = [gl.drawingBufferWidth, gl.drawingBufferHeight];

    const v = createShader(gl, gl.VERTEX_SHADER, sources.vertex);
    result.error.vertex = v.error;

    const f = createShader(gl, gl.FRAGMENT_SHADER, sources.fragment);
    result.error.fragment = f.error;

    const program = gl.createProgram();
    if (!v.error) {
        gl.attachShader(program, v.shader);
    }
    if (!f.error) {
        gl.attachShader(program, f.shader);
    }
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        result.error.linker = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        return result;
    }
    result.program = program;
    result.compiledMillis = takeMilliSeconds(result.createdAt);

    collectActiveUniforms(gl, result);
    return result;
}

export function initVertices(gl, state, variableName) {
    if (!state.program) {
        throw Error("initVertices() needs a working state.program");
    }

    state.location.aPosition = gl.getAttribLocation(state.program, variableName);
    gl.enableVertexAttribArray(state.location.aPosition);
    gl.vertexAttribPointer(
        state.location.aPosition,
        2,
        gl.FLOAT,
        false,
        0,
        0
    );
}

