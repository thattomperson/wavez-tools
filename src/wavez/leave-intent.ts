// Remembers when you last chose to leave the DJ queue, so a drop out of the
// queue can be told apart from being removed by a mod. The bridge doesn't say
// why you left, so this watches the ways you can leave yourself:
// - Auto-leave, which calls leaveQueue() below
// - clicking a button labelled "Leave" on the page
// - any packet the page sends whose event mentions leaving
import { requireBridge, type ActionResult } from './bridge';
import { onOutgoing } from './socket';

// A leave that shows up within this long of one of the above counts as yours.
const GRACE_MS = 15_000;

let lastIntent = 0;

const mark = () => {
  lastIntent = Date.now();
};

/** True if you asked to leave the queue in the last few seconds. */
export function leftOnPurpose(): boolean {
  return Date.now() - lastIntent < GRACE_MS;
}

/** Leaves the queue through the bridge, remembering that it was on purpose. */
export function leaveQueue(): ActionResult {
  mark();
  return requireBridge().actions.leaveQueue();
}

/** Starts watching for leaves you make on the page. Returns a function that stops it. */
export function watchLeaveIntent(): () => void {
  const onClick = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest('button, [role="button"], a') : null;
    if (!target) return;
    const label = `${target.textContent ?? ''} ${target.getAttribute('aria-label') ?? ''} ${target.getAttribute('title') ?? ''}`;
    if (/\bleave\b/i.test(label)) mark();
  };
  document.addEventListener('click', onClick, true);
  const stopSocket = onOutgoing((packet) => {
    if (/leave/i.test(packet.event)) mark();
  });
  return () => {
    document.removeEventListener('click', onClick, true);
    stopSocket();
  };
}
