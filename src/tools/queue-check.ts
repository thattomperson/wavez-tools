import { playlists } from '../wavez/api';
import { opcheck } from '../wavez/opcheck';
import { getPlaylistQueue, trackArtist, trackLink, trackTitle } from '../wavez/tracks';
import { button, chip, message, setChip } from '../ui/components';
import { h } from '../ui/dom';
import type { ScreenContext, ScreenTool } from './types';

const CHECK_COUNT = 10;

// Opchecks the next few tracks, then offers to move the OP ones to the end of
// the playlist, keeping everything else in its current order.
export const queueCheck: ScreenTool = {
  kind: 'screen',
  name: 'Queue check',
  blurb: `Opcheck the next ${CHECK_COUNT}, move OP songs to the end`,
  glyph: 'Q',
  open: (ctx) => check(ctx),
};

async function check(ctx: ScreenContext): Promise<void> {
  const { body, setSubtitle, signal } = ctx;
  body.replaceChildren(message('Loading playlist…'));
  const { playlist, tracks, nextIndex } = await getPlaylistQueue();
  if (signal.aborted) return;
  const upcoming = tracks.slice(nextIndex, nextIndex + CHECK_COUNT);

  const bar = h('div');
  const rows = upcoming.map((track, i) => {
    const status = chip('Waiting', 'idle');
    const row = h(
      'li',
      { class: 'wt-track' },
      h('span', { class: 'wt-track-n' }, String(i + 1)),
      h(
        'span',
        { class: 'wt-track-text' },
        h('span', { class: 'wt-ellipsis' }, trackTitle(track)),
        h('span', { class: 'wt-ellipsis wt-muted' }, trackArtist(track)),
      ),
      status,
    );
    return { track, row, status };
  });
  const summary = h('span', { class: 'wt-grow wt-muted' });
  const recheck = button('Recheck', () => void check(ctx), { disabled: true });
  const move = button('Move to end', () => void moveToEnd(), { primary: true, disabled: true });
  body.replaceChildren(
    h('div', { class: 'wt-progress' }, bar),
    h('ol', { class: 'wt-tracks' }, ...rows.map((r) => r.row)),
    h('div', { class: 'wt-footer' }, summary, recheck, move),
  );

  const opIds = new Set<string>();
  const showSummary = () => {
    summary.className = opIds.size ? 'wt-grow wt-warn' : 'wt-grow wt-muted';
    summary.textContent = opIds.size ? `${opIds.size} overplayed` : 'None overplayed';
    move.textContent = `Move ${opIds.size} to end`;
  };

  for (const [i, { track, status }] of rows.entries()) {
    if (signal.aborted) return;
    setSubtitle(`${playlist.name} · checked ${i} of ${rows.length}`);
    setChip(status, 'Checking…', 'busy');
    try {
      const result = await opcheck(trackLink(track));
      if (result.op || result.blocked) opIds.add(track.id);
      if (result.blocked) setChip(status, 'Blocked', 'op');
      else setChip(status, result.op ? 'OP' : 'OK', result.op ? 'op' : 'ok');
      status.title = result.reason ?? '';
    } catch (err) {
      setChip(status, '?', 'err');
      status.title = err instanceof Error ? err.message : String(err);
    }
    bar.style.width = `${((i + 1) / rows.length) * 100}%`;
    if (opIds.size) showSummary();
  }
  if (signal.aborted) return;
  setSubtitle(`${playlist.name} · checked ${rows.length} of ${rows.length}`);
  showSummary();
  recheck.disabled = false;
  move.disabled = !opIds.size;

  async function moveToEnd() {
    move.disabled = recheck.disabled = true;
    summary.className = 'wt-grow wt-muted';
    summary.textContent = 'Moving…';
    try {
      const order = [...tracks.filter((t) => !opIds.has(t.id)), ...tracks.filter((t) => opIds.has(t.id))];
      await playlists.reorderTracks(playlist.id, order.map((t) => t.id));
      summary.className = 'wt-grow wt-muted';
      summary.textContent = `Moved ${opIds.size} to the end`;
      ctx.nextSong.refresh();
    } catch (err) {
      summary.className = 'wt-grow wt-error';
      summary.textContent = err instanceof Error ? err.message : String(err);
      move.disabled = false;
    }
    recheck.disabled = false;
  }
}
