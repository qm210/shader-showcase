import {TimelineEngine} from "./timeline-engine.js";
import STYLESHEET from './timeline-overlay.css?inline';

export class TimelineOverlay {
    constructor(timelineEngine) {
        this.engine = timelineEngine || new TimelineEngine();
        this.element = null;
        this.selectedKeyframe = null; // { trackId, kfIndex }
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.origLeft = 0;
        this.origTop = 0;
        this.init();
    }

    init() {
        // Inject CSS
        if (!document.getElementById('timeline-overlay-css')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'timeline-overlay-css';
            styleEl.textContent = STYLESHEET;
            document.head.appendChild(styleEl);
        }
        this.createDOM();
        this.bindEvents();
        this.render();
    }

    createDOM() {
        const overlay = document.createElement('div');
        overlay.id = 'timeline-overlay';
        overlay.innerHTML = `
               <div class="panel-header" data-drag-handle>
                   <span class="title">Timeline</span>
                   <button class="minimize-btn" title="Minimize">−</button>
               </div>
               <div class="timeline-controls">
                   <button class="play-btn" title="Play/Pause">▶</button>
                   <input type="range" class="time-slider" min="0" max="60" step="0.1" value="0">
                   <span class="time-display">0.0s</span>
                   <div class="speed-control">
                       <label>x</label>
                       <input type="number" class="speed-input" min="0.1" max="5" step="0.1" value="1.0">
                   </div>
               </div>
               <div class="track-list"></div>
               <div class="overlay-footer">
                   <button class="add-track-btn">+ Track</button>
                   <button class="export-btn">Export</button>
                   <button class="import-btn">Import</button>
               </div>
           `;

        this.element = overlay;
        document.body.appendChild(overlay);
    }

    bindEvents() {
        const overlay = this.element;

        // Dragging
        const dragHandle = overlay.querySelector('[data-drag-handle]');
        dragHandle.addEventListener('mousedown', (e) => {
            if (e.target.closest('.minimize-btn')) return;
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            const rect = overlay.getBoundingClientRect();
            this.origLeft = rect.left;
            this.origTop = rect.top;
            overlay.classList.add('dragging');
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            overlay.style.left = `${this.origLeft + e.clientX - this.dragStartX}px`;
            overlay.style.top = `${this.origTop + e.clientY - this.dragStartY}px`;
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            overlay.classList.remove('dragging');
        });

        // Minimize
        overlay.querySelector('.minimize-btn').addEventListener('click', () => {
            overlay.classList.toggle('collapsed');
        });

        // Play/Pause
        const playBtn = overlay.querySelector('.play-btn');
        playBtn.addEventListener('click', () => {
            this.engine.playing = !this.engine.playing;
            playBtn.textContent = this.engine.playing ? '⏸' : '▶';
            playBtn.classList.toggle('active', this.engine.playing);
        });

        // Time slider
        const timeSlider = overlay.querySelector('.time-slider');
        const timeDisplay = overlay.querySelector('.time-display');
        timeSlider.addEventListener('input', () => {
            this.engine.currentTime = parseFloat(timeSlider.value);
            timeDisplay.textContent = `${this.engine.currentTime.toFixed(1)}s`;
            this.render();
        });

        // Speed input
        const speedInput = overlay.querySelector('.speed-input');
        speedInput.addEventListener('change', () => {
            this.engine.speed = parseFloat(speedInput.value) || 1.0;
        });

        // Add track
        overlay.querySelector('.add-track-btn').addEventListener('click', () => {
            const name = prompt('Track name:', `Track ${this.engine.getAllTracks().length + 1}`);
            if (name) {
                this.engine.addTrack(name);
                this.render();
            }
        });

        // Export
        overlay.querySelector('.export-btn').addEventListener('click', () => {
            const json = JSON.stringify(this.engine.toJSON(), null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'timeline.json';
            a.click();
            URL.revokeObjectURL(url);
        });

        // Import
        overlay.querySelector('.import-btn').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const json = JSON.parse(ev.target.result);
                        this.engine = TimelineEngine.fromJSON(json);
                        this.syncUI();
                        this.render();
                    } catch (err) {
                        alert('Invalid timeline file: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });

        // Keyframe strip click to add keyframe
        overlay.addEventListener('click', (e) => {
            const dot = e.target.closest('.keyframe-dot');
            if (dot) {
                const trackId = dot.dataset.trackId;
                const kfIndex = parseInt(dot.dataset.kfIndex);
                this.selectedKeyframe = { trackId, kfIndex };
                this.render();
                return;
            }

            // Click on strip background to add keyframe
            const strip = e.target.closest('.keyframe-strip');
            if (strip && !e.target.closest('.keyframe-dot') && !e.target.closest('.playhead')) {
                const trackId = strip.dataset.trackId;
                const track = this.engine.getTrack(trackId);
                if (!track) return;

                const rect = strip.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const time = x * track.duration || 1.0;

                // Default value: first target's min or 0
                let defaultValue = 0;
                if (track.targets.length > 0 && track.targets[0].enabled) {
                    defaultValue = track.targets[0].minValue;
                }

                const value = prompt('Keyframe value:', String(defaultValue));
                if (value !== null) {
                    const numVal = parseFloat(value);
                    if (!isNaN(numVal)) {
                        track.addKeyframe(time, numVal);
                        this.render();
                    }
                }
            }
        });

        // Double-click keyframe to edit/remove
        overlay.addEventListener('dblclick', (e) => {
            const dot = e.target.closest('.keyframe-dot');
            if (dot) {
                const trackId = dot.dataset.trackId;
                const kfIndex = parseInt(dot.dataset.kfIndex);
                const track = this.engine.getTrack(trackId);
                if (!track || !track.keyframes[kfIndex]) return;

                const kf = track.keyframes[kfIndex];
                const newVal = prompt(`Edit keyframe at ${kf.time.toFixed(1)}s:`, String(kf.value));
                if (newVal !== null) {
                    const numVal = parseFloat(newVal);
                    if (!isNaN(numVal)) {
                        kf.value = numVal;
                        this.render();
                    }
                } else {
                    // Remove keyframe
                    track.removeKeyframe(kf.time);
                    this.render();
                }
            }
        });

        // Target enable/disable toggles
        overlay.addEventListener('change', (e) => {
            if (e.target.classList.contains('target-enable')) {
                const trackId = e.target.dataset.trackId;
                const targetIdx = parseInt(e.target.dataset.targetIdx);
                const track = this.engine.getTrack(trackId);
                if (track && track.targets[targetIdx]) {
                    track.targets[targetIdx].enabled = e.target.checked;
                    this.render();
                }
            }

            // Min/max inputs
            if (e.target.classList.contains('target-min') || e.target.classList.contains('target-max')) {
                const trackId = e.target.dataset.trackId;
                const targetIdx = parseInt(e.target.dataset.targetIdx);
                const track = this.engine.getTrack(trackId);
                if (track && track.targets[targetIdx]) {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                        if (e.target.classList.contains('target-min')) {
                            track.targets[targetIdx].minValue = val;
                        } else {
                            track.targets[targetIdx].maxValue = val;
                        }
                        // Re-clamp existing keyframes
                        for (const kf of track.keyframes) {
                            if (Array.isArray(kf.value)) {
                                kf.value[targetIdx] = Math.max(
                                    track.targets[targetIdx].minValue,
                                    Math.min(track.targets[targetIdx].maxValue, kf.value[targetIdx])
                                );
                            }
                        }
                    }
                }
            }
        });

        // Target name editing (click to rename)
        overlay.addEventListener('dblclick', (e) => {
            if (e.target.classList.contains('target-name')) {
                const trackId = e.target.dataset.trackId;
                const targetIdx = parseInt(e.target.dataset.targetIdx);
                const track = this.engine.getTrack(trackId);
                if (track && track.targets[targetIdx]) {
                    const newName = prompt('Uniform name:', track.targets[targetIdx].uniformName);
                    if (newName && newName.trim()) {
                        const oldName = track.targets[targetIdx].uniformName;
                        track.targets[targetIdx].uniformName = newName.trim();
                        this.render();
                    }
                }
            }
        });

        // Track header click to expand/collapse
        overlay.addEventListener('click', (e) => {
            const header = e.target.closest('.track-header');
            if (header) {
                const trackItem = header.closest('.track-item');
                trackItem.classList.toggle('expanded');
            }
        });

        // Track delete button
        overlay.addEventListener('click', (e) => {
            if (e.target.classList.contains('track-delete')) {
                const trackId = e.target.dataset.trackId;
                if (confirm('Delete this track?')) {
                    this.engine.removeTrack(trackId);
                    this.render();
                }
            }
        });

        // Add target button in track
        overlay.addEventListener('click', (e) => {
            if (e.target.classList.contains('add-target-btn')) {
                const trackId = e.target.dataset.trackId;
                const track = this.engine.getTrack(trackId);
                if (!track) return;

                const name = prompt('Uniform name:', '');
                if (name && name.trim()) {
                    track.addTarget(name.trim(), -1, 1);
                    this.render();
                }
            }
        });

        // Remove target button
        overlay.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-target-btn')) {
                const trackId = e.target.dataset.trackId;
                const targetIdx = parseInt(e.target.dataset.targetIdx);
                const track = this.engine.getTrack(trackId);
                if (track) {
                    track.removeTarget(track.targets[targetIdx].uniformName);
                    this.render();
                }
            }
        });

        // Transition change
        overlay.addEventListener('change', (e) => {
            if (e.target.classList.contains('transition-select')) {
                const trackId = e.target.dataset.trackId;
                const kfIndex = parseInt(e.target.dataset.kfIndex);
                const track = this.engine.getTrack(trackId);
                if (track && track.keyframes[kfIndex]) {
                    track.keyframes[kfIndex].transition = e.target.value;
                    this.render();
                }
            }
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.target.closest('input')) {
                e.preventDefault();
                this.engine.playing = !this.engine.playing;
                const playBtn = overlay.querySelector('.play-btn');
                playBtn.textContent = this.engine.playing ? '⏸' : '▶';
                playBtn.classList.toggle('active', this.engine.playing);
            }
            if (e.code === 'Delete' && this.selectedKeyframe) {
                const track = this.engine.getTrack(this.selectedKeyframe.trackId);
                if (track && track.keyframes[this.selectedKeyframe.kfIndex]) {
                    track.removeKeyframe(track.keyframes[this.selectedKeyframe.kfIndex].time);
                    this.selectedKeyframe = null;
                    this.render();
                }
            }
        });
    }

    syncUI() {
        const slider = this.element.querySelector('.time-slider');
        const display = this.element.querySelector('.time-display');
        const speedInput = this.element.querySelector('.speed-input');
        const playBtn = this.element.querySelector('.play-btn');

        slider.max = Math.max(60, ...this.engine.getAllTracks().map(t => t.duration) || [60]);
        slider.value = this.engine.currentTime;
        display.textContent = `${this.engine.currentTime.toFixed(1)}s`;
        speedInput.value = this.engine.speed;
        playBtn.textContent = this.engine.playing ? '⏸' : '▶';
        playBtn.classList.toggle('active', this.engine.playing);
    }

    render() {
        const trackList = this.element.querySelector('.track-list');
        const slider = this.element.querySelector('.time-slider');
        const display = this.element.querySelector('.time-display');
        const tracks = this.engine.getAllTracks();

        // Update time display
        slider.value = this.engine.currentTime;
        display.textContent = `${this.engine.currentTime.toFixed(1)}s`;

        // Render tracks
        trackList.innerHTML = '';

        for (const track of tracks) {
            const trackEl = document.createElement('div');
            trackEl.className = 'track-item expanded';
            trackEl.dataset.trackId = track.id;

            // Track header
            const header = document.createElement('div');
            header.className = 'track-header';
            header.innerHTML = `
                   <span class="track-name">${track.name}</span>
                   <div class="track-toggle ${track.targets.some(t => t.enabled) ? 'active' : ''}" data-track-id="${track.id}"></div>
               `;

            // Track body
            const body = document.createElement('div');
            body.className = 'track-body';

            // Targets
            for (let i = 0; i < track.targets.length; i++) {
                const target = track.targets[i];
                const targetRow = document.createElement('div');
                targetRow.className = 'target-row';
                targetRow.innerHTML = `
                       <span class="target-name" data-track-id="${track.id}" data-target-idx="${i}" title="Double-click to rename">${target.uniformName}</span>
                       <div class="target-inputs">
                           <input type="number" class="target-min" data-track-id="${track.id}" data-target-idx="${i}" value="${target.minValue}" step="0.01" title="Min value">
                           <span style="opacity:0.4">→</span>
                           <input type="number" class="target-max" data-track-id="${track.id}" data-target-idx="${i}" value="${target.maxValue}" step="0.01" title="Max value">
                       </div>
                       <input type="checkbox" class="target-enable" data-track-id="${track.id}" data-target-idx="${i}" ${target.enabled ? 'checked' : ''} title="Enable/disable">
                       <button class="remove-target-btn" data-track-id="${track.id}" data-target-idx="${i}" style="padding:2px 4px;font-size:9px;opacity:0.5;" title="Remove">×</button>
                   `;
                body.appendChild(targetRow);
            }

            // Add target button
            const addTargetBtn = document.createElement('button');
            addTargetBtn.className = 'add-target-btn';
            addTargetBtn.dataset.trackId = track.id;
            addTargetBtn.textContent = '+ Target';
            body.appendChild(addTargetBtn);

            // Keyframe strip
            if (track.keyframes.length > 0) {
                const strip = document.createElement('div');
                strip.className = 'keyframe-strip';
                strip.dataset.trackId = track.id;

                const bg = document.createElement('div');
                bg.className = 'strip-bg';
                strip.appendChild(bg);

                // Keyframe dots
                for (let i = 0; i < track.keyframes.length; i++) {
                    const kf = track.keyframes[i];
                    const dot = document.createElement('div');
                    dot.className = 'keyframe-dot' + (this.selectedKeyframe && this.selectedKeyframe.trackId === track.id && this.selectedKeyframe.kfIndex === i ? ' selected' : '');
                    dot.dataset.trackId = track.id;
                    dot.dataset.kfIndex = i;
                    dot.style.left = `${(kf.time / (track.duration || 1)) * 100}%`;
                    dot.title = `t=${kf.time.toFixed(1)}s, val=${kf.value}, ${kf.transition}`;
                    strip.appendChild(dot);

                    // Transition selector on hover (we'll add it via a separate element)
                }

                // Playhead
                const playhead = document.createElement('div');
                playhead.className = 'playhead';
                playhead.style.left = `${(this.engine.currentTime / (track.duration || 1)) * 100}%`;
                strip.appendChild(playhead);

                body.appendChild(strip);

                // Track actions
                const actions = document.createElement('div');
                actions.className = 'track-actions';
                actions.innerHTML = `
                       <button class="add-kf-btn" data-track-id="${track.id}" style="flex:1;">+ Keyframe</button>
                       <button class="track-delete" data-track-id="${track.id}" style="flex:0.5;" title="Delete track">×</button>
                   `;

                // Add keyframe button
                actions.querySelector('.add-kf-btn').addEventListener('click', () => {
                    const time = parseFloat(slider.value) || 0;
                    let defaultVal = 0;
                    if (track.targets.length > 0 && track.targets[0].enabled) {
                        defaultVal = track.targets[0].minValue;
                    }
                    const val = prompt(`Keyframe value at ${time.toFixed(1)}s:`, String(defaultVal));
                    if (val !== null) {
                        const numVal = parseFloat(val);
                        if (!isNaN(numVal)) {
                            track.addKeyframe(time, numVal);
                            this.render();
                        }
                    }
                });

                body.appendChild(actions);
            }

            trackEl.appendChild(header);
            trackEl.appendChild(body);
            trackList.appendChild(trackEl);
        }

        // Value preview at bottom
        let preview = trackList.parentElement.querySelector('.value-preview');
        if (!preview) {
            preview = document.createElement('div');
            preview.className = 'value-preview';
            trackList.after(preview);
        }

        const values = this.engine.getAllUniformValues();
        const lines = Object.entries(values).map(([name, val]) => {
            const displayVal = Array.isArray(val) ? `[${val.map(v => v.toFixed(3)).join(', ')}]` : val.toFixed(4);
            return `<div class="val-line"><span class="val-name">${name}</span><span class="val-num">${displayVal}</span></div>`;
        });
        preview.innerHTML = lines.length > 0 ? lines.join('') : '<div style="opacity:0.4">No active tracks</div>';
    }

    /** Get current uniform values for shader binding */
    getUniformValues() {
        return this.engine.getAllUniformValues();
    }

    /** Update engine time by delta (call from render loop) */
    update(dt) {
        this.engine.update(dt);
        // Periodically re-render to update playhead and value preview
        if (this.engine.playing && Math.random() < 0.3) {
            this.render();
        }
    }

    /** Helper: bind all current values to WebGL state */
    syncToShader(gl, state) {
        const values = this.getUniformValues();
        for (const [name, value] of Object.entries(values)) {
            const loc = state.location[name];
            if (loc === undefined) continue;

            // Get uniform type from WebGL
            const info = gl.getActiveUniform(state.program, loc);
            if (!info) continue;

            if (info.type === gl.FLOAT) {
                gl.uniform1f(loc, value);
            } else if (info.type === gl.FLOAT_VEC2) {
                gl.uniform2fv(loc, value);
            } else if (info.type === gl.FLOAT_VEC3) {
                gl.uniform3fv(loc, value);
            } else if (info.type === gl.FLOAT_VEC4) {
                gl.uniform4fv(loc, value);
            } else if (info.type === gl.INT) {
                gl.uniform1i(loc, value);
            } else if (info.type === gl.INT_VEC2) {
                gl.uniform2iv(loc, value);
            } else if (info.type === gl.INT_VEC3) {
                gl.uniform3iv(loc, value);
            } else if (info.type === gl.INT_VEC4) {
                gl.uniform4iv(loc, value);
            }
        }
    }

    /** Show/hide the overlay */
    setVisible(visible) {
        this.element.style.display = visible ? 'flex' : 'none';
    }

    /** Toggle visibility */
    toggle() {
        this.setVisible(!this.element.hidden);
    }
}

// ─── Singleton instance (optional convenience) ──────────────────

let _instance = null;

export function getTimelineOverlay(engine) {
    if (!_instance || _instance.engine !== engine) {
        _instance = new TimelineOverlay(engine);
    }
    return _instance;
}
