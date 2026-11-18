// Voice & video: while it's on, a call popup sits at the bottom right of the
// room, just left of the chat. Everyone in the same WavezFM room who has it on
// can join the same LiveKit call. Joining loads LiveKit (src/call/load.ts) and
// asks the token Worker in server/call-token for a token.
import { effect } from '@preact/signals-core';
import { mountCallPopup } from '../call/popup';
import { createCallSession } from '../call/session';
import { requireBridge, type RoomState } from '../wavez/bridge';
import type { ToggleTool } from './types';

function me(state: RoomState) {
  const u = state.currentUser;
  return u ? { id: u.id, name: u.displayUsername || u.username } : null;
}

export const voiceCall: ToggleTool = {
  kind: 'toggle',
  id: 'voice-call',
  command: 'call',
  name: 'Voice & video',
  blurb: 'Off',
  onBlurb: 'On: call popup next to the chat',
  glyph: 'V',
  enable({ setStatus }) {
    const bridge = requireBridge();
    let roomId: string | null = null;
    let stop: (() => void) | null = null;

    // One call per WavezFM room. Moving to another room hangs up and shows that room's call.
    const open = () => {
      const state = bridge.room.getState();
      const id = state?.room.id ?? null;
      if (id === roomId) return;
      stop?.();
      stop = null;
      roomId = id;
      if (!state || !id) return;
      const call = createCallSession(id, me(state));
      const unmount = mountCallPopup(call);
      const stopStatus = effect(() => {
        const n = call.people.value.length;
        setStatus(call.phase.value === 'connected' ? `In call with ${n - 1} other${n === 2 ? '' : 's'}` : null);
      });
      stop = () => {
        stopStatus();
        unmount();
        call.dispose();
      };
    };

    open();
    const unsubscribe = bridge.room.subscribe('room_changed', open);
    return () => {
      unsubscribe();
      stop?.();
    };
  },
};
