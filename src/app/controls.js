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

    const radioSets = collectRadioSets(controls);
    for (const control of controls.uniforms) {
        if (control.radio) {
            control.radioSet = radioSets[control.radio];
        }
    }

    return controls;
}

function collectRadioSets(controls) {
    const result = {};
    for (const control of controls.uniforms) {
        if (!control.radio) {
            continue;
        }
        if (!result[control.radio]) {
            result[control.radio] = [];
        }
        result[control.radio].push(control);
    }
    return result;
}

export function isNumeric(control) {
    return control.type
        && !control.boolean
        && control.min !== undefined
        && control.max !== undefined;
}