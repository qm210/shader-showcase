import {binarySearchInsert} from "../app/algorithms.js";

export function createEventsManager(state, events) {
    const scheduled = [];
    const manager = {
        queue: {
            immediate: [],
            scheduled,
        },
        events,
        members: [],
        launch: void 0,
        manage: void 0,
        clear: void 0,
        flag: {
            debug: false,
            reset: false,
        }
    };
    const glyphManager = state.glyphs.manager;

    const schedule = (event) =>
        binarySearchInsert(event, scheduled, "timeSec");

    for (let m = 0; m < manager.events.opt.dataLength; m++) {
        manager.members[m] = manager.events.members[m];
    }

    manager.launch = (event) => {
        /** This is the public callee.
         *  event can contain the fields {type, subtype, coords, args}
         *  from the actual struct, and for scheduling
         *  launch: {in? , at?} and expire: {in? , at?} in seconds each
         *  */
        event.timeSec = asScheduled(event.launch, state.time);
        if (event.timeSec > 0) {
            schedule(event);
        } else {
            manager.queue.immediate.push(event);
        }
        // FOR NOW
        manager.flag.debug = true;
    };

    const handle = (event) => {
        if (event.member === events.SPECIAL_MEMBER.GLYPH_INSTANCES) {
            handleGlyphInstanceScript(event);
            return;
        }
        event.type ??= -1;
        event.members ??= [event.member];
        event.data.timeStart = state.time;
        for (const member of event.members) {
            member.update(event.data);
        }
        if (event.expire) {
            schedule({
                ...event,
                data: {...event.data, type: null},
                timeSec: asScheduled(event.expire, state.time),
                expire: null
            });
        }
    };

    manager.manage = (state) => {
        /** This is the public method for the render loop.
         *  The internal queue handling is done so that at this one manage() call,
         *  we can have somewhat of a synchronization for a short time.
         *  (other than that, events might get spawned via buttons, mouse, keyboard, etc...)
         *  */
        for (const event of manager.queue.immediate) {
            handle(event);
            console.info("[EVENT][IMMEDIATE] Handle", event, "Expire?", event.expire);
        }
        manager.queue.immediate.length = 0;

        while (scheduled.length > 0 && scheduled[0].timeSec <= state.time) {
            const event = scheduled.shift();
            handle(event);
            console.info("[EVENT][SCHEDULED] Handle", event);
        }

        // if (manager.flag.debug && scheduled.length === 0) {
        //     console.info("[EVENT MANAGER] Schedule Empty.", manager.queue, manager.events);
        //     manager.flag.debug = false;
        // }

        if (manager.flag.reset) {
            manager.queue.scheduled.length = 0;
            handle({
                members: manager.members,
                data: { type: -1 },
            });
            manager.flag.reset = false;
            console.info("[EVENT MANAGER] Cleared.", manager);
        }
    };

    manager.clear = () => {
        manager.flag.reset = true;
    }

    return manager;

    function handleGlyphInstanceScript(event) {
        // We quick-and-dirty merge the concepts of these two managers now
        glyphManager.setGlyphs(event.data);
    }
}

/**
 * @param {object=} [given] - Optional scheduling info
 * @param {number} [given.in] - Delay in seconds from "current" or "at"
 * @param {number} [given.at] - Absolute launch time (or reference for "in")
 * @param {object=} [current] - current time as reference for "in" (unless "at")
 * @returns {number} - absolutely scheduled time in seconds.
 */
function asScheduled(given, current) {
    if (!given) {
        return undefined;
    }
    return given.in
        ? (given.in + (given.at ?? current))
        : given.at;
}

export function createGlyphInstanceManager(state, instances) {
    const manager = {
        def: instances,
        instanceFields: Array(instances.opt.memberCount),
        setGlyphs: void 0,
        setSinglePhrase: void 0,
        debug: {}
    };

    for (let i = 0; i < instances.opt.memberCount; i++) {
        const instance = {};
        const member = instances.members[i];
        for (const [field, start, size] of instances.structFields) {
            instance[field] = member.view.subarray(start, start + size);
        }
        manager.instanceFields[i] = instance;
    }

    manager.setGlyphs = (data) => {
        let {text, fromIndex, posX, posY, scale, lettersUsed} = data;
        text ??= "";
        fromIndex ??= 0; // TODO: doesn't work completely yet (3 phrases -> only last shows all)
        posX ??= 0;
        posY ??= 0;
        scale ??= 1;

        const maxLength = manager.instanceFields.length - fromIndex;
        text = text.substring(0, maxLength);
        console.log("text?", fromIndex, text, data);

        const pixelUnit = 0.0067 * scale;
        const space = 0.667 * state.glyphs.detailed.size;
        const chars = state.glyphs.detailed.chars;

        manager.debug.glyph = [];
        manager.debug.advance = [];
        manager.debug.pos = [];
        manager.debug.pixelUnit = pixelUnit;

        let cursorX = -text.length * 0.11;
        let index = fromIndex;
        for (let t = 0; t < text.length; t++) {
            if (text[t] === " ") {
                cursorX += space * pixelUnit;
                continue;
            }
            const ascii = text.charCodeAt(t);
            const glyph = chars[ascii];
            // scale *= 1 + 0.6 * Math.random();
            const pos = [
                posX + cursorX,
                posY + (Math.random() - 0.5) / 15 - 0.2
            ];
            instances.members[index].update({
                ascii,
                scale,
                pos,
                color: [0, 0, 0, 1],
                glowColor: [0.5, 0, 0.7, 0.1],
                glowArgs: [1.9, 0.155, 11.2, 0.33],
                randAmp: [0.02, 0.2],
                randFreq: [0.1, 0.5],
                freeArgs: [1, 0, 0, 0]
            });
            const advance = (chars[ascii].xadvance) * pixelUnit / scale;
            manager.debug.advance.push(advance);
            manager.debug.pos.push(pos);
            manager.debug.glyph.push(glyph);
            cursorX += advance;
            index++;
        }
        state.glyphs.meta.lettersUsed.update(lettersUsed ?? index);
        instances.writeWhole();
        console.info("[GLYPH INSTANCES] setGlyphs():", data, state.glyphs, manager.debug, instances);
    };

    manager.setSinglePhrase = (text, remember = true) => {
        manager.setGlyphs({text});
        if (remember) {
            manager.lastPhrase = text;
        }
    };

    return manager;
}
