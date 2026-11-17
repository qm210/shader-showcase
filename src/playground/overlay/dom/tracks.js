import {ACTION} from "../../actions.js";
import {percentOfSpan, smoothstep} from "../../engine/math.js";
import {calcLaneValueRange} from "../../engine/valueRanges.js";
import {CHAR, clamp} from "../index.js";
import {actionButton, cls, dataAttrs, editableName, esc, pointerFraction,} from "./html.js";
import {DATALIST} from "./scaffold.js";
import {isInView} from "../../engine/timeZoom.js";
import {keyframeKey} from "../../engine/keyframes.js";

function easedT(t, ease) {
    if (ease === "step") {
        return 0;
    }
    if (ease === "smoothstep") {
        return smoothstep(0, 1, t);
    }
    return t;
}

function valueFraction(value, min, max) {
    const range = max - min;
    return range === 0 ? 0.5 : 1 - (value - min) / range;
}

const CURVE_STEPS = 20;

const fmt = (n) => n.toFixed(2);

function easingPath(kf1, kf2, toPoint) {
    const ease = kf1.ease || "linear";
    const [x1, y1] = toPoint(kf1.time, kf1.value);
    const [x2, y2] = toPoint(kf2.time, kf2.value);
    if (ease === "step") {
        return `M ${fmt(x1)} ${fmt(y1)} H ${fmt(x2)} V ${fmt(y2)}`;
    }
    const steps = ease === "linear" ? 1 : CURVE_STEPS;
    const points = [];
    for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const x = x1 + (x2 - x1) * frac;
        const y = y1 + (y2 - y1) * easedT(frac, ease);
        points.push(`${fmt(x)} ${fmt(y)}`);
    }
    return `M ${points.join(' L ')}`;
}

/**
 * One SVG with the easing curves between the keyframes and the tail
 * after the last one. The viewBox is 0..100 in both directions and is
 * stretched over the strip, like the percent positions of the dots.
 */
function curveLines(lane, view, min, max) {
    const kfs = lane.keyframes;
    const span = view.end - view.start;
    if (kfs.length === 0 || span <= 0) {
        return "";
    }
    const toPoint = (time, value) => [
        (time - view.start) / span * 100,
        valueFraction(value, min, max) * 100,
    ];
    // Segments overlapping the view, also those spanning all of it.
    const easing = kfs.slice(0, -1)
        .map((kf, i) => [kf, kfs[i + 1]])
        .filter(([a, b]) => a.time <= view.end && b.time >= view.start)
        .map(([a, b]) => easingPath(a, b, toPoint))
        .join(" ");

    const last = kfs[kfs.length - 1];
    let tail = "";
    if (last.time < view.end) {
        const [x, y] = toPoint(last.time, last.value);
        tail = `M ${fmt(x)} ${fmt(y)} H 100`;
    }
    return `
        <svg class="curve-lines"
             viewBox="0 0 100 100"
             preserveAspectRatio="none"
             >
            <path class="easing-line"
                  d="${easing}"
                  />
            <path class="tail-line"
                  d="${tail}"
                  />
        </svg>`;
}

const TRACK_ACTIONS = [
    {action: ACTION.ADD_KEYFRAME, label: "+",
        title: "Add keyframe at current time"},
    {action: ACTION.RESCALE_LANE, label: CHAR.RESCALE,
        title: "Rescale time range"},
    {action: ACTION.COPY_LANE, label: CHAR.ARROW_PAIR_RIGHT,
        title: "Copy keyframes"},
    {action: ACTION.PASTE_LANE, label: CHAR.ARROW_PAIR_LEFT,
        title: "Paste keyframes"},
    {action: ACTION.CLEAR_LANE, label: CHAR.CLEAR,
        title: "Clear track keyframes", className: "btn icon danger"},
    {action: ACTION.DELETE_LANE, label: CHAR.TRASH,
        title: "Delete track", className: "btn icon danger"},
];

function knownTargetNames(provider) {
    const names = new Set(provider.getKnownUniformNames());
    for (const batch of provider.allBatches()) {
        names.add(batch.id);
    }
    return names;
}

/** One target row; target = null renders the empty "add" row. */
function targetRow(laneId, index, target, knownNames) {
    const data = dataAttrs({laneId, targetIdx: index});
    const name = target?.uniformName ?? "";
    const isValid = !name || knownNames.has(name);
    const checked = target && (!isValid || target.enabled);
    const disabled = target && !isValid && target.enabled;
    const removeButton =
        actionButton({
            action: ACTION.REMOVE_TARGET,
            label: CHAR.TIMES,
            className: "btn icon subtle",
            title: "Remove target",
            data: {laneId, targetIdx: index},
            style: !target ? "visibility:hidden" : "",
            disabled: !target,
        });
    return `
        <div class="${cls('target-row', !isValid && 'invalid-target')}">
            <input type="checkbox"
                   class="target-enable"
                   ${data}
                   ${checked ? 'checked' : ''}
                   ${disabled ? 'disabled' : ''}
                   title="Enable/disable">
            <input type="text"
                   class="field target-selector"
                   list="${DATALIST.UNIFORMS}"
                   placeholder="Uniform name"
                   value="${esc(name)}"
                   ${data}
                   spellcheck="false"
                   autocomplete="off">
            ${removeButton}
        </div>`;
}

function targetRows(lane, knownNames) {
    const rows = lane.targets.map((target, i) =>
        targetRow(lane.id, i, target, knownNames)
    );
    rows.push(targetRow(lane.id, lane.targets.length, null, knownNames));
    return rows.join("");
}

/** Pointer x on a keyframe strip as a fraction of its time axis. */
export function stripFraction(strip, clientX) {
    // The strip has an inset of half a font size on both sides.
    const inset = parseFloat(getComputedStyle(strip).fontSize) * 0.5;
    return pointerFraction(strip, clientX, inset);
}

function stripPosition(time, view) {
    return isInView(view, time)
        ? `left:${percentOfSpan(time - view.start, view.end - view.start)}`
        : "display:none";
}

function keyframeDots(lane, view, selectedKeyframes, min, max) {
    return lane.keyframes.map(kf => {
        if (!isInView(view, kf.time)) {
            return "";
        }
        const key = keyframeKey(lane.id, kf.id);
        const selected = selectedKeyframes.has(key);
        const title = [
            `t = ${kf.time.toFixed(1)}s`,
            `val = ${kf.value.toFixed(4)}`,
            kf.ease
        ].join("; ");

        return `
            <div class="${cls('keyframe-dot', selected && 'selected')}"
                 ${dataAttrs({laneId: lane.id, kfId: kf.id})}
                 style="${position(kf, view)}"
                 title="${esc(title)}"></div>`;
    }).join("");

    function position(kf, view) {
        const left = stripPosition(kf.time, view);
        const top = `top:${valuePosition(kf.value)}`;
        return `${left}; ${top}`;
    }

    function valuePosition(value) {
        const fraction = valueFraction(value, min, max);
        return `${clamp(fraction * 100, 0, 100).toFixed(1)}%`;
    }
}

function valueLine(target, min, max, currentValue) {
    if (!target || !target.uniformName) {
        return "";
    }
    const value = currentValue?.[target.uniformName];
    if (value === undefined || value === null) {
        return "";
    }
    if (max === min) {
        return "";
    }
    const fraction = valueFraction(value, min, max);
    const clamped = clamp(fraction, 0, 1);
    const topPercent = (clamped * 100).toFixed(1);
    const outside = clamped !== fraction;
    return `
        <div class="value-line ${outside && 'outside'}"
             ${dataAttrs({uniformName: target.uniformName})}
             style="top:${topPercent}%"
             title="${esc(target.uniformName)}">
        </div>`;
}

function keyframeStrip(lane, provider, view, selectedKeyframes) {
    const [min, max] = calcLaneValueRange(lane, provider);
    const playhead = stripPosition(provider.engine.currentTime, view);
    const values = provider.engine.getUniformBaseValues();
    const uniformLines = lane.targets
        .filter(t => t.uniformName)
        .map(t => valueLine(t, min, max, values))
        .join("");
    const keyframes = keyframeDots(lane, view, selectedKeyframes, min, max);
    const showHint = lane.keyframes.length === 0 ? "Click to set keyframe" : "";
    return `
        <div class="keyframe-strip"
             ${dataAttrs({laneId: lane.id})}
             title="${showHint}"
             >
            <div class="strip-bg"></div>
            ${curveLines(track, view, min, max)}
            ${keyframes}
            <div class="playhead"
                 style="${playhead}"></div>
            ${uniformLines}
            <span class="range-label max-label">${esc(max.toFixed(2))}</span>
            <span class="zero-marker">0</span>
            <span class="range-label min-label">${esc(min.toFixed(2))}</span>
        </div>
    `;
}

function laneActions(laneId) {
    return TRACK_ACTIONS
        .map(({className = "btn icon", ...button}) =>
            actionButton({...button, className, data: {laneId}})
        )
        .join("");
}

function laneColumns(
    lane, provider, view, knownNames, editingTrackId, selectedKeyframes
) {
    const data = {laneId: lane.id};
    const nameCol = editableName({
        isEditing: editingTrackId === lane.id,
        name: lane.name,
        data,
        labelClass: "lane-name",
        extra: actionButton({
            action: ACTION.CANCEL_LANE_NAME,
            label: CHAR.X_MARK,
            className: "btn subtle cancel-name",
            data,
        }),
    });
    return `
        <div class="lane-name-col">
            ${nameCol}
        </div>
        <div class="lane-targets-col">
            ${targetRows(lane, knownNames)}
        </div>
        <div class="lane-widget">
            ${keyframeStrip(lane, provider, view, selectedKeyframes)}
        </div>
        <div class="lane-actions-col">
            ${laneActions(lane.id)}
        </div>`;
}

function createLaneRow(lane, provider, knownNames, selectedTrackId,
                        editingTrackId, collapsedTrackIds, selectedKeyframes,
                        view) {
    const wrapper = document.createElement("div");
    wrapper.className = "lane-wrapper";
    wrapper.classList.toggle("selected", selectedTrackId === lane.id);
    wrapper.classList.toggle("collapsed", collapsedTrackIds.has(lane.id));
    wrapper.dataset.laneId = lane.id;
    wrapper.innerHTML = laneColumns(
        lane, provider, view, knownNames, editingTrackId,
        selectedKeyframes
    );
    return wrapper;
}

export function renderAllLanes(ui, provider, ...state) {
    const knownNames = knownTargetNames(provider);
    const rows = provider.engine.getAllLanes().map(lane =>
        createLaneRow(lane, provider, knownNames, ...state)
    );
    ui.laneRows.replaceChildren(...rows);
}

export function renderLane(ui, provider, laneId, ...state) {
    const lane = provider.engine.getLane(laneId);
    const row = ui.laneRows.querySelector(
        `.lane-wrapper[data-lane-id="${CSS.escape(laneId)}"]`
    );
    if (!lane || !row) {
        return false;
    }
    row.replaceWith(
        createLaneRow(lane, provider, knownTargetNames(provider), ...state)
    );
    return true;
}
