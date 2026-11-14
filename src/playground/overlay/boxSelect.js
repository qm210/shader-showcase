// Shift+drag rectangle selection of keyframe dots.

const MIN_VISIBLE_SIZE = 5;
const RECT_STYLE = [
    'position:absolute',
    'border:1px dashed rgba(120,200,255,0.7)',
    'background:rgba(120,200,255,0.1)',
    'pointer-events:none',
    'display:none',
    'z-index:50',
].join(';');

const keyOf = (dot) => `${dot.dataset.trackId}:${dot.dataset.kfIndex}`;

export class KeyframeBoxSelect {
    /** onSelect({trackId, kfIndex}) receives the first dot in the box. */
    constructor(root, onSelect) {
        this.onSelect = onSelect;
        this.active = false;
        this.start = null;
        this.selected = new Set();

        this.rect = document.createElement('div');
        this.rect.className = 'shift-drag-rect';
        this.rect.style.cssText = RECT_STYLE;
        document.body.append(this.rect);

        root.addEventListener('mousedown', (e) => this._begin(e));
        window.addEventListener('mousemove', (e) => this._move(e));
        window.addEventListener('mouseup', () => this._end());
    }

    _begin(e) {
        if (!e.shiftKey || !e.target.closest('.keyframe-strip')) {
            return;
        }
        this.active = true;
        this.start = {x: e.clientX, y: e.clientY};
        this.selected.clear();
        this.rect.style.display = 'none';
    }

    _move(e) {
        if (!this.active) {
            return;
        }
        const box = {
            x: Math.min(this.start.x, e.clientX),
            y: Math.min(this.start.y, e.clientY),
            w: Math.abs(e.clientX - this.start.x),
            h: Math.abs(e.clientY - this.start.y),
        };
        Object.assign(this.rect.style, {
            left: `${box.x}px`,
            top: `${box.y}px`,
            width: `${box.w}px`,
            height: `${box.h}px`,
            display: Math.max(box.w, box.h) > MIN_VISIBLE_SIZE ? '' : 'none',
        });

        this.selected.clear();
        for (const dot of document.querySelectorAll('.keyframe-dot')) {
            const inside = this._contains(box, dot.getBoundingClientRect());
            dot.classList.toggle('shift-selected', inside);
            if (inside) {
                this.selected.add(keyOf(dot));
            }
        }
    }

    _contains(box, r) {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        return cx >= box.x && cx <= box.x + box.w
            && cy >= box.y && cy <= box.y + box.h;
    }

    _end() {
        if (!this.active) {
            return;
        }
        this.active = false;
        this.start = null;
        this.rect.style.display = 'none';
        document.querySelectorAll('.keyframe-dot.shift-selected')
            .forEach(dot => dot.classList.remove('shift-selected'));

        const [first] = this.selected;
        this.selected.clear();
        if (first) {
            const [trackId, kfIndex] = first.split(':');
            this.onSelect({trackId, kfIndex: parseInt(kfIndex, 10)});
        } else {
            this.onSelect(null);
        }
    }
}
