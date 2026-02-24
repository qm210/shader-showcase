import {startRenderLoop} from "../webgl/render.js";
import {
    createFramebufferWithTexture,
    createPingPongFramebuffersWithTexture,
    updateResolutionInState
} from "../webgl/helpers.js";

import vertexShaderSource from "../shaders/vertex.basicWithDifferentials.glsl"
import fragmentShaderSource from "../shaders/multipassPlayground.glsl";
import {initBasicState} from "./common.js";

export default {
    title: "Multi-Pass Playground",
    init: (gl, sources = {}) => {
        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        // TODO: Resizing the canvas DOES NOT scale the framebuffers / textures yet!! MUST DO
        const {width, height} = updateResolutionInState(state, gl);
        state.nPasses = 2;

        state.framebuffer =
            createPingPongFramebuffersWithTexture(gl, {
                width,
                height,
                attachment: gl.COLOR_ATTACHMENT0,
            });

        // for the second, i.e. app(location=1) out ... we need another texture PER FRAMEBUFFER.
        const extraData = {
            // The specific linking between one framebuffer object (FBO) and one texture is called "attachment",
            // as this FBO already has its primary texture on COLOR_ATTACHMENT0, we need a second one.
            attachment: gl.COLOR_ATTACHMENT1,
            // We need to choose fitting format (number of channels) / type (bytes per channel) parameters,
            // and gl.RGBA16F due for reasons unknown, gl.RGBA32F did not work for me ¯\_(ツ)_/¯
            dataFormat: gl.RGBA,
            dataType: gl.FLOAT,
            internalFormat: gl.RGBA16F,
            // Also, to initialize these values, we need these typed WebGL Arrays (e.g. Float32Array),
            // they should be sized as (resolution * 4) as WebGL standard, (even with gl.RGBA16F).
            initialData: new Float32Array(width * height * 4),
            // and we might want to read the pixels at a later time
            readData: new Float32Array(width * height * 4),
            readAtTime: null,
        };
        initializeExtraValues(extraData.initialData, ...state.resolution);
        state.extraData = extraData;
        state.wantToReadExtraData = false;

        state.framebuffer.fb.forEach((fb, index) => {
            fb.extraDataTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, fb.extraDataTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);

            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                extraData.internalFormat,
                ...state.resolution,
                0,
                extraData.dataFormat,
                extraData.dataType,
                index === state.framebuffer.pong() ? extraData.initialData : null,
                // <-- need the data only in the first "read" buffer
            );

            fb.attachments.push(extraData.attachment);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, extraData.attachment, gl.TEXTURE_2D, fb.extraDataTexture, 0);
            gl.drawBuffers(fb.attachments);

            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.error(fb, status);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindTexture(gl.TEXTURE_2D, null);
        });

        gl.useProgram(state.program);

        return state;
    },
    generateControls: () => ({
        renderLoop: render,
        uniforms: [{
            type: "label",
            name: "iTime",
        }, {
            type: "float",
            name: "iNoiseLevel",
            defaultValue: 1,
            min: 0.,
            max: 2.,
        }, {
            type: "float",
            name: "iNoiseFreq",
            defaultValue: 1,
            min: 0.01,
            max: 10.,
        }, {
            type: "float",
            name: "iNoiseOffset",
            defaultValue: 0,
            min: -1,
            max: 1,
        }, {
            type: "float",
            name: "iFractionalOctaves",
            defaultValue: 1,
            min: 1,
            max: 10.,
            step: 1,
        }, {
            type: "float",
            name: "iFractionalScale",
            defaultValue: 2.,
            min: 0.01,
            max: 10.,
        }, {
            type: "float",
            name: "iFractionalDecay",
            defaultValue: 0.5,
            min: 0.01,
            max: 2.,
        }, {
            type: "float",
            name: "iCloudMorph",
            defaultValue: 0,
            min: 0,
            max: 2,
        }, {
            type: "float",
            name: "iCloudVelX",
            defaultValue: 0,
            min: -2.,
            max: 2,
        }, {
            type: "vec3",
            name: "iFree0",
            defaultValue: [0, 0, 0],
            min: -9.99,
            max: +9.99,
        }, {
            type: "vec3",
            name: "iFree1",
            defaultValue: [0, 0, 0],
            min: -9.99,
            max: +9.99,
        }, {
            type: "vec3",
            name: "iFree2",
            defaultValue: [0, 0, 0],
            min: -9.99,
            max: +9.99,
        }, {
            type: "button",
            name: "readButton",
            label: "read second \"out\" texture (check F12 console)",
            onClick: () => {
                state.wantToReadExtraData = true;
            }
        }]
    })
};

function render(gl, state) {
    gl.uniform2fv(state.location.texelSize, state.texelSize);
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform1i(state.location.iFrame, state.iFrame);

    gl.uniform1f(state.location.iNoiseLevel, state.iNoiseLevel);
    gl.uniform1f(state.location.iNoiseFreq, state.iNoiseFreq);
    gl.uniform1f(state.location.iNoiseOffset, state.iNoiseOffset);
    gl.uniform1i(state.location.iFractionalOctaves, Math.floor(state.iFractionalOctaves));
    gl.uniform1f(state.location.iFractionalScale, state.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1f(state.location.iCloudMorph, state.iCloudMorph);
    gl.uniform1f(state.location.iCloudVelX, state.iCloudVelX);
    gl.uniform3fv(state.location.iFree0, state.iFree0);
    gl.uniform3fv(state.location.iFree1, state.iFree1);
    gl.uniform3fv(state.location.iFree2, state.iFree2);

    gl.disable(gl.BLEND);

    let pass, write, read;
    for (pass = 0; pass < state.nPasses; pass++) {

        // write = state.framebuffer[state.fbPingIndex];
        // read = state.framebuffer[state.fbPongIndex];
        [write, read] = state.framebuffer.currentWriteReadOrder();

        // ... but the last pass needs to go to the screen (framebuffer == null)
        if (pass < state.nPasses - 1) {
            // [state.fbPingIndex, state.fbPongIndex] = [state.fbPongIndex, state.fbPingIndex];
            state.framebuffer.doPingPong();
            gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
            gl.drawBuffers(write.attachments);
        } else {
            // Note: will not render the extra output anymore, only fragColor!
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);

            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.enable(gl.BLEND);
        }

        // get the previously rendered image from the other buffer on its attachment
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        gl.uniform1i(state.location.iPrevImage, 0);

        // that is the previously calculated extraData from the other buffer on its different attachment
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, read.extraDataTexture);
        gl.uniform1i(state.location.iPrevData, 1);

        if (state.iFrame < 3) {
            console.log("[DEBUG]", state.iFrame, pass, write, read, "bound", gl.getParameter(gl.FRAMEBUFFER_BINDING));
        }

        gl.uniform1i(state.location.iPassIndex, pass);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // Demonstration: how gl.readPixels() could work (this transfers GPU -> CPU, but that takes time)

    if (state.wantToReadExtraData) {
        state.wantToReadExtraData = false;
        console.time("readPixels()");
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read.fbo);
        gl.readBuffer(state.extraData.attachment);
        gl.reading(0, 0, ...state.resolution, state.extraData.dataFormat, state.extraData.dataType, state.extraData.readData);
        state.extraData.readAtTime = state.time;
        console.timeEnd("readPixels()");
        console.info(
            "Read:", state.extraData.readData,
            "resolution:", state.resolution
        );
    }
}

function initializeExtraValues(data, width, height) {
    function put(x, y, r = 0, g = 0, b = 0, a = 0) {
        let index = 4 * (y * width + x);
        data[index++] = r;
        data[index++] = g;
        data[index++] = b;
        data[index++] = a;
    }
    // Notes:
    // - initialization is only necessary when already changed, fresh Float32Array() are 0-initialized.
    // - one might suggest, "why don't we use the shader itself here?" -- because yes. we could and maybe should.
    console.time("initializeExtraValues");
    for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
    {
        if (y / height < x / width) {
            put(x, y, 0.5, 0.5)
        } else {
            put(x, y, -0.5, 0.5);
        }
    }
    console.timeEnd("initializeExtraValues");
}
