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

function setRule(key: RuleKey, patch: Partial<Rule>) {
  setSettings({ ...settings, [key]: { ...settings[key], ...patch } });
}

/** One rule: a checkbox, its wording, and a -/+ stepper. Returns the row and a function that redraws it. */
function RuleRow(props: {
  rule: RuleKey;
  text: (n: number) => string;
  hint: string;
  unit: string;
  short: (n: number) => string;
}) {
  const { rule: key, text, hint, unit, short } = props;
  const { min, max, step } = LIMITS[key];
  const id = `wt-leave-${key}`;
  const bump = (dir: number) => setRule(key, { on: true, n: Math.min(max, Math.max(min, settings[key].n + dir * step)) });

  const box = (
    <input type="checkbox" id={id} onchange={(e) => setRule(key, { on: (e.currentTarget as HTMLInputElement).checked })} />
  ) as HTMLInputElement;
  const name = <span />;
  const value = <output aria-live="polite" />;
  const less = (
    <button type="button" aria-label={`Fewer ${unit}`} onclick={() => bump(-1)}>
      {icon('minus', 12)}
    </button>
  ) as HTMLButtonElement;
  const more = (
    <button type="button" aria-label={`More ${unit}`} onclick={() => bump(1)}>
      {icon('plus', 12)}
    </button>
  ) as HTMLButtonElement;
  const row = (
    <div class="wt-rule">
      {box}
      <label for={id}>
        {name}
        <span class="wt-hint">{hint}</span>
      </label>
      <span class="wt-stepper">
        {less}
        {value}
        {more}
      </span>
    </div>
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
  syncers.set(row, sync);
  sync();
  return row;
}

// Redraw functions for the rows on screen, keyed by row so they go with it.
const syncers = new WeakMap<Element, () => void>();

function options(): HTMLElement {
  const stopJoin = (
    <input
      type="checkbox"
      id="wt-leave-stopjoin"
      onchange={(e) => setSettings({ ...settings, stopJoin: (e.currentTarget as HTMLInputElement).checked })}
    />
  ) as HTMLInputElement;

  const rows = [
    <RuleRow
      rule="waiting"
      text={(n) => (n === 1 ? 'When anyone else is waiting' : `When ${n} people are waiting`)}
      hint="Not counting you or the DJ"
      unit="people"
      short={String}
    />,
    <RuleRow
      rule="plays"
      text={(n) => `After my next ${plural(n, 'play', 'plays')}`}
      hint="Counted from when you switch it on"
      unit="plays"
      short={String}
    />,
    <RuleRow
      rule="timer"
      text={(n) => `After ${minutes(n)}`}
      hint="Sleep timer, from when you switch it on"
      unit="minutes"
      short={(n) => (n < 60 ? `${n}m` : `${String(+(n / 60).toFixed(2))}h`)}
    />,
  ];

  const el = (
    <div class="wt-options">
      <span class="wt-label">Leave when any of these happens</span>
      {rows}
      <div class="wt-divider" />
      <div class="wt-rule">
        {stopJoin}
        <label for="wt-leave-stopjoin">
          <span>Also turn off Auto-join</span>
          <span class="wt-hint">When the plays or timer rule is done, so you don't rejoin</span>
        </label>
      </div>
      <span class="wt-hint">
        Never leaves mid-song: if a rule hits while you're playing, it waits for your song to end. The plays and timer
        rules switch Auto-leave off once they're done.
      </span>
    </div>
  );

  const sync = () => {
    rows.forEach((row) => syncers.get(row)?.());
    stopJoin.checked = settings.stopJoin;
  };
  // Redraw after each change. The listener goes once the panel re-renders and
  // this element is thrown away.
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
