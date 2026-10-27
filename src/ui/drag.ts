// Lets the panel be moved by a grip in its header, by pointer or arrow keys,
// and remembers where it was left between runs.
import { h } from './dom';
import { icon } from './icons';

const STORAGE_KEY = 'wavez-tools:position';
const KEY_STEP = 20;
// Keep at least the header on screen.
const MIN_VISIBLE_HEIGHT = 46;

interface Position {
  left: number;
  top: number;
}

export interface Draggable {
  /** The grip element; the header re-appends it on every render. */
  grip: HTMLButtonElement;
  dispose(): void;
}

export function makeDraggable(panel: HTMLElement): Draggable {
  let pos = loadPosition();

  const place = (next: Position) => {
    pos = {
      left: Math.round(clamp(next.left, 0, window.innerWidth - panel.offsetWidth)),
      top: Math.round(clamp(next.top, 0, window.innerHeight - MIN_VISIBLE_HEIGHT)),
    };
    panel.style.left = `${pos.left}px`;
    panel.style.top = `${pos.top}px`;
    panel.style.right = 'auto';
  };
  const current = (): Position => {
    const rect = panel.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  };

  let offset: Position | null = null;
  const grip = h(
    'button',
    {
      type: 'button',
      class: 'wt-grip',
      'aria-label': 'Move panel (drag, or use the arrow keys)',
      title: 'Drag to move',
      onpointerdown: (event) => {
        const e = event as PointerEvent;
        if (e.button !== 0) return;
        const { left, top } = current();
        offset = { left: e.clientX - left, top: e.clientY - top };
        grip.setPointerCapture(e.pointerId);
        panel.classList.add('wt-dragging');
        e.preventDefault();
      },
      onpointermove: (event) => {
        const e = event as PointerEvent;
        if (offset) place({ left: e.clientX - offset.left, top: e.clientY - offset.top });
      },
      onpointerup: () => endDrag(),
      onpointercancel: () => endDrag(),
      onkeydown: (event) => {
        const e = event as KeyboardEvent;
        const step = e.shiftKey ? KEY_STEP * 3 : KEY_STEP;
        const moves: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const move = moves[e.key];
        if (!move) return;
        e.preventDefault();
        const { left, top } = current();
        place({ left: left + move[0], top: top + move[1] });
        if (pos) savePosition(pos);
      },
    },
    icon('grip'),
  );

  function endDrag() {
    if (!offset) return;
    offset = null;
    panel.classList.remove('wt-dragging');
    if (pos) savePosition(pos);
  }

  // Keep a remembered or dragged position on screen when the window shrinks.
  const onResize = () => {
    if (pos) place(pos);
  };
  window.addEventListener('resize', onResize);
  if (pos) requestAnimationFrame(() => pos && place(pos));

  return {
    grip,
    dispose: () => window.removeEventListener('resize', onResize),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

function loadPosition(): Position | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return typeof value?.left === 'number' && typeof value?.top === 'number' ? value : null;
  } catch {
    return null;
  }
}

function savePosition(pos: Position) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // Storage blocked: the position just won't be remembered.
  }
}
