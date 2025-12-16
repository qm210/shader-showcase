import {initBasicState, startRenderLoop} from "./common.js";
import {createTextureFromImage, createTextureFromLoadedImage, loadImagesByVite} from "../webgl/helpers/textures.js";

import vertexShaderSource from "../shaders/specific/dream210.vertex.glsl";
import fragmentShaderSource from "../shaders/specific/dream210.fragment.glsl";
import spiceSaleMsdfPng from "../textures/dream210/SpicySale.msdf.png";
import spiceSaleMsdfJson from "../textures/dream210/SpicySale.msdf.json";
import {resolutionScaled, updateResolutionInState} from "../webgl/helpers/resolution.js";
import {
    createFramebufferWithTexture,
    createFramebufferWithTextureArray,
    createPingPongFramebuffersWithTexture,
    halfFloatOptions
} from "../webgl/helpers/framebuffers.js";
import ditherImage from "../textures/dither.png";
import {createUboForArray, createUboForArraylikeStruct} from "../webgl/helpers/uniformbuffers.js";
import {compactifyGlyphJson, createGlyphDef} from "../app/algorithms.js";
import {createEventsManager, createGlyphInstanceManager} from "./D210_Dream.management.js";

// This secret move is presented to you by... vite :)
const monaImages =
    import.meta.glob('/src/textures/dream210/mona/*.png', {eager: true});


export default {
    title: "DREAM210 Merged",
    init: async (gl, sources = {}) => {
        sources.vertex ??= vertexShaderSource;
        sources.fragment ??= fragmentShaderSource;
        const state = initBasicState(gl, sources);

        if (!state.program) {
            return state;
        }

        state.monaTextures = await loadImagesByVite(
            monaImages,
            img => createTextureFromLoadedImage(gl, img)
        );
        console.log("Mona-Textures", state.monaTextures);

        state.passIndex = 0;

        const {width, height} = updateResolutionInState(state, gl);
        state.opt = {
            image: {
                width, height,
                attachment: gl.COLOR_ATTACHMENT0,
            },
            floatImage: {
                width, height,
                internalFormat: gl.RGBA32F,
                dataFormat: gl.RGBA,
                dataType: gl.FLOAT,
            },
            fluid: resolutionScaled(128, width, height),
            sunrays: halfFloatOptions(gl,
                resolutionScaled(192, width, height),
                gl.R16F,
            ),
            bloom: halfFloatOptions(gl,
                resolutionScaled(256, width, height),
                gl.RGBA16F,
            )
        };

        state.framebuffer = {
            clouds: createPingPongFramebuffersWithTexture(gl, state.opt.floatImage),
            noiseBase: createFramebufferWithTexture(gl, state.opt.image),
            // Texts: Handling unclear. The Framebuffer with Array is meant to store
            //        the results of as many rendering passes as required, but maybe
            //        we go with the GlyphInstances anyway.
            texts: createFramebufferWithTextureArray(gl, 2, state.opt.image),
        };

        const glyphDef = createGlyphDef(spiceSaleMsdfJson);
        const msdf = {
            tex: createTextureFromImage(gl, spiceSaleMsdfPng, {
                wrapS: gl.CLAMP_TO_EDGE,
                wrapT: gl.CLAMP_TO_EDGE,
                minFilter: gl.LINEAR,
                maxFilter: gl.LINEAR,
                internalFormat: gl.RGBA8,
                dataFormat: gl.RGBA,
                dataType: gl.UNSIGNED_BYTE,
            }),
            ubo: createUboForArray(gl, state.program, glyphDef, {
                blockName: "Glyphs",
                dataSize: 4,
            }),
        };
        state.glyphs = {
            msdf,
            ...createUboForArraylikeStruct(gl, state.program, {
                blockName: "GlyphInstances",
                bindingPoint: 2,
                memoryUsage: gl.DYNAMIC_DRAW,
                memberFields: {
                    ascii: [0, 1],
                    scale: [1, 1],
                    pos: [2, 2],
                    color: [4, 4],
                    effect: [8, 4],
                },
                dataLength: 32,
                metadata: {
                    fields: {
                        lettersUsed: [0, 1],
                    },
                    size: 4,
                },
            }),
            detailed: compactifyGlyphJson(spiceSaleMsdfJson),
            // only for debugging:
            glyphDef,
        }
        state.glyphs.manager = createGlyphInstanceManager(state, state.glyphs);

        state.glyphs.manager.replacePhrase("Hello Dream210");

        /*  std140 needs 4-byte alignments overall, and the offsets must be integer multiples of the size (afair);
            now as the base alignment is 16 anyway and thus the whole struct is gonna take 64 bytes, we use:
            struct Event {      | offset | size -> aligned to next element's base size
                int type;       |      0 |    4 -> 1 *  4 tight
                float t;        |      4 |    4 -> 2 *  4 tight
                float arg;      |      8 |    4 -> 3 *  4 tight
                int subtype;    |     12 |    4 -> 1 * 16 tight
                vec4 coord;     |     16 |   16 -> tight
                -> base alignment is 16 (largest) -> struct is 4x16 = 64-aligned
                -> so we could gönn ourselves even another 2x vec4 for "free".
            };
         */
        state.events = createUboForArraylikeStruct(gl, state.program, {
            blockName: "Events",
            bindingPoint: 1,
            memoryUsage: gl.DYNAMIC_DRAW,
            dataSize: 48,
            memberMap: {
                genericEvent: 0,
                fluidColorEvent: 1,
                fluidVelocityEvent: 2,
                textEvent: 3,
            },
            structFields: {
                type: [0, 1],
                subtype: [1, 1],
                coords: [4, 4],
                args: [8, 4],
            },
        });
        // maps some readable names to the "int type" and/or "int subtype".
        // must, of course, be understood by the Shader.
        state.events.types = Object.freeze({
            IDLE: 0,
            SHOW_TEXTURE: 1,
            STIR_FLUID: 2,
            DISSIPATE: 3,
            CLEAR_FLUID: 4,
            SHIFT_PALETTE: 5,
            DRAIN: 6,
            DRAW_TEXT: 7,
        });
        state.events.manager = createEventsManager(state, state.events);

        state.opt.fluid.scalar = {
            width: state.opt.fluid.width,
            height: state.opt.fluid.height,
            internalFormat: gl.R16F,
            dataFormat: gl.RED,
            dataType: gl.HALF_FLOAT,
            minFilter: gl.NEAREST,
            magFilter: gl.NEAREST,
        };
        state.opt.fluid.vec2 = {
            width: state.opt.fluid.width,
            height: state.opt.fluid.height,
            internalFormat: gl.RG16F,
            dataFormat: gl.RG,
            dataType: gl.HALF_FLOAT,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
        };
        state.framebuffer.fluid = {
            result: createFramebufferWithTexture(gl, state.opt.image),
            color: createPingPongFramebuffersWithTexture(gl, state.opt.image),
            velocity: createPingPongFramebuffersWithTexture(gl, state.opt.fluid.vec2),
            divergence: createFramebufferWithTexture(gl, state.opt.fluid.scalar),
            curl: createFramebufferWithTexture(gl, state.opt.fluid.scalar),
            pressure: createPingPongFramebuffersWithTexture(gl, state.opt.fluid.scalar),
        };

        state.framebuffer.post = {};
        state.framebuffer.post.sunrays = {
            effect: createFramebufferWithTexture(gl, state.opt.sunrays),
            tempForBlur: createFramebufferWithTexture(gl, state.opt.sunrays),
        };
        state.framebuffer.post.bloom = {
            options: state.opt.bloom,
            effect: createFramebufferWithTexture(gl, state.opt.bloom),
            nIterations: Math.log2(state.opt.bloom.height),
            iterations: [],
            dither: createTextureFromImage(gl, ditherImage, {
                minFilter: gl.LINEAR,
                maxFilter: gl.LINEAR,
                wrapS: gl.REPEAT,
                wrapT: gl.REPEAT,
                internalFormat: gl.RGB,
                dataFormat: gl.RGB,
                dataType: gl.UNSIGNED_BYTE,
                returnMetaInformation: true,
            })
        };

        for (let i = 0; i < state.framebuffer.post.bloom.nIterations; i++) {
            const options = {
                ...state.opt.bloom,
                width: state.opt.bloom.width >> (i + 1),
                height: state.opt.bloom.height >> (i + 1),
            };
            if (options.width < 2 || options.height < 2) {
                break;
            }
            state.framebuffer.post.bloom.iterations.push(
                createFramebufferWithTexture(gl, options)
            );
        }

        state.debug = {
            option: +(sessionStorage.getItem("qm.dream210.debug") ?? 0),
            fb: {
                index: +(sessionStorage.getItem("qm.dream210.debug.fb") ?? 0),
                obj: null,
                name: ""
            },
            toggle: {}
        };
        state.debug.toggle.option = (index) => {
            if (index === -1) {
                state.debug.option = Math.max(0, state.debug.option - 1);
            } else if (index === undefined) {
                state.debug.option = (state.debug.option + 1) % 4;
            } else {
                state.debug.option ^= 1 << index;
            }
            sessionStorage.setItem("qm.dream210.debug", state.debug.option);
        };
        state.debug.hasOption = (index) =>
            (state.debug.option & (1 << index)) !== 0;

        state.debug.fb.toggle = (index) => {
            const debugFramebuffer = [
                [null, "--"],
                [state.framebuffer.fluid.result, "Fluid Render Image"],
                [state.framebuffer.fluid.color.currentRead(), "Fluid Color Density"],
                [state.framebuffer.fluid.velocity.currentRead(), "Fluid Velocity"],
                [state.framebuffer.fluid.curl, "Fluid Curl"],
                [state.framebuffer.fluid.divergence, "Fluid Divergence"],
                [state.framebuffer.fluid.pressure.currentRead(), "Fluid Pressure"],
                [state.framebuffer.noiseBase, "Noise Base"],
                [state.framebuffer.texts, "Text 2"]
            ];
            state.debug.fb.index =
                index === undefined
                ? (state.debug.fb.index + 1)
                : index === -1
                ? (state.debug.fb.index - 1)
                : index;
            if (state.debug.fb.index < 0) {
                state.debug.fb.index += debugFramebuffer.length;
            }
            [state.debug.fb.obj, state.debug.fb.name] =
                debugFramebuffer[state.debug.fb.index] ?? debugFramebuffer[0];
            if (!state.debug.fb.obj) {
                state.debug.fb.index = 0;
            } else {
                console.info("[DEBUG FRAMEBUFFER]", state.debug.fb);
            }
            sessionStorage.setItem("qm.dream210.debug.fb", state.debug.fb.index);
        };
        state.debug.fb.toggle(state.debug.fb.index);

        gl.useProgram(state.program);

        // initialize the velocity framebuffer texture ([1] = pong = first read) to constant values
        // rg == vec2(0,0) should be default anyway, but why not make sure.
        const [, initialVelocity] = state.framebuffer.fluid.velocity.currentWriteRead();
        gl.bindFramebuffer(gl.FRAMEBUFFER, initialVelocity.fbo);
        gl.clearColor(0,0,0,0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        // also initialize the curl framebuffer texture (there is only one), while we're at it
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer.fluid.curl.fbo);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // ALWAYS BOUND FOR NOW
        let unit = TEXTURE_UNITS.MONA_1;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, state.monaTextures["210_schnoerkel"]);
        gl.uniform1i(state.location.texMonaSchnoergel, unit++);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, state.monaTextures["regenbogen"]);
        gl.uniform1i(state.location.texMonaRainbow, unit++);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, state.monaTextures["dream210_visual_quadratisch_transparent"]);
        gl.uniform1i(state.location.texMonaCity, unit++);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, state.monaTextures["schnoerkelsterne"]);
        gl.uniform1i(state.location.texMonaStars, unit++);

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
        toggles: [
            {
                label: () =>
                    "Debug Option = " + state.debug.option,
                onClick: () =>
                    state.debug.toggle.option(),
                onRightClick: () =>
                    state.debug.toggle.option(-1),
            }, {
                label: () =>
                    "Debug FB: " + (state.debug.fb.name || "--"),
                onClick: () =>
                    state.debug.fb.toggle(),
                onRightClick: () =>
                    state.debug.fb.toggle(-1),
            }, {
                label: () =>
                    "Test Event...",
                onClick: () => {
                    state.events.manager.launch({
                        member: state.events.members.fluidVelocityEvent,
                        data: {
                            type: state.events.types.CLEAR_FLUID,
                            coords: [10., 0.],
                            args: [7.]
                        },
                        expire: {in: 0.5},
                    });
                },
                onRightClick: () => {
                    console.info("[EVENTS]", state.events, "- Queues:", state.events.manager.queue);
                },
            }, {
                label: () =>
                    "Glyph Instances",
                onClick: () => {
                    const text = window.prompt(
                        "Set the Glyph Instances to... (max 32. characters)",
                        state.glyphs.manager.lastPhrase
                    );
                    if (text !== null) {
                        state.glyphs.manager.replacePhrase(text);
                    }
                },
                onRightClick: () => {
                    state.glyphs.manager.replacePhrase("", false);
                    console.info("[GLYPHS]", state.glyphs, "- Manager:", state.glyphs.manager);
                },
            }, {
                label: () => {
                    if (!state.lastQueryNanos) {
                        return "Query";
                    }
                    const millis = (1e-6 * state.lastQueryNanos).toFixed(3);
                    return `${millis} ms`;
                },
                onClick: async () => {
                    const nanos = await gl.timer.executeWithQuery(() =>
                        render(gl, state)
                    );
                    const comparison = !state.lastQueryNanos ? [] :
                        ["- Ratio to last query:", nanos / state.lastQueryNanos];
                    console.log("Query took", nanos / 1e3, "µs", ...comparison);
                    state.lastQueryNanos = nanos;
                },
                style: { flex: 0.5 }
            },
        ],
        uniforms: createUniforms(),
    })
};

const PASS = {
    INIT_FLUID_COLOR: 1,
    INIT_VELOCITY: 2,
    INIT_PRESSURE: 3,
    CALC_CURL_FROM_VELOCITY: 4,
    PROCESS_VELOCITY_CURLING: 10,
    CALC_DIVERGENCE_FROM_VELOCITY: 11,
    PROCESS_PRESSURE: 12,
    PROCESS_GRADIENT_SUBTRACTION: 13,
    PROCESS_ADVECTION: 14,
    PROCESS_FLUID_COLOR: 19,
    POST_BLOOM_PREFILTER: 20,
    POST_BLOOM_BLUR: 21,
    POST_SUNRAYS_CALC_MASK: 30,
    POST_SUNRAYS_CALC: 31,
    POST_SUNRAYS_BLUR: 32,
    RENDER_FLUID: 40,

    RENDER_CLOUDS: 60,

    // PLACEHOLDERS
    INIT_TEXT0: 80,
    INIT_TEXT1: 81,
    INIT_TEXT2: 82,
    INIT_TEXT3: 83,

    RENDER_NOISE_BASE: 90,
    RENDER_FINALLY_TO_SCREEN: 100
};

// scheiß-nummerierung -> aber egal -> frag nicht
const TEXTURE_UNITS = {
    COLOR_DENSITY: 0,
    VELOCITY: 1,
    CURL: 2,
    PRESSURE: 3,
    DIVERGENCE: 4,
    POST_SUNRAYS: 2,
    POST_BLOOM: 3,
    POST_DITHER: 4,
    // <-- bestmöglich wiederverwendet.
    // glyphs:
    OHLI_FONT: 7,
    // cloud render result
    PREVIOUS_CLOUDS: 8,
    NOISE_BASE: 9,
    // ... and some mona-graphics please?
    MONA_1: 10,
    MONA_2: 12,
    MONA_3: 13,
    MONA_4: 14,
    // GLYPH-WRITTEN TEXTURE ARRAY
    FONT_ARRAY: 15,
}

// sind halt einfach Platzhalter.
// zwar global, aber werden halt einfach nicht scheiße behandelt. yespls?
// -> else hausverbot
let write, read, readPrevious, readVelocity;

function render(gl, state) {
    gl.uniform1f(state.location.iTime, state.time);
    gl.uniform1f(state.location.deltaTime, state.play.dt);
    gl.uniform2fv(state.location.iResolution, state.resolution);
    gl.uniform1i(state.location.iFrame, state.iFrame);
    gl.uniform1i(state.location.debugOption, state.debug.option);

    state.events.manager.manage(state);

    gl.uniform1f(state.location.iVignetteInner, state.iVignetteInner);
    gl.uniform1f(state.location.iVignetteOuter, state.iVignetteOuter);
    gl.uniform1f(state.location.iVignetteScale, state.iVignetteScale);
    gl.uniform1f(state.location.iGamma, state.iGamma);

    gl.uniform1f(state.location.iFree0, state.iFree0);
    gl.uniform1f(state.location.iFree1, state.iFree1);
    gl.uniform1f(state.location.iFree2, state.iFree2);
    gl.uniform1f(state.location.iFree3, state.iFree3);
    gl.uniform1f(state.location.iFree4, state.iFree4);
    gl.uniform1f(state.location.iFree5, state.iFree5);
    gl.uniform1f(state.location.iFree6, state.iFree6);
    gl.uniform1f(state.location.iFree7, state.iFree7);
    gl.uniform1f(state.location.iFree8, state.iFree8);
    gl.uniform1f(state.location.iFree9, state.iFree9);
    gl.uniform4fv(state.location.colFree0, state.colFree0);
    gl.uniform4fv(state.location.colFree1, state.colFree1);
    gl.uniform4fv(state.location.colFree2, state.colFree2);
    gl.uniform4fv(state.location.colFree3, state.colFree3);

    // SOURCE: NOISE BASE -

    gl.uniform1f(state.location.iGridOpacity, state.iGridOpacity);
    gl.uniform2fv(state.location.iOverallNoiseShift, state.iOverallNoiseShift);
    gl.uniform1f(state.location.iOverallScale, state.iOverallScale);
    gl.uniform1f(state.location.iOverallHashOffset, state.iOverallHashOffset);
    gl.uniform1f(state.location.iNoiseLevelA, state.iNoiseLevelA);
    gl.uniform1f(state.location.iNoiseLevelAC, state.iNoiseLevelAC);
    gl.uniform1f(state.location.iNoiseLevelC, state.iNoiseLevelC);
    gl.uniform1f(state.location.iNoiseScaleA, state.iNoiseScaleA);
    gl.uniform1f(state.location.iNoiseScaleXT, state.iNoiseScaleXT);
    gl.uniform1f(state.location.iNoiseScaleC, state.iNoiseScaleC);
    gl.uniform1f(state.location.iNoiseMorphingA, state.iNoiseMorphingA);
    gl.uniform1f(state.location.iNoiseMorphingB, state.iNoiseMorphingB);
    gl.uniform1f(state.location.iNoiseMorphingC, state.iNoiseMorphingC);
    gl.uniform1i(state.location.iFractionalOctaves, state.iFractionalOctaves);
    gl.uniform1f(state.location.iFractionalScale, state.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1f(state.location.iTurbulenceNormFactor, state.iTurbulenceNormFactor);
    gl.uniform1f(state.location.iTurbulenceMeanOffset, state.iTurbulenceMeanOffset);
    gl.uniform2fv(state.location.iMarbleSqueeze, state.iMarbleSqueeze);
    gl.uniform1f(state.location.iMarbleGranularity, state.iMarbleGranularity);
    gl.uniform1f(state.location.iMarbleGradingExponent, state.iMarbleGradingExponent);
    gl.uniform1f(state.location.iMarbleRange, state.iMarbleRange);
    gl.uniform1f(state.location.iColorStrength, state.iColorStrength);
    gl.uniform3fv(state.location.iColorCosineFreq, state.iColorCosineFreq);
    gl.uniform3fv(state.location.iColorCosinePhase, state.iColorCosinePhase);

    // SOURCE: FONTS -- TEXTURE8 für MSDF-Png

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.OHLI_FONT);
    gl.bindTexture(gl.TEXTURE_2D, state.glyphs.msdf.tex);
    gl.uniform1i(state.location.glyphTex, TEXTURE_UNITS.OHLI_FONT);

    ///// INIT_TEXTi...

    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer.texts.fbo);
    gl.uniform1i(state.location.texTexts, TEXTURE_UNITS.FONT_ARRAY);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.FONT_ARRAY);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

    for (let layer = 0; layer < state.framebuffer.texts.layers; layer++) {
        gl.uniform1i(state.location.passIndex, PASS.INIT_TEXT0 + layer);
        gl.framebufferTextureLayer(
            gl.FRAMEBUFFER,
            state.framebuffer.texts.opt.attachment,
            state.framebuffer.texts.texArray,
            0,
            layer
        );
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, state.framebuffer.texts.texArray);

    /////

    gl.uniform1i(state.location.passIndex, PASS.RENDER_NOISE_BASE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer.noiseBase.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // SOURCE: CLOUDS -- TEXTURE9 für Feedback / Akkumulation

    gl.uniform1f(state.location.iCloudYDisplacement, state.iCloudYDisplacement);
    gl.uniform1f(state.location.iCloudLayerDistance, state.iCloudLayerDistance);
    gl.uniform1f(state.location.iLightLayerDistance, state.iLightLayerDistance);
    gl.uniform1f(state.location.iCloudSeed, state.iCloudSeed);
    gl.uniform1f(state.location.iSkyQuetschung, state.iSkyQuetschung);
    gl.uniform1f(state.location.iSampleCount, state.iSampleCount);
    gl.uniform1i(state.location.iCloudLayerCount, state.iCloudLayerCount);
    gl.uniform1i(state.location.iLightLayerCount, state.iLightLayerCount);
    gl.uniform1i(state.location.iCloudNoiseCount, state.iCloudNoiseCount);
    gl.uniform1i(state.location.iLightNoiseCount, state.iLightNoiseCount);
    gl.uniform1f(state.location.iCloudTransmittanceThreshold, state.iCloudTransmittanceThreshold);
    gl.uniform3fv(state.location.iNoiseScale, state.iNoiseScale);
    gl.uniform1f(state.location.iCloudAbsorptionCoeff, state.iCloudAbsorptionCoeff);
    gl.uniform1f(state.location.iCloudBaseLuminance, state.iCloudBaseLuminance);
    gl.uniform1f(state.location.iCloudAnisoScattering, state.iCloudAnisoScattering);
    gl.uniform3fv(state.location.vecSunPosition, state.vecSunPosition);
    gl.uniform3fv(state.location.vecSunColorYCH, state.vecSunColorYCH);
    gl.uniform1f(state.location.iSunExponent, state.iSunExponent);
    gl.uniform1f(state.location.iCloudFieldOfView, state.iCloudFieldOfView)
    gl.uniform3fv(state.location.vecTone1, state.vecTone1);
    gl.uniform3fv(state.location.vecTone2, state.vecTone2);
    gl.uniform1f(state.location.iAccumulateMix, state.iAccumulateMix);
    gl.uniform1i(state.location.doAccumulate, state.doAccumulate);
    gl.uniform1i(state.location.useModdedFBM, state.useModdedFBM);
    gl.uniform1f(state.location.iVariateCloudMarchSize, state.iVariateCloudMarchSize);
    gl.uniform1f(state.location.iVariateCloudMarchOffset, state.iVariateCloudMarchOffset);
    gl.uniform1f(state.location.iVariateCloudMarchFree, state.iVariateCloudMarchFree);

    gl.uniform1f(state.location.iNoiseLevel, state.iNoiseLevel);
    gl.uniform1f(state.location.iNoiseFreq, state.iNoiseFreq);
    gl.uniform1f(state.location.iNoiseOffset, state.iNoiseOffset);
    gl.uniform1i(state.location.iFractionalOctaves, state.iFractionalOctaves);
    gl.uniform1f(state.location.iFractionalScale, state.iFractionalScale);
    gl.uniform1f(state.location.iFractionalDecay, state.iFractionalDecay);
    gl.uniform1f(state.location.iCloudMorph, state.iCloudMorph);

    gl.uniform1i(state.location.passIndex, PASS.RENDER_CLOUDS);

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.PREVIOUS_CLOUDS);
    gl.uniform1i(state.location.texAccumulusClouds, TEXTURE_UNITS.PREVIOUS_CLOUDS);

    [write, read] = state.framebuffer.clouds.currentWriteRead();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.clouds.doPingPong();

    [, read] = state.framebuffer.clouds.currentWriteRead();
    gl.bindTexture(gl.TEXTURE_2D, read.texture);

    // SOURCE: FLUID-ESCALATION

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

    //// FLUID STUFF. Massiv. Erstmal auslagern

    // NOTE: man KÖNNTE die komprimieren, aber vllt muss man gar nicht
    gl.uniform1i(state.location.texColor, TEXTURE_UNITS.COLOR_DENSITY);
    gl.uniform1i(state.location.texVelocity, TEXTURE_UNITS.VELOCITY);
    gl.uniform1i(state.location.texCurl, TEXTURE_UNITS.CURL); // could also use 0 here because we will not conflict, but this is needless.
    gl.uniform1i(state.location.texPressure, TEXTURE_UNITS.PRESSURE); // could also use 0 here because we will not conflict, but this is needless.
    gl.uniform1i(state.location.texDivergence, TEXTURE_UNITS.DIVERGENCE); // could also use 0 here because we will not conflict, but this is needless.
    gl.uniform1i(state.location.texPostSunrays, TEXTURE_UNITS.POST_SUNRAYS);
    gl.uniform1i(state.location.texPostBloom, TEXTURE_UNITS.POST_BLOOM);
    gl.uniform1i(state.location.texPostDither, TEXTURE_UNITS.POST_DITHER);

    gl.uniform1f(state.location.iBloomSoftKnee, state.iBloomSoftKnee);
    gl.uniform1f(state.location.iBloomThreshold, state.iBloomThreshold);
    gl.uniform1f(state.location.iBloomIntensity, state.iBloomIntensity);
    gl.uniform1f(state.location.iBloomPreGain, state.iBloomPreGain);
    gl.uniform1f(state.location.iBloomDithering, state.iBloomDithering);

    processFluid(gl, state);
    postProcessFluid(gl, state);
    renderFluid(gl, state);

    // !! Finale Komposition auf Back Buffer !!

    gl.uniform1i(state.location.passIndex, PASS.RENDER_FINALLY_TO_SCREEN);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.NOISE_BASE);
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.noiseBase.texture);
    gl.uniform1i(state.location.texNoiseBase, TEXTURE_UNITS.NOISE_BASE);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.COLOR_DENSITY);
    gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.fluid.result.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.NOISE_BASE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    if (state.debug.fb.obj) {
        /*
        // Would like to set the Alpha to 1 for debugging. Don't know whether this destroys something...??
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, state.debug.fb.obj.fbo);
        gl.colorMask(false, false, false, true);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.colorMask(true, true, true, true);
         */
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.debug.fb.obj.fbo);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(
            0, 0, state.debug.fb.obj.width, state.debug.fb.obj.height,
            0, 0, state.opt.image.width, state.opt.image.height,
            gl.COLOR_BUFFER_BIT,
            gl.LINEAR
        );
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    }
}

function processFluid(gl, state) {

    /////////////

    gl.uniform1i(state.location.passIndex, PASS.INIT_VELOCITY);

    [write, readPrevious] = state.framebuffer.fluid.velocity.currentWriteRead();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.opt.fluid.resolution);

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.VELOCITY);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.velocity.doPingPong();

    /////////////

    gl.uniform1i(state.location.passIndex, PASS.INIT_FLUID_COLOR);

    [write, readPrevious] = state.framebuffer.fluid.color.currentWriteRead();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.resolution);

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.COLOR_DENSITY);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.color.doPingPong();

    /////////////

    // Use Velocity to calculate a fresh Scalar: Curl

    gl.uniform1i(state.location.passIndex, PASS.CALC_CURL_FROM_VELOCITY);

    write = state.framebuffer.fluid.curl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.opt.fluid.resolution);

    readVelocity = state.framebuffer.fluid.velocity.currentRead();
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.CURL);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.VELOCITY);

    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /////////////

    // Use Curl and Velocity to calculate new Velocity
    gl.uniform1i(state.location.passIndex, PASS.PROCESS_VELOCITY_CURLING);

    [write, readVelocity] = state.framebuffer.fluid.velocity.currentWriteRead();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.opt.fluid.resolution);

    const readCurl = state.framebuffer.fluid.curl;
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.VELOCITY);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.CURL);
    gl.bindTexture(gl.TEXTURE_2D, readCurl.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.velocity.doPingPong();
    // ! ... we did use Velocity to write Velocity, so do the ping-pong.

    /////////////

    // Use Velocity to calculate a fresh Scalar: Divergence
    gl.uniform1i(state.location.passIndex, PASS.CALC_DIVERGENCE_FROM_VELOCITY);

    write = state.framebuffer.fluid.divergence;
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.opt.fluid.resolution);

    readVelocity = state.framebuffer.fluid.velocity.currentRead();
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.VELOCITY);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // ! ... we did not write to anything we've read from, i.e. no swap here

    /////////////

    gl.uniform1i(state.location.passIndex, PASS.INIT_PRESSURE);

    [write, readPrevious] = state.framebuffer.fluid.pressure.currentWriteRead();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.opt.fluid.resolution);

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.PRESSURE);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.pressure.doPingPong();

    /////////////

    // Use Divergence and Pressure to Iterate a while on Pressure
    gl.uniform1i(state.location.passIndex, PASS.PROCESS_PRESSURE);

    //gl.uniform2fv(state.location.iResolution, state.opt.fluid.resolution);

    for (let p = 0; p < state.pressureIterations; p++) {
        [write, readPrevious] = state.framebuffer.fluid.pressure.currentWriteRead();
        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
        gl.viewport(0, 0, write.width, write.height);
        gl.uniform2fv(state.location.iResolution, state.opt.fluid.resolution);

        gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.PRESSURE);
        gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
        gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.DIVERGENCE);
        gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.fluid.divergence.texture);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        state.framebuffer.fluid.pressure.doPingPong();
    }
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.DIVERGENCE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    /////////////

    // Use Pressure and Velocity to Subtract Gradients on Velocity - it seems.
    gl.uniform1i(state.location.passIndex, PASS.PROCESS_GRADIENT_SUBTRACTION);

    [write, readVelocity] = state.framebuffer.fluid.velocity.currentWriteRead();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.opt.fluid.resolution);

    const readPressure = state.framebuffer.fluid.pressure.currentRead();
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.PRESSURE);
    gl.bindTexture(gl.TEXTURE_2D, readPressure.texture);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.VELOCITY);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.velocity.doPingPong();

    /////////////

    // Use Velocity as velocity AND as previous value to advect / dissipate Velocity
    gl.uniform1i(state.location.passIndex, PASS.PROCESS_ADVECTION);

    [write, readPrevious] = state.framebuffer.fluid.velocity.currentWriteRead();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.opt.fluid.resolution);

    // ! wird tatsächlich bewusst auf zwei Units eingelesen !
    // -> TEXTURE_UNITS.VELOCITY != 0
    readVelocity = readPrevious;
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.VELOCITY);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.velocity.doPingPong();

    /////////////

    // Use Velocity as velocity and last image color as previous value to advect / dissipate Density
    // (Density, together with the somehow chosen start color, is what we actually see as colored cloud image)
    gl.uniform1i(state.location.passIndex, PASS.PROCESS_FLUID_COLOR);

    [write, readPrevious] = state.framebuffer.fluid.color.currentWriteRead();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.resolution);

    readVelocity = state.framebuffer.fluid.velocity.currentRead();
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.COLOR_DENSITY);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.VELOCITY);
    gl.bindTexture(gl.TEXTURE_2D, readVelocity.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.color.doPingPong();

    /// END OF FLUID DYNAMICS ///////////////////
}

function postProcessFluid(gl, state) {

    /// POST: BLOOM /////////////////////////////

    gl.uniform1i(state.location.passIndex, PASS.POST_BLOOM_PREFILTER);

    write = state.framebuffer.post.bloom.effect;
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, write.resolution);

    readPrevious = state.framebuffer.fluid.color.currentRead();
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.COLOR_DENSITY);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    let lastWrite = write;

    gl.uniform1i(state.location.passIndex, PASS.POST_BLOOM_BLUR);

    for (const iteration of state.framebuffer.post.bloom.iterations) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, iteration.fbo);
        gl.viewport(0, 0, iteration.width, iteration.height);
        // Obacht, hier lastWrite:
        gl.uniform2fv(state.location.iResolution, lastWrite.resolution);

        gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_BLOOM);
        gl.bindTexture(gl.TEXTURE_2D, lastWrite.texture);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        lastWrite = iteration;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = state.framebuffer.post.bloom.iterations.length - 2; i >= 0; i--) {
        const iteration = state.framebuffer.post.bloom.iterations[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, iteration.fbo);
        gl.viewport(0, 0, iteration.width, iteration.height);
        // Obacht, hier auch wieder lastWrite:
        gl.uniform2fv(state.location.iResolution, lastWrite.resolution);

        gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_BLOOM);
        gl.bindTexture(gl.TEXTURE_2D, lastWrite.texture);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        lastWrite = iteration;
    }

    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    // änd once moar.
    gl.uniform2fv(state.location.iResolution, lastWrite.resolution);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_BLOOM);
    gl.bindTexture(gl.TEXTURE_2D, lastWrite.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /// POST: SUNRAYS ///////////////////////////

    // the prepare step takes the previous image and writes to the next _image_

    gl.uniform1i(state.location.passIndex, PASS.POST_SUNRAYS_CALC_MASK);

    [write, readPrevious] = state.framebuffer.fluid.color.currentWriteRead();
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.resolution);

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.COLOR_DENSITY);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.framebuffer.fluid.color.doPingPong();
    // did we write to what we read? hell yes wie did (the image itself)

    /////////////

    // with that mask prepared (i.e. now the previous image),
    // the main step can now write on the sunrays framebuffer itself

    gl.uniform1i(state.location.passIndex, PASS.POST_SUNRAYS_CALC);

    write = state.framebuffer.post.sunrays.effect;
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.width, write.height);
    gl.uniform2fv(state.location.iResolution, state.opt.sunrays.resolution);

    readPrevious = state.framebuffer.fluid.color.currentRead();
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_SUNRAYS);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /////////////

    // the blurring afterwards writes from sunrays.effect to sunrays.tempForBlur
    // because it does first x, then y, and needs something to stash inbetween.

    gl.uniform1i(state.location.passIndex, PASS.POST_SUNRAYS_BLUR);

    write = state.framebuffer.post.sunrays.tempForBlur;
    for (let blur = 0; blur < state.sunrayBlurs; blur++) {
    // can iterate this for more blur, but one iteration is also fine.

        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
        gl.viewport(0, 0, write.width, write.height);
        // only texelSize.x
        gl.uniform2f(state.location.iResolution, state.opt.sunrays.width, 1e8);

        readPrevious = state.framebuffer.post.sunrays.effect;
        gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_SUNRAYS);
        gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        // ... consider this very similar to the other framebuffer ping pongs ...
        [readPrevious, write] = [write, readPrevious];

        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
        gl.viewport(0, 0, write.width, write.height);
        // only texelSize.y
        gl.uniform2f(state.location.iResolution, 1e8, state.opt.sunrays.height);

        gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_SUNRAYS);
        gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        [readPrevious, write] = [write, readPrevious];
    }
}

function renderFluid(gl, state) {

    gl.uniform1i(state.location.passIndex, PASS.RENDER_FLUID);

    readPrevious = state.framebuffer.fluid.color.currentRead();
    write = state.framebuffer.fluid.result;
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, state.opt.image.width, state.opt.image.height);
    gl.uniform2fv(state.location.iResolution, state.resolution);

    if (state.debug.option > 0) {
        gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.PRESSURE);
        gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.fluid.pressure.currentRead().texture);
        gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.DIVERGENCE);
        gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.fluid.divergence.texture);
        gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.CURL);
        gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.fluid.curl.texture);
    } else {
        // Auskommentiert, wo als unnötig erwiesen
        // gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_BLOOM);
        // gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.post.bloom.effect.texture);
        gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_DITHER);
        gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.post.bloom.dither.texture);
        // gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_SUNRAYS);
        // gl.bindTexture(gl.TEXTURE_2D, state.framebuffer.post.sunrays.effect.texture);
    }
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.COLOR_DENSITY);
    gl.bindTexture(gl.TEXTURE_2D, readPrevious.texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_SUNRAYS);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_BLOOM);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.POST_DITHER);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

function createUniforms() {
    return [
        {
            ////////////////////////////////////////
            separator: "NR4s Wolkenquest",
            ////////////////////////////////////////
        }, {
            type: "float",
            name: "iCloudYDisplacement",
            defaultValue: -12.43,
            min: -50,
            max: 10,
        }, {
            type: "float",
            name: "iCloudLayerDistance",
            defaultValue: 4.46,
            min: 0.01,
            max: 10,
        }, {
            type: "float",
            name: "iLightLayerDistance",
            defaultValue: 3.00,
            min: 0.01,
            max: 10,
        }, {
            type: "float",
            name: "iCloudSeed",
            defaultValue: 11.07,
            min: 0,
            max: 100,
        }, {
            type: "float",
            name: "iSkyQuetschung",
            defaultValue: 0.72,
            min: 0,
            max: 10,
        }, {
            type: "int",
            name: "iSampleCount",
            defaultValue: 1,
            min: 1,
            max: 20,
            step: 1,
        }, {
            type: "int",
            name: "iCloudLayerCount",
            defaultValue: 60,
            min: 1,
            max: 200,
        }, {
            type: "int",
            name: "iLightLayerCount",
            defaultValue: 6,
            min: 1,
            max: 100,
        }, {
            type: "float",
            name: "iCloudTransmittanceThreshold",
            defaultValue: 0.1,
            min: 0,
            max: 1,
            step: 0.001
        }, {
            type: "int",
            name: "iCloudNoiseCount",
            defaultValue: 6,
            min: 1,
            max: 10,
        }, {
            type: "int",
            name: "iLightNoiseCount",
            defaultValue: 3,
            min: 1,
            max: 10,
        }, {
            type: "vec3",
            name: "iNoiseScale",
            defaultValue: [1, 1, 1],
            min: 0.01,
            max: 3,
            step: 0.01,
        }, {
            type: "float",
            name: "iCloudAbsorptionCoeff",
            defaultValue: 0.9,
            min: 0.001,
            max: 3,
        }, {
            type: "float",
            name: "iCloudBaseLuminance",
            defaultValue: .055,
            min: 0.001,
            max: 1.,
            log: true,
        }, {
            type: "float",
            name: "iCloudAnisoScattering",
            defaultValue: 0.3,
            min: 0,
            max: 2,
        }, {
            type: "vec3",
            name: "vecSunPosition",
            defaultValue: [1, 0, 0],
            min: -1,
            max: 1,
            normalize: true,
        }, {
            type: "vec3",
            name: "vecSunColorYCH",
            defaultValue: [0.6267, 0.5051, 0.1466], // YIQ [0.6267, 0.3622, 0.0535], RGB [1, 0.5, 0.3]
            min: [0, 0.00, -3.142],
            max: [1, 0.78, +3.142],
        }, {
            type: "float",
            name: "iSunExponent",
            defaultValue: 10,
            min: 0.01,
            max: 100,
        }, {
            type: "float",
            name: "iCloudFieldOfView",
            defaultValue: 1,
            min: 0.01,
            max: 10,
            log: true,
        }, {
            type: "vec3",
            name: "vecTone1",
            defaultValue: [2.51, 0.03, 2.43],
            min: 0,
            max: 5,
        }, {
            type: "vec3",
            name: "vecTone2",
            defaultValue: [0.59, 0.14, 1.],
            min: 0,
            max: 5,
        }, {
            type: "bool",
            name: "useModdedFBM",
            defaultValue: false,
        }, {
            type: "bool",
            name: "doAccumulate",
            defaultValue: false,
        }, {
            type: "float",
            name: "iAccumulateMix",
            defaultValue: 1.,
            min: 0.,
            max: 1,
        }, {
            type: "float",
            name: "iVariateCloudMarchSize",
            defaultValue: 0.,
            min: 0.,
            max: 0.1,
            step: 0.001,
        }, {
            type: "float",
            name: "iVariateCloudMarchOffset",
            defaultValue: 0.,
            min: 0.,
            max: 0.1,
            step: 0.001,
        }, {
            type: "float",
            name: "iVariateCloudMarchFree",
            defaultValue: 0.,
            min: 0.,
            max: 1.,
            step: 0.001,
        }, {
            /////////////////////////////////////
            separator: "Spawn Colors & Velocity"
            /////////////////////////////////////
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
            type: "float",
            name: "iBloomPreGain",
            defaultValue: 1.,
            min: 0,
            max: 10,
        }, {
            type: "float",
            name: "iBloomDithering",
            defaultValue: 1,
            min: 0,
            max: 20,
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
            type: "int",
            name: "sunrayBlurs",
            defaultValue: 1,
            min: 0,
            max: 20,
            notAnUniform: true,
        }, {
            separator: "Pseudo-Random - Allgemeine Parameter"
        }, {
            type: "float",
            name: "iNoiseLevel",
            defaultValue: 0.,
            min: -2,
            max: 2,
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
            // }, {
            //     type: "float",
            //     name: "iCloudVelX",
            //     defaultValue: 0,
            //     min: -2.,
            //     max: 2,
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
            separator: "Noise Base",
        }, {
            type: "float",
            name: "iNoiseLevelA",
            defaultValue: 0.0,
            min: -2,
            max: 2,
        }, {
            type: "float",
            name: "iNoiseLevelC",
            defaultValue: 0,
            min: -2,
            max: 2,
        }, {
            type: "float",
            name: "iNoiseLevelAC",
            defaultValue: 0.0,
            min: -2,
            max: 2,
        }, {
            type: "float",
            name: "iNoiseScaleA",
            defaultValue: 1,
            min: 0.01,
            max: 10,
        }, {
            type: "float",
            name: "iNoiseScaleC",
            defaultValue: 1,
            min: 0.01,
            max: 10,
        }, {
            type: "float",
            name: "iNoiseScaleXT",
            defaultValue: 1,
            min: 0.01,
            max: 10,
        }, {
            type: "vec2",
            name: "iOverallNoiseShift",
            defaultValue: [1, 1],
            min: 0,
            max: 10,
        }, {
            type: "float",
            name: "iOverallScale",
            defaultValue: 2,
            min: 0.01,
            max: 10.,
        }, {
            type: "float",
            name: "iNoiseMorphingA",
            defaultValue: 0,
            min: 0,
            max: 6.28,
        }, {
            type: "float",
            name: "iNoiseMorphingB",
            defaultValue: 1.,
            min: 0,
            max: 6.28,
        }, {
            type: "float",
            name: "iNoiseMorphingC",
            defaultValue: 2.,
            min: 0,
            max: 6.28,
        }, {
            type: "float",
            name: "iOverallHashOffset",
            defaultValue: 0,
            min: -1,
            max: 1,
            step: 0.01
        }, {
            type: "float",
            name: "iTurbulenceNormFactor",
            defaultValue: 0.33,
            min: 0.001,
            max: 1.,
        }, {
            type: "float",
            name: "iTurbulenceMeanOffset",
            defaultValue: 0.18,
            min: 0.,
            max: 0.5,
        }, {
            type: "vec2",
            name: "iMarbleSqueeze",
            defaultValue: [0, 0],
            min: 0.0,
            max: 20.,
            step: 0.01
        }, {
            type: "float",
            name: "iMarbleGranularity",
            defaultValue: 7.5,
            min: 0.01,
            max: 50,
        }, {
            type: "float",
            name: "iMarbleGradingExponent",
            defaultValue: 1,
            min: 0.01,
            max: 5.,
        }, {
            type: "float",
            name: "iMarbleRange",
            defaultValue: 0.5,
            min: 0.01,
            max: 1.,
        }, {
            type: "float",
            name: "iColorStrength",
            defaultValue: 0.,
            min: 0,
            max: 1,
        }, {
            type: "vec3",
            name: "iColorCosineFreq",
            defaultValue: [11, 20, 30],
            min: 0,
            max: 31.42,
            step: 0.01,
        }, {
            type: "vec3",
            name: "iColorCosinePhase",
            defaultValue: [0, 1, 0.5],
            min: 0,
            max: 6.283,
            step: 0.01,
        }, {
            separator: "Zur freien Verwendung..."
        }, {
            type: "float",
            name: "iFree0",
            defaultValue: 0,
            min: 0.01,
            max: 100,
            log: true
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
        }, {
            type: "float",
            name: "iFree6",
            defaultValue: 0,
            min: -2,
            max: +2,
        }, {
            type: "float",
            name: "iFree7",
            defaultValue: 0,
            min: -2,
            max: +2,
        }, {
            type: "float",
            name: "iFree8",
            defaultValue: 0,
            min: -2,
            max: +2,
        }, {
            type: "float",
            name: "iFree9",
            defaultValue: 0,
            min: -2,
            max: +2,
        }, {
            type: "vec4",
            name: "colFree0",
            defaultValue: 0,
            min: 0,
            max: 2,
        }, {
            type: "vec4",
            name: "colFree1",
            defaultValue: 0,
            min: 0,
            max: 2,
        }, {
            type: "vec4",
            name: "colFree2",
            defaultValue: 0,
            min: 0,
            max: 2,
        }, {
            type: "vec4",
            name: "colFree3",
            defaultValue: 0,
            min: 0,
            max: 2,
        }
    ];
}
