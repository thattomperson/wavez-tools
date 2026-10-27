import { OPCHECK_BOT } from '../config';
import { parseJsonReply, sendBotCommand } from '../wavez/bot';
import { getNextTrack, trackLink, trackName } from '../wavez/tracks';
import type { Command } from './types';

interface OpcheckResult {
  cmd: 'opcheck';
  link: string;
  trackId: string | null;
  title: string | null;
  op: boolean;
  reason: string | null;
  blocked: boolean;
  plays: { all: number; day: number; week: number; month: number };
  lastPlayed: string | null;
  label: string | null;
}

export const opcheckNextSong: Command = {
  label: 'Opcheck next song',
  async run({ show }) {
    const { playlist, track } = await getNextTrack();
    const link = trackLink(track);
    show([`Checking ${trackName(track)} (${playlist.name})…`]);

    const reply = await sendBotCommand(OPCHECK_BOT.botUserId, `${OPCHECK_BOT.commandPrefix} opcheck ${link}`);
    const result = parseJsonReply<OpcheckResult>(reply.content);
    if (!result) {
      show([trackName(track), link, `Bot: ${reply.content}`]);
      return;
    }

    const { plays } = result;
    show([
      trackName(track),
      link,
      `OP: ${result.op ? 'yes' : 'no'}${result.blocked ? ', BLOCKED' : ''}${result.reason ? ` (${result.reason})` : ''}`,
      result.label && `Label: ${result.label}`,
      `Plays: ${plays.day} today, ${plays.week} this week, ${plays.month} this month, ${plays.all} total`,
      `Last played: ${result.lastPlayed ? new Date(result.lastPlayed).toLocaleString() : 'never'}`,
    ]);
  },
};
