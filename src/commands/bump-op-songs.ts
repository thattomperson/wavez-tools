import { playlists } from '../wavez/api';
import { opcheck } from '../wavez/opcheck';
import { getPlaylistQueue, trackLink, trackName } from '../wavez/tracks';
import type { Command } from './types';

const CHECK_COUNT = 10;

// Opchecks the next few tracks and moves any that are OP to the end of the
// playlist, keeping everything else in its current order.
export const bumpOpSongs: Command = {
  label: 'Move OP songs to end',
  async run({ show }) {
    const { playlist, tracks, nextIndex } = await getPlaylistQueue();
    const upcoming = tracks.slice(nextIndex, nextIndex + CHECK_COUNT);
    const lines: string[] = [];
    const opIds = new Set<string>();

    for (const [i, track] of upcoming.entries()) {
      show([...lines, `Checking ${i + 1}/${upcoming.length}: ${trackName(track)}…`]);
      try {
        const result = await opcheck(trackLink(track));
        if (result.op) opIds.add(track.id);
        lines.push(`${result.op ? 'OP ' : 'ok '} ${trackName(track)}`);
      } catch (err) {
        lines.push(`?   ${trackName(track)} (${err instanceof Error ? err.message : err})`);
      }
    }

    if (!opIds.size) {
      show([...lines, '', `No OP songs in the next ${upcoming.length}.`]);
      return;
    }

    const order = [...tracks.filter((t) => !opIds.has(t.id)), ...tracks.filter((t) => opIds.has(t.id))];
    show([...lines, '', `Moving ${opIds.size} to the end of ${playlist.name}…`]);
    await playlists.reorderTracks(playlist.id, order.map((t) => t.id));
    show([...lines, '', `Moved ${opIds.size} OP song${opIds.size === 1 ? '' : 's'} to the end of ${playlist.name}.`]);
  },
};
