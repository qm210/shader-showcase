
export function addCanvasMouseInteraction(elements, state) {
    // Shadertoy convention for iMouse is
    //   .xy = the current mouse position when some button is pressed (i.e. dragged to)
    //         and [0, 0] if not pressed
    //   .zw = the last mouse position where the button was pressed (i.e. dragged from)
    //         <-- but I hate that, I want .zw to be dragged so it stays after mouseup.
    // And I prefer to also have the last position where the drag was dropped, or better
    //   .xy = the currently dragged distance (iMouse.xy - iMouse.zw when dragging)
    //   .zw = the total dragged distance up to now
    initMouseState(state);
    loadMouseTotals(state);

    elements.canvas.addEventListener("mousedown", event => {
        state.iMouseDown = true;
        state.drag.pressed = true;
        const pressed = correctedCoordinates(event);
        state.iMouse = [pressed.x, pressed.y, pressed.x, pressed.y];
    });
    elements.canvas.addEventListener("mousemove", event => {
        const cursor = correctedCoordinates(event);
        state.iMouseHover[0] = cursor.x;
        state.iMouseHover[1] = cursor.y;
        if (!state.drag.pressed) {
            return;
        }
        state.iMouse[0] = cursor.x;
        state.iMouse[1] = cursor.y;
        state.iMouse[2] = cursor.x;
        state.iMouse[3] = cursor.y;
        state.iMouseDrag[0] = state.iMouse[0] - state.iMouse[2];
        state.iMouseDrag[1] = state.iMouse[1] - state.iMouse[3];
        state.iMouseDrag[2] = state.drag.total.dx + state.iMouseDrag[0];
        state.iMouseDrag[3] = state.drag.total.dy +  state.iMouseDrag[1];
    });
    document.addEventListener("mouseup", event => {
        state.iMouseDown = false;
        if (!state.drag.pressed) {
            return;
        }
        state.drag.pressed = false;
        state.iMouseDown = false;
        storeMouseTotals(state);
        state.iMouseDrag[0] = 0;
        state.iMouseDrag[1] = 0;
        state.iMouse[0] = 0;
        state.iMouse[1] = 0;
    });
    elements.canvas.addEventListener("mouseenter", event => {
        state.iMouseHover[2] = true;
    });
    elements.canvas.addEventListener("mouseleave", event => {
        state.iMouseHover[2] = false;
        state.iMouseDown = false;
    });
    elements.canvas.addEventListener("wheel", event => {
        state.iMouseWheel -= event.deltaY / 100.
        storeMouseTotals(state);
    });

    function correctedCoordinates(event) {
        // the y convention in GLSL is opposed to the HTML convention.
        return {
            x: event.offsetX,
            y: elements.canvas.height - event.offsetY
        };
    }

}

export function initMouseState(state, resetStored = false) {
    state.iMouse = [0, 0, 0, 0];
    state.iMouseDrag = [0, 0, 0, 0];
    state.iMouseDown = false;
    state.iMouseHover = [-999, -999, false];
    state.iMouseWheel = 0;
    state.drag = {
        pressed: false,
        total: {
            dx: 0,
            dy: 0,
            wheel: 0,
        }
    };
    if (resetStored) {
        storeMouseTotals(state);
    }
}

function storeMouseTotals(state) {
    state.drag.total = {
        dx: state.iMouseDrag[2],
        dy: state.iMouseDrag[3],
        wheel: state.iMouseWheel,
    };
    sessionStorage.setItem("qm.mouse", JSON.stringify(state.drag.total));
}

function loadMouseTotals(state) {
    const stored = sessionStorage.getItem("qm.mouse");
    if (!stored) {
        return;
    }
    state.drag.total = JSON.parse(stored);
    state.iMouseDrag[2] = state.drag.total.dx ?? 0;
    state.iMouseDrag[3] = state.drag.total.dy ?? 0;
    state.iMouseWheel = state.drag.total.wheel ?? 0;
}