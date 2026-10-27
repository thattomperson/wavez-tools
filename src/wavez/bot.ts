// Private room bot commands over the room socket: send_bot_command, answered
// by a bot_private_reply whose commandId is our requestId.
import { requireState } from './bridge';
import { makeRequestId, request, type Packet } from './socket';

export interface BotPrivateReply {
  id: string;
  commandId: string;
  roomId: string;
  botUserId: string;
  content: string;
  private: boolean;
}

export async function sendBotCommand(botUserId: string, content: string): Promise<BotPrivateReply> {
  const roomId = requireState().room.id;
  const requestId = makeRequestId('bot');
  const isReply = (packet: Packet): packet is Packet<BotPrivateReply> =>
    packet.event === 'bot_private_reply' &&
    (packet.payload as BotPrivateReply | null)?.commandId === requestId;

  const reply = await request('send_bot_command', { roomId, botUserId, content }, requestId, isReply);
  return reply.payload;
}

/** Parse a reply like `tp1 {"cmd":"opcheck",...}` into its JSON body. */
export function parseJsonReply<T>(content: string): T | null {
  const start = content.indexOf('{');
  if (start === -1) return null;
  try {
    return JSON.parse(content.slice(start)) as T;
  } catch {
    return null;
  }
}
