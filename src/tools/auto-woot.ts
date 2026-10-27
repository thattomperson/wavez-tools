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
    const woot = () => {
      const state = bridge.room.getState();
      if (!state?.playback || !state.votes.canVote || state.votes.clientVote === 'woot') return;
      const result = bridge.actions.vote('woot');
      if (!result.ok) console.warn(`WavezFM Tools: AutoWoot vote failed (${result.code})`);
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
