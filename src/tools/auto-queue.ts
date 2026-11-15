// Auto-join: joins the DJ queue when nobody else is waiting. Paired with
// Auto-leave (auto-leave.ts) it fills gaps without holding up the room.
// If someone else takes you out of the queue (a mod removing you), it switches
// itself off so it doesn't put you straight back.
import { requireBridge, type ActionResult, type RoomState } from '../wavez/bridge';
import { leftOnPurpose, watchLeaveIntent } from '../wavez/leave-intent';
import type { ToggleContext, ToggleTool } from './types';

// Don't retry an action faster than this while the room catches up.
const COOLDOWN_MS = 3000;

/** Users waiting in the queue, not counting you or whoever is DJing now. */
export function othersWaiting(state: RoomState): number {
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

// Calls `onRemoved` when you drop out of the queue while waiting for your turn
// without having asked to leave. Leaving after your own song isn't counted,
// since that's the room rotating rather than a removal.
function watchRemoval(onRemoved: () => void): () => void {
  const bridge = requireBridge();
  let wasWaiting = false;
  let roomId: string | null = null;

  const check = () => {
    const state = bridge.room.getState();
    if (!state?.currentUser) return;
    const { queue } = state;
    const waiting = queue.isJoined && !queue.isCurrentDj;
    const out = !queue.isJoined && !queue.isCurrentDj && state.playback?.djId !== state.currentUser.id;
    const sameRoom = roomId === state.room.id;
    if (wasWaiting && out && sameRoom && !leftOnPurpose()) {
      onRemoved();
      return;
    }
    wasWaiting = waiting;
    roomId = state.room.id;
  };

  const stopIntent = watchLeaveIntent();
  const stop = bridge.room.subscribe('queue_changed', check);
  check();
  return () => {
    stop();
    stopIntent();
  };
}

export const autoJoin: ToggleTool = {
  kind: 'toggle',
  id: 'auto-join',
  command: 'autojoin',
  name: 'Auto-join when queue is empty',
  blurb: 'Off',
  onBlurb: 'On: joins the queue when nobody else is waiting',
  glyph: 'J',
  enable(ctx: ToggleContext) {
    const stopRemoval = watchRemoval(() => {
      console.info('WavezFM Tools: removed from the queue, switching Auto-join off');
      ctx.turnOff('Off: you were removed from the queue');
    });
    const stopJoining = watchQueue(
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
    return () => {
      stopRemoval();
      stopJoining();
    };
  },
};
