// Notifications for chat that's meant for you: @mentions, and messages
// from the room bot (its notices to you and private replies you didn't ask
// this script for). Each match can show a desktop notification (only while
// you're in another tab or app) and play a sound (any time); both are options.
//
// Bot messages can carry buttons. Browsers only allow buttons on a
// notification shown by a service worker, and a bookmarklet can't register
// one on wavez.fm (and the site's own worker wouldn't know what to do with a
// click). So the notification lists the buttons, and clicking it brings you
// back to the room with a small card that has the real buttons.
//
// What counts as "for you" is set under the switch's cog: @your name, @staff,
// room-wide pings, bot messages, and a list of extra words, plus how to tell
// you: desktop notification, sound, or both.
import { computed, effect, signal } from '@preact/signals-core';
import { h } from '../ui/dom';
import { playSound, primeSound } from '../lib/sound';
import { closeNotice, showNotice, type NoticeButton } from '../ui/notice';
import { isOwnCommand, sendBotCommand, type BotEmbed, type BotPrivateReply } from '../wavez/bot';
import { requireBridge, type ChatMessage, type RoomState } from '../wavez/bridge';
import { onIncoming, type Packet } from '../wavez/socket';
import type { ToggleContext, ToggleTool } from './types';

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

// Every step is logged to the console so a missing notification can be traced.
// Filter the console by "[notify]" to see just these.
const log = (...args: unknown[]) => console.log('WavezFM Tools [notify]', ...args);

// --- settings -------------------------------------------------------------------

const STORAGE_KEY = 'wavez-tools:notifications';

interface NotifySettings {
  /** @username and @"Display Name". */
  name: boolean;
  /** @staff, while your room role is bouncer or above. */
  staff: boolean;
  /** @everyone, @here and @room. */
  room: boolean;
  /** Bot notices to you and bot private replies. */
  bot: boolean;
  /** Extra words to look out for anywhere in a message, without the @. */
  words: string[];
  /** Show a desktop notification while you're in another tab or app. */
  desktop: boolean;
  /** Play the notification sound, even while you're looking at the room. */
  sound: boolean;
}

const DEFAULTS: NotifySettings = {
  name: true,
  staff: true,
  room: true,
  bot: true,
  words: [],
  desktop: true,
  sound: false,
};
type Flag = Exclude<keyof NotifySettings, 'words'>;

// The running switch and the options under the cog both follow this.
const settings = signal(loadSettings());

function loadSettings(): NotifySettings {
  let saved: Partial<Record<keyof NotifySettings, unknown>> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    // Fall back to the defaults.
  }
  const flag = (key: Flag) => (typeof saved[key] === 'boolean' ? (saved[key] as boolean) : DEFAULTS[key]);
  const words = Array.isArray(saved.words) ? parseWords(saved.words.filter((w) => typeof w === 'string').join(',')) : [];
  return {
    name: flag('name'),
    staff: flag('staff'),
    room: flag('room'),
    bot: flag('bot'),
    words,
    desktop: flag('desktop'),
    sound: flag('sound'),
  };
}

function setSettings(next: NotifySettings) {
  settings.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: settings just won't be remembered.
  }
}

/** "tom, ttp,  Thomas" -> ["tom", "ttp", "thomas"]: trimmed, lower case, no @, no repeats. */
function parseWords(text: string): string[] {
  const words = text
    .split(/[,\n]/)
    .map((w) => w.trim().replace(/^@+/, '').toLowerCase())
    .filter(Boolean);
  return [...new Set(words)];
}

/** The line under the switch's name: what it's listening for. */
function summary(s: NotifySettings): string {
  const parts = [
    s.name && '@you',
    s.staff && '@staff',
    s.room && '@everyone',
    s.words.length && (s.words.length === 1 ? `"${s.words[0]}"` : `${s.words.length} words`),
    s.bot && 'bot',
  ].filter(Boolean);
  if (!parts.length) return 'On: nothing picked, open the cog';
  const desktop = s.desktop && desktopState();
  const how = [desktop === 'granted' && 'desktop', desktop === 'blocked' && 'desktop blocked', s.sound && 'sound'].filter(Boolean);
  if (!how.length) return `On: ${parts.join(', ')} · no desktop or sound picked`;
  return `On: ${parts.join(', ')} · ${how.join(' + ')}`;
}

/** Where desktop notifications stand in this browser. */
function desktopState(): 'granted' | 'blocked' | 'ask' {
  if (typeof Notification === 'undefined' || Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' ? 'granted' : 'ask';
}

/** Ask for desktop permission. Needs a click or keypress, which the switch, cog and /wt command all are. */
function askPermission() {
  if (desktopState() !== 'ask') return;
  void Notification.requestPermission().then((result) => {
    log('permission answer:', result);
    // Refresh the line under the switch.
    settings.value = { ...settings.peek() };
  });
}


export const notifications: ToggleTool = {
  kind: 'toggle',
  id: 'notifications',
  command: 'notify',
  name: 'Notifications',
  blurb: 'Off',
  onBlurb: 'On: @mentions and bot messages',
  glyph: '@',
  subcommands: {
    test: {
      help: 'checks notifications, then sends a test one (and plays the sound) in 5 seconds',
      run: runTest,
    },
  },
  options,
  enable(ctx: ToggleContext) {
    const start = settings.peek();
    log('switch on', { desktop: start.desktop && desktopState(), sound: start.sound });
    // Switching on is a click or keypress, the moment browsers allow these.
    if (start.desktop) askPermission();
    if (start.sound) primeSound();

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
      const s = settings.peek();
      log('notify?', { title, lines, buttons: buttons.map((b) => b.label), desktop: s.desktop, sound: s.sound });
      const sound = s.sound ? 'played sound' : null;
      if (s.sound) playSound().catch((err) => log('sound failed:', err));
      const done = (why: string) => [sound, why].filter(Boolean).join(', ');
      if (!s.desktop) return done('desktop notifications are off in the options');
      if (desktopState() !== 'granted') return done(`no desktop notification: permission is "${Notification.permission}"`);
      if (isWatching()) return done('no desktop notification: you were looking at the room');
      log('showing notification', title);
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
      return done('notified');
    };

    const onChat = (message: ChatMessage) => {
      const verdict = checkChat(message);
      log('→', verdict);
      // The same message often comes through the bridge and the socket; keep the first verdict.
      if (verdict !== DUPLICATE) diag.lastVerdict = verdict;
    };
    const checkChat = (message: ChatMessage): string => {
      const state = bridge.room.getState();
      const me = state?.currentUser;
      log('chat message', message, 'me:', me);
      if (!state || !me) return 'skipped: not signed in to the room';
      if (message.userId === me.id) return 'skipped: your own message';
      if (!firstSighting(message.id)) return DUPLICATE;
      const from = message.displayUsername || message.username || 'Someone';
      const s = settings.peek();
      const reason = matchReason(message.content ?? '', state, s);
      const mentioned = reason !== null;
      log('matches:', reason ?? 'nothing', { settings: s });

      if (isBot(message)) {
        log('is bot message', {
          targetUserIds: message.targetUserIds,
          ephemeral: message.ephemeral,
          embedOwner: message.embed?.ownerUserId,
          buttons: message.embed?.buttons?.length ?? 0,
        });
        const sentToMe =
          message.targetUserIds?.includes(me.id) ||
          message.embed?.ownerUserId === me.id ||
          (message.ephemeral && !message.targetUserIds?.length);
        if (sentToMe && !s.bot && !mentioned) return 'skipped: bot messages are turned off in the options';
        const forMe = mentioned || sentToMe;
        log('bot message for me:', !!forMe);
        if (!forMe) return 'skipped: bot message not meant for you';
        const { lines, buttons } = fromBot(message.userId, message.content, message.embed);
        return notify(message.id, from, lines, buttons);
      }
      log('not a bot message');
      if (reason) return notify(message.id, `${from} ${reason}`, [message.content], []);
      return 'skipped: nothing you asked to be notified about';
    };

    const onPacket = (packet: Packet) => {
      if (packet.event === 'bot_private_reply') {
        const reply = packet.payload as BotPrivateReply | null;
        log('bot private reply', reply);
        if (!reply) return;
        if (!settings.peek().bot) return log('→ skipped: bot messages are turned off in the options');
        if (isOwnCommand(reply.commandId)) return log('→ skipped: reply to our own command (opcheck etc.)');
        if (!firstSighting(reply.id)) return log('→', DUPLICATE);
        const { lines, buttons } = fromBot(reply.botUserId, reply.content, reply.embed);
        log('→', notify(reply.id ?? reply.commandId, 'Room bot', lines, buttons));
        return;
      }
      // The bridge may not pass on every kind of chat (live-only bot notices,
      // for one), so also look at chat packets on the socket. Ids keep this
      // from notifying twice.
      if (packet.event.includes('chat')) {
        const message = asChatMessage(packet.payload);
        log(`socket packet "${packet.event}"`, packet.payload, message ? '' : '(not a chat message)');
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
      log('bridge chat_message', payload);
      const message = asChatMessage(payload);
      if (message) onChat(message);
      else {
        diag.lastVerdict = 'skipped: could not read the message';
        log('→', diag.lastVerdict);
      }
    });
    const stopSocket = onIncoming(onPacket);
    const stopStatus = effect(() => ctx.setStatus(summary(settings.value)));
    log('listening to the bridge and the room socket');
    diag.running = true;
    return () => {
      diag.running = false;
      log('switch off');
      stopStatus();
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
  const s = settings.peek();
  const lines: string[] = [];
  lines.push(`Switch: ${diag.running ? 'on' : 'off (turn it on with /wt notify on)'}`);
  lines.push(`Desktop notifications: ${s.desktop ? 'on' : 'off'}, browser permission: ${typeof Notification === 'undefined' ? 'not supported' : Notification.permission}`);
  lines.push(`Sound: ${s.sound ? 'on' : 'off'}`);
  if (s.desktop && desktopState() === 'blocked') {
    lines.push('Desktop notifications are blocked for this site. Click the icon left of the address bar to allow them.');
  }
  if (s.desktop) askPermission();
  if (s.sound) primeSound();
  lines.push(`Chat messages seen since it was turned on: ${diag.chatEvents}`);
  if (diag.lastPayload) lines.push(`Last one: ${diag.lastPayload}`);
  if (diag.lastVerdict) lines.push(`Result: ${diag.lastVerdict}`);
  if (!s.desktop && !s.sound) return [...lines, 'Nothing to test: tick desktop notifications or sound under the cog.'];
  lines.push('Testing in 5 seconds. Switch to another tab now.');
  setTimeout(() => {
    if (s.sound) playSound().catch((err) => log('sound failed:', err));
    if (s.desktop && desktopState() === 'granted') {
      new Notification('WavezFM Tools', { body: 'Test notification. If you see this, notifications work.', icon: siteIcon() });
    }
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

const isStaff = (role: string | null | undefined) => STAFF_ROLES.has(role?.toLowerCase() ?? '');

/**
 * Why a message is for you, as the end of the notification title ("mentioned
 * you", "said “tom”"), or null if it isn't. Follows the options under the cog.
 */
function matchReason(content: string, state: RoomState, s: NotifySettings): string | null {
  const me = state.currentUser;
  if (!me) return null;
  const test = (pattern: string) => new RegExp(pattern, 'i').test(content);
  const any = (items: string[]) => items.map(escapeRegExp).join('|');
  // A word ends where letters, digits, dots and dashes stop, so @tom doesn't match @tommy.
  const end = '(?![\\w.-])';

  if (s.name) {
    const names = [me.username, me.displayUsername].filter(Boolean).map((n) => n.trim());
    if (names.length && test(`@(?:"(?:${any(names)})"|(?:${any(names)})${end})`)) return 'mentioned you';
  }
  if (s.staff && isStaff(me.roomRole) && test(`@staff${end}`)) return 'pinged @staff';
  if (s.room) {
    const room = content.match(new RegExp(`@(everyone|here|room)${end}`, 'i'));
    if (room) return `pinged @${room[1].toLowerCase()}`;
  }
  for (const word of s.words) {
    if (test(`(?<![\\w.-])@?${escapeRegExp(word)}${end}`)) return `said “${word}”`;
  }
  return null;
}

// --- options under the cog --------------------------------------------------------

function Check(props: { flag: Flag; label: string; hint: string; onTick?: () => void }) {
  const { flag, label, hint, onTick } = props;
  const id = `wt-notify-${flag}`;
  const on = computed(() => settings.value[flag]);
  return (
    <div class={computed(() => (on.value ? 'wt-rule' : 'wt-rule wt-rule-off'))}>
      <input
        type="checkbox"
        id={id}
        checked={on}
        onchange={(e) => {
          const checked = (e.currentTarget as HTMLInputElement).checked;
          setSettings({ ...settings.peek(), [flag]: checked });
          if (checked) onTick?.();
        }}
      />
      <label for={id}>
        <span>{label}</span>
        <span class="wt-hint">{hint}</span>
      </label>
    </div>
  );
}

function currentUser(): RoomState['currentUser'] {
  try {
    return requireBridge().room.getState()?.currentUser ?? null;
  } catch {
    return null;
  }
}

function options(): HTMLElement {
  const me = currentUser();
  const names = me
    ? [`@${me.username}`, me.displayUsername && me.displayUsername !== me.username ? `@${me.displayUsername}` : null]
        .filter(Boolean)
        .join(' or ')
    : '@your name';

  // Saved when you leave the box or press Enter, so typing a comma doesn't rewrite what you typed.
  const save = (e: Event) => {
    const input = e.currentTarget as HTMLTextAreaElement;
    const words = parseWords(input.value);
    setSettings({ ...settings.peek(), words });
    input.value = words.join(', ');
  };

  return (
    <div class="wt-options">
      <span class="wt-label">How</span>
      <Check
        flag="desktop"
        label="Desktop notification"
        hint="While you’re in another tab or app"
        onTick={askPermission}
      />
      <Check
        flag="sound"
        label="Notification sound"
        hint="Any time, even while you’re looking at the room"
        onTick={() => {
          primeSound();
          playSound().catch((err) => log('sound failed:', err));
        }}
      />
      <div class="wt-divider" />
      <span class="wt-label">Notify me about</span>
      <Check flag="name" label="My name" hint={names} />
      <Check
        flag="staff"
        label="@staff"
        hint={isStaff(me?.roomRole) ? 'You’re staff in this room' : 'Only while you’re a bouncer or above'}
      />
      <Check flag="room" label="@everyone, @here, @room" hint="Pings for the whole room" />
      <Check flag="bot" label="Room bot messages" hint="Its notices to you and its private replies" />
      <div class="wt-divider" />
      <label class="wt-field" for="wt-notify-words">
        <span>Other words</span>
        <span class="wt-hint">Comma-separated, matched as whole words, with or without @</span>
      </label>
      <textarea
        id="wt-notify-words"
        class="wt-input"
        rows="2"
        placeholder="tom, ttp, thomas"
        spellcheck="false"
        value={settings.peek().words.join(', ')}
        onchange={save}
        onkeydown={(e) => {
          const key = e as KeyboardEvent;
          if (key.key === 'Enter' && !key.shiftKey) {
            key.preventDefault();
            (key.currentTarget as HTMLTextAreaElement).blur();
          }
        }}
      />
      <span class="wt-hint">Your own messages never notify.</span>
    </div>
  );
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
