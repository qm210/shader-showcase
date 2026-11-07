import {promptForSecondToJump} from "./layout/elements/time.js";

export function addKeyboardShortcuts(state, {printDebug} = {}) {
    const seekAction = state.play.actions;
    let printNextKey;

    document.addEventListener("keydown", event => {
        if (document.activeElement !== document.body) {
            return;
        }
        let preventBrowserBehaviour = true;
        const combinedKey = readableKeyCombinations(event);
        if (printNextKey) {
            console.log("[KEYBOARD]", event.key, event.code, `= "${combinedKey}"`);
            printNextKey = false;
        }
        switch (combinedKey) {
            case "Ctrl + Backspace":
                state.play.signal.reset = true;
                break;
            case "Ctrl + Space":
                seekAction.toggle();
                break;
            case "Ctrl + ArrowLeft":
                seekAction.jump({delta: -1});
                break;
            case "Ctrl + ArrowRight":
                seekAction.jump({delta: +1});
                break;
            case "Ctrl + ArrowUp":
                seekAction.jump({delta: +0.05});
                break;
            case "Ctrl + ArrowDown":
                seekAction.jump({delta: -0.05});
                break;
            case "Ctrl + Home":
                seekAction.jump({to: 0});
                break;
            case "Ctrl + End":
                seekAction.jump({to: state.play.range.max});
                break;
            case "Ctrl + Insert":
                promptForSecondToJump(seekAction, state.time);
                break;
            case "Ctrl + I":
                printDebug?.();
                printNextKey = true;
                break;
            case "Ctrl + U":
                openUniformInputHelper();
                break;
            case "Ctrl + Tab":
                console.log("[KEYPRESS AT]", state.time, state.track?.audio?.currentTime);
                break;
            case "MediaPlayPause":
                if (state.track) {
                    state.track.actions.togglePlay().then(() => {
                        console.info("[AUDIO] Playing?", !state.track.audio.paused)
                    });
                } else {
                    preventBrowserBehaviour = false;
                }
                break;
            case "AudioVolumeMute":
                if (state.track) {
                    state.track.actions.toggleMuted();
                    console.info("[AUDIO] Muted?", !state.track.audio.muted)
                } else {
                    preventBrowserBehaviour = false;
                }
                break;
            default:
                preventBrowserBehaviour = false;
                break;
        }
        if (preventBrowserBehaviour) {
            event.preventDefault();
            event.stopPropagation();
        }
    });
}

function readableKeyCombinations(event) {
    const modifiers = [
        event.ctrlKey ? "Ctrl" : "",
        event.shiftKey ? "Shift" : "",
        event.altKey ? "Alt" : "",
    ].filter(Boolean);
    let key = event.key;
    if (key === " ") {
        key = "Space";
    }
    if (key.length === 1) {
        key = key.toUpperCase();
    }
    return [...modifiers, key].join(" + ");
}

/**
 * openUniformInputHelper() is just for developing when adding new uniforms to a shader.
 * The output is given in the Browser Console and consists of
 * - the declaration line in GLSL
 * - the gl.uniform...() call for our render(...) function
 * - the object for the uniforms array in generateControls(...) for the slider
 */
function openUniformInputHelper() {
    const inputString = window.prompt(
        "Enter for new Uniform (whitespace-separated, i.e. vectors as [0,1] without spaces):\n" +
        "<type> <name> <defaultValue> [<min> <max>]\n\n" +
        "(then check output in Console)"
    );
    if (!inputString) {
        return;
    }
    const glUniformSuffix = {
        "float": "1f",
        "int": "1i",
        "bool": "1i",
        "vec2": "2fv",
        "vec3": "3fv",
        "vec4": "4fv",
        "ivec2": "2iv",
        "ivec3": "3iv",
        "ivec4": "4iv",
    };
    const knownTypes = Object.keys(glUniformSuffix);
    let type, name, defaultValue, min, max;
    const parts = inputString
        .split(/\s+/)
        .map(part =>
            part.replaceAll(",", ", ")
        );
    if (knownTypes.includes(parts[0])) {
        [type, name, defaultValue, min, max] = parts;
    } else {
        type = "float";
        [name, defaultValue, min, max] = parts;
    }
    const glslDeclaration =
        `uniform ${type} ${name};`;
    const glUniformCall =
        `gl.uniform${glUniformSuffix[type]}(state.location.${name}, state.uni.${name});`;
    let inputControl =
        `        }, {
            type: "${type}",
            name: "${name}",
            defaultValue: ${defaultValue ?? 0},`;
    if (min !== undefined) {
        inputControl += `\n            min: ${min},`;
    }
    if (max !== undefined) {
        inputControl += `\n            max: ${max},`;
    }

    const combined = [glslDeclaration, glUniformCall, inputControl].join("\n\n");
    console.info(combined);
}
