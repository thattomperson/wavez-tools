// Asks the room bot whether a track is overplayed ("OP").
import { OPCHECK_BOT } from '../config';
import { parseJsonReply, sendBotCommand } from './bot';

export interface OpcheckResult {
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

export async function opcheck(link: string): Promise<OpcheckResult> {
  const reply = await sendBotCommand(OPCHECK_BOT.botUserId, `${OPCHECK_BOT.commandPrefix} opcheck ${link}`);
  const result = parseJsonReply<OpcheckResult>(reply.content);
  if (!result) throw new Error(`Unexpected bot reply: ${reply.content}`);
  return result;
}

export function describeOpcheck(result: OpcheckResult): string[] {
  const { plays } = result;
  return [
    `OP: ${result.op ? 'yes' : 'no'}${result.blocked ? ', BLOCKED' : ''}${result.reason ? ` (${result.reason})` : ''}`,
    ...(result.label ? [`Label: ${result.label}`] : []),
    `Plays: ${plays.day} today, ${plays.week} this week, ${plays.month} this month, ${plays.all} total`,
    `Last played: ${result.lastPlayed ? new Date(result.lastPlayed).toLocaleString() : 'never'}`,
  ];
}
