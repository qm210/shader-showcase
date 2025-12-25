export function loadImage(imageSource, onLoad, onError = undefined) {
    const img = new Image();
    img.src = imageSource;
    img.onload = () => onLoad(img);
    img.onerror = (err) => {
        console.error("Error loading image", imageSource);
        onError && onError(err);
    }
    img.crossOrigin = "anonymous";
    return img;
}

function createTexture(gl, options) {
    const opt = options ?? {};

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

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opt.wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opt.wrapT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opt.minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opt.magFilter);

    return texture;
}

export function createTextureFromImage(gl, imageSource, options) {
    const opt = options ?? {};

    // Texturen brauchen einerseits die Parameter, die beschreiben, wie eine Textur skaliert
    // und außerhalb der Koordinaten (0..1) interpretiert werden soll,
    // und die Spezifikation des Datentyps, Anzahl Kanäle, Farbtiefe.

    const texture = createTexture(gl, opt);

    // Spezifikation des Datentyps (damit auch Anzahl Kanäle / Farbtiefe)
    // ACHTUNG: Diese müssen aufeinander abgestimmt sein. Wird sonst Fehler geben.
    // https://registry.khronos.org/OpenGL-Refpages/gl4/html/glTexImage2D.xhtml
    opt.dataType ??= gl.UNSIGNED_BYTE;
    opt.dataFormat ??= gl.RGBA;
    opt.internalFormat ??= gl.RGBA;
    // Anmerkung: internalFormat = gl.SRGB8_ALPHA8 kann bei Bildern oft sinnvoll sein

    const result = {
        texture,
        opt,
        width: 1,
        height: 1,
    };

    loadImage(imageSource, (img) => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            opt.internalFormat,
            opt.dataFormat,
            opt.dataType,
            img
        );
        // Notiz: Weil das hier im Browser ist, ist die Auflösung des Bilds im HTMLImageElement "img"
        //        bereits bekannt. Im Allgemeinen würde man die Auflösung hier auch noch spezifizieren.
        result.width = img.naturalWidth;
        result.height = img.naturalHeight;
    });

    return options.returnMetaInformation
        ? result
        : result.texture;
}

export function createTextureFromLoadedImage(gl, image, options) {
    const opt = options ?? {};
    opt.wrapS ??= gl.CLAMP_TO_EDGE;
    opt.wrapT ??= gl.CLAMP_TO_EDGE;
    opt.minFilter ??= gl.LINEAR;
    opt.magFilter ??= gl.LINEAR;
    opt.dataType ??= gl.UNSIGNED_BYTE;
    opt.dataFormat ??= gl.RGBA;
    opt.internalFormat ??= gl.SRGB8_ALPHA8; // gl.RGBA8

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opt.wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opt.wrapT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opt.minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opt.magFilter);

    gl.texImage2D(gl.TEXTURE_2D, 0, opt.internalFormat, opt.dataFormat, opt.dataType, image);

    return texture;
}

export async function createTextureFromImageAsync(gl, source, options) {
    return loadImageAsync(
        source,
        resolve => img =>
            resolve(createTextureFromLoadedImage(gl, img, options))
    );
}

async function loadImageAsync(source, afterLoad) {
    return new Promise((resolve, reject) =>
        loadImage(source, afterLoad(resolve), reject)
    );
}

export async function loadImagesByVite(modules, mapFunction = undefined) {
    // can load images provided by vite via
    //     import.meta.glob('/src/textures/dream210/mona/*.png', {eager: true});
    return Promise.all(
        Object.entries(modules)
            .map(([path, module]) => {
                const key = path.split("/").slice(-1)[0].split(".")[0];
                const afterLoad = resolve => img => resolve([key, img]);
                return loadImageAsync(module.default, afterLoad);
            })
    )
    .then(entries => {
        if (mapFunction) {
            entries = entries.map(([key, value]) =>
                [key, mapFunction(value)]
            );
        }
        return Object.fromEntries(entries);
    })
    .catch(console.error);
}
