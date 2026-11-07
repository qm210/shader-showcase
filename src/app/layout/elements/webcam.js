export const addVideoElement = (elements, state) => {
    elements.video = document.createElement("video");
    elements.video.autoplay = true;
    elements.video.muted = true;
    elements.video.playsinline = true;
    elements.video.hidden = true;
    elements.canvasFrame.appendChild(elements.video);

    state.videoInput = null;
    elements.video.initialize = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });
        elements.video.srcObject = stream;
        await new Promise((resolve) => {
            elements.video.onloadedmetadata = resolve;
        });
        try {
            await elements.video.play();
            state.videoInput = elements.video;
            console.log("[VIDEO]", stream, elements.video);
        } catch (err) {
            console.warn("[VIDEO] Failed", err);
            state.videoInput = null;
        }
    };
};
