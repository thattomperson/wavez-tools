import { getActivePlaylist, getTracks, type Playlist, type PlaylistTrack } from './api';
import { getState } from './bridge';

const URL_KEYS = ['url', 'permalinkUrl', 'permalink_url', 'sourceUrl'];

export function trackLink(track: PlaylistTrack): string {
  for (const key of URL_KEYS) {
    const value = track[key];
    if (typeof value === 'string' && /^https?:/.test(value)) return value;
  }
  const id = String(track.sourceId);
  if (/^https?:/.test(id)) return id;
  if (track.source === 'youtube') return `https://youtu.be/${id}`;
  if (track.source === 'soundcloud') {
    return /^\d+$/.test(id)
      ? `https://api.soundcloud.com/tracks/${id}`
      : `https://soundcloud.com/${id.replace(/^\/+/, '')}`;
  }
  return id;
}

export function trackName(track: PlaylistTrack): string {
  const title = track.customTitle || track.title;
  const artist = track.customArtist || track.artist;
  return artist ? `${artist} - ${title}` : title;
}

// Is this playlist track the one I'm playing right now?
function isPlayingNow(track: PlaylistTrack): boolean {
  const state = getState();
  const playback = state?.playback;
  if (!state || !playback || !state.queue.isCurrentDj) return false;
  return (
    playback.trackId === track.id ||
    (playback.source === track.source && playback.sourceId === track.sourceId)
  );
}

export async function getNextTrack(): Promise<{ playlist: Playlist; track: PlaylistTrack }> {
  const playlist = await getActivePlaylist();
  const tracks = await getTracks(playlist.id);
  if (!tracks.length) throw new Error(`"${playlist.name}" is empty.`);
  // While you're DJing, the playing track may still sit at the top; skip it.
  const track = isPlayingNow(tracks[0]) && tracks.length > 1 ? tracks[1] : tracks[0];
  return { playlist, track };
}
