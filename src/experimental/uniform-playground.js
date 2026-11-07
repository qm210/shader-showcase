import { TimelineEngine } from './timeline-engine.js';
import { PlaygroundOverlay } from './playground-overlay.js';
import { getUniformRandomizer } from './uniform-randomizer.js';

const pg = {
    engine: null,
    overlay: null,
    randomizer: null,
};

export function createUniformPlayground(state, controls) {
    if (!pg.engine) {
        pg.engine = new TimelineEngine();
        // The randomizer needs the controls before the overlay renders its sets.
        pg.randomizer = getUniformRandomizer(controls.uniforms);
        pg.overlay = new PlaygroundOverlay(pg.engine, { randomizer: pg.randomizer });

        for (const control of controls.uniforms) {
            // Only initialize scalar/vector uniforms that don't have a value yet
            if (control.separator || control.boolean) {
                continue;
            }
            const target = control.notAnUniform ? state : state.uni;
            if (target[control.name] === undefined) {
                target[control.name] = control.defaultValue;
            }
        }
    }

    return {
        ...pg,

        update(dt) {
            // The overlay advances the engine; updating both would run the timeline twice per frame.
            pg.overlay.update(dt);
        },

        syncToShader(gl, state) {
            pg.overlay.syncToShader(gl, state);
        },

        toggleOverlay() {
            pg.overlay.toggle();
        },

        getUniformValues() {
            return pg.engine.getAllUniformValues();
        },

        addTrack(name) {
            const track = pg.engine.addTrack(name);
            pg.overlay.render();
            return track;
        },

        removeTrack(id) {
            pg.engine.removeTrack(id);
            pg.overlay.render();
        },

        resetOverlay() {
            pg.overlay.reset();
        },

        toJSON() {
            return pg.engine.toJSON();
        },
    };
}

export function getTimelineValues() {
    if (!pg.engine) {
        return {};
    }
    return pg.engine.getAllUniformValues();
}
