import {totalSizeForStd140} from "../../app/algorithms.js";

const FLOAT_SIZE = 4;

export function createUboForArray(gl, program, array, opt) {
    if (!opt.blockName) {
        throw Error("createUboForArray needs at least a \"blockName\"!");
    }
    opt.dataSize ??= FLOAT_SIZE;
    opt.memoryUsage ??= gl.STATIC_DRAW;
    // gl.DYNAMIC_DRAW if data is changing often!
    // but... suffice to say I never compared these..?

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
    const binding = gl.getActiveUniformBlockParameter(
        program, blockIndex, gl.UNIFORM_BLOCK_BINDING
    );
    gl.uniformBlockBinding(program, blockIndex, 0);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);

    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, array);

    const checkBlockSize = gl.getActiveUniformBlockParameter(
        program, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE
    );
    console.info("[UBO]", opt.blockName, ubo, opt,
        "Do Block Sizes in Bytes match...", checkBlockSize, blockSize,
        "? Block Index:", blockIndex, "Binding", binding
    );

    /*
    Update Data with:
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, array);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
     */

    return ubo;
}

export function createUboForArraylikeStruct(gl, program, opt) {
    if (!opt.blockName) {
        throw Error("createUboForStruct needs at least a \"blockName\"!");
    }
    opt.memoryUsage ??= gl.DYNAMIC_DRAW;
    opt.bindingPoint ??= 0;

    const result = {
        opt,
        ubo: null,
        block: {
            name: opt.blockName,
            size: null,
            index: null,
            binding: null,
        },
        error: "",
        members: {},
        fields: []
    };

    if (opt.memberFields) {
        result.fields = Object.entries(opt.memberFields);
        if (!opt.dataSize) {
            const sizesEach =
                Object.values(opt.memberFields).map(info => info[1]);
            opt.dataSize = totalSizeForStd140(sizesEach);
        }
    }

    opt.dataSize ??= 4;
    opt.dataLength ??= opt.memberMap
        ? Object.keys(opt.memberMap).length
        : 1;

    for (let i = 0; i < opt.dataLength; i++) {
        defineMember(i, opt.dataSize * i);
    }
    for (const key in (opt.memberMap ?? {})) {
        defineMember(key, opt.dataSize * opt.memberMap[key]);
    }

    const block = result.block;
    block.size = opt.dataLength * opt.dataSize
        + (opt.additionalDataSize ?? 0);
    console.log("[UBO] Data Size", opt.dataSize, block.size, opt.dataLength * opt.dataSize, opt.additionalDataSize);

    result.ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, result.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, block.size, opt.memoryUsage);

    block.index = gl.getUniformBlockIndex(program, block.name);
    if (block.index === gl.INVALID_INDEX) {
        result.error = `Found no layout(std140) uniform "${block.name}"`;
        return result;
    }

    block.binding = gl.getActiveUniformBlockParameter(
        program, block.index, gl.UNIFORM_BLOCK_BINDING
    );
    gl.uniformBlockBinding(program, block.index, opt.bindingPoint);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, opt.bindingPoint, result.ubo);

    if (opt.initialData) {
        gl.bindBuffer(gl.UNIFORM_BUFFER, result.ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, opt.data);
    }

    result.updateMemberAt = (baseIndex, memberData) => {
        /** Helper function that does no checks on it's own!
         * (but probably expects memberData as array of <dataSize> length)
         * */
        gl.bindBuffer(gl.UNIFORM_BUFFER, result.ubo);
        const offset = baseIndex * opt.dataSize;
        gl.bufferSubData(gl.UNIFORM_BUFFER, offset, memberData);
    }

    block.actualSize = gl.getActiveUniformBlockParameter(
        program, block.index, gl.UNIFORM_BLOCK_DATA_SIZE
    );
    if (block.actualSize !== block.size) {
        console.warn("[UBO][CUSTOM STRUCTS]",
            "Block Sizes don't match; you said", block.size,
            "WebGL thinks differently:", block.actualSize, "..?", result
        );
    }

    console.info("[UBO]", opt.blockName, result);

    return result;

    function defineMember(key, offset) {
        result.members[key] = {
            offset,
            set: (data) =>
                result.updateMemberAt(result.opt.memberMap[key], data),
            // Does not have to be used, just a float32ing offer:
            workdata: new Float32Array(opt.dataSize / FLOAT_SIZE),
            update: constructMemberUpdater(key)
        };
        return result.members[key];
    }

    function constructMemberUpdater(key) {
        let changed;
        // the update object can contain all the fields, and
        // as an additional info { reset: false } (true by default)
        return (update) => {
            const member = result.members[key];
            console.log(result.members, key, member, update);
            changed = false;
            if (update.reset !== false) {
                member.workdata.fill(0);
                changed = true;
            }
            if (!update.type) {
                update.type = -1;
            }
            // somewhat optimized for performance (classical for loop & .set())
            for (let f = 0; f < result.fields.length; f++) {
                const [field, [start,]] = result.fields[f];
                if (!update.hasOwnProperty(field)) {
                    continue;
                }
                member.workdata.set(update[field], start);
                changed = true;
            }
            if (changed) {
                gl.bindBuffer(gl.UNIFORM_BUFFER, result.ubo);
                gl.bufferSubData(gl.UNIFORM_BUFFER, member.offset, member.workdata);
            }
        };
    }
}
