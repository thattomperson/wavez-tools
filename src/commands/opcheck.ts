import { describeOpcheck, opcheck } from '../wavez/opcheck';
import { getNextTrack, trackLink, trackName } from '../wavez/tracks';
import type { Command } from './types';

export const opcheckNextSong: Command = {
  label: 'Opcheck next song',
  async run({ show }) {
    const { playlist, track } = await getNextTrack();
    const link = trackLink(track);
    show([`Checking ${trackName(track)} (${playlist.name})…`]);
    const result = await opcheck(link);
    show([trackName(track), link, ...describeOpcheck(result)]);
  },
};
