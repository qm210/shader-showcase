import {startRenderLoop} from "./playback.js";

export function createControls(showcase, glContext, state, elements) {
    const controls = showcase.generateControls(glContext, state, elements);

    if (!controls.onRender) {
        if (!controls.renderLoop) {
            throw new Error("generateControls() needs either onRender or renderLoop defined!");
        }
        controls.onRender = () =>
            startRenderLoop(
                state => controls.renderLoop(glContext, state, elements),
                state,
                elements
            );
    }

    controls.uniforms ??= [];
    controls.toggles ??= [];

    const groups = collectGroups(controls);
    for (const control of controls.uniforms) {
        if (control.group) {
            control.groupedControls = groups[control.group];
        }
    }

    return controls;
}

function collectGroups(controls) {
    const result = {};
    for (const control of controls.uniforms) {
        if (!control.group) {
            continue;
        }
        if (!result[control.group]) {
            result[control.group] = [];
        }
        result[control.group].push(control);
    }
    return result;
}

export function isNumeric(control) {
    return control.type
        && !control.boolean
        && control.min !== undefined
        && control.max !== undefined;
}