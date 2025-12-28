
export default function initLayout(rootId) {

    const root = document.getElementById(rootId);
    root.innerHTML = `
      <div id="layout">
        <div id="shaders"></div>
        <div id="console"></div>
        <div id="working-program">
          <div id="canvas-frame">
            <canvas id="canvas"></canvas>
            <div id="display-controls"></div>            
          </div>
          <div id="control-frame">
            <div id="main-controls"></div>
          </div>
          <div id="uniform-controls"></div>
        </div>
      </div>
    `;

    const elements = {
        layout: document.getElementById("layout"),
        shaders: document.getElementById("shaders"),
        console: document.getElementById("console"),
        workingShader: document.getElementById("working-program"),
        canvasFrame: document.getElementById("canvas-frame"),
        canvas: document.getElementById("canvas"),
        displayControls: document.getElementById("display-controls"),
        controlBar: {
            frame: document.getElementById("control-frame"),
            main: document.getElementById("main-controls"),
            buttons: [],
            time: {
                frame: emptyDiv({id: "time-controls"}),
                value: emptyDiv({className: "value-label"}),
                update: void 0,
                seeker: emptyDiv({id: "time-seek"}),
                bookmarks: emptyDiv({id: "time-bookmarks"}),
            }
        },
        buttons: {},
        uniformControls: document.getElementById("uniform-controls"),
        uniforms: {},
        db: undefined,
        measured: {
            initialMs: performance.now(),
            pageLoadingMs: null,
        }
    };

    keepScrollPosition(elements.shaders, "qm.shaders.scroll");
    keepScrollPosition(elements.uniformControls, "qm.uniforms.scroll");

    return elements;
}

function emptyDiv({id, className}) {
    const element = document.createElement("div");
    if (id) {
        element.id = id;
    }
    if (className) {
        element.className = className;
    }
    return element;
}

export function setFromUrlParameters(paramMap) {
    const urlParams = new URLSearchParams(window.location.search);
    for (const paramName in paramMap) {
        const paramValue = urlParams.get(paramName);
        if (!paramValue) {
            // not given in url
            continue;
        }
        const cssProperty = paramMap[paramName];
        document.documentElement.style.setProperty(cssProperty, paramValue);
    }
}

function keepScrollPosition(element, storageKey) {
    let debounceTimer;
    element.addEventListener("scroll", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            sessionStorage.setItem(storageKey, element.scrollTop.toString());
        }, 200);
    });
    document.addEventListener("DOMContentLoaded", () => {
        const scrollPosition = sessionStorage.getItem(storageKey);
        if (!scrollPosition) {
            return;
        }
        setTimeout(() =>
            element.scrollTo({
                top: parseInt(scrollPosition),
                behavior: "smooth",
            }),
            300
        );
    });
}
