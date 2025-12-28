import {initMouseState} from "../../mouse.js";
import {createDiv, createSmallButton} from "../dom.js";
import {sessionStoreControlState, updateVecLabel} from "./uniforms.js";
import {createTimeSeeker} from "./time.js";


export function createMainControlBar(elements, state, controls) {
    const seeker = createTimeSeeker(
        elements.controlBar.time.seeker, state, elements.controlBar.time.bookmarks
    );
    const rows = Array(2)
        .fill("")
        .map(text => createDiv(text, "full-row"));
    rows[0].append(
        createDiv("Time", "value-label"),
        createDiv("", "half spacer"),
        elements.controlBar.time.seeker,
    );
    rows[1].append(elements.controlBar.time.bookmarks);
    elements.controlBar.time.frame.append(...rows);
    elements.controlBar.time.value.id = "iTime";
    elements.controlBar.time.update = seeker.callback.update;

    elements.controlBar.main.append(
        elements.controlBar.time.frame,
        // TODO: Reset-All-Button might go into the Display Controls (right bar)
        createResetAllButton(elements, state, controls)
    );

    return {
        elements: elements.controlBar,
        seeker,
    };
}

function createResetAllButton(elements, state, controls) {
    const button = createSmallButton("Reset All", "right-align");
    button.addEventListener("click", event => {
        const allResetButtons = elements.uniformControls.querySelectorAll("button.reset");
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
        state.play.signal.reset = true;
        event.target.blur();
    });
    return button;
}
