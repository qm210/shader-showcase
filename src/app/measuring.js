

export function takeMilliSeconds(since = 0) {
    return +(performance.now() - since).toFixed(3);
}

export function wrap(callFunction, {before = null, after = null, enabled = true} = {}) {
    return enabled => {
        if (!enabled) {
            return callFunction();
        }
        before?.();
        try {
            return callFunction();
        } finally {
            after?.();
        }
    };
}

export function executeAndMaybeMeasureMilliseconds(callFunction, doMeasurement = true) {
    return doMeasurement
        ? (() => {
            const start = performance.now();
            callFunction();
            return performance.now() - start;
        })()
        : void callFunction();
}


