import {startRenderLoop} from "../webgl/render.js";
import {
    createFramebufferWithTexture,
    createPingPongFramebuffersWithTexture, createTextureFromImage, halfFloatOptions, resolutionScaled,
    updateResolutionInState
} from "../webgl/helpers.js";
import {initBasicState} from "./common.js";

import vertexShaderSource from "../shaders/vertex.basicWithDifferentials.glsl"
import fragmentShaderSource from "../shaders/fluidPlayground.glsl";
import ditherImage from "../textures/dither.png";

export default {
    title: "Fluid Dynamics Playground",
    init: (gl, sources = {}) => {
        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        // TODO: check difference with IndexBuffer / drawElements() some day...

        if (!state.program) {
            return state;
        }

        // TODO: Resizing the canvas DOES NOT scale the framebuffers / textures yet!! MUST DO
        const {width, height} = updateResolutionInState(state, gl);

        state.framebuffer = {
            image: createPingPongFramebuffersWithTexture(gl, {
                width,
                height,
                attachment: gl.COLOR_ATTACHMENT0,
            }),
            fluid: {},
            post: {},
        };
        state.fluid = resolutionScaled(128, width, height);
        state.fluid.scalarField = {
            width: state.fluid.width,
            height: state.fluid.height,
            internalFormat: gl.R16F,
            dataFormat: gl.RED,
            dataType: gl.HALF_FLOAT,
            minFilter: gl.NEAREST,
            magFilter: gl.NEAREST,
        };
        state.fluid.vec2Field = {
            width: state.fluid.width,
            height: state.fluid.height,
            internalFormat: gl.RG16F,
            dataFormat: gl.RG,
            dataType: gl.HALF_FLOAT,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        };
        state.framebuffer.fluid = {
            velocity: createPingPongFramebuffersWithTexture(gl, state.fluid.vec2Field),
            divergence: createFramebufferWithTexture(gl, state.fluid.scalarField),
            curl: createFramebufferWithTexture(gl, state.fluid.scalarField),
            pressure: createPingPongFramebuffersWithTexture(gl, state.fluid.scalarField),
        };
        state.doDebugRender = 0;

        // analog zum scalarField oben -> Helper definiert :)
        state.framebuffer.post.sunrays = {
            options: halfFloatOptions(
                gl,
                resolutionScaled(196, width, height),
                gl.R16F,
                gl.LINEAR
            ),
            effect: undefined,
        }
        state.framebuffer.post.sunrays.effect =
            createFramebufferWithTexture(gl,
                state.framebuffer.post.sunrays.options
            );
        state.framebuffer.post.sunrays.tempForBlur =
            createFramebufferWithTexture(gl,
                state.framebuffer.post.sunrays.options
            );

        state.framebuffer.post.bloom = {
            options: halfFloatOptions(
                gl,
                resolutionScaled(256, width, height),
                gl.RGBA16F,
                gl.LINEAR
            ),
            effect: undefined,
            iterations: [],
            dither: createTextureFromImage(gl, ditherImage, {
                minFilter: gl.LINEAR,
                maxFilter: gl.LINEAR,
                wrapS: gl.REPEAT,
                wrapT: gl.REPEAT,
                internalFormat: gl.RGB,
                dataFormat: gl.RGB,
                dataType: gl.UNSIGNED_BYTE
            })
        };
        state.framebuffer.post.bloom.effect =
            createFramebufferWithTexture(gl,
                state.framebuffer.post.bloom.options
            );
        const bloomIterations = Math.log2(
            state.framebuffer.post.bloom.options.height
        );
        for (let i = 0; i < bloomIterations; i++) {
            const options = {
                ...state.framebuffer.post.bloom.options,
                width: state.framebuffer.post.bloom.options.width >> (i + 1),
                height: state.framebuffer.post.bloom.options.height >> (i + 1),
            };
            if (options.width < 2 || options.height < 2) {
                break;
            }
            state.framebuffer.post.bloom.iterations.push(
                createFramebufferWithTexture(gl, options)
            );
        }

        gl.useProgram(state.program);

        // initialize the velocity framebuffer texture ([1] = pong = first read) to constant values
        // rg == vec2(0,0) should be default anyway, but why not make sure.
        const [, initialVelocity] = state.framebuffer.fluid.velocity.currentWriteReadOrder();
        gl.bindFramebuffer(gl.FRAMEBUFFER, initialVelocity.fbo);
        gl.clearColor(0,0,0,0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        // also initialize the curl framebuffer texture (there is only one), while we're at it
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer.fluid.curl.fbo);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        // and reset these shenanigans (is needless for us here, but good style in general.)
        // TODO: MEASURE THAT IN MS DIFFERENCE (also, Indexed Draw)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // need some way of controlling when to spawn, because the input textures should then have that
        // external value _exactly_ one frame, that is quite hard to accomplish inside the shader.
        state.spawn = {
            seed: 0.,
            last: Number.NEGATIVE_INFINITY,
            age: 0.,
        };

        return state;
    },
    generateControls: (state) => ({
        renderLoop: render,
        toggles: [{
            label: () =>
                state.doDebugRender === 1
                ? "Rendering: Velocity Texture (.rg)"
                : state.doDebugRender === 2
                ? "Rendering: Curl Texture (.r)"
                : state.doDebugRender === 3
                ? "Rendering: Pressure Texture (.r)"
                : state.doDebugRender === 4
                ? "Rendering: Divergence Texture (.r)"
                : "Debug Fluid Fields",
            onClick: () => {
                state.doDebugRender = (state.doDebugRender + 1) % 5;
            }
        }, {
            label: () => "Log Spawn State",
            onClick: () => {
                console.log(state.spawn, state);
            }
        }],
        uniforms: [{
            separator: "Spawn Colors & Velocity"
        }, {
            type: "vec3",
            name: "iSpawnColorHSV",
            defaultValue: [240, 1, 1],
            min: [0, 0, 0],
            max: [360, 1, 1],
        }, {
            type: "float",
            name: "iSpawnHueGradient",
            defaultValue: 100,
            min: -999,
            max: 999,
            step: 1
        }, {
            type: "float",
            name: "iSpawnRandomizeHue",
            defaultValue: 0.2,
            min: 0.,
            max: 1,
        }, {
            type: "float",
            name: "iMaxInitialVelocity",
            defaultValue: 100,
            min: -500,
            max: 500,
        }, {
            separator: "Fluid Dynamics"
        }, {
            type: "float",
            name: "iColorDissipation",
            defaultValue: 0.3,
            min: 0.,
            max: 2.,
        }, {
            type: "float",
            name: "iVelocityDissipation",
            defaultValue: 0.2,
            min: 0.,
            max: 2.,
        }, {
            type: "float",
            name: "iCurlStrength",
            defaultValue: 0,
            min: -100,
            max: 100,
        }, {
            type: "float",
            name: "iPressure",
            defaultValue: 0.8,
            min: -10,
            max: 50,
        }, {
            type: "int",
            name: "pressureIterations",
            defaultValue: 20,
            min: 0,
            max: 100,
            notAnUniform: true,
        }, {
            separator: "Bloom-Effekt"
        }, {
            type: "float",
            name: "iBloomIntensity",
            defaultValue: 0,
            min: 0,
            max: 10,
        }, {
            type: "float",
            name: "iBloomThreshold",
            defaultValue: 0.6,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iBloomSoftKnee",
            defaultValue: 0.7,
            min: 0,
            max: 1,
        }, {
            separator: "Sunrays-Effekt"
        }, {
            type: "float",
            name: "iSunraysWeight",
            defaultValue: 1.,
            min: 0,
            max: 20,
        }, {
            type: "float",
            name: "iSunraysDensity",
            defaultValue: 0.3,
            min: 0,
            max: 10,
        }, {
            type: "float",
            name: "iSunraysDecay",
            defaultValue: 0.95,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iSunraysExposure",
            defaultValue: 0.5,
            min: 0,
            max: 2,
        }, {
            type: "int",
            name: "iSunraysIterations",
            defaultValue: 5,
            min: 1,
            max: 30,
        }, {
            separator: "Pseudo-Random - Allgemeine Parameter"
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
            separator: "Noch allgemeiner..."
        }, {
            type: "float",
            name: "iGamma",
            defaultValue: 2.2,
            min: 0.01,
            max: 10.,
        }, {
            type: "float",
            name: "iVignetteInner",
            defaultValue: 1.,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iVignetteOuter",
            defaultValue:0.17,
            min: 0,
            max: 1,
        }, {
            type: "float",
            name: "iVignetteScale",
            defaultValue: 1.39,
            min: 0.1,
            max: 10,
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
        }],
        onReset: () => {
            state.spawn.last = Number.NEGATIVE_INFINITY;
        }
    })
};

const PASS = {
    INIT_VELOCITY: 0,
    INIT_IMAGE: 1,
    INIT_PRESSURE: 2,
    INIT_CURL_FROM_VELOCITY: 3,
    PROCESS_VELOCITY_VORTICITY: 12,
    PROCESS_DIVERGENCE_FROM_VELOCITY: 13,
    PROCESS_PRESSURE: 14,
    PROCESS_GRADIENT_SUBTRACTION: 15,
    PROCESS_ADVECTION: 16,
    PROCESS_FLUID_COLOR: 50,
    POST_PREFILTER_BLOOM: 70,
    POST_BLOOM_BLUR: 71,
    POST_BLOOM_BLUR_FINISH: 72,
    POST_PREPARE_SUNRAYS_MASK: 80,
    POST_APPLY_SUNRAYS: 81,
    POST_BLUR_SUNRAYS: 82,
    RENDER_TO_SCREEN: 99,
};

let write, readPrevious, readVelocity;
const SPAWN_EVERY_SECONDS = 2.5;

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform1f(state.location.deltaTime, state.deltaTime);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform1i(state.location.iFrame, state.iFrame);
    gl.uniform1f(state.location.iGamma, state.iGamma);
    gl.uniform3fv(state.location.iSpawnColorHSV, state.iSpawnColorHSV);
    gl.uniform1f(state.location.iSpawnHueGradient, state.iSpawnHueGradient);
    gl.uniform1f(state.location.iSpawnRandomizeHue, state.iSpawnRandomizeHue);
    gl.uniform1f(state.location.iColorDissipation, state.iColorDissipation);
    gl.uniform1f(state.location.iVelocityDissipation, state.iVelocityDissipation);
    gl.uniform1f(state.location.iMaxInitialVelocity, state.iMaxInitialVelocity);
    gl.uniform1f(state.location.iCurlStrength, state.iCurlStrength);
    gl.uniform1f(state.location.iPressure, state.iPressure);
    gl.uniform1f(state.location.iSunraysWeight, state.iSunraysWeight);
    gl.uniform1f(state.location.iSunraysDensity, state.iSunraysDensity);
    gl.uniform1f(state.location.iSunraysDecay, state.iSunraysDecay);
    gl.uniform1f(state.location.iSunraysExposure, state.iSunraysExposure);
    gl.uniform1f(state.location.iSunraysIterations, state.iSunraysIterations);

    gl.uniform1f(state.location.iNoiseLevel, state.iNoiseLevel);
    gl.uniform1f(state.location.iNoiseFreq, state.iNoiseFreq);
    gl.uniform1f(state.location.iNoiseOffset, state.iNoiseOffset);
    gl.uniform1i(state.location.iFractionalOctaves, Math.floor(state.iFractionalOctaves));
    gl.uniform1f(state.location.iFractionalScale, state.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1f(state.location.iCloudMorph, state.iCloudMorph);
    gl.uniform1f(state.location.iCloudVelX, state.iCloudVelX);
    gl.uniform1f(state.location.iVignetteInner, state.iVignetteInner);
    gl.uniform1f(state.location.iVignetteOuter, state.iVignetteOuter);
    gl.uniform1f(state.location.iVignetteScale, state.iVignetteScale);
    gl.uniform3fv(state.location.iFree0, state.iFree0);
    gl.uniform3fv(state.location.iFree1, state.iFree1);
    gl.uniform3fv(state.location.iFree2, state.iFree2);

    // as we now only have write texture _at_the_same_time_, only need one color attachment
    // -> no gl.drawBuffers() required.

    state.spawn.seed = -1.;
    if (state.time - state.spawn.last > SPAWN_EVERY_SECONDS) {
        state.spawn.seed = Math.floor(state.time / SPAWN_EVERY_SECONDS);
        state.spawn.last = state.time;
    }
    state.spawn.age = Math.max(state.time - state.spawn.last, 0.);
    gl.uniform1f(state.location.iSpawnSeed, state.spawn.seed);
    gl.uniform1f(state.location.iSpawnAge, state.spawn.age);

    gl.uniform1i(state.location.doDebugRender, state.doDebugRender);

    // also, the assignment of the two input textures stay the same:
    // texPrevious @ texture unit gl.TEXTURE0
    //  -> when a shader pass uses texPrevious, gl.activeTexture(gl.TEXTURE0) must be used before binding the texture
    // texVelocity @ texture unit gl.TEXTURE1
    //  -> when a shader pass uses texVelocity, gl.activeTexture(gl.TEXTURE1) must be... blah blah.
    gl.uniform1i(state.location.texPrevious, 0);
    gl.uniform1i(state.location.texVelocity, 1);
    gl.uniform1i(state.location.texCurl, 2); // could also use 0 here because we will not conflict, but this is needless.
    gl.uniform1i(state.location.texPressure, 5); // could also use 0 here because we will not conflict, but this is needless.
    gl.uniform1i(state.location.texDivergence, 6); // could also use 0 here because we will not conflict, but this is needless.
    gl.uniform1i(state.location.texPostSunrays, 3);
    gl.uniform1i(state.location.texPostBloom, 4);
    gl.uniform1i(state.location.texPostBloomDither, 7);
    // and depending on what we want to write, we need to bind that corresponding Framebuffer only
    // (so if these are part of a ping-pong-pair, swap them after drawing to make them usable for a later pass)

    /////////////

    gl.uniform1i(state.location.iPassIndex, PASS.INIT_VELOCITY);
    [write, readPrevious] = state.framebuffer.fluid.velocity.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.uniform2fv(state.location.texelSize, state.fluid.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.velocity.doPingPong();

    /////////////

    gl.uniform1i(state.location.iPassIndex, PASS.INIT_IMAGE);

    [write, readPrevious] = state.framebuffer.image.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.uniform2fv(state.location.texelSize, state.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.image.doPingPong();

    /////////////

    // Use Velocity to calculate a fresh Scalar: Curl

    gl.uniform1i(state.location.iPassIndex, PASS.INIT_CURL_FROM_VELOCITY),

    // Note: need to unbind the curl texture itself when we want to write to its framebuffer.
    //       we _could_ clean this up right after the next step (or avoid a third texture unit altogether)
    //       but it _is_ convenient that we can just render the texture for debugging in the last pass.

    write = state.framebuffer.fluid.curl;
    [, readVelocity] = state.framebuffer.fluid.velocity.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);
    gl.uniform2fv(state.location.texelSize, state.fluid.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /////////////

    // Use Curl and Velocity to calculate new Velocity
    gl.uniform1i(state.location.iPassIndex, PASS.PROCESS_VELOCITY_VORTICITY);

    [write, readVelocity] = state.framebuffer.fluid.velocity.currentWriteReadOrder();
    const readCurl = state.framebuffer.fluid.curl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, readCurl.texture);
    gl.uniform2fv(state.location.texelSize, state.fluid.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // ! ... we did use Velocity to write Velocity, so do the ping-pong:
    state.framebuffer.fluid.velocity.doPingPong();

    /////////////

    // Use Velocity to calculate a fresh Scalar: Divergence
    gl.uniform1i(state.location.iPassIndex, PASS.PROCESS_DIVERGENCE_FROM_VELOCITY);

    write = state.framebuffer.fluid.divergence;
    [, readVelocity] = state.framebuffer.fluid.velocity.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);
    gl.uniform2fv(state.location.texelSize, state.fluid.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // ! ... we did not write to anything we've read from, i.e. no swap here

    /////////////

    gl.uniform1i(state.location.iPassIndex, PASS.INIT_PRESSURE);

    [write, readPrevious] = state.framebuffer.fluid.pressure.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.uniform2fv(state.location.texelSize, state.fluid.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.pressure.doPingPong();

    /////////////

    // Use Divergence and Pressure to Iterate a while on Pressure
    gl.uniform1i(state.location.iPassIndex, PASS.PROCESS_PRESSURE);

    gl.uniform2fv(state.location.texelSize, state.fluid.texelSize);
    for (let p = 0; p < state.pressureIterations; p++) {
        [write, readPrevious] = state.framebuffer.fluid.pressure.currentWriteReadOrder();
        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
        gl.viewport(0, 0, write.width, write.height);
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.fluid.divergence.texture);
        gl.uniform2fv(state.location.texelSize, state.fluid.texelSize);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        state.framebuffer.fluid.pressure.doPingPong();
    }
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, null);

    /////////////

    // Use Pressure and Velocity to Subtract Gradients on Velocity - it seems.
    gl.uniform1i(state.location.iPassIndex, PASS.PROCESS_GRADIENT_SUBTRACTION);

    const [, readPressure] = state.framebuffer.fluid.pressure.currentWriteReadOrder();
    [write, readVelocity] = state.framebuffer.fluid.velocity.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, readPressure.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);
    gl.uniform2fv(state.location.texelSize, state.fluid.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.velocity.doPingPong();

    /////////////

    // Use Velocity as velocity AND as previous value to advect / dissipate Velocity
    gl.uniform1i(state.location.iPassIndex, PASS.PROCESS_ADVECTION);

    [write, readPrevious] = state.framebuffer.fluid.velocity.currentWriteReadOrder();
    readVelocity = readPrevious;
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);
    gl.uniform2fv(state.location.texelSize, state.fluid.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.velocity.doPingPong();

    /////////////

    // Use Velocity as velocity and last image color as previous value to advect / dissipate Density
    // (Density, together with the somehow chosen start color, is what we actually see as colored cloud image)
    gl.uniform1i(state.location.iPassIndex, PASS.PROCESS_FLUID_COLOR);

    [write, readPrevious] = state.framebuffer.image.currentWriteReadOrder();
    [, readVelocity] = state.framebuffer.fluid.velocity.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);
    gl.uniform2fv(state.location.texelSize, state.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.image.doPingPong();

    /// END OF FLUID DYNAMICS ///////////////////

    /// POST: BLOOM /////////////////////////////

    gl.uniform1i(state.location.iPassIndex, PASS.POST_PREFILTER_BLOOM);
    gl.disable(gl.BLEND);

    [, readPrevious] = state.framebuffer.image.currentWriteReadOrder();
    write = state.framebuffer.post.bloom.effect;
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.uniform1f(state.location.iBloomSoftKnee, state.iBloomSoftKnee);
    gl.uniform1f(state.location.iBloomThreshold, state.iBloomThreshold);
    gl.uniform2fv(state.location.texelSize, write.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    let lastWrite = write;

    gl.uniform1i(state.location.iPassIndex, PASS.POST_BLOOM_BLUR);

    for (const iteration of state.framebuffer.post.bloom.iterations) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, iteration.fbo);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, lastWrite.texture);
        gl.uniform2fv(state.location.texelSize, lastWrite.texelSize);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        lastWrite = iteration;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = state.framebuffer.post.bloom.iterations.length - 2; i >= 0; i--) {
        const base = state.framebuffer.post.bloom.iterations[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, base.fbo);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, lastWrite.texture);
        gl.uniform2fv(state.location.texelSize, lastWrite.texelSize);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        lastWrite = base;
    }

    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lastWrite.texture);
    gl.uniform1f(state.location.iBloomIntensity, state.iBloomIntensity);
    gl.uniform2fv(state.location.texelSize, lastWrite.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /// POST: SUNRAYS ///////////////////////////

    // the prepare step takes the previous image and writes to the next _image_

    gl.uniform1i(state.location.iPassIndex, PASS.POST_PREPARE_SUNRAYS_MASK);

    [write, readPrevious] = state.framebuffer.image.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.uniform2fv(state.location.texelSize, state.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // did we write to what we read? hell yes wie did (the image itself)
    state.framebuffer.image.doPingPong();

    /////////////

    // with that mask prepared (i.e. now the previous image),
    // the main step can now write on the sunrays framebuffer itself

    gl.uniform1i(state.location.iPassIndex, PASS.POST_APPLY_SUNRAYS);
    [, readPrevious] = state.framebuffer.image.currentWriteReadOrder();
    write = state.framebuffer.post.sunrays.effect;
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.uniform2fv(state.location.texelSize, state.framebuffer.post.sunrays.options.texelSize);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    /////////////

    // the blurring afterwards writes from sunrays.effect to sunrays.tempForBlur
    // because it does first x, then y, and needs something to stash inbetween.
    // (yeah, that _could_also_ be its own pass, but I couldn't say whether that would be advantageous.)
    const [texelWidth, texelHeight] = state.framebuffer.post.sunrays.options.texelSize;
    gl.uniform1i(state.location.iPassIndex, PASS.POST_BLUR_SUNRAYS);
    readPrevious = state.framebuffer.post.sunrays.effect;
    write = state.framebuffer.post.sunrays.tempForBlur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.uniform2f(state.location.texelSize, texelWidth, 0.);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // ... consider this very similar to the other framebuffer ping pongs ...
    [readPrevious, write] = [write, readPrevious];
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.uniform2f(state.location.texelSize, 0., texelHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // we could iterate this for more blur, but that's fine for now.

    /////////////

    gl.uniform1i(state.location.iPassIndex, PASS.RENDER_TO_SCREEN);
    [, readPrevious] = state.framebuffer.image.currentWriteReadOrder();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    // <-- gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
    // --> bloom
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.post.bloom.effect.texture);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.post.bloom.dither.texture);
    const scale = [
        gl.drawingBufferWidth / state.framebuffer.post.bloom.dither.width,
        gl.drawingBufferHeight / state.framebuffer.post.bloom.dither.height,
    ];
    gl.uniform2fv(state.location.iBloomDitherScale, scale);
    // --> sunrays
    gl.activeTexture(gl.TEXTURE3); // see above, we kept that
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.post.sunrays.effect.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // need to cleanup this one, we got
    //   "GL_INVALID_OPERATION: glDrawArrays: Feedback loop formed between Framebuffer and active Texture."
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

function getTextureScale (texture, width, height) {
    return {
        x: width / texture.width,
        y: height / texture.height
    };
}