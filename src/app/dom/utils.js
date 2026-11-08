export function assignGloballyUniqueClass(element, className) {
    if (!element) {
        return;
    }
    const selected = [...document.getElementsByClassName(className)];
    for (const previous of selected) {
        previous.classList.remove(className);
    }
    element.classList.add(className);
}

export function findFirstAncestorOfClass(element, className) {
    // Can match the element itself!
    let result = element;
    while (result && !result.classList.contains(className)) {
        result = result.parentElement;
    }
    return result;
}

export function injectGlobalCSS(elementId, stylesheet) {
    if (document.getElementById(elementId)) {
        return;
    }
    const element = document.createElement('style');
    element.id = elementId;
    element.textContent = stylesheet;
    document.head.appendChild(element);
}
