import { effect } from '@preact/signals-core';
import { playlists } from '../wavez/api';
import type { NextSongState } from '../wavez/next-song';
import { getPlaylistQueue, trackName } from '../wavez/tracks';
import { rotationDue } from './playlist-rotation';
import type { ToggleTool } from './types';

// Watches the header's opcheck of the next song and moves the song to the end
// of the playlist when it's OP. The store then checks the new next song, so a
// run of OP songs is worked through one at a time.
//
// A long run of OP songs is still worked through all the way, but after this
// many in a row each move waits a moment, to go easy on the bot. It only gives
// up once it's moved as many songs as the playlist holds, which means
// everything in it is OP.
const EASE_OFF_AFTER = 10;
const EASE_OFF_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const autoMoveOp: ToggleTool = {
  kind: 'toggle',
  id: 'auto-move-op',
  command: 'automove',
  name: 'Auto-move OP songs',
  blurb: 'Off',
  onBlurb: "On: moves the next song to the end if it's OP",
  glyph: 'M',
  enable({ nextSong }) {
    let stopped = false;
    let moving = false;
    let inARow = 0;
    let lastPlaylistId: string | undefined;

    const check = async (state: NextSongState) => {
      if (stopped || moving || state.status !== 'ready') return;
      // A run doesn't carry over to another playlist (say after Playlist rotation switched).
      if (state.playlist.id !== lastPlaylistId) inARow = 0;
      lastPlaylistId = state.playlist.id;
      if (!state.result.op && !state.result.blocked) {
        inARow = 0;
        return;
      }
      const { track } = state;
      // A playlist's starting song back at the front means Playlist rotation is
      // switching to the next playlist, so don't send it round again.
      if (rotationDue(state.playlist.id, track.id)) return;
      moving = true;
      try {
        if (inARow >= EASE_OFF_AFTER) await sleep(EASE_OFF_MS);
        if (stopped) return;
        const { playlist, tracks, nextIndex } = await getPlaylistQueue();
        if (stopped) return;
        // The playlist moved on while we were checking: check the song that's next now.
        if (tracks[nextIndex]?.id !== track.id) {
          nextSong.refresh();
          return;
        }
        if (tracks.length < 2) return;
        if (inARow >= tracks.length) {
          console.warn(`WavezFM Tools: every song in "${playlist.name}" is OP; leaving ${trackName(track)} where it is.`);
          return;
        }
        const order = [...tracks.filter((t) => t.id !== track.id), track];
        await playlists.reorderTracks(playlist.id, order.map((t) => t.id));
        inARow++;
        nextSong.refresh();
      } catch (err) {
        console.warn('WavezFM Tools: Auto-move OP songs failed', err);
      } finally {
        moving = false;
      }
    };

    const unsubscribe = effect(() => void check(nextSong.value));
    return () => {
      stopped = true;
      unsubscribe();
    };
  },
};
