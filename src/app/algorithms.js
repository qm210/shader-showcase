export function clamp(x, min, max) {
    return Math.min(Math.max(x, min), max);
}

export function binarySearchRight(targetValue, array, key) {
    let lower = 0;
    let upper = array.length;
    while (lower < upper) {
        const middle = Math.floor((lower + upper) / 2);
        if (array[middle][key] < targetValue) {
            lower = middle + 1;
        } else {
            upper = middle;
        }
    }
    return lower;
}

export function binarySearchLeft(targetValue, array, key) {
    const right = binarySearchRight(targetValue, array, key);
    return right > 0 && targetValue < array[right][key]
        ? right - 1
        : right;
}

export function binarySearchInsert(event, queue, key) {
    const lower = binarySearchRight(event[key], queue, key);
    queue.splice(lower, 0, event);
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

/**
 * @param fieldSizes {[number]} struct field sizes in original order and float units (4 bytes each)
 * cf. https://registry.khronos.org/OpenGL/specs/gl/glspec45.core.pdf#page=159 (GLSL Spec §7.6.2.2)
 */
export function totalSizeForStd140(fieldSizes) {
    const baseAlignment = Math.max(...fieldSizes);
    const count = {
        cursor: 0,
        base: 0,
        previousSize: baseAlignment,
    };
    function countOneBase() {
        count.base++;
        count.cursor = 0;
        count.previousSize = baseAlignment;
    }

    for (const size of fieldSizes) {
        if (size === baseAlignment) {
            if (count.cursor > 0) {
                countOneBase();
            }
            countOneBase();
        }
        else if (count.cursor + size === baseAlignment) {
            countOneBase();
        }
        else if (count.cursor + size > baseAlignment) {
            countOneBase();
            count.cursor = size;
        }
        else if (size > count.previousSize) {
            countOneBase();
            count.cursor = size;
        } else {
            count.cursor += size;
            count.previousSize = size;
        }
    }
    if (count.cursor > 0) {
        countOneBase();
    }
    const FLOAT_SIZE = 4;
    return count.base * baseAlignment * FLOAT_SIZE;
}

export function toAscii(text) {
    return Array.from(text, char => char.charCodeAt(0));
}

export function createGlyphDef(msdfJson) {
    // This will create an array of (center, halfSize, offset, xAdvance, xAdvanceRelative)
    // i.e. if one is used to think of u0, v0, u1, v1, then it is
    //   glyphCenter = (uv0 + uv1) / 2;
    //   halfSize = (uv1 - uv0) / 2;
    // (in relative coordinates [0..1] of the textures each.)
    // the offset it then needed to place the glyph correctly,
    // the advance values useful in writing coherent words from glyphs.
    const charset = msdfJson.info.charset;
    const glyphDef = new Float32Array(charset.length * 8);
    const atlasW = msdfJson.common.scaleW;
    const atlasH = msdfJson.common.scaleH;

    let index = 0;
    for (const char of charset) {
        const charCode = char.charCodeAt(0);
        const glyph = msdfJson.chars.find(g => g.id === charCode);

        if (!glyph) {
            console.warn("This character is defined in the charset but not in the chars array: " + char);
            continue;
        }

        const halfWidth = 0.5 * glyph.width / atlasW;
        const halfHeight = 0.5 * glyph.height / atlasH;

        glyphDef[index++] = glyph.x / atlasW + halfWidth;
        glyphDef[index++] = glyph.y / atlasH + halfHeight;
        glyphDef[index++] = halfWidth;
        glyphDef[index++] = halfHeight;

        glyphDef[index++] = +2 * halfWidth + 2 * glyph.xoffset / atlasW;
        glyphDef[index++] = -2 * halfHeight - 2 * glyph.yoffset / atlasH;
        glyphDef[index++] = glyph.xadvance / atlasW;
        glyphDef[index++] = glyph.xadvance / halfWidth / 2;
    }

    return glyphDef;
}

export function compactifyGlyphJson(msdfJson) {
    const detailed = {
        chars: {},
        ...msdfJson.info,
        ...msdfJson.common,
    };
    for (const glyph of msdfJson.chars) {
        detailed.chars[glyph.id] = glyph;
    }
    return detailed;
}
