/**
 * Audio track for the playground timeline.
 * Loads an audio file, decodes it, and renders its waveform.
 */

export class AudioTrack {
    /**
     * @param {string} id - Unique track ID
     * @param {string} name - Display name
     */
    constructor(id, name = 'Audio') {
        this.id = id;
        this.name = name;
        this.audioBuffer = null;
        this.sourceFile = null; // File object reference
        this.duration = 0;
        this.loading = false;
    }

    /**
     * Load and decode an audio file.
     * @param {File} file
     * @param {AudioContext} audioContext
     * @returns {Promise<AudioTrack>}
     */
    static async load(file, audioContext) {
        const id = `audio:${Date.now()}`;
        const track = new AudioTrack(id, file.name.replace(/\.[^.]+$/, ''));
        track.sourceFile = file;
        track.loading = true;

        try {
            const arrayBuffer = await file.arrayBuffer();
            track.audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            track.duration = track.audioBuffer.duration;
        } finally {
            track.loading = false;
        }

        return track;
    }

    /**
     * Get waveform data as a Float32Array (channel 0).
     * @returns {Float32Array|null}
     */
    getWaveformData() {
        if (!this.audioBuffer || !this.audioBuffer.length) {
            return null;
        }
        return this.audioBuffer.getChannelData(0);
    }

    /**
     * Serialize to JSON (does not include audio data).
     * @returns {object}
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            duration: this.duration,
            sourceFile: this.sourceFile?.name,
        };
    }

    /**
     * Restore from JSON (audio data must be reloaded separately).
     * @param {object} json
     * @returns {AudioTrack}
     */
    static fromJSON(json) {
        const track = new AudioTrack(json.id, json.name);
        track.duration = json.duration || 0;
        track.sourceFile = json.sourceFile ? { name: json.sourceFile } : null;
        return track;
    }
}
