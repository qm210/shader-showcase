/**
 * Das ist alles kein Produktivcode, nur ein Platz, um so Helfer zu sammeln,
 * die man nur mal braucht, wenn man diese Showcases in ein anderes Framework
 * umziehen will (OpenGL unter C++, Python, oder was völlig anderes -- go wild)
 */

export function transformUniformControlsToSomethingPython(controls) {
    let code = ""
    for (const control of controls.uniforms) {
        if (control.separator) {
            continue;
        }
        code += `    UniformControl("${control.name}", ${control.defaultValue}, ${control.min}, ${control.max}),\n`
    }
    code = `\n\n${code}\n\n`;
    console.info("[PYTHON-ESQUE UNIFORM CONTROLS]", controls.uniforms, code);
}