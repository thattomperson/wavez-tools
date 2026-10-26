export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '?';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
