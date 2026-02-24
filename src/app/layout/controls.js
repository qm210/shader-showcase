import {createDiv, createElement, createSpan} from "./dom.js";
import {initMouseState} from "../mouse.js";

export function addButton({parent, onClick, onRightClick, title = "", className = "", style}) {
    const button = document.createElement("button");
    button.textContent = title;
    if (className) {
        button.className = className;
    }
    if (style) {
        for (const key in style) {
            button.style[key] = style[key];
        }
    }
    if (onClick) {
      button.addEventListener("click", onClick);
    }
    if (onRightClick) {
      button.addEventListener("contextmenu", onRightClick);
    }
    if (parent) {
        parent.appendChild(button);
    }
    return button;
}

export const addFreeRow = ({parent, label, id, content, valuePrefix, isSeparator}) => {
    const name = createElement("label", label);
    const container = createDiv("", "free-row");
    const value = createDiv("", "value-label");
    if (label) {
        parent.appendChild(name);
    } else {
        container.classList.add("extra-column");
    }
    parent.appendChild(container);
    if (id) {
        container.dataset.id = id;
    }
    if (isSeparator) {
        container.classList.add("separator-row");
    } else {
        if (valuePrefix) {
            container.appendChild(
                createDiv(valuePrefix, "value-label")
            );
        }
        container.appendChild(value);
    }
    if (content instanceof Array) {
        content.forEach(child => {
            if (!child) {
                return;
            }
            container.appendChild(child);
        });
    } else if (content) {
        container.appendChild(content);
    }
    return {container, name, value, content};
};

export function createInputElements(state, control) {

    const expected = state.expectedUniforms.find(
        uniform => uniform.name === control.name
    );
    if (!expected && !control.notAnUniform) {
        console.warn("Could not find expected uniform", control.name, "(is it declared?), ", control, state);
        return;
    }

    control.storageKey = `qm.${state.title}.${control.name}`;
    const storedState = sessionStorage.getItem(control.storageKey);
    if (storedState) {
        state[control.name] = JSON.parse(storedState);
    }
    if (state[control.name] === undefined) {
        state[control.name] = control.defaultValue;
        if (control.defaultValue === undefined) {
            console.warn("Uniform control has no defaultValue defined: ", control.name, control);
        } else if (control.defaultValue instanceof Array) {
            state[control.name] = [...control.defaultValue];
        }
    }

    if (control.hidden) {
        return;
    }

    const activelyUsed = state.activeUniforms.find(
        uniform => uniform.name === control.name
    );
    if (!activelyUsed && !control.notAnUniform) {
        return;
    }

    control.dim = 1;
    const input = createInputControlElements(control);
    switch (control.type) {
        case "int":
            control.integer = true;
            return asFloatInput(input, state, control);
        case "float":
            return asFloatInput(input, state, control);
        case "vec2":
            control.dim = 2;
            return asVecInput(input, state, control);
        case "vec3":
            control.dim = 3;
            return asVecInput(input, state, control);
        case "vec4":
            control.dim = 4;
            return asVecInput(input, state, control);
        case "cursorInput":
            return asCursorInput(input, state, control);
        case "bool":
        case "boolean":
            control.boolean = true;
            return asBoolInput(input, state, control)
        default:
            console.warn("Control type", control.type, "has no elements definition (yet)", control);
            return undefined;
    }
}

function sessionStoreControlState(state, control) {
    if (state[control.name] === control.defaultValue) {
        sessionStorage.removeItem(control.storageKey);
    } else {
        sessionStorage.setItem(
            control.storageKey,
            JSON.stringify(state[control.name])
        );
    }
}

export function createSmallButton(title, ...extraClasses) {
    const button = document.createElement("button");
    button.classList.add("small-button", ...extraClasses);
    button.textContent = title;
    return button;
}

const createInputControlElements = (control) => {
    const elements = {
        name: document.createElement("label"),
        value: createDiv("", "value-label"),
        control: document.createElement("input"),
        min: document.createElement("label"),
        max: document.createElement("label"),
        reset: createSmallButton("reset", "reset"),
        description: null,
        updateValue: null,
    };
    if (control) {
        elements.value.dataset.id = control.name;
        elements.name.textContent = control.name;
    }
    elements.min.style.fontSize = "small";
    elements.min.style.width = "0.1";
    elements.min.style.textAlign = "right";
    elements.max.style.fontSize = "small";
    elements.max.style.textAlign = "left";

    if (!control.boolean) {
        elements.value.addEventListener("dblclick", () => {
            if (!elements.updateValue) {
                return;
            }
            const value = window.prompt(`New Value for "${control.name}:"`);
            if (value) {
                elements.updateValue(value);
            }
        });
    }
    return elements;
};

export const asFloatInput = (elements, state, control) => {
    control.defaultValue ??= control.log ? 1 : 0;
    elements.reset.textContent = `reset: ${control.defaultValue}`;
    asSlider(elements.control, control);
    updateSlider(elements, state, control, true);

    elements.updateValue = (value = undefined) => {
        if (value !== undefined) {
            value = parseFloat(value);
            if (isNaN(value)) {
                return;
            }
            state[control.name] = value;
        }
        updateSlider(elements, state, control, true);
        sessionStoreControlState(state, control);
    };

    elements.control.addEventListener("input", event => {
        state[control.name] = valueFrom(event, control);
        updateSlider(elements, state, control, false);
    });
    elements.control.addEventListener("change", event => {
        elements.updateValue(
            valueFrom(event, control)
        );
    });
    elements.reset.addEventListener("click", () => {
        elements.updateValue(
            control.defaultValue
        );
    });

    return elements;
};

function valueFrom(event, control) {
    let value = parseFloat(event.target.value);
    if (control.log) {
        value = Math.pow(10, value);
    }
    if (control.integer) {
        value = Math.round(value);
    }
    return value;
}

function asSlider(inputElement, control) {
    control.step ??=
        control.min > 0 && control.min < 0.01
            ? 0.001 : 0.01;
    if (control.log && control.min > 0 && control.max > control.min) {
        control.step = Math.min(control.min, 0.001);
        control.min = Math.log10(control.min);
        control.max = Math.log10(control.max);
    }
    control.digits = control.integer ? 0 : -Math.log10(control.step);
    if (control.min !== undefined) {
        inputElement.min = control.min;
    }
    if (control.max !== undefined) {
        inputElement.max = control.max;
    }
    inputElement.type = "range";
    inputElement.step = control.step;
    inputElement.style.flex = "1";
}

function updateSlider(elements, state, control, full = false, givenValue = undefined) {
    let value = givenValue ?? state[control.name];
    value = round(value, control.step);
    if (control.log) {
        value = Math.log10(value);
    }
    if (full) {
        const defaultMin =
            value === 0 ? -1
            : value > 0 ? 0
            : 2 * value;
        const defaultMax =
            value === 0 ? +1
            : value < 0 ? 0
            : 2 * value;
        elements.control.min = round(control.min ?? defaultMin, control.step);
        elements.control.max = round(control.max ?? defaultMax, control.step);
        elements.min.textContent = toDigits(elements.control.min, control);
        elements.max.textContent = toDigits(elements.control.max, control);
    }
    elements.control.value = value;
    value = toDigits(value, control);
    elements.value.textContent = ` = ${value}`;
    return value;
}

function toDigits(value, control) {
    value = +value;
    if (control.log) {
        value = Math.pow(10, value);
    }
    return value.toFixed(control.digits);
}

function round(value, step) {
    return Math.round(value / step) * step;
}

const toVec = (dim, value) =>
    Array(dim).fill(null).map(_ => value);

const randomVec = (control) =>
    Array(control.dim).fill(null)
        .map((_, i) => {
            const random = (control.max[i] - control.min[i]) * Math.random();
            return round(control.min[i] + random, control.step[i]);
        });

export const asVecInput = (elements, state, control) => {
    elements.control = document.createElement("div");
    elements.control.style.gap = "0.25rem";

    let maybeNormFactor = 1;
    if (control.normalize) {
        control.min = control.log ? 1e-6 : -1;
        control.max = 1;
        maybeNormFactor = 1 / (squareNorm(state[control.name]) || 1);
    }

    control.sameMin = !(control.min instanceof Array);
    control.sameMax = !(control.max instanceof Array);
    control.sameStep = !(control.step instanceof Array);
    if (control.sameMin) {
        control.min = toVec(control.dim, control.min);
    }
    if (control.sameMax) {
        control.max = toVec(control.dim, control.max);
    }
    if (control.sameStep) {
        control.step = toVec(control.dim, control.step);
    }
    if (!(state[control.name] instanceof Array)) {
        // fixes bad data from the Browser Storage
        state[control.name] = toVec(control.dim, state[control.name]);
    }

    const sliders = [];
    const elementsForComponent = [];
    for (let index = 0; index < control.dim; index++) {
        const componentControl = {
            name: `${control.name}.${index}`,
            min: control.min[index],
            max: control.max[index],
            step: control.step[index],
            debugOriginal: control,
        };
        const forComponent = createInputControlElements(componentControl);
        elementsForComponent.push(forComponent);
        sliders.push(forComponent.control);
        asSlider(forComponent.control, componentControl);
        control.step[index] ??= componentControl.step;
        state[control.name][index] *= maybeNormFactor;
        forComponent.control.value =
            updateSlider(forComponent, state, componentControl, true, state[control.name][index]);
        forComponent.control.addEventListener("input", event => {
            updateSlider(forComponent, state, componentControl, false, event.target.value);
            updateVector();
        });
        forComponent.control.addEventListener("change", event => {
            updateSlider(forComponent, state, componentControl, true, event.target.value);
            updateVector();
        });
    }
    elements.min = elementsForComponent[0].min;
    elements.max = elementsForComponent[control.dim - 1].max;
    for (let index = 0; index < control.dim; index++) {
        if (!control.sameMin && index > 0) {
            elements.control.appendChild(elementsForComponent[index].min);
        }
        elements.control.appendChild(elementsForComponent[index].control);
        if (!control.sameMax && index < control.dim - 1) {
            elements.control.appendChild(elementsForComponent[index].max);
            elements.control.appendChild(createSpan({text: "|"}));
        }
    }

    elements.reset.addEventListener("click", (event) => {
        const value = event.ctrlKey
            ? randomVec(control)
            : control.defaultValue;
        updateVector(value);
    });

    elements.updateValue = (value) => {
        if (typeof value === "string") {
            value = value.split(",").map(parseFloat);
        }
        if (!(value instanceof Array)
            || value.some(Number.isNaN)
            || value.length !== control.dim
        ) {
            console.warn(`Bad input for ${control.type} ${control.name}: ${value}`);
            return;
        }
        state[control.name] = value;
        updateVector(value);
    };

    updateVector();

    return elements;

    function updateVector(givenVector) {
        const vector = givenVector ?? sliders.map(s => s.value);
        const norm = control.normalize
            ? squareNorm(vector)
            : 1;
        state[control.name] = vector.map(v => v / norm);
        sliders.forEach((slider, i) => {
            slider.value = state[control.name][i];
        });
        updateVecLabel(elements.value, state, control);
        sessionStoreControlState(state, control);
    }
};

function squareNorm(vec) {
    return Math.sqrt(vec.reduce(
        (sum, comp) => sum + comp * comp,
        0
    ));
}

const asCursorInput = (elements, state, control) => {
    // control.keys needs 7 keydown event names like ["W", "A", "S", "D", "R", "F", "Q"]
    const [front, left, back, right, up, down, reset] =
        control.keys.map(k => k.toUpperCase());
    const moveKeys = control.keys.slice(0, 6).join("").toUpperCase();
    elements.control = document.createElement("label");
    elements.control.innerHTML = ` -> use <kbd>${moveKeys}</kbd> to move, <kbd>${reset}</kbd> to reset.`;
    elements.reset.style.visibility = "collapse";

    control.step ??= 1;

    update();

    document.addEventListener("keydown", event => {
        if (!document.activeElement.matches("body")) {
            return;
        }
        switch (event.key.toUpperCase()) {
            case front:
                shiftComponent(2, control.step);
                break;
            case back:
                shiftComponent(2, -control.step);
                break;
            case left:
                shiftComponent(0, -control.step);
                break;
            case right:
                shiftComponent(0, control.step);
                break;
            case up:
                shiftComponent(1, control.step);
                break;
            case down:
                shiftComponent(1, -control.step);
                break;
            case reset:
                state[control.name] = control.defaultValue;
                break;
            default:
                return;
        }
        update();
        sessionStoreControlState(state, control);
    });

    return elements;

    function update() {
        updateVecLabel(elements.value, state, control)
    }

    function shiftComponent(index, shift) {
        if (index >= state[control.name].length) {
            return;
        }
        state[control.name] = state[control.name].map((value, i) =>
            index !== i ? value :
                value + shift
        );
    }
}

function updateVecLabel(labelElement, state, control) {
    let value = state[control.name];
    if (value instanceof Array) {
        value = value
            .map(i => i.toFixed(2))
            .join(",");
    } else {
        console.warn("this is weird, updateVecLabel has no vec value", control, value);
    }
    labelElement.textContent = `= (${value})`;
}

export const asBoolInput = (elements, state, control) => {
    elements.control.type = "checkbox";
    if (control.group) {
        elements.control.name = control.group;
        elements.control.dataset.name = control.name;
    }
    elements.control.id = `check.${control.name}`;
    elements.description =
        createElement("label", control.description ?? "", "bool-description");
    elements.description.htmlFor = elements.control.id;

    control.defaultValue ??= false;
    elements.reset.textContent = `reset`;
    if (control.group && !control.defaultValue) {
        elements.description.classList.add("extra-column");
        delete elements.reset;
    }

    update();

    elements.control.addEventListener("change", event => {
        update(event.target.checked);
    });

    if (elements.reset) {
        elements.reset.addEventListener("click", () => {
            update(control.defaultValue);
        });
    }

    return elements;

    function update(value = undefined) {
        const manuallyChanged = value !== undefined;
        if (manuallyChanged) {
            state[control.name] = value;
            sessionStoreControlState(state, control);
        } else {
            value = !!state[control.name];
        }
        elements.control.checked = value;
        elements.value.textContent = `= ${value}`;

        if (control.group && manuallyChanged) {
            updateOthersInGroup();
        }
    }

    function updateOthersInGroup() {
        const others = document.querySelectorAll(
            `input[name="${control.group}"]`
        )
        for (const input of others) {
            if (input.dataset.name === control.name) {
                continue;
            }
            input.checked = false;
            const valueLabel = input.previousElementSibling;
            if (valueLabel.dataset.id !== input.dataset.name) {
                console.warn("Value Label doesn't match to the adjacent Input, wtf?");
                continue;
            }
            valueLabel.textContent = `= ${input.checked}`;
        }
        for (const otherControl of control.groupedControls) {
            if (otherControl.name !== control.name) {
                state[otherControl.name] = false;
                sessionStoreControlState(state, otherControl);
            }
        }
    }
};

export function createResetAllButton(elements, state, controls) {
    if (!controls.uniforms) {
        return undefined;
    }

    const button = createSmallButton("Reset All", "right-align");
    button.addEventListener("click", event => {
        const allResetButtons = elements.controls.querySelectorAll("button.reset");
        for (const button of allResetButtons) {
            button.click();
        }
        for (const control of controls.uniforms) {
            if (control.type === "cursorInput") {
                state[control.name] = control.defaultValue;
                const label = elements.uniforms[control.name].value;
                updateVecLabel(label, state, control);
                sessionStoreControlState(state, control);
            }
        }
        if (controls.onReset) {
            controls.onReset();
        }
        initMouseState(state, true);
        state.resetSignal = true;
        event.target.blur();
    });
    return button;
}
