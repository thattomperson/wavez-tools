import { formatDuration } from '../lib/format';
import { getActivePlaylist, getTracks } from '../wavez/api';
import { trackArtist, trackTitle } from '../wavez/tracks';
import { message } from '../ui/components';
import { h } from '../ui/dom';
import type { ScreenTool } from './types';

const PREVIEW_COUNT = 10;

export const playlistInfo: ScreenTool = {
  kind: 'screen',
  name: 'Playlist info',
  blurb: 'Active playlist length and first tracks',
  glyph: 'P',
  async open({ body, setSubtitle, signal }) {
    body.replaceChildren(message('Loading playlist…'));
    const playlist = await getActivePlaylist();
    const tracks = await getTracks(playlist.id);
    if (signal.aborted) return;
    const total = tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
    setSubtitle(`${playlist.name} · ${tracks.length} tracks · ${formatDuration(total)}`);
    body.replaceChildren(
      <ol class="wt-tracks">
        {tracks.slice(0, PREVIEW_COUNT).map((track, i) => (
          <li class="wt-track">
            <span class="wt-track-n">{i + 1}</span>
            <span class="wt-track-text">
              <span class="wt-ellipsis">{trackTitle(track)}</span>
              <span class="wt-ellipsis wt-muted">{trackArtist(track)}</span>
            </span>
            <span class="wt-muted">{formatDuration(track.durationMs)}</span>
          </li>
        ))}
      </ol>,
    );
  },
};
