import {totalSizeForStd140} from "../../app/algorithms.js";

/* for sharing larger blocks of data (= buffers) between CPU and GPU,
 *   there are a few options in differing OpenGL versions:
 *   - shader storage buffer objects (since OpenGL 4.3 -> not available in WebGL2)
 *   - texture buffers (since OpenGL 3.1 / OpenGL ES 3.1 -> not available in WebGL2)
 *   - uniform buffers (available in WebGL2, but have the std140 layout complication (i.e. can drop FPS)
 *   - 1D textures with custom management structures (available in WebGL2, potentially faster than UBOs)
 */

const FLOAT_SIZE = 4;

export function createUboForArray(gl, program, array, opt) {
    if (!opt.blockName) {
        throw Error("createUboForArray needs at least a \"blockName\"!");
    }
    opt.dataSize ??= FLOAT_SIZE;
    opt.memoryUsage ??= gl.STATIC_DRAW;
    // gl.DYNAMIC_DRAW if data is changing often. Did never compared tho.

    const ubo = gl.createBuffer();
    const blockSize = array.length * opt.dataSize;
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, blockSize, opt.memoryUsage);

    const blockIndex = gl.getUniformBlockIndex(program, opt.blockName);
    if (blockIndex === gl.INVALID_INDEX) {
        console.error("Found no layout(std140) uniform", opt.blockName);
        return null;
    }

    // seems that WebGL2 doesn't allow (std140, binding=0), only (std140)
    const bindingPoint = gl.getActiveUniformBlockParameter(
        program, blockIndex, gl.UNIFORM_BLOCK_BINDING
    );
    gl.uniformBlockBinding(program, blockIndex, bindingPoint);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, ubo);

    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, array);

    const checkBlockSize = gl.getActiveUniformBlockParameter(
        program, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE
    );
    if (checkBlockSize !== blockSize) {
        console.warn("[UBO] Block Size Mismatch!",
            opt.blockName, blockSize, "-> actual:", checkBlockSize
        );
    }

    return ubo;
}

export function createUboForArraylikeStruct(gl, program, opt) {
    if (!opt.blockName) {
        throw Error("createUboForStruct needs at least a \"blockName\"!");
    }
    opt.memoryUsage ??= gl.DYNAMIC_DRAW;
    opt.bindingPoint ??= 0;

    const block = {
        name: opt.blockName,
        size: null,
        index: null,
        binding: null,
    };
    const context = {
        opt,
        ubo: null,
        block,
        error: "",
        members: {},
        memberFields: [],
        meta: {},
    };

    if (opt.memberFields) {
        context.memberFields = Object.entries(opt.memberFields)
            .map(([name, values]) => [name, ...values]);
        if (!opt.dataSize) {
            const sizesEach = context.memberFields.map(info => info[2]);
            opt.dataSize = totalSizeForStd140(sizesEach);
        }
    }

    opt.dataSize ??= FLOAT_SIZE;
    opt.dataLength ??= !opt.memberMap ? 1
        : Object.keys(opt.memberMap).length;

    for (let i = 0; i < opt.dataLength; i++) {
        defineMember(i, opt.dataSize * i);
    }
    for (const key in opt.memberMap ?? {}) {
        defineMember(key, opt.dataSize * opt.memberMap[key]);
    }

    block.size = opt.dataLength * opt.dataSize;

    if (opt.metadata) {
        const metadataStart = block.size;
        if (!opt.metadata.size) {
            console.error(`[UBO] ${block.name} metadata MUST define .size:`, opt.metadata);
        } else {
            block.size += opt.metadata.size;
        }
        for (const key in opt.metadata.fields ?? {}) {
            const [start, size] = opt.metadata.fields[key];
            context.meta[key] = createFieldManageObject(
                key,
                metadataStart + start,
                new Int32Array(size),
                value => {
                    context.meta[key].workdata.fill(value);
                    context.meta[key].write();
                }
            );
        }
    }

    // CHECK ONE DAY: compare one-array-solution vs. member arrays
    // context.workdata = new Float32Array(block.size / FLOAT_SIZE);

    context.ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, context.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, block.size, opt.memoryUsage);

    block.index = gl.getUniformBlockIndex(program, block.name);
    if (block.index === gl.INVALID_INDEX) {
        context.error = `Found no layout(std140) uniform "${block.name}"`;
        return context;
    }

    block.binding = gl.getActiveUniformBlockParameter(
        program, block.index, gl.UNIFORM_BLOCK_BINDING
    );
    gl.uniformBlockBinding(program, block.index, opt.bindingPoint);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, opt.bindingPoint, context.ubo);

    if (opt.initialData) {
        gl.bindBuffer(gl.UNIFORM_BUFFER, context.ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, opt.data);
    }

    context.debug = addSanityChecks(context);

    console.info("[UBO]", opt.blockName, context);

    return context;

    function createFieldManageObject(key, offset, workdata, updateFunc) {
        // Note: is a makeshift "class", might re-phrase when required
        const obj = {
            offset,
            workdata,
            updateFields: updateFunc,
            write: void 0,
        };
        obj.write = (data = undefined) => {
            data ??= obj.workdata;
            gl.bindBuffer(gl.UNIFORM_BUFFER, context.ubo);
            gl.bufferSubData(gl.UNIFORM_BUFFER, offset, data);
        };
        return obj;
    }

    function defineMember(key, offset) {
        context.members[key] = createFieldManageObject(
            key,
            offset,
            new Float32Array(opt.dataSize / FLOAT_SIZE),
            args => updateMember(context.members[key], args),
        );
        return context.members[key];
    }

    function updateMember(member, update) {
        let changed = false;
        // CAUTION! if any member fields is named "reset", this breaks
        if (update.reset !== false) {
            member.workdata.fill(0);
            changed = true;
        }
        // somewhat optimized for performance, I believe
        const fields = context.memberFields;
        for (let f = 0; f < fields.length; f++) {
            const [field, start, size] = fields[f];
            if (!(field in update)) {
                continue;
            }
            if (size > 1) {
                member.workdata.set(update[field], start);
            } else {
                member.workdata[start] = update[field];
            }
            changed = true;
        }
        if (changed) {
            member.write();
        }
    }

    function addSanityChecks() {
        const debug = {};

        debug.actualSize = gl.getActiveUniformBlockParameter(
            program, block.index, gl.UNIFORM_BLOCK_DATA_SIZE
        );
        if (debug.actualSize !== block.size) {
            console.warn("[UBO][CUSTOM STRUCTS]",
                "Block Sizes don't match; you said", block.size,
                "WebGL thinks differently:", debug.actualSize, "..?", context
            );
        }

        const FORBIDDEN_FIELD_NAMES = ["reset"];
        debug.memberLayout = [];
        let collisionFound = false;
        for (const [name, start, size] of context.memberFields) {
            for (let s = 0; s < size; s++) {
                if (!debug.memberLayout[start + s]) {
                    debug.memberLayout[start + s] = name;
                } else {
                    collisionFound = true;
                    debug.memberLayout[start + s] += "|" + name;
                }

                if (FORBIDDEN_FIELD_NAMES.includes(name)) {
                    console.error("[UBO][CUSTOM STRUCTS]",
                        "Forbidden Field Name (used internally):", name
                    );
                }
            }
        }
        if (collisionFound) {
            console.warn("[UBO][CUSTOM STRUCTS]",
                "Layout Conflict:", debug.memberLayout, context.memberFields
            );
        }
        return debug;
    }
}

const RGBA_CHANNELS = 4;

export function createDataTexture(gl, opt) {
    if (opt.data) {
        if (opt.memberCount) {
            opt.dataSize = opt.data.length / opt.memberCount;
        } else {
            opt.dataSize ??= RGBA_CHANNELS;
            opt.memberCount = opt.data.length / opt.dataSize;
        }
    } else if (opt.dataSize && opt.memberCount) {
        opt.data = new Float32Array(opt.dataSize * opt.memberCount);
    } else {
        throw Error("needs either data or dataSize & memberCount!");
    }

    const texWidth = opt.dataSize / RGBA_CHANNELS;
    const context = {
        opt,
        tex: null,
        texWidth,
        resolution: [texWidth, opt.memberCount],
    };

    context.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, context.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ...context.resolution, 0, gl.RGBA, gl.FLOAT, opt.data);

    return context;
}

// aims for the same as createUboForArraylikeStruct,
// but using a 1d texture buffer and doing the packing ourselves
// -> can be more resourceful
export function createDataTextureForStructArray(gl, opt) {
    const context = {
        opt,
        tex: null,
        buffer: null,
        error: "",
        members: {},
        structFields: [],
        meta: {},
    };

    if (opt.structFields) {
        context.structFields = Object.entries(opt.structFields)
            .map(([name, values]) => [name, ...values]);
        let lastStart = 0;
        let lastSize = 0;
        for (const [, start, size] of context.structFields) {
            if (start > lastStart) {
                lastStart = start;
                lastSize = size;
            }
        }
        const memberSize = lastStart + lastSize;
        if (opt.structSize && opt.structSize < memberSize) {
            console.warn("[DATA TEXTURE] Given memberSize does not match memberFields:", opt.structSize, memberSize);
        }
        opt.structSize = Math.max(opt.structSize ?? 0, memberSize);
    }

    opt.structSize ??= 1;
    opt.memberCount ??= !opt.memberMap ? 1
        : Object.keys(opt.memberMap).length;

    context.texWidth = Math.ceil(opt.structSize / RGBA_CHANNELS);
    context.floatsPerRow = context.texWidth * RGBA_CHANNELS;
    context.buffer = new Float32Array(context.floatsPerRow * opt.memberCount);

    context.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, context.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    context.writeWhole = () => {
        gl.bindTexture(gl.TEXTURE_2D, context.tex);
        gl.texImage2D(gl.TEXTURE_2D,
            0,
            gl.RGBA32F,
            context.texWidth,
            opt.memberCount,
            0,
            gl.RGBA,
            gl.FLOAT,
            context.buffer
        );
    };

    context.writePartial = (firstRow, rowCount) => {
        gl.bindTexture(gl.TEXTURE_2D, context.tex);
        gl.texSubImage2D(gl.TEXTURE_2D,
            0,
            0,
            firstRow,
            context.texWidth,
            rowCount,
            gl.RGBA,
            gl.FLOAT,
            context.buffer
        );
    };

    context.writeWhole();

    for (let i = 0; i < opt.memberCount; i++) {
        const offset = i * context.floatsPerRow;
        const view = context.buffer.subarray(offset, offset + context.floatsPerRow);
        context.members[i] = {
            offset,
            view,
            updateFields: (args, reset = true) =>
                updateStruct(context.members[i], args, reset),
            write: () => {
                gl.bindTexture(gl.TEXTURE_2D, context.tex);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, i, context.texWidth, 1, gl.RGBA, gl.FLOAT, view);
            }
        };
    }

    context.debug = addSanityChecks(context);
    console.info("[PACKED TEXTURE]", context);

    return context;

    function updateStruct(member, update, reset) {
        let changed = false;
        if (reset) {
            member.view.fill(0);
            changed = true;
        }
        // somewhat optimized for performance, I believe
        const fields = context.structFields;
        for (let f = 0; f < fields.length; f++) {
            const [field, start, size] = fields[f];
            if (!(field in update) || update[field] === undefined) {
                continue;
            }
            if (size > 1) {
                member.view.set(update[field], start);
            } else {
                member.view[start] = update[field];
            }
            changed = true;
        }
        if (changed) {
            member.write();
        }
    }

    function addSanityChecks() {
        const debug = {};

        debug.memberLayout = [];
        let collisionFound = false;
        for (const [name, start, size] of context.structFields) {
            for (let s = 0; s < size; s++) {
                if (!debug.memberLayout[start + s]) {
                    debug.memberLayout[start + s] = name;
                } else {
                    collisionFound = true;
                    debug.memberLayout[start + s] += "|" + name;
                }
            }
        }
        if (collisionFound) {
            console.warn("[PACKED TEXTURE]",
                "Layout Conflict:", debug.memberLayout, context.structFields
            );
        }
        return debug;
    }
}
