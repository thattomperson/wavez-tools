// A short record of what Auto-move OP songs checked and did, and which of your
// songs actually played, kept in localStorage so it survives a reload. Shown
// by `/wt automove log`, to work out after the fact why an OP song got played.
const STORAGE_KEY = 'wavez-tools:automove-log';
const KEEP = 150;
const SHOW = 30;

interface Entry {
  /** Milliseconds since the epoch. */
  t: number;
  text: string;
}

function load(): Entry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((e) => typeof e?.t === 'number' && typeof e?.text === 'string') : [];
  } catch {
    return [];
  }
}

export function logAutoMove(text: string): void {
  const entries = [...load(), { t: Date.now(), text }].slice(-KEEP);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage blocked: nothing to keep.
  }
}

export function showAutoMoveLog(): string[] {
  const entries = load().slice(-SHOW);
  if (!entries.length) return ['Auto-move log is empty.'];
  const time = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return entries.map((e) => `${time(e.t)} ${e.text}`);
}

export function clearAutoMoveLog(): string[] {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked.
  }
  return ['Auto-move log cleared.'];
}
