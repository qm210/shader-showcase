import {extendAnalysis} from "./analysis.js";
import {withGlslHighlighting, withSymbolsHighlighted} from "./highlighting.js";
import {addShaderCodeEventListeners, addShaderControlsEventListeners, scrollToElementId} from "../app/events.js";
import {createDiv} from "../app/dom/dom.js";
import {idForLine} from "../app/layout/shaderCode.js";

export function deferExtendedAnalysis(elements) {
    return Promise.all(
        elements.register.map(code =>
            extendAnalysis(code.analyzed)
                .then(extended => {
                    applyExtendedAnalysis(
                        extended,
                        code.references,
                        elements,
                    );
                })
                .catch(error => {
                    console.error("Analysis failed, guess your shader's broken anyway.");
                    console.info(error);
                })
        )
    );
}

function applyExtendedAnalysis(analyzed, references, elements) {
    const {header, sources} = references;
    enrichHeader(header, analyzed);

    for (const line of analyzed.lines) {
        const element = references[line.number];

        let code = element.code.innerHTML;
        code = withGlslHighlighting(code);
        code = withSymbolsHighlighted(code, analyzed.symbols, line.number);
        element.code.innerHTML = code;

        if (element.line.classList.contains("error")) {
            continue;
        }

        if (line.belongsTo.unusedCode) {
            element.line.classList.add("unused-definition");
            element.annotation.textContent = "unused";
        } else if (line.belongsTo.comment) {
            element.line.classList.add("comment");
        }
    }

    addShaderCodeEventListeners(analyzed, sources, elements.scrollStack);
    addShaderControlsEventListeners(analyzed, elements);

    for (const element of sources.getElementsByClassName("symbol")) {
        const symbolName = element.getAttribute("data");
        const symbol = analyzed.symbols.find(symbol => symbol.name === symbolName);
        if (!symbol) {
            continue;
        }
        const code = symbol.code ?? symbol.matched.trimmed;
        const lineInfo = `line ${symbol.definedInLine}`;
        element.title = `${lineInfo}: ${code}`;
    }
}

function enrichHeader(element, analyzed) {
    const main = analyzed.symbols.find(f => f.name === "main");
    if (!main) {
        return;
    }

    const mainLink = createDiv(
        `main() in l. ${main.definedInLine}`,
        "quicklink"
    );
    element.appendChild(mainLink);

    mainLink.addEventListener("click", () => {
        scrollToElementId(idForLine(analyzed.shaderKey, main.definedInLine))
    });
}