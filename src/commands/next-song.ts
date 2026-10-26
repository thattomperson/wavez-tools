import { formatDuration } from '../lib/format';
import { getNextTrack, trackLink, trackName } from '../wavez/tracks';
import type { Command } from './types';

export const nextSong: Command = {
  label: 'Next song',
  async run({ show }) {
    const { playlist, track } = await getNextTrack();
    show([
      `Playlist: ${playlist.name}`,
      `Next: ${trackName(track)} [${formatDuration(track.durationMs)}]`,
      trackLink(track),
    ]);
  },
};
