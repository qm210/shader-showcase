function randomBetween(min, max, intensity) {
    return min + Math.random() * (max - min) * intensity;
}

export class Randomizer {
    constructor(contextProvider) {
        this._provider = contextProvider;
    }

    apply(uniforms, intensity) {
        const values = this.getRandomValues(uniforms, intensity);
        for (const [name, value] of Object.entries(values)) {
            this._provider.engine.setActualUniformValue(name, value);
        }
        return values;
    }

    getRandomValues(uniforms, intensity = 1) {
        const result = {};
        if (!uniforms?.length) {
            return result;
        }
        for (const entry of uniforms) {
            if (!entry.name) {
                continue;
            }
            const {min, max, components} = this._provider.getControl(entry);
            const factor = entry.factor ?? 1;

            function drawRandom(index = 0) {
                return randomBetween(
                    component(min, index),
                    component(max, index),
                    intensity
                ) * factor;
            }

            result[entry.name] = components === 1
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
