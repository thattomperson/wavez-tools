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

export const notifications: ToggleTool = {
  kind: 'toggle',
  id: 'notifications',
  command: 'notify',
  name: 'Desktop notifications',
  blurb: 'Off',
  onBlurb: 'On: @mentions and bot messages while you’re away',
  glyph: '@',
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

    const notify = (key: string, title: string, lines: string[], buttons: NoticeButton[]) => {
      if (Notification.permission !== 'granted' || isWatching()) return;
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
    };

    const onChat = (message: ChatMessage) => {
      const state = bridge.room.getState();
      const me = state?.currentUser;
      if (!state || !me || message.userId === me.id || !firstSighting(message.id)) return;
      const from = message.displayUsername || message.username || 'Someone';
      const mentioned = mentionsMe(message.content ?? '', state);

      if (isBot(message)) {
        const forMe =
          mentioned ||
          message.targetUserIds?.includes(me.id) ||
          message.embed?.ownerUserId === me.id ||
          (message.ephemeral && !message.targetUserIds?.length);
        if (!forMe) return;
        const { lines, buttons } = fromBot(message.userId, message.content, message.embed);
        notify(message.id, from, lines, buttons);
      } else if (mentioned) {
        notify(message.id, `${from} mentioned you`, [message.content], []);
      }
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
        if (message) onChat(message);
      }
    };

    const unsubscribe = bridge.room.subscribe('chat_message', (payload) => {
      const message = asChatMessage(payload);
      if (message) onChat(message);
    });
    const stopSocket = onIncoming(onPacket);
    return () => {
      unsubscribe();
      stopSocket();
      open.forEach((n) => n.close());
      closeNotice();
    };
  },
};

function asChatMessage(payload: unknown): ChatMessage | null {
  const value = payload as { message?: unknown } | null;
  const candidate = (value && typeof value.message === 'object' ? value.message : value) as ChatMessage | null;
  return candidate && typeof candidate.id === 'string' && typeof candidate.userId === 'string' && typeof candidate.content === 'string'
    ? candidate
    : null;
}

function isBot(message: ChatMessage): boolean {
  return message.userId.startsWith('room-bot:') || /bot/i.test(message.role ?? '');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True for @you (username or display name, quoted or not) and room-wide pings. */
function mentionsMe(content: string, state: RoomState): boolean {
  const me = state.currentUser;
  if (!me) return false;
  const names = [me.username, me.displayUsername].filter(Boolean).map((n) => escapeRegExp(n.trim()));
  const pattern = new RegExp(`@(?:"(?:${names.join('|')})"|(?:${names.join('|')})(?![\\w.-])|(?:everyone|here|room)\\b)`, 'i');
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
