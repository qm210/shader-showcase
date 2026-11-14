import {ACTION} from '../../actions.js';
import {CHAR} from '../index.js';
import {actionButton} from './html.js';
import {timelineTemplate} from './timeline.js';
import {uniformPanelTemplate} from './uniformList.js';
import {randomizerTemplate} from './randomizer.js';

export const DATALIST = {
    UNIFORMS: 'playground-uniform-names',
};

const UI_SELECTORS = {
    playBtn:               '.play-btn',
    timeRangeBar:          '.time-range-bar',
    timeSlider:            '.time-slider',
    timeStart:             '.time-start',
    timeEnd:               '.time-end',
    timeZoomReset:         '.time-zoom-reset',
    timeRuler:             '.time-ruler',
    timeRulerTicks:        '.time-ruler .time-ticks',
    timeZoomBand:          '.time-zoom-band',
    timeZoomDetail:        '.time-zoom-detail',
    timeZoomLens:          '.time-zoom-lens',
    timeSubSlider:         '.time-sub-slider',
    timeSubTicks:          '.time-sub-ticks',
    speedInput:            '.speed-input',
    timelineEditor:        '.timeline-editor',
    trackRows:             '.track-rows',
    preview:               '.value-preview',
    timelineTooltip:       '.timeline-tooltip',
    batchSelectorDisplay:  '.target-selector-display',
    batchSelectorDropdown: '.target-selector-dropdown',
    randomizeBtn:          '.randomize-btn',
    intensitySlider:       '.intensity-slider',
    intensityValue:        '.intensity-value',
    batchList:             '.batch-list',
    uniformNames:          `#${DATALIST.UNIFORMS}`,
    uniformListBody:       '.uniform-list-body',
};

function headerTemplate() {
    return `
        <div class="panel-header"
             data-drag-handle>
            <span class="title">Uniform Playground</span>
            <div class="panel-header-actions">
                <div class="track-list-export">
                    <span>Timeline:</span>
                    ${actionButton({action: ACTION.EXPORT, label: 'Export'})}
                    ${actionButton({action: ACTION.IMPORT, label: 'Import'})}
                </div>
                <div class="uniform-snaphot">
                    <span>Uniform Snapshot:</span>
                    ${actionButton({
                        action: ACTION.LOAD_SNAPSHOT,
                        label: 'Load Current',
                        className: 'btn danger',
                        title: 'Load current uniform values '
                            + 'from main page sliders',
                    })}
                    ${actionButton({
                        action: ACTION.CLEAR_OVERRIDES,
                        label: 'Clear Overrides',
                        className: 'btn danger',
                        title: 'Set all uniform values to most recent snapshot',
                    })}
                </div>
            </div>
            ${actionButton({
                action: ACTION.HIDE_OVERLAY,
                label: CHAR.X_MARK,
                className: 'minimize-btn',
                title: 'Minimize',
            })}
        </div>
        <datalist id="${DATALIST.UNIFORMS}"></datalist>`;
}

export function createPlaygroundOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pg-overlay';
    overlay.innerHTML = [
        headerTemplate(),
        timelineTemplate(),
        uniformPanelTemplate(),
        randomizerTemplate(),
    ].join('');

    const ui = Object.fromEntries(
        Object.entries(UI_SELECTORS)
            .map(([key, selector]) => [key, overlay.querySelector(selector)])
    );
    return {element: overlay, ui, contextBar: null};
}
