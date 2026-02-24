import {createSmallButton} from "./layout/controls.js";
import {createPreset, deletePreset, loadPresets} from "./database.js";
import {createDiv} from "./layout/dom.js";

const ADVANCED = import.meta.env.VITE_MODE_ADVANCED;

const HEADER = {
    IDENTIFIER: "qm210.uniforms",
    VERSION: 1,
};

const uniformNameMap = {
    iTime: "time",
    iResolution: "resolution",
};

function bundleUniforms(state) {
    const result = {
        ...HEADER,
        name: undefined,
        uniforms: [],
        showcaseId: state.showcaseId,
    };
    for (const uniform of state.expectedUniforms) {
        const value = state[uniform.name] ?? state[uniformNameMap[uniform.name]]
        result.uniforms.push({
            type: uniform.type,
            name: uniform.name,
            value
        });
    }
    return result;
}

function unpackBundle(state, json) {
    if (json.IDENTIFIER !== HEADER.IDENTIFIER) {
        throw Error(`This is JSON, but bad IDENTIFIER ${json.IDENTIFIER}`);
    } else if (json.VERSION !== 1) {
        throw Error(`This is JSON, but unknown VERSION ${json.VERSION}`);
    } else if (json.showcaseId !== state.showcaseId) {
        throw Error(`This does not match required showcaseId "${state.showcaseId}"`)
    }
    const loaded = Object.fromEntries(
        json.uniforms.map(obj => [obj.name, obj])
    );
    for (const uniform of state.expectedUniforms) {
        if (!loaded[uniform.name]) {
            continue;
        }
        if (uniform.type !== loaded[uniform.name].type) {
            console.warn("Uniform doesn't match type, ignore:", loaded[uniform.name]);
            continue;
        }
        const uniformKey = uniformNameMap[uniform.name] ?? uniform.name;
        state[uniformKey] = loaded[uniform.name].value;
    }
}

function updateFromBundle(json, state, elements) {
    unpackBundle(state, json);
    for (const uniform of json.uniforms) {
        const input = elements.uniforms[uniform.name]?.control;
        if (!(input instanceof HTMLInputElement)) {
            continue;
        }
        input.value = uniform.value;
    }
    console.info("Updated from", json, state, elements);
}

export function createClipboardButtons(elements, state) {
    if (!ADVANCED) {
        return [];
    }

    const copyButton = createSmallButton("→ Clipboard", "right-align");
    const pasteButton = createSmallButton("Paste", "right-align");

    copyButton.addEventListener("click", async () => {
        const originalContent = copyButton.textContent;
        try {
            const json = bundleUniforms(state);
            await navigator.clipboard.writeText(
                JSON.stringify(json, null, 4)
            );
            console.info("Copied to Clipboard", json);
            copyButton.textContent = "✔ copied";
        } catch (error) {
            console.error(error);
            copyButton.textContent = "✘ failed";
        }
        setTimeout(() => {
            copyButton.textContent = originalContent;
        }, 1000);
    });

    pasteButton.addEventListener("click", async () => {
        const originalContent = pasteButton.textContent;
        const originalState = {...state};
        try {
            const text = await navigator.clipboard.readText();
            const json = JSON.parse(text);
            updateFromBundle(json, state, elements);
            pasteButton.textContent = "✔ pasted";
        } catch (error) {
            console.error(error);
            state = {...originalState};
            pasteButton.textContent = "✘ failed";
            pasteButton.style.color = "red";
            pasteButton.style.outlineColor = "red";
        }
        setTimeout(() => {
            pasteButton.textContent = originalContent;
            pasteButton.style.color = "";
            pasteButton.style.outlineColor = "";
        }, 1000);
    });

    return [copyButton, pasteButton];
}

const OPTION = {
    NEW: "__STORE_NEW__",
    DELETE: "__DELETE_CURRENT__",
};

function queryOption(selector, value) {
    return selector.querySelector(
        `option[value="${value}"]`
    );
}

export function createPresetSelector(elements, state) {
    const selector = document.createElement("select");
    const container = document.createElement("div");
    const result = {selector, container};

    if (!ADVANCED) {
        return result;
    }

    selector.classList.add("presets-selector");
    addOption(selector, "Loading Presets...");
    selector.disabled = true;

    container.appendChild(selector);
    container.appendChild(createDiv("Presets...", "presets-hint"));

    let ignoreChangeEvent = false;
    selector.addEventListener("change", async event => {
        if (ignoreChangeEvent) {
            return;
        }
        const key = event.target.value;
        if (!key) {
            return;
        }
        const db = elements.db;

        if (key === OPTION.NEW) {
            const defaultName = (new Date()).toISOString()
                .split(".")[0]
                .replace("T", " \u2013 ");
            const name = window.prompt("Name for the new preset:", defaultName);
            if (!name) {
                return;
            }
            await createPreset(db, bundleUniforms(state), name);
            return refreshPresetsFor(db, state, selector);
        }

        const deleteOption = queryOption(selector, OPTION.DELETE);
        if (key === OPTION.DELETE) {
            if (!state.selectedPreset) {
                deleteOption.disabled = true;
                return;
            }
            const preset = selectedPreset();
            if (!window.confirm(`Sure about deleting preset "${preset.name}"?`)) {
                return;
            }
            await deletePreset(db, state.selectedPreset);
            return refreshPresetsFor(db, state, selector);
        }

        state.selectedPreset = +event.target.value;
        const preset = selectedPreset();
        deleteOption.disabled = !preset;
        if (preset) {
            updateFromBundle(preset, state, elements);
        }
    });

    return result;

    function selectedPreset() {
        return elements.db.presets.find(p =>
            p.id === state.selectedPreset
        );
    }
}

function addOption(parent, label, value = undefined, visible = true) {
    const option = document.createElement("option");
    option.value = value;
    if (value === undefined) {
        option.disabled = true;
    }
    option.text = label;
    option.hidden = !visible;
    parent.append(option);
    return option;
}

async function refreshPresetsFor(db, state, selector) {
    db.presets = await loadPresets(db, state.showcaseId);

    selector.disabled = false;
    selector.innerHTML = "";
    addOption(selector, "").selected = true;
    addOption(selector, "Store as new preset", OPTION.NEW);
    const deleteOption = addOption(selector, "Delete last selected", OPTION.DELETE);
    deleteOption.disabled = !state.selectedPreset;
    addOption(selector, "\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014");

    const group = document.createElement("optgroup");
    group.label = "\u2014Stored Presets\u2014"
    for (const preset of db.presets) {
        addOption(group, preset.name, preset.id);
    }
    if (db.presets.length === 0) {
        addOption(group, "(none)");
        group.disabled = true;
    }
    selector.append(group);
}

export function refreshPresets(elements, state) {
    void refreshPresetsFor(elements.db, state, elements.presets.selector);
}
