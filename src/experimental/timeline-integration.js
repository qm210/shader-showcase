/**
 * Timeline Integration — bridges the timeline engine/overlay with Schlosslichtspiel.
 * 
 * This module:
 * 1. Creates a TimelineEngine instance
 * 2. Creates the TimelineOverlay UI
 * 3. Provides a function to sync timeline values to shader uniforms each frame
 * 4. Exposes a toggle for the overlay visibility
 */

import { TimelineEngine } from './timeline-engine.js';
import { TimelineOverlay, getTimelineOverlay } from './timeline-overlay.js';

let engine = null;
let overlay = null;

/**
 * Initialize timeline system. Call once during showcase init.
 * @param {Object} state - The WebGL state object from Schlosslichtspiel.init()
 * @returns {Object} Timeline integration API
 */
export function initTimeline(state) {
    if (!engine) {
        engine = new TimelineEngine();
        overlay = new TimelineOverlay(engine);
        
        // Sync initial values to state for UI population
        state.uLayoutNCols = 8;
        state.uLayoutNRows = 3;
        state.uLayoutPanesX = 2;
        state.uLayoutPanesY = 4;
        state.uLayoutGapBottomMid = 0.5;
        state.uLayoutGapMidTop = 0.333;
        state.uLayoutMarginX = 1.0;
        state.uLayoutMarginY = 0.75;
        state.uLayoutBlockShiftY = 0.12;
        state.uLayoutFrameW = 0.07;
        state.uLayoutMullionW = 0.035;
        state.uLayoutSillH = 0.09;
        state.uLayoutSillOverhang = 0.10;
        state.uLayoutPlinthH = 0.55;
        state.uLayoutCorniceH = 0.35;
        state.uLayoutWrapSmooth = 0.25;

        state.uColPlaster = [0.86, 0.80, 0.70];
        state.uColFrame = [0.93, 0.91, 0.86];
        state.uColMullion = [0.90, 0.88, 0.84];
        state.uColSill = [0.78, 0.74, 0.68];
        state.uColPlinth = [0.30, 0.30, 0.34];
        state.uColCornice = [0.26, 0.24, 0.26];
        state.uColGlassLo = [0.06, 0.09, 0.17];
        state.uColGlassHi = [0.22, 0.34, 0.48];
        state.uColLitLo = [0.95, 0.55, 0.20];
        state.uColLitHi = [1.00, 0.85, 0.50];

        state.uDebugView = 0;
    }

    return {
        /** Get the timeline engine instance */
        getEngine: () => engine,
        
        /** Get the overlay UI instance */
        getOverlay: () => overlay,
        
        /** Sync all timeline-driven uniforms to the shader */
        syncToShader: (gl, state) => {
            const values = engine.getAllUniformValues();
            
            for (const [name, value] of Object.entries(values)) {
                const loc = state.location[name];
                if (loc === undefined) continue;

                if (Array.isArray(value)) {
                    gl.uniform3fv(loc, value);
                } else if (typeof value === 'number') {
                    // Check if it's an int uniform
                    if (name === 'uDebugView' || name.includes('NCols') || 
                        name.includes('NRows') || name.includes('Panes')) {
                        gl.uniform1i(loc, Math.round(value));
                    } else {
                        gl.uniform1f(loc, value);
                    }
                }
            }
        },

        /** Update timeline by delta time (call from render loop) */
        update: (dt) => {
            engine.update(dt);
            overlay.render();
        },

        /** Toggle overlay visibility */
        toggleOverlay: () => {
            overlay.toggle();
        },

        /** Show/hide overlay */
        setOverlayVisible: (visible) => {
            overlay.setVisible(visible);
        }
    };
}

/**
 * Get current timeline values for debugging/logging
 */
export function getTimelineValues() {
    if (!engine) return {};
    return engine.getAllUniformValues();
}
