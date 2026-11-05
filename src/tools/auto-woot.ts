import { requireBridge } from '../wavez/bridge';
import type { ToggleTool } from './types';

// Give the room a moment to register the new track before voting.
const WOOT_DELAY_MS = 1500;

export const autoWoot: ToggleTool = {
  kind: 'toggle',
  id: 'auto-woot',
  name: 'AutoWoot',
  blurb: 'Off',
  onBlurb: 'On: woots every song for you',
  glyph: 'W',
  enable() {
    const bridge = requireBridge();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Each song gets at most one automatic woot, and none once you've voted on
    // it yourself, so a manual meh sticks.
    let handledKey: string | null = null;
    const woot = () => {
      const state = bridge.room.getState();
      const playback = state?.playback;
      if (!state || !playback || playback.playbackKey === handledKey) return;
      if (state.votes.clientVote !== null) {
        handledKey = playback.playbackKey;
        return;
      }
      if (!state.votes.canVote) return;
      handledKey = playback.playbackKey;
      const result = bridge.actions.vote('woot');
      if (!result.ok) {
        // Let the next playback event try again.
        handledKey = null;
        console.warn(`WavezFM Tools: AutoWoot vote failed (${result.code})`);
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(woot, WOOT_DELAY_MS);
    };
    schedule();
    const unsubscribe = bridge.room.subscribe('playback_changed', schedule);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  },
};
