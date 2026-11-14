import {ACTION} from '../../actions.js';
import {CHAR} from '../index.js';
import {actionButton} from './html.js';
import {contextBarTemplate} from './contextBar.js';
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
    audioFileInput:        '#audio-file-input',
    timelineEditor:        '.timeline-editor',
    trackRows:             '.track-rows',
    preview:               '.value-preview',
    timelineTooltip:       '.timeline-tooltip',
    batchList:             '.batch-list',
    uniformNames:          `#${DATALIST.UNIFORMS}`,
    uniformListBody:       '.uniform-list-body',
    randomize: {
        targetSelector:    '.target-selector > .selector-display',
        targetDropdown:    '.target-selector > .selector-dropdown',
        button:            '.randomize-btn',
        intensitySlider:   '.intensity-slider',
        intensityValue:    '.intensity-value',
    },
    contextBar:            '.context-action-bar'
};

function headerTemplate() {
    return `
        <div class="panel-header"
             data-drag-handle
         >
            <span class="title">
                Uniform Playground
            </span>
            <div class="panel-header-actions">
                <div class="timeline-actions">
                    <span>Timeline:</span>                   
                    ${actionButton({
                        action: ACTION.EXPORT,
                        label: 'Export'
                    })}
                    ${actionButton({
                        action: ACTION.IMPORT,
                        label: 'Import'
                    })}
                    ${actionButton({
                        action: ACTION.LOAD_AUDIO,
                        label: '🎵',
                        title: 'Load audio file',
                        className: 'btn icon'
                    })}                    
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

function queryUI(root, selectors) {
    return Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => [
            key,
            typeof selector === 'string'
                ? root.querySelector(selector)
                : queryUI(root, selector),
        ])
    );
}

export function createPlaygroundOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pg-overlay';
    overlay.innerHTML = [
        headerTemplate(),
        timelineTemplate(),
        uniformPanelTemplate(),
        randomizerTemplate(),
        contextBarTemplate(),
    ].join('');

    const ui = queryUI(overlay, UI_SELECTORS);

    return {element: overlay, ui};
}
