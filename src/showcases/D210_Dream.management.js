import {binarySearchInsert} from "../app/algorithms.js";

export function createEventsManager(state, events) {
    const scheduled = [];
    const manager = {
        queue: {
            immediate: [],
            scheduled,
        },
        events,
        launch: void 0,
        manage: void 0,
        flag: {
            debug: false,
        }
    };
    const schedule = (event) =>
        binarySearchInsert(event, scheduled, "timeSec");

    manager.launch = (event) => {
        /** This is the public callee.
         *  event can contain the fields {type, subtype, coords, args}
         *  from the actual struct, and for scheduling
         *  launch: {in? , at?} and expire: {in? , at?} in seconds each
         *  */
        event.timeSec = asScheduled(event.launch);
        if (event.timeSec > 0) {
            schedule(event);
        } else {
            manager.queue.immediate.push(event);
        }
        // FOR NOW
        manager.flag.debug = true;
    };

    const handle = (event) => {
        event.type ??= -1;
        event.members ??= [event.member];
        // <-- TODO: compare one day whether this line is needlessly unperformant
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

        if (manager.flag.debug && scheduled.length === 0) {
            console.info("[EVENT MANAGER] Schedule Empty.", manager.queue, manager.events);
            manager.flag.debug = false;
        }
    };

    return manager;
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

export function createGlyphInstanceManager(state, glyphs) {
    const manager = {
        glyphs,
        update: void 0,
        replacePhrase: void 0,
        debug: {}
    };

    manager.update = (event) => {
        // const members = event.members || (event.members = [event.member]);
        // // for (let m = 0; m < members.length; m++) {
        // //     members[m].update(event.data);
        // // }
        // // <-- class for loops are 2-4x faster than for...of -- worth it?
        // for (const member of members) {
        //     member.update(event.data);
        // }
        // if (event.expire) {
        //     schedule({
        //         ...event,
        //         data: { ...event.data, type: null },
        //         timeSec: asScheduled(event.expire, state.time),
        //         expire: null
        //     });
        // }
    };

    manager.replacePhrase = (text) => {
        const pixelUnit = 2 / state.glyphs.detailed.scaleH;
        const space = 0.667 * state.glyphs.detailed.size;
        const glyphs = state.glyphs.detailed.chars;

        manager.debug.glyph = [];
        manager.debug.advance = [];
        manager.debug.pos = [];
        manager.debug.pixelUnit = pixelUnit;

        let cursorX = -text.length * 0.1;
        let used = 0;
        for (let t = 0; t < text.length; t++) {
            if (text[t] === " ") {
                cursorX += space * pixelUnit;
                continue;
            }
            const ascii = text.charCodeAt(t);
            const glyph = glyphs[ascii];
            const scale = 0.7 + 0.6 * Math.random();
            const pos = [cursorX, (Math.random() - 0.5) / 10 - 0.8];
            state.glyphs.members[used].update({
                ascii,
                scale,
                pos,
                color: [0.5, 0, 0.7, 1],
                effect: [1, 2, 3, 4],
            });
            const advance = (glyphs[ascii].xadvance) * pixelUnit / scale;
            manager.debug.advance.push(advance);
            manager.debug.pos.push(pos);
            manager.debug.glyph.push(glyph);
            cursorX += advance;
            used++;
        }
        state.glyphs.meta.lettersUsed.update(used);
        console.info(`[GLYPH INSTANCES] replaced with "${text}".`, state.glyphs, manager.debug);
    };

    return manager;
}
