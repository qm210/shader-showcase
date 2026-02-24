import {startRenderLoop} from "../../webgl/render.js";
import {createFramebufferWithTexture, createTextureFromImage} from "../../webgl/helpers.js";

import fragmentShaderSource from "../../shaders/xSimulationPlayground.glsl";
import {initBasicState} from "../common.js";
import schnoergl210 from "../../textures/210_schnoerkel.png";

export default {
    title: "Advanced Playground",
    init: (gl, sources = {}) => {
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        // TODO: Resizing the canvas DOES NOT scale the framebuffers / textures yet!! MUST DO
        state.resolution = [gl.drawingBufferWidth, gl.drawingBufferHeight];
        state.nPasses = 4;

        state.framebuffer = [0, 1].map((index) =>
            createFramebufferWithTexture(gl, {
                width: gl.drawingBufferWidth,
                height: gl.drawingBufferHeight,
                attachment: gl.COLOR_ATTACHMENT0,
                // Diese Formate werden später wichtig, können hier aber auf dem Default bleiben:
                // internalFormat: gl.RGBA,
                // dataFormat: gl.RGBA,
                // dataType: gl.UNSIGNED_BYTE,
            }, index)
        );
        state.fbPingIndex = 0;
        state.fbPongIndex = 1;

        // for the second, i.e. app(location=1) out ... we need another texture PER FRAMEBUFFER.
        const extraOut = {
            // The specific linking between one framebuffer object (FBO) and one texture is called "attachment",
            // as this FBO already has its primary texture on COLOR_ATTACHMENT0, we need a second one.
            attachment: gl.COLOR_ATTACHMENT1,
            // We need to choose fitting format (number of channels) / type (bytes per channel) parameters,
            // this CAN BE TRICKY, so best not to leave the vec4 alignment, and I needed to
            // use gl.RGBA16F because the "more natural sounding" gl.RGBA32F just wouldn't work ¯\_(ツ)_/¯
            dataFormat: gl.RGBA,
            dataType: gl.FLOAT,
            internalFormat: gl.RGBA16F,
            // Also, to initialize these values, we need these typed WebGL Arrays (e.g. Float32Array),
            // they should be sized as (resolution * 4), even if only used for one vec2
            // ignoring z and w is easier than caring for the different alignment ;)
            // Also: 4 bytes / 32 bit for floats is the WebGL standard, (even with gl.RGBA16F).
            initialData: new Float32Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4),
            // and we might want to read the pixels at a later time
            readData: new Float32Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4),
            readAtTime: null,
        };
        initializeExtraValues(extraOut.initialData, ...state.resolution);
        state.extraOut = extraOut;
        state.wantToReadExtraOut = false;

        for (const fb of state.framebuffer) {
            fb.extraDataTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, fb.extraDataTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);

            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                extraOut.internalFormat,
                ...state.resolution,
                0,
                extraOut.dataFormat,
                extraOut.dataType,
                extraOut.initialData,
                // <-- NOTE: would suffice to supply the data to the first READ fbo, but which is it?
                //           let's just init both, the first WRITE will overwrite it anyway.
            );

            fb.attachments.push(extraOut.attachment);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, extraOut.attachment, gl.TEXTURE_2D, fb.extraDataTexture, 0);
            gl.drawBuffers(fb.attachments);

            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.error(fb, status);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        state.location.iTime = gl.getUniformLocation(state.program, "iTime");
        state.location.iResolution = gl.getUniformLocation(state.program, "iResolution");
        state.location.prevImage = gl.getUniformLocation(state.program, "iPrevImage");
        state.location.prevVelocity = gl.getUniformLocation(state.program, "iPrevVelocity");
        state.location.passIndex = gl.getUniformLocation(state.program, "iPassIndex");
        state.location.iFrame = gl.getUniformLocation(state.program, "iFrame");

        state.location.iNoiseLevel = gl.getUniformLocation(state.program, "iNoiseLevel");
        state.location.iNoiseFreq = gl.getUniformLocation(state.program, "iNoiseFreq");
        state.location.iNoiseOffset = gl.getUniformLocation(state.program, "iNoiseOffset");
        state.location.iFractionalOctaves = gl.getUniformLocation(state.program, "iFractionalOctaves");
        state.location.iFractionalScale = gl.getUniformLocation(state.program, "iFractionalScale");
        state.location.iFractionalDecay = gl.getUniformLocation(state.program, "iFractionalDecay");
        state.location.iCloudMorph = gl.getUniformLocation(state.program, "iCloudMorph");
        state.location.iCloudVelX = gl.getUniformLocation(state.program, "iCloudVelX");
        state.location.iFree0 = gl.getUniformLocation(state.program, "iFree0");
        state.location.iFree1 = gl.getUniformLocation(state.program, "iFree1");
        state.location.iFree2 = gl.getUniformLocation(state.program, "iFree2");

        state.dream210logo = createTextureFromImage(gl, schnoergl210, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.NEAREST,
        });
        state.location.iDream210 = gl.getUniformLocation(state.program, "texImage");

        gl.useProgram(state.program);

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
                state.wantToReadExtraOut = true;
            }
        }]
    })
};

function render(gl, state) {
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

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, state.dream210logo);
    gl.uniform1i(state.location.iDream210, 2);

    let pass, write, read;
    for (pass = 0; pass < state.nPasses; pass++) {

        // we always do the frame-buffer ping pong...
        write = state.framebuffer[state.fbPingIndex];
        read = state.framebuffer[state.fbPongIndex];
        [state.fbPingIndex, state.fbPongIndex] = [state.fbPongIndex, state.fbPingIndex];

        // ... but the last pass needs to go to the screen
        if (pass < state.nPasses - 1) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
            gl.drawBuffers(write.attachments);
        } else {
            // null == Screen ("Back Buffer")
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            // Note: this amounts to gl.drawBuffers([gl.BACK]);
            //       i.e. this will not render the extra output anymore, only fragColor!
        }

        // get the previously rendered image from the other buffer on its attachment
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        gl.uniform1i(state.location.prevImage, 0);

        // that is the previously calculated extraOut from the other buffer on its different attachment
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, read.extraDataTexture);
        gl.uniform1i(state.location.prevVelocity, 1);

        gl.uniform1i(state.location.passIndex, pass);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // Demonstration: how gl.readPixels() could work (this transfers GPU -> CPU, but that takes time)

    if (state.wantToReadExtraOut) {
        state.wantToReadExtraOut = false;
        console.time("readPixels()");
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read.fbo);
        gl.readBuffer(state.extraData.attachment);
        gl.reading(0, 0, ...state.resolution, state.extraData.dataFormat, state.extraData.dataType, state.extraData.readData);
        state.extraData.readAtTime = state.time;
        console.timeEnd("readPixels()");
        console.info(
            "Read:", state.extraData.readData,
            "extraOut:", state.extraData,
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
