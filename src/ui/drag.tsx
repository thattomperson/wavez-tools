// Lets a floating box (the panel, the call popup) be moved by a grip, by
// pointer or arrow keys, and remembers where it was left between runs.
import { h } from './dom';
import { icon } from './icons';

const KEY_STEP = 20;

export interface DragOptions {
  /** localStorage key for the position. */
  storageKey: string;
  /** The grip's accessible name. */
  label: string;
  /** Class for the grip button, styled by the box's own CSS. */
  gripClass: string;
  /** Class on the box while it's being dragged. */
  draggingClass: string;
  /** Which edge stays put: the panel grows down from its top, the call popup up from its bottom. */
  anchor: 'top' | 'bottom';
  /** How much of the box must stay on screen, in px. */
  minVisible: number;
  /** Called after each move, and after a reset. */
  onMove?(): void;
  /** Double-clicking the grip forgets the position and calls this to put the box back. */
  onReset?(): void;
}

// left, plus top or bottom depending on the anchor.
interface Position {
  left: number;
  y: number;
}

export interface Draggable {
  /** The grip element, for the header to show. */
  grip: HTMLButtonElement;
  /** Whether the box has been moved (now or in an earlier run). */
  placed(): boolean;
  dispose(): void;
}

export const PANEL_DRAG: DragOptions = {
  storageKey: 'wavez-tools:position',
  label: 'Move panel (drag, or use the arrow keys)',
  gripClass: 'wt-grip',
  draggingClass: 'wt-dragging',
  anchor: 'top',
  // Keep at least the header on screen.
  minVisible: 46,
};

export function makeDraggable(box: HTMLElement, opts: DragOptions = PANEL_DRAG): Draggable {
  const bottom = opts.anchor === 'bottom';
  let pos = loadPosition(opts.storageKey);

  const place = (next: Position) => {
    pos = {
      left: Math.round(clamp(next.left, 0, window.innerWidth - box.offsetWidth)),
      y: Math.round(clamp(next.y, 0, window.innerHeight - opts.minVisible)),
    };
    box.style.left = `${pos.left}px`;
    box.style.right = 'auto';
    box.style[bottom ? 'bottom' : 'top'] = `${pos.y}px`;
    box.style[bottom ? 'top' : 'bottom'] = 'auto';
    opts.onMove?.();
  };
  const current = (): Position => {
    const rect = box.getBoundingClientRect();
    return { left: rect.left, y: bottom ? window.innerHeight - rect.bottom : rect.top };
  };
  // The pointer's distance from the anchored edge of the window.
  const pointerY = (e: PointerEvent) => (bottom ? window.innerHeight - e.clientY : e.clientY);

  let offset: Position | null = null;
  const grip = (
    <button
      type="button"
      class={opts.gripClass}
      aria-label={opts.label}
      title={opts.onReset ? 'Drag to move, double-click to put it back' : 'Drag to move'}
      onpointerdown={(event) => {
        const e = event as PointerEvent;
        if (e.button !== 0) return;
        const { left, y } = current();
        offset = { left: e.clientX - left, y: pointerY(e) - y };
        grip.setPointerCapture(e.pointerId);
        box.classList.add(opts.draggingClass);
        e.preventDefault();
      }}
      onpointermove={(event) => {
        const e = event as PointerEvent;
        if (offset) place({ left: e.clientX - offset.left, y: pointerY(e) - offset.y });
      }}
      onpointerup={() => endDrag()}
      onpointercancel={() => endDrag()}
      ondblclick={() => {
        if (!opts.onReset) return;
        pos = null;
        clearPosition(opts.storageKey);
        opts.onReset();
      }}
      onkeydown={(event) => {
        const e = event as KeyboardEvent;
        const step = e.shiftKey ? KEY_STEP * 3 : KEY_STEP;
        const down = bottom ? -step : step;
        const moves: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -down],
          ArrowDown: [0, down],
        };
        const move = moves[e.key];
        if (!move) return;
        e.preventDefault();
        const { left, y } = current();
        place({ left: left + move[0], y: y + move[1] });
        if (pos) savePosition(opts.storageKey, pos);
      }}
    >
      {icon('grip')}
    </button>
  ) as HTMLButtonElement;

  function endDrag() {
    if (!offset) return;
    offset = null;
    box.classList.remove(opts.draggingClass);
    if (pos) savePosition(opts.storageKey, pos);
  }

  // Keep a remembered or dragged position on screen when the window shrinks.
  const onResize = () => {
    if (pos) place(pos);
  };
  window.addEventListener('resize', onResize);
  if (pos) requestAnimationFrame(() => pos && place(pos));

  return {
    grip,
    placed: () => pos !== null,
    dispose: () => window.removeEventListener('resize', onResize),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

// Older versions saved the panel as {left, top}; that still loads.
function loadPosition(key: string): Position | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    const y = value?.y ?? value?.top;
    return typeof value?.left === 'number' && typeof y === 'number' ? { left: value.left, y } : null;
  } catch {
    return null;
  }
}

function savePosition(key: string, pos: Position) {
  try {
    localStorage.setItem(key, JSON.stringify(pos));
  } catch {
    // Storage blocked: the position just won't be remembered.
  }
}

function clearPosition(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to forget.
  }
}
