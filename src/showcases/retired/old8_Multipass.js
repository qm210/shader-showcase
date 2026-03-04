import standardSetup from "./old3_SimpleGeometry.js";
import {startRenderLoop} from "../../webgl/render.js";
import {createTextureFromImage} from "../../webgl/helpers.js";

// multiPassMain.glsl ist fast wie texturesAdvanced.glsl
// aber was ist anders?
import fragmentShaderSource from "../../shaders/retired-2025/multiPassMain.glsl";
import postFragmentShaderSource from "../../shaders/retired-2025/multiPassPost.glsl";

import imageFrame from "../../textures/frame.png";
import imageSpace from "../../textures/hubble_extreme_deep_field.jpg";
import imageWood from "../../textures/Wood066_1K-JPG_Color.jpg";
import imageBumpMap from "../../textures/funny_bumpmap.png";

const ACTIVATE_POST_PROCESSING = true;

export default {
    title: "Multipass",
    init: (gl) => {
        const state = standardSetup.init(gl, fragmentShaderSource);

        if (!state.program) {
            return state;
        }

        state.texture0 = createTextureFromImage(gl, imageFrame, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        });
        state.texture1 = createTextureFromImage(gl, imageSpace, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
        });
        state.texture2 = createTextureFromImage(gl, imageWood, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
        });
        state.texture3 = createTextureFromImage(gl, imageBumpMap, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR
        });

        state.location.texture0 = gl.getUniformLocation(state.program, "iTexture0");
        state.location.texture1 = gl.getUniformLocation(state.program, "iTexture1");
        state.location.texture2 = gl.getUniformLocation(state.program, "iTexture2");
        state.location.texture3 = gl.getUniformLocation(state.program, "iBumpMap");

        // <-- up to here, known from old6_TexturesIn3D.js

        state.post = standardSetup.init(gl, postFragmentShaderSource);

        state.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.fbo);

        state.fbTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, state.fbTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.drawingBufferWidth,
            gl.drawingBufferHeight,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null
        );
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            state.fbTexture,
            0
        );

        state.post.location.texture = gl.getUniformLocation(state.program, "iImage");

        // ... and there may be more uniforms. take one position to move around with keys.
        state.location.cursorWalk = gl.getUniformLocation(state.program, "cursorWalk");
        state.cursorWalk = [0, 0, 0];

        state.location.iFieldOfView = gl.getUniformLocation(state.program, "iFieldOfView");
        state.location.iCameraTilt = gl.getUniformLocation(state.program, "iCameraTilt");

        state.location.iSomeFloat = gl.getUniformLocation(state.program, "iSomeFloat");

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
        }, {
            type: "float",
            name: "iFieldOfView",
            defaultValue: 80,
        }, {
            type: "float",
            name: "iCameraTilt",
            defaultValue: -23,
        }, {
            type: "cursorInput",
            name: "cursorWalk",
            keys: ["w", "a", "s", "d", "r", "f", "q"],
        }, {
            type: "float",
            name: "focusDistance",
            defaultValue: 1,
        }, {
            type: "float",
            name: "focalLength",
            defaultValue: 0.5,
        }, {
            type: "float",
            name: "aperture",
            defaultValue: 0.25,
        }]
    })
};

function render(gl, state) {
    const post = ACTIVATE_POST_PROCESSING ? state.post : null;

    gl.useProgram(state.program);

    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform3fv(state.location.cursorWalk, state.cursorWalk);
    gl.uniform1f(state.location.iFieldOfView, state.iFieldOfView);
    gl.uniform1f(state.location.iCameraTilt, state.iCameraTilt);

    // generell: getUniformLocation kann auch hier aufgerufen werden, optimiert vielleicht ein paar epsilons...

    // Was ist die Texture Unit? (i.e. TEXTURE0)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.texture0);
    gl.uniform1i(state.location.texture0, 0);
    // <-- hint: 0 entspricht gl.TEXTURE0 unit

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.texture1);
    gl.uniform1i(state.location.texture1, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, state.texture2);
    gl.uniform1i(state.location.texture2, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, state.texture3);
    gl.uniform1i(state.location.texture3, 3);

    // texture unit goes up to gl.TEXTURE31 - was könnte man tun, wenn das nicht reicht?

    if (post) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.fbo)
    } else {
        // unbind framebuffer = draw on screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (post) {
        gl.useProgram(post.program);

        gl.uniform1f(post.location.iTime, state.time);
        gl.uniform2fv(post.location.iResolution, state.resolution);

        // spontan eingefügt, um Depth-of-Field-Parameter zu testen
        gl.uniform1f(
            gl.getUniformLocation(post.program, "focusDistance"),
            state.focusDistance,
        );
        gl.uniform1f(
            gl.getUniformLocation(post.program, "focalLength"),
            state.focalLength
        );
        gl.uniform1f(
            gl.getUniformLocation(post.program, "aperture"),
            state.aperture
        );

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.fbTexture);
        gl.uniform1i(post.location.texture, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}
