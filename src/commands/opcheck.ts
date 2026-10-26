import { sendChat } from '../wavez/bridge';
import { getNextTrack, trackLink, trackName } from '../wavez/tracks';
import type { Command } from './types';

export const opcheckNextSong: Command = {
  label: 'Opcheck next song',
  async run({ show }) {
    const { playlist, track } = await getNextTrack();
    const message = `!opcheck ${trackLink(track)}`;
    sendChat(message);
    show([`Sent: ${message}`, `${trackName(track)} (${playlist.name})`]);
  },
};
