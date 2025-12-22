
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
        if (!enabled) {
            return {
                record: label => {},
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
                const results = Promise.all(
                    records.map(r => evaluateQuery(r.query, gl))
                ).then(nanos =>
                    nanos.map((ns, index) =>
                        ({micros: 1e-3 * ns, label: records[index]}),
                    )
                );
                return {title, results};
            }
        };
    };
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
