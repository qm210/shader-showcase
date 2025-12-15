import {totalSizeForStd140} from "../../app/algorithms.js";

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
            update: updateFunc,
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
