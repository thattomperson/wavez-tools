// Keeps track of the next song in the active playlist and its opcheck, and
// re-checks whenever the room's playback changes. The store is a read-only
// signal of the state, so reading `nextSong.value` in an effect or a live h()
// binding re-runs it when the state changes.
import { computed, signal, type ReadonlySignal } from '@preact/signals-core';
import type { PlaylistSummary, PlaylistTrack } from './api';
import { requireBridge } from './bridge';
import { opcheck, type OpcheckResult } from './opcheck';
import { getNextTrack, trackLink } from './tracks';

export type NextSongState =
  | { status: 'loading'; playlist?: PlaylistSummary; track?: PlaylistTrack }
  | { status: 'ready'; playlist: PlaylistSummary; track: PlaylistTrack; result: OpcheckResult }
  | { status: 'failed'; playlist?: PlaylistSummary; track?: PlaylistTrack; error: string };

export interface NextSongStore extends ReadonlySignal<NextSongState> {
  refresh(): void;
  dispose(): void;
}

// The playlist rotates a moment after the song changes, so wait before re-checking.
const PLAYBACK_SETTLE_MS = 2500;

export function createNextSongStore(): NextSongStore {
  const state = signal<NextSongState>({ status: 'loading' });
  let run = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (next: NextSongState) => {
    state.value = next;
  };

  const refresh = async () => {
    const id = ++run;
    const { playlist, track } = state.peek();
    set({ status: 'loading', playlist, track });
    let found: { playlist: PlaylistSummary; track: PlaylistTrack } | undefined;
    try {
      found = await getNextTrack();
      if (id !== run) return;
      set({ status: 'loading', ...found });
      const result = await opcheck(trackLink(found.track));
      if (id === run) set({ status: 'ready', ...found, result });
    } catch (err) {
      if (id === run) set({ status: 'failed', ...found, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const unsubscribe = requireBridge().room.subscribe('playback_changed', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, PLAYBACK_SETTLE_MS);
  });
  void refresh();

  return Object.assign(
    computed(() => state.value),
    {
      refresh: () => void refresh(),
      dispose() {
        run++;
        clearTimeout(timer);
        unsubscribe();
      },
    },
  );
}
