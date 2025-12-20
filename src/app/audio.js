
export function initAudioState(state, audioSource) {
    const audio = new Audio(audioSource);
    const track = {
        audio,
        durationSec: null,
        stopped: true,
        disabled: !audioSource,
        useAsTimer: !!audioSource,
        error: null,
        actions: {}
    };
    audio.onloadedmetadata = () => {
        track.durationSec = audio.duration;
    };
    audio.onerror = (error)=> {
        track.disabled = true;
        track.error = error;
    };
    audio.onabort = () => {
        track.disabled = true;
    }
    // Loads of Convenience, vor allem eigentlich zur Selbstdokumentation :)
    track.actions = {
        playWhenReady: async () => {
            await waitForReadyState(track.audio);
            audio.stopped = false;
            return audio.play();
        },
        pause: audio.pause,
        seek: (second = undefined) => {
            second ??= state.time;
            audio.currentTime = second;
        },
        stop: () => {
            audio.pause();
            track.actions.seek(0);
            audio.stopped = true;
        },
        isReadyToPlay: () =>
            track.audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA,
            // cf. developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState
        isPlaying: () => !audio.paused,
        togglePlay: async (force = undefined) => {
            if (audio.paused || force) {
                await audio.play().catch((err) =>
                    console.warn("[AUDIO BLOCKED]", err)
                );
            } else {
                audio.pause();
            }
        },
        toggleLoop: (force = undefined) => {
            audio.loop = force === undefined
                ? !audio.loop
                : force;
            console.log("[AUDIO] Now Looping", audio.loop ? "is" : "isn't");
        },
        toggleMuted: (force = undefined) => {
            audio.muted = force === undefined
                ? !audio.muted
                : force;
            console.log("[AUDIO] Now Muted", audio.muted ? "is" : "isn't");
        },
        toggleDisabled: (force = undefined) => {
            track.disabled = force === undefined
                ? track.disabled
                : force;
            console.log("[AUDIO] Now Disabled", track.disabled ? "is" : "isn't");
        },
        askForPlayInAdvance: async () => {
            await track.audio.play();
            if (track.stopped) {
                track.actions.stop();
            }
        }
    };
    console.log("[AUDIO]", track);
    state.track = track;
}

async function waitForReadyState(audio, timeoutMs = 5000) {
    return Promise.race([
        new Promise(resolve => {
            if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                return resolve();
            }
            const onLoaded = () => {
                audio.removeEventListener("loadeddata", onLoaded);
                resolve();
            };
            audio.addEventListener("loadedmetadata", onLoaded);
        }),
        new Promise(resolve => {
            const check = () => {
                if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                    resolve();
                } else {
                    requestAnimationFrame(check);
                }
            }
            check();
        }),
        new Promise((_, reject) =>
            setTimeout(() =>
                reject(`ReadyState Timeout >= ${timeoutMs}ms`),
                timeoutMs
            )
        )
    ]);
}
