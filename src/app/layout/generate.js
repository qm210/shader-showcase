import {addFreeRow, createInputElements} from "./elements/uniforms.js";
import {createShaderCodeRegister} from "./shaderCode.js";
import {addButton, appendButton, appendElement, createDiv, createElement} from "../dom/dom.js";
import {createScrollStackOn, scrollToFirstInterestingLine} from "../events.js";
import {deferExtendedAnalysis} from "../../glslCode/deferredAnalysis.js";
import {setCanvasResolution} from "../../webgl/setup.js";
import {addCanvasMouseInteraction} from "../mouse.js";
import {createClipboardButtons, createPresetSelector, refreshPresets} from "../exchange.js";
import {initializePresetStore} from "../database.js";
import {createMainControlBar} from "./elements/bar.js";
import {updateResolutionInState} from "../../webgl/helpers/resolution.js";
import {addVideoElement} from "./elements/webcam.js";
import {addKeyboardShortcuts} from "../keyboard.js";
import {createUniformPlayground} from "../../playground/context.js";


const generatePage = (glContext, elements, state, controls) => {

    if (!state.program) {
        elements.workingShader.remove();
        elements.console.innerHTML = renderErrorConsole(state);
    } else {
        elements.console.remove();
    }

    elements.scrollStack = createScrollStackOn(elements.shaders);
    elements.register = createShaderCodeRegister(elements, state);
    deferExtendedAnalysis(elements)
        .then(scrollToFirstInterestingLine);

    addCanvasMouseInteraction(elements, state);
    addVideoElement(elements, state);
    addMainControls(elements, state, controls, glContext);
    addUniformControls(elements, state, controls);
    addDisplayControls(elements, state, glContext);
    state.playground = createUniformPlayground(state, controls);

    state.selectedPreset = null;
    elements.db = undefined;
    initializePresetStore()
        .then(db => {
            elements.db = db;
            refreshPresets(elements, state);
        });

    tryStartupToggles(controls);
    addKeyboardShortcuts(state, {
        printDebug: () => console.info(state, elements)
    });

    elements.measured.startupMs = (
        performance.now() - elements.measured.initialMs
    );
    console.info(
        "Page took", elements.measured.startupMs.toFixed(2), "ms to generate."
    );
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
    state.play.actions = seeker.do;

    for (const control of controls.toggles) {
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
            className: "toggle-buttons"
        });
    }
    elements.controlBar.customArea =
        addFreeRow({
            parent: elements.controlBar.frame,
        });
};

export const addUniformControls = (elements, state, controls) => {
    if (!state.program) {
        return;
    }

    for (const control of controls.uniforms) {

        if (elements[control.name] !== undefined) {
            console.error("SKIP control", control, "- already defined!", elements[control.name]);
            continue;
        }

        if (control.type === "label") {
            if (elements[control.name] !== undefined) {
                // skip overwriting one defined per default (i.e. iTime)
                continue;
            }

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

export const STORAGE_KEY = {
    FONT_FACTOR: "qm.fontsize.factor",
    NO_CODE: "qm.no-code",
    PLAYGROUND_OVERLAY: "qm.playground.overlay",
};

const PAGE_FONT = {
    cssProperty: "--font-size-factor",
    storageKey: STORAGE_KEY.FONT_FACTOR,
};

const CHAR = {
    PLUS: "+",
    MINUS: "\u2013",
    ARROW_UP: "\u2191",
    ARROW_DOWN: "\u2193",
};

function addDisplayControls(elements, state, glContext) {
    const canvasControls = createDiv();
    elements.displayControls.appendChild(canvasControls);
    appendButton(canvasControls, CHAR.PLUS, canvasResize(1.05));
    appendButton(canvasControls, CHAR.MINUS, canvasResize(0.95));
    appendElement(canvasControls, "canvas", "label");

    const fontControls = createDiv();
    elements.displayControls.appendChild(fontControls);
    appendButton(fontControls, CHAR.ARROW_UP, pageFontResize(1.05));
    appendButton(fontControls, CHAR.ARROW_DOWN, pageFontResize(0.95));
    const fontLabel = appendElement(fontControls, "font", "label");
    fontLabel.addEventListener("dblclick", () => setPageFontFactor(1));
    pageFontInitialize();

    const codeToggle = createDiv("code?", "small-link");
    fontControls.appendChild(codeToggle);
    codeToggle.addEventListener("click", toggleShaderCode);
    if (localStorage.getItem(STORAGE_KEY.NO_CODE)) {
        toggleShaderCode();
    }

    const info = appendElement(
        elements.displayControls,
        "", "div", "fps-box"
    );
    elements.fps = {
        label: createElement("label", "FPS..?"),
        display: createDiv("\u2013 ? \u2013", "fps"),
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
            updateResolutionInState(state, gl);
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
            setPageFontFactor(newFactor);
        };
    }

    function setPageFontFactor(value) {
        document.documentElement.style.setProperty(PAGE_FONT.cssProperty, value);
        localStorage.setItem(PAGE_FONT.storageKey, value);
    }

    function pageFontInitialize() {
        const currentFactor = JSON.parse(localStorage.getItem(PAGE_FONT.storageKey) ?? "1");
        document.documentElement.style.setProperty(PAGE_FONT.cssProperty, currentFactor);
    }

    function toggleShaderCode() {
        elements.layout.classList.toggle("no-code");
        if (elements.layout.classList.contains("no-code")) {
            localStorage.setItem(STORAGE_KEY.NO_CODE, "true");
        } else {
            localStorage.removeItem(STORAGE_KEY.NO_CODE);
        }
    }
}


function tryStartupToggles(controls) {
    Promise.all(
        controls.toggles
            .filter(toggle => toggle.tryOnStartup)
            .map(toggle =>
                toggle.onClick().then(() =>
                    console.log("[STARTUP] Toggled ", toggle)
                )
            )
    ).catch((err) =>
        console.warn("[STARTUP] Failed:", err)
    );
}