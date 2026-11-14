import {urlSearchParam} from "../../app/layout/page.js";

export {clamp} from '../../app/algorithms.js';
export {urlSearchParam} from '../../app/layout/page.js';
export {CHAR, DELAY_MS, STORAGE_KEY} from '../../app/constants.js';

const _debug =
    urlSearchParam("debug") ||
    import.meta.env.VITE_DEBUG_LOG === "true";

export const DEBUG = {
    log: (...args) =>
        _debug && console.log("[DEBUG]", ...args),
    table: (arg) =>
        _debug && console.table(arg),
};
