const typeCache = new WeakMap();
const setterCache = new WeakMap();

/** getActiveUniform() takes an index, not a location: map names once. */
function uniformTypes(gl, program) {
    let types = typeCache.get(program);
    if (!types) {
        types = new Map();
        const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
            const info = gl.getActiveUniform(program, i);
            if (info) {
                types.set(info.name.replace(/\[0]$/, ''), info.type);
            }
        }
        typeCache.set(program, types);
    }
    return types;
}

function setters(gl) {
    if (!setterCache.has(gl)) {
        setterCache.set(gl, createSetters(gl));
    }
    return setterCache.get(gl);
}

function createSetters(gl) {
    const ints = (v) => v.map(Math.round);
    return new Map([
        [gl.FLOAT,      (loc, v) => gl.uniform1f(loc, v)],
        [gl.FLOAT_VEC2, (loc, v) => gl.uniform2fv(loc, v)],
        [gl.FLOAT_VEC3, (loc, v) => gl.uniform3fv(loc, v)],
        [gl.FLOAT_VEC4, (loc, v) => gl.uniform4fv(loc, v)],
        [gl.INT,        (loc, v) => gl.uniform1i(loc, Math.round(v))],
        [gl.INT_VEC2,   (loc, v) => gl.uniform2iv(loc, ints(v))],
        [gl.INT_VEC3,   (loc, v) => gl.uniform3iv(loc, ints(v))],
        [gl.INT_VEC4,   (loc, v) => gl.uniform4iv(loc, ints(v))],
    ]);
}

export function uploadUniforms(gl, program, locations, values) {
    const types = uniformTypes(gl, program);
    const setterByType = setters(gl);
    for (const [name, value] of Object.entries(values)) {
        const location = locations[name];
        const setter = setterByType.get(types.get(name));
        if (location !== undefined && location !== null && setter) {
            setter(location, value);
        }
    }
}
