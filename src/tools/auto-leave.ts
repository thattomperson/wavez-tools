// Auto-leave: leaves the DJ queue when one of its rules hits. The rules are set
// under the switch's cog and remembered between runs:
// - when N other people are waiting (keeps going, so Auto-join can rejoin later)
// - after your next N plays (then switches itself off)
// - after N minutes, a sleep timer (then switches itself off)
// It never leaves while your own song is playing.
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { requireBridge, type ActionResult } from '../wavez/bridge';
import { othersWaiting } from './auto-queue';
import type { ToggleContext, ToggleTool } from './types';

const STORAGE_KEY = 'wavez-tools:auto-leave';
// Don't retry leaving faster than this while the room catches up.
const COOLDOWN_MS = 3000;
// How often the sleep timer's countdown line refreshes.
const TICK_MS = 15000;

interface Rule {
  on: boolean;
  n: number;
}

type RuleKey = 'plays' | 'waiting' | 'timer';

interface LeaveSettings {
  plays: Rule;
  waiting: Rule;
  /** n is minutes. */
  timer: Rule;
  /** Also switch Auto-join off when the plays or timer rule finishes. */
  stopJoin: boolean;
}

const LIMITS: Record<RuleKey, { min: number; max: number; step: number }> = {
  plays: { min: 1, max: 10, step: 1 },
  waiting: { min: 1, max: 10, step: 1 },
  timer: { min: 15, max: 240, step: 15 },
};

// The waiting rule with 1 matches how Auto-leave always worked.
const DEFAULTS: LeaveSettings = {
  plays: { on: false, n: 2 },
  waiting: { on: true, n: 1 },
  timer: { on: false, n: 60 },
  stopJoin: false,
};

let settings = loadSettings();

function setSettings(next: LeaveSettings) {
  settings = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings just won't be remembered.
  }
  listeners.forEach((fn) => fn());
}

const listeners = new Set<() => void>();

function loadSettings(): LeaveSettings {
  let saved: Partial<Record<keyof LeaveSettings, unknown>> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    // Fall back to the defaults.
  }
  const rule = (key: RuleKey): Rule => {
    const value = saved[key] as Partial<Rule> | undefined;
    const { min, max } = LIMITS[key];
    const n = typeof value?.n === 'number' ? Math.min(max, Math.max(min, Math.round(value.n))) : DEFAULTS[key].n;
    return { on: typeof value?.on === 'boolean' ? value.on : DEFAULTS[key].on, n };
  };
  return {
    plays: rule('plays'),
    waiting: rule('waiting'),
    timer: rule('timer'),
    stopJoin: typeof saved.stopJoin === 'boolean' ? saved.stopJoin : DEFAULTS.stopJoin,
  };
}

// --- wording ------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function minutes(m: number): string {
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours} h ${rest} min` : plural(hours, 'hour', 'hours');
}

// --- behaviour ----------------------------------------------------------------

function run(ctx: ToggleContext): () => void {
  const bridge = requireBridge();
  const startedAt = Date.now();
  let plays = 0;
  let countedKey: string | null = null;
  let lastTry = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let done = false;

  // Leaves at most once per cooldown. True when the leave went through.
  const leave = (): boolean => {
    const wait = lastTry + COOLDOWN_MS - Date.now();
    if (wait > 0) {
      retry = setTimeout(check, wait);
      return false;
    }
    lastTry = Date.now();
    const result: ActionResult = bridge.actions.leaveQueue();
    // Look again after the cooldown in case nothing else changes meanwhile.
    retry = setTimeout(check, COOLDOWN_MS);
    if (!result.ok) console.warn(`WavezFM Tools: Auto-leave failed (${result.code})`);
    return result.ok;
  };

  function check() {
    if (done) return;
    clearTimeout(retry);
    const state = bridge.room.getState();
    if (!state) {
      ctx.setStatus(null);
      return;
    }
    const s = settings;
    const me = state.currentUser?.id;
    const playback = state.playback;
    // Count each of your songs once, as it starts.
    if (me && playback && playback.djId === me && playback.playbackKey !== countedKey) {
      countedKey = playback.playbackKey;
      plays++;
    }

    const playing = state.queue.isCurrentDj;
    const inQueue = state.queue.isJoined && !playing;
    const waiting = othersWaiting(state);
    const playsLeft = s.plays.n - plays;
    const msLeft = startedAt + s.timer.n * 60_000 - Date.now();
    const playsDone = s.plays.on && playsLeft <= 0;
    const timeUp = s.timer.on && msLeft <= 0;
    const crowded = s.waiting.on && waiting >= s.waiting.n;

    // Plays and the timer end the session: leave if needed, then switch off.
    if ((playsDone || timeUp) && !playing) {
      if (inQueue && !leave()) return;
      const songs = plural(plays, 'song', 'songs');
      const note =
        timeUp && !playsDone
          ? inQueue
            ? `Left the queue after ${minutes(s.timer.n)}`
            : 'Sleep timer done'
          : inQueue
            ? `Left the queue after ${songs}`
            : `Done after ${songs}`;
      done = true;
      if (s.stopJoin) ctx.turnOffOther('auto-join');
      ctx.turnOff(note);
      return;
    }
    // The waiting rule leaves but stays on, so Auto-join can bring you back.
    if (crowded && inQueue) leave();

    // --- the line under the name ---
    if (!s.plays.on && !s.waiting.on && !s.timer.on) {
      ctx.setStatus('On: pick when to leave with the cog');
    } else if (playing && (playsDone || timeUp || crowded)) {
      if (crowded) ctx.setStatus(`Leaving when your song ends · ${plural(waiting, 'person', 'people')} waiting`, 'soon');
      else ctx.setStatus(playsDone && !timeUp ? 'Leaving after this song' : 'Leaving when your song ends', 'soon');
    } else if (!inQueue && !playing) {
      ctx.setStatus(s.timer.on ? `Not in the queue · timer ends in ${minutes(Math.ceil(msLeft / 60_000))}` : 'Not in the queue');
    } else {
      const clauses: string[] = [];
      if (s.plays.on) {
        clauses.push(playsLeft === 1 && !playing ? 'after your next song' : `after ${plural(playsLeft, 'more song', 'more songs')}`);
      }
      if (s.waiting.on) {
        const need = s.waiting.n - waiting;
        clauses.push(need <= 0 ? 'now' : `when ${plural(need, 'more person joins', 'more people join')} the queue`);
      }
      if (s.timer.on) clauses.push(`in ${minutes(Math.ceil(msLeft / 60_000))}`);
      ctx.setStatus(`Leaving ${clauses.join(', or ')}`);
    }
  }

  const stops = [
    bridge.room.subscribe('queue_changed', check),
    bridge.room.subscribe('playback_changed', check),
  ];
  listeners.add(check);
  const tick = setInterval(check, TICK_MS);
  check();
  return () => {
    done = true;
    clearTimeout(retry);
    clearInterval(tick);
    listeners.delete(check);
    stops.forEach((stop) => stop());
  };
}

// --- options under the cog ------------------------------------------------------

function options(): HTMLElement {
  const setRule = (key: RuleKey, patch: Partial<Rule>) => setSettings({ ...settings, [key]: { ...settings[key], ...patch } });

  const ruleRow = (key: RuleKey, text: (n: number) => string, hint: string, unit: string, short: (n: number) => string) => {
    const { min, max, step } = LIMITS[key];
    const id = `wt-leave-${key}`;
    const box = h('input', { type: 'checkbox', id, onchange: () => setRule(key, { on: box.checked }) });
    const name = h('span');
    const value = h('output', { 'aria-live': 'polite' });
    const bump = (dir: number) => {
      setRule(key, { on: true, n: Math.min(max, Math.max(min, settings[key].n + dir * step)) });
    };
    const less = h('button', { type: 'button', 'aria-label': `Fewer ${unit}`, onclick: () => bump(-1) }, icon('minus', 12));
    const more = h('button', { type: 'button', 'aria-label': `More ${unit}`, onclick: () => bump(1) }, icon('plus', 12));
    const row = h(
      'div',
      { class: 'wt-rule' },
      box,
      h('label', { for: id }, name, h('span', { class: 'wt-hint' }, hint)),
      h('span', { class: 'wt-stepper' }, less, value, more),
    );
    const sync = () => {
      const rule = settings[key];
      box.checked = rule.on;
      row.classList.toggle('wt-rule-off', !rule.on);
      name.textContent = text(rule.n);
      value.textContent = short(rule.n);
      less.disabled = rule.n <= min;
      more.disabled = rule.n >= max;
    };
    return { row, sync };
  };

  const rows = [
    ruleRow('waiting', (n) => (n === 1 ? 'When anyone else is waiting' : `When ${n} people are waiting`), 'Not counting you or the DJ', 'people', String),
    ruleRow('plays', (n) => `After my next ${plural(n, 'play', 'plays')}`, 'Counted from when you switch it on', 'plays', String),
    ruleRow('timer', (n) => `After ${minutes(n)}`, 'Sleep timer, from when you switch it on', 'minutes', (n) =>
      n < 60 ? `${n}m` : `${String(+(n / 60).toFixed(2))}h`,
    ),
  ];

  const stopJoin = h('input', {
    type: 'checkbox',
    id: 'wt-leave-stopjoin',
    onchange: () => setSettings({ ...settings, stopJoin: stopJoin.checked }),
  });

  const el = h(
    'div',
    { class: 'wt-options' },
    h('span', { class: 'wt-label' }, 'Leave when any of these happens'),
    ...rows.map((r) => r.row),
    h('div', { class: 'wt-divider' }),
    h(
      'div',
      { class: 'wt-rule' },
      stopJoin,
      h(
        'label',
        { for: 'wt-leave-stopjoin' },
        h('span', null, 'Also turn off Auto-join'),
        h('span', { class: 'wt-hint' }, "When the plays or timer rule is done, so you don't rejoin"),
      ),
    ),
    h(
      'span',
      { class: 'wt-hint' },
      "Never leaves mid-song: if a rule hits while you're playing, it waits for your song to end. The plays and timer rules switch Auto-leave off once they're done.",
    ),
  );
  const sync = () => {
    rows.forEach((r) => r.sync());
    stopJoin.checked = settings.stopJoin;
  };
  // Only this element changes the settings, so sync straight after each change.
  // The listener goes when the element is thrown away on the next re-render.
  const listener = () => (el.isConnected ? sync() : listeners.delete(listener));
  listeners.add(listener);
  sync();
  return el;
}

export const autoLeave: ToggleTool = {
  kind: 'toggle',
  id: 'auto-leave',
  command: 'autoleave',
  name: 'Auto-leave',
  blurb: 'Off',
  onBlurb: 'On',
  glyph: 'L',
  enable: run,
  options,
};
