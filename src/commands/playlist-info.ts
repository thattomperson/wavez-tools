import { formatDuration } from '../lib/format';
import { getActivePlaylist, getTracks } from '../wavez/api';
import { trackName } from '../wavez/tracks';
import type { Command } from './types';

const PREVIEW_COUNT = 5;

export const playlistInfo: Command = {
  label: 'Playlist info',
  async run({ show }) {
    const playlist = await getActivePlaylist();
    const tracks = await getTracks(playlist.id);
    const total = tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
    show([
      `${playlist.name}: ${tracks.length} tracks, ${formatDuration(total)}`,
      ...tracks.slice(0, PREVIEW_COUNT).map((t, i) => `${i + 1}. ${trackName(t)}`),
    ]);
  },
};
