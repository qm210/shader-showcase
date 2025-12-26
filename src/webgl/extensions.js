import {label} from "happy-dom/lib/PropertySymbol.js";

export function loadExtensions(gl, extensions) {
    for (const extension of extensions) {
        const ext = gl.getExtension(extension);
        if (!ext) {
            console.warn("Extension not available:", extension);
        }
        gl.ext[extension] = ext;

        if (extension === "EXT_disjoint_timer_query_webgl2" && ext) {
            enrichWithTimerHelpers(gl, ext);
        }
    }
}

function enrichWithTimerHelpers(gl, ext) {
    gl.timer.ELAPSED = ext.TIME_ELAPSED_EXT;
    gl.timer.DISJOINT = ext.GPU_DISJOINT_EXT;
    gl.timer.query = gl.createQuery();
    gl.timer.executeWithQuery = async (func) => {
        gl.beginQuery(gl.timer.ELAPSED, gl.timer.query);
        func();
        gl.endQuery(gl.timer.ELAPSED);
        return evaluateQuery(gl.timer.query, gl);
    };
    gl.timer.createQueryProfiler = ({title, enabled}) => {
        const records = [];
        if (enabled === false) {
            return {
                record: (label) => {},
                finalize: async () => null,
            }
        }
        return {
            record: (label) => {
                if (records.length > 0) {
                    gl.endQuery(gl.timer.ELAPSED);
                }
                const query = gl.createQuery();
                gl.beginQuery(gl.timer.ELAPSED, query);
                records.push({query, label});
            },
            finalize: async () => {
                if (records.length === 0) {
                    return null;
                }
                gl.endQuery(gl.timer.ELAPSED);
                const nanos = await Promise.all(
                    records.map(r => evaluateQuery(r.query, gl))
                );
                const totalNs = nanos.reduce(
                    (acc, ns) => acc + ns,
                    0
                );
                return {
                    title,
                    totalMillis: 1e-6 * totalNs,
                    maxPossibleFps: 1e9 / totalNs,
                    results: nanos
                        .map((ns, index) => ({
                            millis: 1e-6 * ns,
                            label: records[index].label,
                            percent: 100 * (ns / totalNs),
                        }))
                }
            }
        };
    };
    // gl.timer.createQueryProfiler = async ({title, enabled}) => {
    //     const queries = [];
    //     if (enabled === false) {
    //         return {
    //             record: (label) => {},
    //             finalize: async () => [],
    //         }
    //     }
    //     return {
    //         record: (label) => {
    //             if (queries.length > 0) {
    //                 gl.endQuery(gl.timer.ELAPSED);
    //             }
    //             const query = gl.createQuery();
    //             gl.beginQuery(gl.timer.ELAPSED, query);
    //             queries.push({query, label});
    //         },
    //         finalize: async () => {
    //             gl.endQuery(gl.timer.ELAPSED);
    //             const times = await Promise.all(
    //                 queries.map(({query}) =>
    //                     evaluateQuery(query, gl)
    //                 )
    //             ).then(nanos =>
    //                 nanos.map((ns, index) => ({
    //                     label: queries[index].label,
    //                     tookMs: ns / 1e6,
    //                 }))
    //             );
    //
    //             console.group("[MULTI-QUERY]", title);
    //             times.forEach(t => console.log(t.label, ":", t.tookMs, "ms"));
    //             console.groupEnd();
    //         }
    //     };
    // };
}

async function evaluateQuery(query, gl) {
    while (true) {
        const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
        const disjoint = gl.getParameter(gl.timer.DISJOINT);
        if (available && !disjoint) {
            return gl.getQueryParameter(query, gl.QUERY_RESULT);
        }
        await new Promise(requestAnimationFrame);
    }
}
