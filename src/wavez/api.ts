// WavezFM HTTP API via the official @wavezfm/api SDK, using the browser's
// session cookies. Only the resources we use are created, so the rest of the
// SDK is tree-shaken out of the bookmarklet.
import { createApi, createPlaylistResource, type PlaylistSummary, type PlaylistTrack } from '@wavezfm/api';

export type { PlaylistSummary, PlaylistTrack };

const api = createApi({
  baseURL: 'https://api.wavez.fm',
  credentials: 'include',
  // The SDK calls fetch as a method on itself; bind it so the browser doesn't
  // throw "Illegal invocation".
  fetch: (input, init) => window.fetch(input, init),
});

export const playlists = createPlaylistResource(api);

export async function getActivePlaylist(): Promise<PlaylistSummary> {
  const { data } = await playlists.list();
  const active = data.find((p) => p.isActive);
  if (!active) throw new Error('No active playlist.');
  return active;
}

export async function getTracks(playlistId: string): Promise<PlaylistTrack[]> {
  const { data } = await playlists.getTracks(playlistId);
  return data
    .map((track, index) => ({ track, index }))
    .sort((a, b) => (a.track.position ?? a.index) - (b.track.position ?? b.index))
    .map(({ track }) => track);
}
