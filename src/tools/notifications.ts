// Desktop notifications for chat that's meant for you: @mentions, and messages
// from the room bot (its notices to you and private replies you didn't ask
// this script for). Only fires while you're looking at another tab or app.
//
// Bot messages can carry buttons. Browsers only allow buttons on a
// notification shown by a service worker, and a bookmarklet can't register
// one on wavez.fm (and the site's own worker wouldn't know what to do with a
// click). So the notification lists the buttons, and clicking it brings you
// back to the room with a small card that has the real buttons.
import { closeNotice, showNotice, type NoticeButton } from '../ui/notice';
import { isOwnCommand, sendBotCommand, type BotEmbed, type BotPrivateReply } from '../wavez/bot';
import { requireBridge, type ChatMessage, type RoomState } from '../wavez/bridge';
import { onIncoming, type Packet } from '../wavez/socket';
import type { ToggleTool } from './types';

const BODY_MAX = 180;
// Remember this many message ids so the same message from the bridge and the
// socket only notifies once.
const SEEN_MAX = 200;
const NOTICE_ID = 'wavez-tools-notice';
const PANEL_ID = 'wavez-tools-panel';

// What the switch last saw, for `/wt notify test`.
const diag = {
  running: false,
  chatEvents: 0,
  lastPayload: null as string | null,
  lastVerdict: null as string | null,
};
const TEST_DELAY_MS = 5000;
const DUPLICATE = 'skipped: already handled';

export const notifications: ToggleTool = {
  kind: 'toggle',
  id: 'notifications',
  command: 'notify',
  name: 'Desktop notifications',
  blurb: 'Off',
  onBlurb: 'On: @mentions and bot messages while you’re away',
  glyph: '@',
  subcommands: {
    test: {
      help: 'checks notifications and sends a test one in 5 seconds',
      run: runTest,
    },
  },
  enable() {
    if (typeof Notification === 'undefined') throw new Error('This browser has no desktop notifications.');
    if (Notification.permission === 'denied') {
      throw new Error('Notifications are blocked for wavez.fm. Allow them in the site settings and try again.');
    }
    // Needs a click or keypress, which the switch and /wt command both are.
    if (Notification.permission === 'default') void Notification.requestPermission();

    const bridge = requireBridge();
    const seen = new Set<string>();
    const open = new Set<Notification>();

    const firstSighting = (id: string | undefined) => {
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value as string);
      return true;
    };

    const notify = (key: string, title: string, lines: string[], buttons: NoticeButton[]): string => {
      if (Notification.permission !== 'granted') return `not shown: permission is "${Notification.permission}"`;
      if (isWatching()) return 'not shown: you were looking at the room';
      let body = clip(lines.join('\n'));
      const live = buttons.filter((b) => !b.disabled);
      if (live.length) body += `\nClick to answer: ${live.map((b) => b.label).join(' · ')}`;
      const n = new Notification(title, { body, tag: `wavez-tools:${key}`, icon: siteIcon() });
      open.add(n);
      n.onclose = () => open.delete(n);
      n.onclick = () => {
        window.focus();
        n.close();
        if (buttons.length) showNotice({ title, lines, buttons });
      };
      return 'notified';
    };

    const onChat = (message: ChatMessage) => {
      const verdict = checkChat(message);
      // The same message often comes through the bridge and the socket; keep the first verdict.
      if (verdict !== DUPLICATE) diag.lastVerdict = verdict;
    };
    const checkChat = (message: ChatMessage): string => {
      const state = bridge.room.getState();
      const me = state?.currentUser;
      if (!state || !me) return 'skipped: not signed in to the room';
      if (message.userId === me.id) return 'skipped: your own message';
      if (!firstSighting(message.id)) return DUPLICATE;
      const from = message.displayUsername || message.username || 'Someone';
      const mentioned = mentionsMe(message.content ?? '', state);

      if (isBot(message)) {
        const forMe =
          mentioned ||
          message.targetUserIds?.includes(me.id) ||
          message.embed?.ownerUserId === me.id ||
          (message.ephemeral && !message.targetUserIds?.length);
        if (!forMe) return 'skipped: bot message not meant for you';
        const { lines, buttons } = fromBot(message.userId, message.content, message.embed);
        return notify(message.id, from, lines, buttons);
      }
      if (mentioned) return notify(message.id, `${from} mentioned you`, [message.content], []);
      return 'skipped: no mention of you';
    };

    const onPacket = (packet: Packet) => {
      if (packet.event === 'bot_private_reply') {
        const reply = packet.payload as BotPrivateReply | null;
        if (!reply || isOwnCommand(reply.commandId) || !firstSighting(reply.id)) return;
        const { lines, buttons } = fromBot(reply.botUserId, reply.content, reply.embed);
        notify(reply.id ?? reply.commandId, 'Room bot', lines, buttons);
        return;
      }
      // The bridge may not pass on every kind of chat (live-only bot notices,
      // for one), so also look at chat packets on the socket. Ids keep this
      // from notifying twice.
      if (packet.event.includes('chat')) {
        const message = asChatMessage(packet.payload);
        if (message) {
          if (!seen.has(message.id)) seenChat(`socket ${packet.event}`, packet.payload);
          onChat(message);
        }
      }
    };
    const seenChat = (source: string, payload: unknown) => {
      diag.chatEvents += 1;
      diag.lastPayload = `${source}: ${describePayload(payload)}`;
    };

    const unsubscribe = bridge.room.subscribe('chat_message', (payload) => {
      seenChat('bridge', payload);
      const message = asChatMessage(payload);
      if (message) onChat(message);
      else diag.lastVerdict = 'skipped: could not read the message';
    });
    const stopSocket = onIncoming(onPacket);
    diag.running = true;
    return () => {
      diag.running = false;
      unsubscribe();
      stopSocket();
      open.forEach((n) => n.close());
      closeNotice();
    };
  },
};

type Loose = Record<string, unknown> | null | undefined;
const str = (...values: unknown[]) => values.find((v): v is string => typeof v === 'string');

// The bridge's chat_message payload isn't documented, so accept the likely
// shapes: the message itself or wrapped in `message`/`chat`, with the sender
// either flat (`userId`) or nested (`user`/`sender`).
function asChatMessage(payload: unknown): ChatMessage | null {
  const outer = payload as Loose;
  const wrapped = (outer?.message ?? outer?.chat) as Loose;
  const m = (wrapped && typeof wrapped === 'object' ? wrapped : outer) as Loose;
  if (!m || typeof m !== 'object') return null;
  const user = (m.user ?? m.sender ?? m.author) as Loose;
  const id = str(m.id, m.messageId, m._id);
  const userId = str(m.userId, m.senderId, user?.id, user?.userId);
  const content = str(m.content, m.text, m.message, m.body);
  if (!id || !userId || content === undefined) return null;
  return {
    ...(m as object),
    id,
    userId,
    content,
    username: str(m.username, user?.username) ?? '',
    displayUsername: str(m.displayUsername, user?.displayUsername, user?.displayName) ?? null,
    role: str(m.role, m.roomRole, user?.role),
  } as ChatMessage;
}

/** Field names (and a little of the text) of a payload, for `/wt notify test`. */
function describePayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return typeof payload;
  const keys = (value: Loose) => Object.keys(value ?? {}).join(', ');
  const p = payload as Record<string, unknown>;
  const nested = ['message', 'chat', 'user', 'sender']
    .filter((k) => p[k] && typeof p[k] === 'object')
    .map((k) => ` ${k}{${keys(p[k] as Loose)}}`)
    .join('');
  return `{${keys(p)}}${nested}`;
}

function runTest(): string[] {
  const lines: string[] = [];
  if (typeof Notification === 'undefined') return ['This browser has no desktop notifications.'];
  lines.push(`Switch: ${diag.running ? 'on' : 'off (turn it on with /wt notify on)'}`);
  lines.push(`Browser permission: ${Notification.permission}`);
  if (Notification.permission === 'denied') {
    lines.push('Notifications are blocked for this site. Click the icon left of the address bar to allow them.');
    return lines;
  }
  if (Notification.permission === 'default') void Notification.requestPermission();
  lines.push(`Chat messages seen since it was turned on: ${diag.chatEvents}`);
  if (diag.lastPayload) lines.push(`Last one: ${diag.lastPayload}`);
  if (diag.lastVerdict) lines.push(`Result: ${diag.lastVerdict}`);
  lines.push('Sending a test notification in 5 seconds. Switch to another tab now.');
  setTimeout(() => {
    if (Notification.permission !== 'granted') return;
    new Notification('WavezFM Tools', { body: 'Test notification. If you see this, notifications work.', icon: siteIcon() });
  }, TEST_DELAY_MS);
  return lines;
}

function isBot(message: ChatMessage): boolean {
  return message.userId.startsWith('room-bot:') || /bot/i.test(message.role ?? '');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Room roles that @staff pings: bouncer and up.
const STAFF_ROLES = new Set(['bouncer', 'manager', 'cohost', 'host']);

/** True for @you (username or display name, quoted or not), room-wide pings, and @staff if you're staff. */
function mentionsMe(content: string, state: RoomState): boolean {
  const me = state.currentUser;
  if (!me) return false;
  const names = [me.username, me.displayUsername].filter(Boolean).map((n) => escapeRegExp(n.trim()));
  const groups = ['everyone', 'here', 'room', ...(STAFF_ROLES.has(me.roomRole?.toLowerCase() ?? '') ? ['staff'] : [])];
  const pattern = new RegExp(`@(?:"(?:${names.join('|')})"|(?:${names.join('|')})(?![\\w.-])|(?:${groups.join('|')})\\b)`, 'i');
  return pattern.test(content);
}

/** True while you're looking at the room tab or its pop-out chat. */
function isWatching(): boolean {
  if (document.visibilityState === 'visible' && document.hasFocus()) return true;
  for (const popup of window.__wavezToolsChat?.popups ?? []) {
    try {
      if (!popup.closed && popup.document.hasFocus()) return true;
    } catch {
      // Another site: skip.
    }
  }
  return false;
}

function clip(text: string): string {
  return text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text;
}

function siteIcon(): string | undefined {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href || undefined;
}

function embedLines(content: string, embed: BotEmbed | null | undefined): string[] {
  if (!embed) return [content];
  return [
    embed.title,
    embed.description,
    ...(embed.fields ?? []).map((f) => `${f.name}: ${f.value}`),
  ].filter((line): line is string => !!line);
}

/** Turn a bot message into card lines and working buttons. */
function fromBot(botUserId: string, content: string, embed: BotEmbed | null | undefined) {
  const lines = embedLines(content, embed);
  const buttons: NoticeButton[] = [
    ...(embed?.buttons ?? []).map((button) => ({
      label: button.label,
      style: button.style,
      disabled: button.disabled,
      run: (): Promise<string[] | void> | void => {
        if (button.url) {
          window.open(button.url, '_blank', 'noopener');
          return;
        }
        if (!button.command) return;
        // The site's own button knows exactly what to send, so press it when
        // the message is on screen. Otherwise send the command ourselves.
        const siteButton = findSiteButton(button.label);
        if (siteButton) {
          siteButton.click();
          return;
        }
        const extra = embed?.panelToken ? { panelToken: embed.panelToken } : {};
        return sendBotCommand(botUserId, button.command, extra).then((reply) => embedLines(reply.content, reply.embed));
      },
    })),
    ...(embed?.links ?? []).map((link) => ({
      label: link.label,
      run: () => {
        window.open(link.url, '_blank', 'noopener');
      },
    })),
  ];
  return { lines, buttons };
}

/** The newest enabled button in the room chat (or pop-out) with this label. */
function findSiteButton(label: string): HTMLButtonElement | null {
  const docs: Document[] = [document];
  for (const popup of window.__wavezToolsChat?.popups ?? []) {
    try {
      if (!popup.closed) docs.push(popup.document);
    } catch {
      // Another site: skip.
    }
  }
  const wanted = label.trim().toLowerCase();
  for (const doc of docs) {
    const matches = [...doc.querySelectorAll<HTMLButtonElement>('button')].filter(
      (b) =>
        !b.disabled &&
        !b.closest(`#${NOTICE_ID}, #${PANEL_ID}`) &&
        (b.textContent ?? '').trim().toLowerCase() === wanted,
    );
    if (matches.length) return matches[matches.length - 1];
  }
  return null;
}
