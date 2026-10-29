// Two switches that manage your place in the DJ queue: join when nobody else
// is waiting, and leave once someone else joins. Together they fill gaps
// without holding up the room.
import { requireBridge, type ActionResult, type RoomState } from '../wavez/bridge';
import type { ToggleTool } from './types';

// Don't retry an action faster than this while the room catches up.
const COOLDOWN_MS = 3000;

/** Users waiting in the queue, not counting you or whoever is DJing now. */
function othersWaiting(state: RoomState): number {
  const { queue, currentUser } = state;
  return queue.entries.filter((e) => e.userId !== currentUser?.id && e.userId !== queue.currentDjId).length;
}

// Runs `act` whenever the queue or playback changes and `shouldAct` says so,
// at most once per cooldown. Re-checks after the cooldown in case nothing else
// changes in the meantime.
function watchQueue(
  name: string,
  shouldAct: (state: RoomState) => boolean,
  act: () => ActionResult,
): () => void {
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
  return () => {
    clearTimeout(timer);
    stops.forEach((stop) => stop());
  };
}

export const autoJoin: ToggleTool = {
  kind: 'toggle',
  id: 'auto-join',
  name: 'Auto-join when queue is empty',
  blurb: 'Off',
  onBlurb: 'On: joins the queue when nobody else is waiting',
  glyph: 'J',
  enable() {
    return watchQueue(
      'Auto-join',
      (state) =>
        !state.queue.isJoined &&
        !state.queue.isCurrentDj &&
        !state.queue.isLocked &&
        !state.queue.isFull &&
        state.permissions.joinQueue &&
        othersWaiting(state) === 0,
      () => requireBridge().actions.joinQueue(),
    );
  },
};

export const autoLeave: ToggleTool = {
  kind: 'toggle',
  id: 'auto-leave',
  name: 'Auto-leave when others are queued',
  blurb: 'Off',
  onBlurb: "On: leaves the queue when someone else is waiting (not while you're playing)",
  glyph: 'L',
  enable() {
    return watchQueue(
      'Auto-leave',
      // Never leave mid-song: that would cut your own track short.
      (state) => state.queue.isJoined && !state.queue.isCurrentDj && othersWaiting(state) > 0,
      () => requireBridge().actions.leaveQueue(),
    );
  },
};
