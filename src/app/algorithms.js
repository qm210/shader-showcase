export function clamp(x, min, max) {
    return Math.min(Math.max(x, min), max);
}

export function binarySearchInsert(event, queue, key) {
    let low = 0, high = queue.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (queue[mid][key] < event[key]) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    queue.splice(low, 0, event);
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
    // This will create an array of (glyphCenter, glyphHalfSize, emOffset, emAdvance [plus 1 padding])
    // i.e. if one is used to think of u0, v0, u1, v1, then it is
    //   glyphCenter = (uv0 + uv1) / 2;
    //   halfSize = (uv1 - uv0) / 2;
    // (in relative coordinates [0..1] of the textures each.)
    // emOffset & emAdvance is just passed through because I guess I'll need it.
    const charset = msdfJson.info.charset;
    const glyphDef = new Float32Array(charset.length * 8);
    const atlasW = msdfJson.common.scaleW;
    const atlasH = msdfJson.common.scaleH;
    const PADDING = 0;

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

        glyphDef[index++] = glyph.xoffset;
        glyphDef[index++] = glyph.yoffset;
        glyphDef[index++] = glyph.xadvance;
        glyphDef[index++] = PADDING;
    }

    return glyphDef;
}

export function compactifyGlyphJson(msdfJson) {
    const details = {
        chars: msdfJson.chars,
        info: msdfJson.info,
        common: msdfJson.common,
        advances: {}
    };
    for (const glyph of details.chars) {
        details.advances[glyph.id] = glyph.xadvance;
    }
    return details;
}
