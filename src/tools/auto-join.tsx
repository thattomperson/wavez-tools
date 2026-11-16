// Auto-join: joins the DJ queue when fewer than N other people are waiting
// (N is set under the cog; 1 means "nobody else"). Paired with Auto-leave
// (auto-leave.tsx) it fills gaps without holding up the room.
// If someone else takes you out of the queue (a mod removing you), it switches
// itself off so it doesn't put you straight back.
import { computed, effect, signal, untracked } from '@preact/signals-core';
import { Stepper } from '../ui/components';
import { h } from '../ui/dom';
import { othersWaiting, requireBridge, type ActionResult, type RoomState } from '../wavez/bridge';
import { leftOnPurpose, watchLeaveIntent } from '../wavez/leave-intent';
import { leaveAtWaiting } from './auto-leave';
import type { ToggleContext, ToggleTool } from './types';

// Don't retry an action faster than this while the room catches up.
const COOLDOWN_MS = 3000;

const STORAGE_KEY = 'wavez-tools:auto-join';
const MIN = 1;
const MAX = 10;

interface JoinSettings {
  /** Join when fewer than this many other people are waiting. */
  fewerThan: number;
}

// 1 matches how Auto-join always worked: join only when nobody else is waiting.
const DEFAULTS: JoinSettings = { fewerThan: 1 };

const settings = signal(loadSettings());

function setSettings(next: JoinSettings) {
  settings.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: settings just won't be remembered.
  }
}

function loadSettings(): JoinSettings {
  let saved: Partial<Record<keyof JoinSettings, unknown>> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    // Fall back to the defaults.
  }
  const n = saved.fewerThan;
  return {
    fewerThan: typeof n === 'number' ? Math.min(MAX, Math.max(MIN, Math.round(n))) : DEFAULTS.fewerThan,
  };
}

// The limit actually used: kept at or under Auto-leave's waiting rule, since
// joining at a count Auto-leave leaves at would join and leave over and over.
const joinBelow = computed(() => {
  const leaveAt = leaveAtWaiting.value;
  const n = settings.value.fewerThan;
  return leaveAt === null ? n : Math.min(n, leaveAt);
});

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const ruleText = (n: number) => (n === 1 ? 'When nobody else is waiting' : `When fewer than ${people(n)} are waiting`);

// Runs `act` whenever the queue or playback changes and `shouldAct` says so,
// at most once per cooldown. Re-checks after the cooldown in case nothing else
// changes in the meantime.
function watchQueue(
  name: string,
  shouldAct: (state: RoomState) => boolean,
  act: () => ActionResult,
): [stop: () => void, check: () => void] {
  const bridge = requireBridge();
  let lastTry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    clearTimeout(timer);
    const state = bridge.room.getState();
    if (!state || !shouldAct(state)) return;
    const wait = lastTry + COOLDOWN_MS - Date.now();
    if (wait > 0) {
      timer = setTimeout(check, wait);
      return;
    }
    lastTry = Date.now();
    const result = act();
    if (!result.ok) console.warn(`WavezFM Tools: ${name} failed (${result.code})`);
    timer = setTimeout(check, COOLDOWN_MS);
  };

  const stops = [
    bridge.room.subscribe('queue_changed', check),
    bridge.room.subscribe('playback_changed', check),
  ];
  check();
  const stop = () => {
    clearTimeout(timer);
    stops.forEach((stop) => stop());
  };
  return [stop, check];
}

// Returns a check, given each new room state, that says whether you've been
// taken out of the queue while waiting for your turn without asking to leave.
// Once it says yes it keeps saying yes. Leaving after your own song isn't
// counted, since that's the room rotating rather than a removal.
function removalTracker(): (state: RoomState) => boolean {
  let wasWaiting = false;
  let roomId: string | null = null;
  let removed = false;

  return (state) => {
    if (removed || !state.currentUser) return removed;
    const { queue } = state;
    const out = !queue.isJoined && !queue.isCurrentDj && state.playback?.djId !== state.currentUser.id;
    if (wasWaiting && out && roomId === state.room.id && !leftOnPurpose()) {
      removed = true;
      return true;
    }
    wasWaiting = queue.isJoined && !queue.isCurrentDj;
    roomId = state.room.id;
    return false;
  };
}

// The line under the name while it's on and you're not in the queue.
function statusFor(state: RoomState): string | null {
  const { queue } = state;
  if (queue.isJoined || queue.isCurrentDj) return null;
  if (queue.isLocked) return 'Waiting: the queue is locked';
  if (queue.isFull) return 'Waiting: the queue is full';
  const limit = joinBelow.value;
  const waiting = othersWaiting(state);
  if (waiting < limit) return null;
  const when = limit === 1 ? 'nobody else is waiting' : `fewer than ${people(limit)} are waiting`;
  return `Joining when ${when} · ${people(waiting)} now`;
}

function options(): HTMLElement {
  const n = computed(() => settings.value.fewerThan);
  const capped = computed(() => joinBelow.value < settings.value.fewerThan);
  return (
    <div class="wt-options">
      <span class="wt-label">Join the queue</span>
      <div class="wt-rule">
        <label>
          <span>{computed(() => ruleText(n.value))}</span>
          <span class="wt-hint">Not counting you or the DJ</span>
        </label>
        <Stepper
          value={n}
          min={MIN}
          max={MAX}
          unit="people"
          short={(v) => `<${v}`}
          onchange={(fewerThan) => setSettings({ ...settings.peek(), fewerThan })}
        />
      </div>
      {() =>
        capped.value && (
          <span class="wt-hint wt-warn">
            Auto-leave leaves when {people(leaveAtWaiting.value ?? 0)} {leaveAtWaiting.value === 1 ? 'is' : 'are'} waiting, so
            this joins only below that to avoid joining and leaving over and over.
          </span>
        )
      }
    </div>
  );
}

export const autoJoin: ToggleTool = {
  kind: 'toggle',
  id: 'auto-join',
  command: 'autojoin',
  name: 'Auto-join',
  blurb: 'Off',
  onBlurb: 'On',
  glyph: 'J',
  options,
  enable(ctx: ToggleContext) {
    const stopIntent = watchLeaveIntent();
    const wasRemoved = removalTracker();
    let switchingOff = false;
    // The removal check runs first, on the same state, so a removal stops the
    // join that the now-empty queue would otherwise trigger.
    const removed = (state: RoomState) => {
      if (!wasRemoved(state)) return false;
      if (!switchingOff) {
        switchingOff = true;
        console.info('WavezFM Tools: removed from the queue, switching Auto-join off');
        ctx.turnOff('Off: you were removed from the queue');
      }
      return true;
    };
    const [stopJoining, recheck] = watchQueue(
      'Auto-join',
      (state) => {
        if (removed(state)) return false;
        ctx.setStatus(statusFor(state));
        return (
          !state.queue.isJoined &&
          !state.queue.isCurrentDj &&
          !state.queue.isLocked &&
          !state.queue.isFull &&
          state.permissions.joinQueue &&
          othersWaiting(state) < joinBelow.value
        );
      },
      () => requireBridge().actions.joinQueue(),
    );
    // Look again when the rule (or Auto-leave's) changes.
    const stopWatching = effect(() => {
      void joinBelow.value;
      untracked(recheck);
    });
    return () => {
      stopWatching();
      stopIntent();
      stopJoining();
    };
  },
};
