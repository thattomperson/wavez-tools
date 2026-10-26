// Minimal client for the WavezFM HTTP API, using the browser's session cookies.
// Paths match the official @wavezfm/api SDK.

const API_BASES = ['https://api.wavez.fm', `${location.origin}/api`];

export interface Playlist {
  id: string;
  name: string;
  isActive?: boolean;
  totalTracks?: number;
  itemCount?: number;
}

export interface PlaylistTrack {
  id: string;
  source: string;
  sourceId: string;
  title: string;
  artist?: string;
  durationMs?: number;
  thumbnailUrl?: string | null;
  position?: number;
  isLive?: boolean;
  customTitle?: string | null;
  customArtist?: string | null;
  [key: string]: unknown;
}

let apiBase: string | null = null;

export async function http<T>(path: string): Promise<T> {
  const bases = apiBase ? [apiBase] : API_BASES;
  let lastErr: unknown;
  for (const base of bases) {
    try {
      const res = await fetch(base + path, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
      }
      apiBase = base;
      return body as T;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function listPlaylists(): Promise<Playlist[]> {
  return (await http<Playlist[] | null>('/playlists')) ?? [];
}

export async function getActivePlaylist(): Promise<Playlist> {
  const active = (await listPlaylists()).find((p) => p.isActive);
  if (!active) throw new Error('No active playlist.');
  return active;
}

export async function getTracks(playlistId: string): Promise<PlaylistTrack[]> {
  const list = (await http<PlaylistTrack[] | null>(`/playlists/${encodeURIComponent(playlistId)}/tracks`)) ?? [];
  return list
    .map((track, index) => ({ track, index }))
    .sort((a, b) => (a.track.position ?? a.index) - (b.track.position ?? b.index))
    .map(({ track }) => track);
}
