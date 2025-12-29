import {binarySearchRight, binarySearchInsert, binarySearchLeft} from "./algorithms.js";

const Interpolation = {
    Linear: "linear",
    Step: "step",
    Smoothstep: "smoothstep",
    Staircase: "quantized",
    Ease2In: "quad-ease-in",
    Ease2Out: "quad-ease-out",
    Ease2InOut: "quad-ease-inout",
    Ease3In: "cubic-ease-in",
    Ease3Out: "cubic-ease-out",
    Ease3InOut: "cubic-ease-inout",
    EaseSineIn: "sine-ease-in",
    EaseSineOut: "sine-ease-out",
    EaseSineInOut: "sine-ease-inout",
    Elastic: "elastic",
    CatmullRom: "catmull-rom"
};

export class UniformAutomationizer {

    constructor(state) {
        this.state = state;
        this.barSec = 240 / this.state.play.sync.bpm;
        if (!isFinite(this.barSec)) {
            console.error("UniformAutomationizer needs to know BPM!");
        }
        // TODO: move uniform management here -> after Dream210, obvy
        this.uniforms = {};
        this.values = {};
        this.automations = {};
        // this.hasChanged = new Set();
        // just in case of debug-deschmug...
        this.updatedAt = null;
    }

    update() {
        // call this at the top of the render loop
        const s = this.state;
        this.updatedAt = s.time;

        for (const uniformName of Object.keys(this.automations)) {
            const value = this.evaluate(uniformName, s.time);
            if (value !== this.values[uniformName]) {
                this.values[uniformName] = value;
                s[uniformName] = value;
                // this.hasChanged.add(uniformName);
            }
        }
    }

    // Keyframe: {time / bar, value, interpolation, arg / controlValue (für gewisse Interpolationen), label (nur zur Übersicht)}
    addKeyFrame(uniformName, ...keyframes) {
        const automation = this.automations[uniformName] ?? [];
        for (const keyframe of keyframes) {
            if (keyframe.bar !== undefined) {
                keyframe.time = this.barSec * keyframe.bar;
            }
            binarySearchInsert(keyframe, automation, "time");
        }
        this.automations[uniformName] = automation;

        console.log("[AUTOMATIONS]", this.automations);
    }

    removeKeyFrame(uniformName, time) {
        const epsilon = 0.001;
        this.automations[uniformName] = (this.automations[uniformName] ?? 0)
            .filter(keyframe => Math.abs(keyframe.time - time) > epsilon);
    }

    evaluate(uniformName, time) {
        const automation = this.automations[uniformName];
        if (!automation) {
            return this.defaultValue(uniformName);
        }
        if (time < automation[0].time) {
            return this.defaultValue(uniformName);
        }
        const nFrames = automation.length;
        const lastFrame = automation[nFrames - 1];
        if (time > lastFrame.time || nFrames < 2) {
            return lastFrame.value;
        }
        const startIndex = binarySearchLeft(time, automation, "time");
        const startFrame = automation[startIndex];
        const segment = {
            startFrame,
            endFrame: automation[startIndex + 1] ?? startFrame,
            interpolation: startFrame.interpolation,
            startControlFrame: null,
            endControlFrame: null,
        };
        if (segment.interpolation === Interpolation.CatmullRom) {
            segment.startControlFrame = automation[startIndex - 1] ?? startFrame;
            segment.endControlFrame = automation[startIndex + 2] ?? segment.endFrame;
        }
        return this.interpolateValue(time, segment);
    }

    interpolateValue(time, {startFrame, endFrame, interpolation}) {
        const deltaTime = endFrame.time - startFrame.time;
        const deltaValue = endFrame.value - startFrame.value;
        let t = (time - startFrame.time) / deltaTime;
        switch (interpolation) {
            case undefined:
            case Interpolation.Linear:
                break;
            case Interpolation.Step:
                t = 0;
                break;
            case Interpolation.Smoothstep:
                t = t * t * (3 - 2 * t);
                break;
            case Interpolation.Staircase:
                const n = startFrame.interpolationArg;
                t = Math.floor(t * n) / n;
                break;
            case Interpolation.Ease2In:
                t = t * t;
                break;
            case Interpolation.Ease2Out:
                t = t * (2 - t);
                break;
            case Interpolation.Ease2InOut:
                if (t < 0.5) {
                    t = 2 * t * t;
                }  else {
                    t = (4 - 2 * t) * t - 1;
                }
                break;
            case Interpolation.Ease3In:
                t = t * t * t;
                break;
            case Interpolation.Ease3Out:
                t = (t - 1) * (t - 1) * (t - 1) + 1;
                break;
            case Interpolation.Ease3InOut:
                if (t < 0.5) {
                    t = 4 * t * t * t;
                } else {
                    t = (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
                }
                break;
            case Interpolation.EaseSineIn:
                t = 1 - Math.cos(t * Math.PI / 2);
                break;
            case Interpolation.EaseSineOut:
                t = Math.sin(t * Math.PI / 2);
                break;
            case interpolation.EaseSineInOut:
                t = -(Math.cos(Math.PI * t) - 1) / 2;
            case Interpolation.Elastic:
                const omega = startFrame.interpolationArg;
                t = 1 - (1 - t) * (1 - t) * (
                    2 * Math.sin(omega * t) / omega + Math.cos(omega * t)
                );
                break;
            case Interpolation.CatmullRom:
                return this.evaluateCatmullRom(segment, t);
                
        }
        return startFrame.value + t * deltaValue;
    }

    defaultValue(uniformName) {
        const uniform = this.uniforms[uniformName];
        return uniform?.defaultValue ?? 0;
    }

    evaluateCatmullRom(segment, t) {
        const v0 = segment.startControlFrame.value;
        const v1 = segment.startFrame.value;
        const v2 = segment.endFrame.value;
        const v3 = segment.endControlFrame.value;
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * (
            2 * v1
            + (-v0 + v2) * t
            + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2
            + (-v0 + 3 * v1 - 3 * v2 + v3) * t3
        );
    }
}