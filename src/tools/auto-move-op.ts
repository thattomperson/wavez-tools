import { effect } from '@preact/signals-core';
import { playlists } from '../wavez/api';
import { getState, requireBridge } from '../wavez/bridge';
import type { NextSongState } from '../wavez/next-song';
import { getPlaylistQueue, trackName } from '../wavez/tracks';
import { clearAutoMoveLog, logAutoMove as log, showAutoMoveLog } from './auto-move-log';
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
  subcommands: {
    log: { help: 'shows what Auto-move checked and did lately, and which of your songs played', run: showAutoMoveLog },
    clearlog: { help: 'empties the Auto-move log', run: clearAutoMoveLog },
  },
  enable({ nextSong }) {
    let stopped = false;
    let moving = false;
    let inARow = 0;
    let lastPlaylistId: string | undefined;
    // For the log: what the last check said, and songs moved to the end lately.
    let lastChecked: { trackId: string; name: string; op: boolean; moved: boolean } | undefined;
    const moved = new Map<string, number>();
    let lastLogged = '';
    log('switched on');

    const check = async (state: NextSongState) => {
      if (stopped) return;
      if (state.status === 'failed') {
        const line = `couldn't check ${state.track ? trackName(state.track) : 'the next song'}: ${state.error}`;
        if (line !== lastLogged) log((lastLogged = line));
        return;
      }
      if (moving || state.status !== 'ready') return;
      const { track, playlist: listed, result } = state;
      const op = result.op || result.blocked;
      const line = `next in "${listed.name}": ${trackName(track)} is ${result.blocked ? 'blocked' : op ? 'OP' : 'fine'}`;
      if (line !== lastLogged) log((lastLogged = line));
      lastChecked = { trackId: track.id, name: trackName(track), op, moved: false };
      // A run doesn't carry over to another playlist (say after Playlist rotation switched).
      if (listed.id !== lastPlaylistId) inARow = 0;
      lastPlaylistId = listed.id;
      if (!op) {
        inARow = 0;
        return;
      }
      // A playlist's starting song back at the front means Playlist rotation is
      // switching to the next playlist, so don't send it round again.
      if (rotationDue(listed.id, track.id)) {
        log('  left it: Playlist rotation is switching playlists');
        return;
      }
      moving = true;
      try {
        if (inARow >= EASE_OFF_AFTER) await sleep(EASE_OFF_MS);
        if (stopped) return;
        const { playlist, tracks, nextIndex } = await getPlaylistQueue();
        if (stopped) return;
        // The playlist moved on while we were checking: check the song that's next now.
        if (tracks[nextIndex]?.id !== track.id) {
          log('  playlist changed while checking; checking again');
          nextSong.refresh();
          return;
        }
        if (tracks.length < 2) {
          log('  left it: only one song in the playlist');
          return;
        }
        if (inARow >= tracks.length) {
          console.warn(`WavezFM Tools: every song in "${playlist.name}" is OP; leaving ${trackName(track)} where it is.`);
          log('  left it: every song in the playlist is OP');
          return;
        }
        const order = [...tracks.filter((t) => t.id !== track.id), track];
        await playlists.reorderTracks(playlist.id, order.map((t) => t.id));
        inARow++;
        moved.set(track.id, Date.now());
        if (lastChecked?.trackId === track.id) lastChecked.moved = true;
        log(`  moved to the end of "${playlist.name}"`);
        nextSong.refresh();
      } catch (err) {
        console.warn('WavezFM Tools: Auto-move OP songs failed', err);
        log(`  move failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        moving = false;
      }
    };

    const unsubscribe = effect(() => void check(nextSong.value));

    // Note each of your songs as it starts, and anything off about it.
    let lastPlayback = '';
    const stopWatchingPlays = requireBridge().room.subscribe('playback_changed', () => {
      const state = getState();
      const playback = state?.playback;
      if (!playback || !state.currentUser || playback.djId !== state.currentUser.id) return;
      if (playback.playbackKey === lastPlayback) return;
      lastPlayback = playback.playbackKey;
      const notes: string[] = [];
      const movedAt = moved.get(playback.trackId);
      if (movedAt) notes.push(`it was moved to the end ${Math.round((Date.now() - movedAt) / 1000)}s ago`);
      if (lastChecked && lastChecked.trackId !== playback.trackId) notes.push(`the panel had ${lastChecked.name} as next`);
      else if (lastChecked?.op && !lastChecked.moved) notes.push('it was OP and not moved');
      else if (!lastChecked) notes.push('no check finished before it started');
      const name = playback.artist ? `${playback.artist} - ${playback.title}` : playback.title;
      log(`PLAYING ${name}${notes.length ? ` (${notes.join('; ')})` : ''}`);
      lastChecked = undefined;
      moved.clear();
    });

    return () => {
      stopped = true;
      unsubscribe();
      stopWatchingPlays();
      log('switched off');
    };
  },
};
