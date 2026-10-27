import { playlists } from '../wavez/api';
import type { NextSongState } from '../wavez/next-song';
import { getPlaylistQueue, trackName } from '../wavez/tracks';
import type { ToggleTool } from './types';

// Watches the header's opcheck of the next song and moves the song to the end
// of the playlist when it's OP. The store then checks the new next song, so a
// run of OP songs is worked through one at a time.
//
// After this many OP songs in a row, stop until a song passes, so a playlist
// that's mostly OP doesn't send the bot a check for every song in it.
const MAX_IN_A_ROW = 10;

export const autoMoveOp: ToggleTool = {
  kind: 'toggle',
  id: 'auto-move-op',
  name: 'Auto-move OP songs',
  blurb: 'Off',
  onBlurb: "On: moves the next song to the end if it's OP",
  glyph: 'M',
  enable({ nextSong }) {
    let stopped = false;
    let moving = false;
    let inARow = 0;

    const check = async (state: NextSongState) => {
      if (stopped || moving || state.status !== 'ready') return;
      if (!state.result.op && !state.result.blocked) {
        inARow = 0;
        return;
      }
      const { track } = state;
      if (inARow >= MAX_IN_A_ROW) {
        console.warn(`WavezFM Tools: moved ${inARow} OP songs in a row; leaving ${trackName(track)} where it is.`);
        return;
      }
      moving = true;
      try {
        const { playlist, tracks, nextIndex } = await getPlaylistQueue();
        // The playlist may have moved on while we were checking.
        if (stopped || tracks[nextIndex]?.id !== track.id || tracks.length < 2) return;
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

    const unsubscribe = nextSong.subscribe((state) => void check(state));
    void check(nextSong.get());
    return () => {
      stopped = true;
      unsubscribe();
    };
  },
};
