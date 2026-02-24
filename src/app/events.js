import {assignGloballyUniqueClass, findParentOfClass} from "./layout/dom.js";
import {idForLine} from "./layout/shaderCode.js";


export function createScrollStackOn(parent) {
    const scrollStack = [];

    parent.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const stackElement = scrollStack.pop();
        if (!stackElement) {
            flashNotAllowedCursor(parent);
            return;
        }
        stackElement.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
        selectContainingLine(stackElement);
    });

    return scrollStack;
}

function flashNotAllowedCursor(parent) {
    parent.style.cursor = "not-allowed";
    setTimeout(() => {
        parent.style.cursor = "";
    }, 100);
}

export function addShaderCodeEventListeners(analyzed, parent, scrollStack) {
    const lineElements =
        parent.getElementsByClassName("line");
    for (const element of lineElements) {
        element.addEventListener("click", () => {
            selectContainingLine(element);
        });
    }

    const symbolElements =
        parent.getElementsByClassName("symbol");
    for (const element of symbolElements) {
        element.addEventListener("click", event => {
            event.stopPropagation();
            const id = element.getAttribute("data");
            scrollToElementId(id, element, scrollStack);
        });
        element.classList.add("linked");
    }

    const usedSymbols = analyzed.symbols.filter(
        s => s.firstUsedInLine !== undefined
    );
    for (const symbol of usedSymbols) {
        const element = document.getElementById(symbol.name);
        if (!element) {
            continue;
        }
        element.addEventListener("click", event => {
            event.stopPropagation();
            const lineId = idForLine(analyzed.shaderKey, symbol.firstUsedInLine);
            scrollToElementId(lineId, element, scrollStack);
        });
        element.classList.add("linked");
    }
}

export function addShaderControlsEventListeners(analyzed, elements) {
    const scrolledToUsage = {};

    for (const uniformName in elements.uniforms) {
        const symbol = analyzed.symbols.find(s => s.name === uniformName);
        if (!symbol) {
            continue;
        }
        const element = elements.uniforms[uniformName].name;
        if (symbol.unused) {
            element.classList.add("unused");
            element.title = "(unused)";
            continue;
        }
        element.addEventListener("click", event => {
            event.stopPropagation();
            let nextUsage = scrolledToUsage[uniformName] ?? -1;
            nextUsage = (nextUsage + 1) % symbol.usages.length;
            const lineId = idForLine(analyzed.shaderKey, symbol.usages[nextUsage].number);
            scrollToElementId(lineId, element, elements.scrollStack);
            scrolledToUsage[uniformName] = nextUsage;
        });
        element.classList.add("linked");
        element.title = symbol.usages.length > 1
            ? `${symbol.usages.length}x used (click to scroll through usages)`
            : `${symbol.usages.length}x used (click to scroll to l. ${symbol.usages[0].number})`;
    }
}

export function scrollToElementId(id, sourceElement, scrollStack) {
    const target = document.getElementById(id);
    if (!target) {
        console.error("Target Element does not exist:", id, "Source Element:", sourceElement);
        return;
    }

    target.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
    selectContainingLine(target);

    if (sourceElement && scrollStack) {
        scrollStack.push(sourceElement);
    }
}

function selectContainingLine(element) {
    const lineParent = findParentOfClass(element, "line");
    assignGloballyUniqueClass(lineParent, "selected");

    if (lineParent?.id) {
        sessionStorage.setItem("selected.line.id", lineParent.id);
    }
}


export function scrollToFirstInterestingLine() {
    let interestingLine =
        document.querySelector(".line.error")
        ?? document.querySelector(".line.changed")
        ?? document.querySelector(".line.removed-before");

    if (interestingLine) {
        setTimeout(() => {
            interestingLine.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }, 200);
    }
}