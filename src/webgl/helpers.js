export function createShader(gl, type, source) {
    let shader = gl.createShader(type);
    let error = "";

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        shader = null;
    }

    return {shader, error};
}

export function takeMilliSeconds(since = 0) {
    return +(performance.now() - since).toFixed(3);
}

/**
 * Helper function for aspectRatio
 * @param geometry {width, height, aspectRatio} - canvas dimensions, specify any two
 * @return {{width, height}} - the resolution in integer pixels.
 */
export function asResolution({width, height, aspectRatio}) {
    if (aspectRatio) {
        return {
            width: Math.round(height * aspectRatio),
            height: Math.round(height),
        };
    }
    return {
        width: Math.round(width || height * aspectRatio),
        height: Math.round(height ?? width / aspectRatio),
    };
}

export function resolutionScaled(newHeight, oldWidth, oldHeight) {
    const resolution = {
        width: Math.floor(newHeight * oldWidth / oldHeight),
        height: Math.floor(newHeight),
    };
    resolution.asVec2 = [resolution.width, resolution.height];
    resolution.texelSize = [1 / resolution.width, 1 / resolution.height];
    return resolution;
}

/**
 * @return {{width, height}}
 */
export function initialOrStoredResolution(canvas, geometry) {
    const canvasRect = canvas.getBoundingClientRect();
    geometry.height = loadStoredResolutionHeight()
        ?? geometry.height
        ?? canvasRect.height;
    if (!geometry.aspectRatio && !geometry.width) {
        geometry.width = canvasRect.width;
    }
    return asResolution(geometry);
}

function loadStoredResolutionHeight() {
    const resolution = JSON.parse(localStorage.getItem("qm.resolution") ?? "null");
    return resolution?.height ?? null;
}

export function storeResolution(width, height) {
    localStorage.setItem("qm.resolution", JSON.stringify({width, height}));
}

export function loadImage(imageSource, onLoad) {
    const img = new Image();
    img.onload = () => onLoad(img);
    img.src = imageSource;
    return img;
}

export function createTextureFromImage(gl, imageSource, options) {
    const opt = options ?? {};

    // Texturen brauchen einerseits die Parameter, die beschreiben, wie eine Textur skaliert
    // und außerhalb der Koordinaten (0..1) interpretiert werden soll,
    // und die Spezifikation des Datentyps, Anzahl Kanäle, Farbtiefe.

    // S, T: Alte Konvention für die Texel-Koordinaten (Heute oft UV, für OpenGL aber nicht.)
    // Wrap: CLAMP_TO_EDGE, REPEAT, MIRRORED_REPEAT (in ES / WebGl: no border colors)
    opt.wrapS ??= gl.CLAMP_TO_EDGE;
    opt.wrapT ??= gl.CLAMP_TO_EDGE;
    // Filter: LINEAR, NEAREST
    opt.minFilter ??= gl.LINEAR;
    opt.magFilter ??= gl.LINEAR;
    // Wir lassen hier das Konzept der "Mipmaps" aus. Es geht da darum,
    // verschiedene Versionen einen Textur für verschiedene Skalierungen darzustellen,
    // was wir hier nur insofern wissen müssen, dass MIN_FILTER so etwas erwartet und deswegen,
    // wenn man dessen glTexParameteri()-Call auslässt, die Textur erstmal gar nicht funktioniert.
    // Das Argument "lod" (Level of Detail) in einigen Funktionen hängt auch an diesen Mipmaps -> Bei uns 0.

    // Spezifikation des Datentyps (damit auch Anzahl Kanäle / Farbtiefe)
    // ACHTUNG: Diese müssen aufeinander abgestimmt sein. Wird sonst Fehler geben.
    // https://registry.khronos.org/OpenGL-Refpages/gl4/html/glTexImage2D.xhtml
    opt.dataType ??= gl.UNSIGNED_BYTE;
    opt.dataFormat ??= gl.RGBA;
    opt.internalFormat ??= gl.RGBA8;
    // Anmerkung: internalFormat = gl.SRGB8_ALPHA8 kann bei Bildern oft sinnvoll sein

    // Eigenes Konstrukt: Convenience-Callback (um auf Bild warten zu können)
    opt.onLoaded ??= () => {};

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opt.wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opt.wrapT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opt.minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opt.magFilter);

    loadImage(imageSource, (img) => {
        // Laden im Browser notwendigerweise asynchron. Flackert ggf. auch kurz.
        // Wichtig: Textur neu binden, weil der Zustand von gl.TEXTURE_2D jetzt unklar ist.
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            opt.internalFormat,
            opt.dataFormat,
            opt.dataType,
            img
        );

        opt.onLoaded(texture);
    });

    return texture;
}

export function createFramebufferWithTexture(gl, options, fbIndex = undefined) {
    const opt = options ?? {};
    opt.width ??= gl.drawingBufferWidth;
    opt.height ??= gl.drawingBufferHeight;

    opt.wrapS ??= gl.CLAMP_TO_EDGE;
    opt.wrapT ??= gl.CLAMP_TO_EDGE;
    opt.minFilter ??= gl.LINEAR;
    opt.magFilter ??= gl.LINEAR;

    // siehe Anmerkung der Datentyp-Parameter in der Textur-Erstellung (weiter oben)
    opt.internalFormat ??= gl.RGBA8;
    opt.dataFormat ??= gl.RGBA;
    opt.dataType ??= gl.UNSIGNED_BYTE;

    // Attachment beschreibt die Direktverknüpfung zwischen einer Textur und einem Framebuffer,
    // er könnte auch über mehrere Color-Attachments mehrere Texturen haben, außerdem gibt es
    // da noch andere Arten von Attachments, die wir in der Vorlesung aber nicht brauchen.
    opt.attachment ??= gl.COLOR_ATTACHMENT0;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opt.minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opt.magFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opt.wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opt.wrapT);

    // Speicher wird alloziert, aber nicht weiter initialisiert
    const textureData = null;
    gl.texImage2D(
        gl.TEXTURE_2D, 0, opt.internalFormat, opt.width, opt.height,
        0, opt.dataFormat, opt.dataType, textureData
    );

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, opt.attachment, gl.TEXTURE_2D, texture, 0
    );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    warnAboutBadFramebufferStatus(gl, status);

    // Kann (und sollte) jetzt aufgeräumt werden, Attachment gilt weiterhin.
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
        fbo,
        texture,
        attachments: [opt.attachment],
        extraDataTexture: null,
        width: opt.width,
        height: opt.height,
        texelSize: [1/opt.width, 1/opt.height],
        params: opt,
        // <-- Speichern wir hier, weil wir bei einem Resize reagieren müssen
        //     TODO: fehlt uns aber noch! Canvas-Resizing braucht F5-Reload.

        // nur fürs Debugging:
        index: fbIndex,
        status,
    };
}

export function halfFloatOptions(gl, resolution, internalFormat, filter) {
    const dataFormatFor = {
        [gl.R16F]: gl.RED,
        [gl.RG16F]: gl.RG,
        [gl.RGB16F]: gl.RG,
        [gl.RGBA16F]: gl.RGBA,
    };
    const result = {
        ...resolution,
        minFilter: filter,
        maxFilter: filter,
        internalFormat,
        dataFormat: dataFormatFor[internalFormat],
        dataType: gl.HALF_FLOAT,
    };
    if (!result.internalFormat) {
        throw Error(`halfFloatOptions() helper function can not deal with internalFormat ${internalFormat}`);
    }
    return result;
}

export function createPingPongFramebuffersWithTexture(gl, options) {
    const pp = {
        fb: [0, 1].map((index) =>
            createFramebufferWithTexture(gl, options, index)
        ),
        ping: 0,
    };
    pp.pong = () => 1 - pp.ping;
    pp.currentWriteReadOrder = () => [
        pp.fb[pp.ping],
        pp.fb[pp.pong()]
    ];
    pp.doPingPong = () => {
        pp.ping = pp.pong();
    }
    return pp;
}

export function recreateFramebufferWithTexture(gl, framebuffer) {
    const old = framebuffer.params;

    // RESOURCE CLEANUP: Not done automatically by OpenGL!
    gl.deleteFramebuffer(framebuffer.fbo);
    gl.deleteTexture(framebuffer.texture);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, old.minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, old.magFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, old.wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, old.wrapT);

    gl.texImage2D(
        gl.TEXTURE_2D, 0, old.internalFormat,
        old.width, old.height,
        0, old.dataFormat, old.dataType,
        null
    );

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, old.attachment, gl.TEXTURE_2D, texture, 0 );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    warnAboutBadFramebufferStatus(gl, status);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
        ...framebuffer,
        fbo,
        texture,
        status,
        extraDataTexture: null,
    };
}

function warnAboutBadFramebufferStatus(gl, status) {
    switch (status) {
        case gl.FRAMEBUFFER_COMPLETE:
            // der Wunschzustand.
            break;
        case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
            console.error('FRAMEBUFFER_INCOMPLETE_ATTACHMENT: Attachment is not renderable');
            break;
        case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
            console.error('FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: No valid attachments');
            break;
        case gl.FRAMEBUFFER_UNSUPPORTED:
            console.error('FRAMEBUFFER_UNSUPPORTED: Combination of internal formats used by attachments is not supported');
            break;
        default:
            console.error('Framebuffer error:', status);
    }
}

export function takePingPongFramebuffers(state) {
    // "Frame Buffer Ping Pong": wir beschreiben die Framebuffer immer abwechselnd:
    // "ping": write fbo 0, read texture 1
    // "pong": write fbo 1, read texture 0
    // etc.
    const pingIndex = state.iFrame % 2;
    const pongIndex = 1 - pingIndex;
    return {
        write: state.framebuffer[pingIndex],
        read: state.framebuffer[pongIndex],
    }
}

export function updateResolution(state, glContext) {
    const width = glContext.drawingBufferWidth;
    const height = glContext.drawingBufferHeight;
    state.resolution = [width, height];
    state.texelSize = [1/width, 1/height];
    return {width, height};
}

export function clearFramebuffers(gl, state) {
    state.framebuffer.fb.forEach(fb => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo);
        gl.viewport(0, 0, fb.width, fb.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

export async function evaluateReadData(buffer, mapFunc = undefined) {
    const isUnsignedByte = buffer instanceof Uint8Array;
    const asFloat = buffer instanceof Float32Array
        ? buffer
        : Float32Array.from(buffer, mapFunc);
    const data = {
        pixels: buffer.length / 4,
        min: rgba(Infinity),
        max: rgba(-Infinity),
        avg: rgba(0),
        span: rgba(0),
        buffer: {
            raw: buffer,
            asFloat,
        },
    };
    for (let i = 0; i < buffer.length; i += 4) {
        for (let c = 0; c < 4; c++) {
            let value = asFloat[i + c];
            if (value < data.min[c]) {
                data.min[c] = value;
            }
            if (value > data.max[c]) {
                data.max[c] = value;
            }
            data.avg[c] += value;
        }
    }
    for (let c = 0; c < 4; c++) {
        data.avg[c] /= data.pixels;
        data.span[c] = data.max[c] - data.min[c];
    }
    data.formatted = {
        avg: toStr(data.avg),
        min: toStr(data.min),
        max: toStr(data.max),
    };
    return data;

    function rgba(value) {
        return [value, value, value, value];
    }

    function toStr(rgba) {
        const list = rgba.map(format).join(", ");
        return `[${list}]`;
    }

    function format(value) {
        if (isUnsignedByte) {
            if (value < 0.001) {
                return " <= 0";
            }
            if (value > 0.999) {
                return " >= 1"
            }
        }
        return value.toFixed(3);
    }
}
