// Private room bot commands over the room socket: send_bot_command, answered
// by a bot_private_reply whose commandId is our requestId.
import { requireState } from './bridge';
import { makeRequestId, request, type Packet } from './socket';

/** A button on a bot's card: either a private command for the bot or a link. */
export interface BotButton {
  label: string;
  style?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  command?: string;
  url?: string;
}

/** The structured card a room bot can attach to a message (`embed` in @wavezfm/api). */
export interface BotEmbed {
  ownerUserId?: string;
  /** Server-issued context for the card's buttons; sent back untouched. */
  panelToken?: string;
  title: string;
  description?: string;
  fields?: Array<{ name: string; value: string }>;
  links?: Array<{ label: string; url: string }>;
  buttons?: BotButton[];
}

export interface BotPrivateReply {
  id: string;
  commandId: string;
  roomId: string;
  botUserId: string;
  content: string;
  private: boolean;
  embed?: BotEmbed | null;
}

// Commands this script sent, so their replies (opchecks and the like) aren't
// mistaken for the bot reaching out on its own.
const ownCommands = new Set<string>();
// Other listeners on the socket see the reply in the same tick, so keep the id
// around a moment after the reply arrives.
const FORGET_MS = 2000;

export function isOwnCommand(commandId: string | undefined): boolean {
  return !!commandId && ownCommands.has(commandId);
}

export async function sendBotCommand(
  botUserId: string,
  content: string,
  extra: Record<string, unknown> = {},
): Promise<BotPrivateReply> {
  const roomId = requireState().room.id;
  const requestId = makeRequestId('bot');
  const isReply = (packet: Packet): packet is Packet<BotPrivateReply> =>
    packet.event === 'bot_private_reply' &&
    (packet.payload as BotPrivateReply | null)?.commandId === requestId;

  ownCommands.add(requestId);
  try {
    const reply = await request('send_bot_command', { roomId, botUserId, content, ...extra }, requestId, isReply);
    return reply.payload;
  } finally {
    setTimeout(() => ownCommands.delete(requestId), FORGET_MS);
  }
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
