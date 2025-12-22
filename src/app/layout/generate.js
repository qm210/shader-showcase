import {addFreeRow, createInputElements} from "./controls/uniforms.js";
import {registerShaderCode} from "./shaderCode.js";
import {addButton, appendButton, appendElement, createDiv, createElement} from "./dom.js";
import {createScrollStackOn, scrollToFirstInterestingLine} from "../events.js";
import {deferExtendedAnalysis} from "../../glslCode/deferredAnalysis.js";
import {setCanvasResolution} from "../../webgl/setup.js";
import {addCanvasMouseInteraction} from "../mouse.js";
import {createClipboardButtons, createPresetSelector, refreshPresets} from "../exchange.js";
import {initializePresetStore} from "../database.js";
import {createMainControlBar} from "./controls/bar.js";
import {takeMilliSeconds} from "../measuring.js";
import {updateResolutionInState} from "../../webgl/helpers/resolution.js";
import {promptForSecondToJump} from "./controls/time.js";
import {transformUniformControlsToSomethingPython} from "../portingHelpers.js";


const generatePage = (glContext, elements, state, controls) => {

    if (!state.program) {
        elements.workingShader.remove();
        elements.console.innerHTML = renderErrorConsole(state);
    } else {
        elements.console.remove();
    }

    elements.scrollStack = createScrollStackOn(elements.shaders);

    elements.register = [];

    registerShaderCode(
        elements,
        state.source.fragment,
        state.error.fragment,
        "fragment.source",
        "Fragment Shader"
    );
    registerShaderCode(
        elements,
        state.source.vertex,
        state.error.vertex,
        "vertex.source",
        "Vertex Shader"
    );

    if (state.post) {
        appendElement(
            elements.shaders,
            "Second Program (Post Processing):",
            "h4",
        );
        registerShaderCode(
            elements,
            state.post.source.fragment,
            state.post.error.fragment,
            "fragment.post.source",
            "Fragment Shader"
        );
        registerShaderCode(
            elements,
            state.post.source.vertex,
            state.post.error.vertex,
            "vertex.post.source",
            "Vertex Shader"
        );
    }

    deferExtendedAnalysis(elements)
        .then(scrollToFirstInterestingLine);

    addCanvasMouseInteraction(elements, state);
    addMainControls(elements, state, controls);
    addUniformControls(elements, state, controls);
    addDisplayControls(elements, state, glContext);

    state.selectedPreset = null;
    initializePresetStore()
        .then(db => {
            elements.db = db;
            refreshPresets(elements, state);
        });

    elements.measured.pageLoadingMs = takeMilliSeconds(elements.measured.initialMs);
};

export default generatePage;

export const addMainControls = (elements, state, controls) => {
    if (!state.program) {
        elements.controlBar.innerHTML = `
            <div class="error" style="text-align: right;">
                Nothing to render, because compilation failed.
            </div>
        `;
        return;
    }

    const {seeker} = createMainControlBar(elements, state, controls);

    for (const control of controls.toggles ?? []) {
        elements.controlBar.buttons.push(
            addButton({
                title: control.label(),
                style: control.style,
                onClick: async (event) => {
                    if (!control.onClick) {
                        return;
                    }
                    await control.onClick(event.target);
                    event.target.textContent = control.label();
                },
                onRightClick: async (event) => {
                    if (!control.onRightClick) {
                        return;
                    }
                    await control.onRightClick(event.target);
                    event.target.textContent = control.label();
                },
            })
        );
    }
    if (elements.controlBar.buttons.length > 0) {
        addFreeRow({
            parent: elements.controlBar.frame,
            content: elements.controlBar.buttons,
        });
    }

    let printNextKey;
    document.addEventListener("keydown", event => {
        if (printNextKey) {
            console.log("Key:", event.key, event.code);
            printNextKey = false;
        }
        if (document.activeElement !== document.body) {
            return;
        }
        let preventBrowserBehaviour = true;
        // cf. playback.js for how the state variables work
        const combinedKey = readableKeyCombinations(event);
        // console.log(`[KEY COMBINATION] "${combinedKey}"`);
        switch (combinedKey) {
            case "Ctrl + Backspace":
                state.play.signal.reset = true;
                break;
            case "Ctrl + Space":
                seeker.do.toggle();
                break;
            case "Ctrl + ArrowLeft":
                seeker.do.jump({delta: -1});
                break;
            case "Ctrl + ArrowRight":
                seeker.do.jump({delta: +1});
                break;
            case "Ctrl + ArrowUp":
                seeker.do.jump({delta: +0.05});
                break;
            case "Ctrl + ArrowDown":
                seeker.do.jump({delta: -0.05});
                break;
            case "Ctrl + Home":
                seeker.do.jump({to: 0});
                break;
            case "Ctrl + End":
                seeker.do.jump({to: state.play.range.max});
                break;
            case "Ctrl + Insert":
                promptForSecondToJump(seeker, state.time);
                break;
            case "Ctrl + I":
                console.info(state, elements);
                printNextKey = true;
                break;
            case "Ctrl + U":
                openUniformInputHelper();
                break;
            case "Ctrl + Tab":
                console.log("[JUST PRESSED AT]", state.time, state.track?.audio?.currentTime, state);
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
};

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

export const addUniformControls = (elements, state, controls) => {
    if (!state.program) {
        return;
    }

    const groups = collectGroups(controls);

    for (const control of controls.uniforms) {

        if (elements[control.name] !== undefined) {
            console.error("SKIP control", control, "- already defined!", elements[control.name]);
            continue;
        }

        if (control.type === "label") {
            elements[control.name] =
                addFreeRow({
                    parent: elements.uniformControls,
                    label: control.name,
                    id: control.name,
                    content: createDiv("=", "value-label"),
                });
            continue;
        }
        else if (control.type === "button") {
            elements.buttons[control.name] = addButton({
                title: control.label,
                onClick: () =>
                    control.onClick(elements.buttons[control.name], control)
            });
            elements[control.name] =
                addFreeRow({
                    parent: elements.uniformControls,
                    label: "",
                    id: control.name,
                    content: elements.buttons[control.name]
                })
            continue;
        }
        else if (control.separator) {
            addFreeRow({
                parent: elements.uniformControls,
                content: createDiv(control.separator ?? control.title, "separator"),
                isSeparator: true,
            });
            continue;
        }

        if (control.group) {
            control.groupedControls = groups[control.group];
        }

        control.dim = 1;
        if (control.type.startsWith("vec")) {
            control.dim = +(control.type.slice(-1)[0]);
        }

        const input = createInputElements(state, control);
        if (!input) {
            continue;
        }
        elements.uniformControls.appendChild(input.name);
        elements.uniformControls.appendChild(input.value);
        if (control.boolean) {
            elements.uniformControls.appendChild(input.control);
            elements.uniformControls.appendChild(input.description);
        } else {
            elements.uniformControls.appendChild(input.min);
            elements.uniformControls.appendChild(input.control);
            elements.uniformControls.appendChild(input.max);
        }
        if (input.reset) {
            elements.uniformControls.appendChild(input.reset);
        }
        elements.uniforms[control.name] = input;
    }

};

function renderErrorConsole(state) {
    let result = `
        <h2>Compilation failed.</h2>
        ${renderCompileStepStatus("Fragment Shader", state.error.fragment, "compiled.")}
        ${renderCompileStepStatus("Vertex Shader", state.error.vertex, "compiled.")}
        ${renderCompileStepStatus("Shader Program", state.error.linker, "linked.")}
    `;

    const locations = Object.entries(state.location);
    if (locations.length > 0) {
        result +=
            `<h4>Locations (whatever these are)</h4>`
            + "<pre>";
        for (const [name, location] of locations) {
            result +=
                `${name.padEnd(20)} -> ${location}\n`;
        }
        result += "</pre>";
    }

    return result;
}

function renderCompileStepStatus(title, error, successMessage) {
    const content = error
        ? `<pre class="error">${error}</pre>`
        : `<div>${successMessage}</div>`;
    return `
        <div>
            <h4>${title}</h4>
            ${content}
        </div>    
    `;
}

const PAGE_FONT = {
    cssProperty: "--font-size-factor",
    storageKey: "qm.fontsize.factor"
};
const NO_CODE_STORAGE_KEY = "qm.no-code";

function addDisplayControls(elements, state, glContext) {
    const canvasControls = createDiv();
    elements.displayControls.appendChild(canvasControls);
    appendButton(canvasControls, "+", canvasResize(1.05));
    appendButton(canvasControls, "–", canvasResize(0.95));
    appendElement(canvasControls, "canvas", "label");

    const fontControls = createDiv();
    elements.displayControls.appendChild(fontControls);
    appendButton(fontControls, "↑", pageFontResize(1.05));
    appendButton(fontControls, "￬", pageFontResize(0.95));
    appendElement(fontControls, "font", "label");
    pageFontInitialize();

    const codeToggle = createDiv("code?", "small-link");
    fontControls.appendChild(codeToggle);
    codeToggle.addEventListener("click", toggleShaderCode);
    if (localStorage.getItem(NO_CODE_STORAGE_KEY)) {
        toggleShaderCode();
    }

    const info = appendElement(elements.displayControls, "", "div", "fps-box");
    elements.fps = {
        label: createElement("label", "FPS"),
        display: createDiv(),
    }
    elements.fps.display.id = "fps";
    info.appendChild(elements.fps.label);
    info.appendChild(elements.fps.display);
    info.addEventListener("click", () => {
        state.play.signal.takeRenderTime = true;
        console.log(state.play);
    });

    elements.presets = createPresetSelector(elements, state);
    elements.displayControls.appendChild(elements.presets.container);

    elements.clipboard = {
        ...createClipboardButtons(elements, state),
        container: createDiv(),
    };
    elements.clipboard.container.appendChild(elements.clipboard.copy);
    elements.clipboard.container.appendChild(elements.clipboard.paste);
    elements.displayControls.appendChild(elements.clipboard.container);

    function canvasResize(factor) {
        return () => {
            let width = elements.canvas.width;
            let height = elements.canvas.height;
            width = Math.max(Math.round(width * factor), 1);
            height = Math.max(Math.round(height * factor), 1);
            setCanvasResolution(elements.canvas, glContext, width, height);
            updateResolutionInState(state, glContext);
            /*
            // TODO: must recreate framebuffers, but for that we need a short break from rendering
            whilePausingRendering(state, () => {
                state.framebuffer.forEach(fb => {
                    recreateFramebufferWithTexture(glContext, fb);
                });
            });
             */
        };
    }

    function pageFontResize(relativeFactor) {
        return () => {
            const currentFactor = JSON.parse(localStorage.getItem(PAGE_FONT.storageKey) ?? "1");
            const newFactor = Math.max(0.1, currentFactor * relativeFactor).toFixed(3);
            document.documentElement.style.setProperty(PAGE_FONT.cssProperty, newFactor);
            localStorage.setItem(PAGE_FONT.storageKey, newFactor);
        };
    }

    function pageFontInitialize() {
        const currentFactor = JSON.parse(localStorage.getItem(PAGE_FONT.storageKey) ?? "1");
        document.documentElement.style.setProperty(PAGE_FONT.cssProperty, currentFactor);
    }

    function toggleShaderCode() {
        elements.layout.classList.toggle("no-code");
        if (elements.layout.classList.contains("no-code")) {
            localStorage.setItem(NO_CODE_STORAGE_KEY, "true");
        } else {
            localStorage.removeItem(NO_CODE_STORAGE_KEY);
        }
    }
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
        `gl.uniform${glUniformSuffix[type]}(state.location.${name}, state.${name});`;
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

