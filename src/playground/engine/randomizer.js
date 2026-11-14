
function randomBetween(min, max, intensity) {
    return min + Math.random() * (max - min) * intensity;
}

export class Randomizer {
    constructor(contextProvider) {
        this._provider = contextProvider;
    }

    randomizeBatch(batch, intensity, provider) {
        const values = this.getBatchRandomValues(batch, intensity);
        for (const [name, value] of Object.entries(values)) {
            provider.engine.setUniformOverride(name, value);
        }
        return values;
    }

    getBatchRandomValues(batch, intensity = 1) {
        const result = {};
        if (!batch) {
            return result;
        }
        for (const entry of batch.uniforms) {
            if (!entry.name || entry.active === false) {
                continue;
            }
            const { min, max, components } = this._provider.resolveControlRange(entry);
            const factor = entry.factor ?? 1;

            function drawRandom(index = 0) {
                return randomBetween(
                    component(min, index),
                    component(max, index),
                    intensity
                ) * factor;
            }

            result[entry.name] = components === null
                ? drawRandom()
                : Array.from({ length: components }, (_, i) =>
                    drawRandom(i)
                );
        }
        return result;

        function component(value, index) {
            return Array.isArray(value) ? (value[index] ?? value[0]) : value;
        }
    }
}
