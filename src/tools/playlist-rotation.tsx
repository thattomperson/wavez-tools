// Playlist rotation: WavezFM caps a playlist at 500 songs, so a big library
// gets split across several. This works through them one after another.
//
// When a playlist in the rotation becomes active, the song at its front is
// remembered as its starting song. Once that song has left the front (played,
// or moved to the end by Auto-move OP songs) and comes back round to be next
// again, the whole playlist has been through, so the next playlist in the
// rotation becomes active. Playlists go in the order they have on WavezFM,
// back to the first after the last.
//
// Auto-move OP songs asks `rotationDue()` before moving a song, so it leaves a
// starting song that's come back round alone and lets this switch instead.
import { computed, effect, signal, untracked } from '@preact/signals-core';
import { button } from '../ui/components';
import { h } from '../ui/dom';
import { playlists, type PlaylistSummary } from '../wavez/api';
import { getPlaylistQueue, trackName } from '../wavez/tracks';
import type { ToggleContext, ToggleTool } from './types';

const STORAGE_KEY = 'wavez-tools:rotation';

interface Start {
  trackId: string;
  /** Shown under the cog. */
  name: string;
  /** True once the song has left the front, so seeing it next again means a full cycle. */
  armed: boolean;
}

interface RotationSettings {
  /** Ids of the playlists in the rotation. */
  playlists: string[];
  /** Starting song per playlist id. */
  starts: Record<string, Start>;
}

const settings = signal(loadSettings());

function setSettings(next: RotationSettings) {
  settings.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: settings just won't be remembered.
  }
}

function loadSettings(): RotationSettings {
  let saved: Partial<Record<keyof RotationSettings, unknown>> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    // Fall back to the defaults.
  }
  const ids = Array.isArray(saved.playlists) ? saved.playlists.filter((id): id is string => typeof id === 'string') : [];
  const starts: Record<string, Start> = {};
  if (saved.starts && typeof saved.starts === 'object') {
    for (const [id, value] of Object.entries(saved.starts as Record<string, Partial<Start>>)) {
      if (typeof value?.trackId === 'string') {
        starts[id] = { trackId: value.trackId, name: String(value.name ?? ''), armed: value.armed === true };
      }
    }
  }
  return { playlists: ids, starts };
}

function setStart(playlistId: string, start: Start | null) {
  const s = settings.peek();
  const starts = { ...s.starts };
  if (start) starts[playlistId] = start;
  else delete starts[playlistId];
  setSettings({ ...s, starts });
}

/** Your playlists as last fetched, for the cog and the status line. */
const allPlaylists = signal<PlaylistSummary[] | null>(null);

async function loadPlaylists(): Promise<PlaylistSummary[]> {
  const { data } = await playlists.list();
  allPlaylists.value = data;
  return data;
}

const songCount = (p: PlaylistSummary) => p.totalTracks ?? p.itemCount;

/** The rotation in WavezFM's playlist order. */
const ringOf = (all: PlaylistSummary[]) => all.filter((p) => settings.peek().playlists.includes(p.id));

/** The playlist after `current` in the rotation, skipping empty ones. */
function nextAfter(ring: PlaylistSummary[], current: PlaylistSummary): PlaylistSummary | undefined {
  const at = ring.findIndex((p) => p.id === current.id);
  for (let i = 1; i < ring.length; i++) {
    const p = ring[(at + i) % ring.length];
    if (songCount(p) !== 0) return p;
  }
  return undefined;
}

let running = false;

/**
 * True when `trackId` is the starting song of `playlistId` and it's come back
 * round, so the rotation is about to switch playlists. Auto-move OP songs
 * leaves such a song where it is rather than sending it round again.
 */
export function rotationDue(playlistId: string, trackId: string): boolean {
  if (!running) return false;
  const s = settings.peek();
  const start = s.starts[playlistId];
  return s.playlists.length >= 2 && s.playlists.includes(playlistId) && !!start?.armed && start.trackId === trackId;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function run(ctx: ToggleContext): () => void {
  const { nextSong } = ctx;
  let stopped = false;
  let busy = false;
  let again = false;

  // Looks at the active playlist: notes its starting song, arms it once it's
  // left the front, and switches when it's next again.
  const check = async () => {
    if (stopped) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      const all = await loadPlaylists();
      const ring = ringOf(all);
      const active = all.find((p) => p.isActive);
      if (stopped) return;
      if (ring.length < 2) return ctx.setStatus('On: pick two or more playlists with the cog');
      if (!active) return ctx.setStatus('No active playlist');
      if (!ring.includes(active)) return ctx.setStatus(`Waiting: "${active.name}" isn't in the rotation`);
      const target = nextAfter(ring, active);
      if (!target) return ctx.setStatus('Waiting: the other playlists are empty');

      const { tracks, nextIndex } = await getPlaylistQueue(active);
      if (stopped) return;
      const next = tracks[nextIndex];
      const start = settings.peek().starts[active.id];
      const at = start ? tracks.findIndex((t) => t.id === start.trackId) : -1;

      if (!start || at < 0) {
        // New to the rotation, or the starting song was removed: start here.
        setStart(active.id, { trackId: next.id, name: trackName(next), armed: false });
      } else if (at !== nextIndex) {
        if (!start.armed) setStart(active.id, { ...start, armed: true });
      } else if (start.armed) {
        console.info(`WavezFM Tools: "${active.name}" has been all the way through, switching to "${target.name}"`);
        await switchTo(target, active);
        if (stopped) return;
        // Both get a fresh starting song next time they're active.
        setStart(active.id, null);
        setStart(target.id, null);
        nextSong.refresh();
        again = true;
        return;
      }

      const mark = settings.peek().starts[active.id];
      const left = mark.armed ? (tracks.findIndex((t) => t.id === mark.trackId) - nextIndex + tracks.length) % tracks.length : tracks.length;
      ctx.setStatus(`${plural(left, 'song', 'songs')} left in ${active.name}, then ${target.name}`, left <= 1 ? 'soon' : undefined);
    } catch (err) {
      console.warn('WavezFM Tools: Playlist rotation failed', err);
      if (!stopped) ctx.setStatus("Couldn't read your playlists, trying again next song");
    } finally {
      busy = false;
      if (again && !stopped) {
        again = false;
        void check();
      }
    }
  };

  // Look again whenever the next song (or the playlist) changes. The store
  // notes the track before it asks the bot, so this usually runs ahead of
  // Auto-move OP songs; `rotationDue` covers it when it doesn't.
  let seen = '';
  const stopFollowing = effect(() => {
    const { playlist, track } = nextSong.value;
    const key = `${playlist?.id}:${track?.id}`;
    if (!track || key === seen) return;
    seen = key;
    untracked(() => void check());
  });
  // And when the playlists in the rotation change.
  const picked = computed(() => settings.value.playlists.join());
  const stopWatching = effect(() => {
    void picked.value;
    untracked(() => void check());
  });

  running = true;
  return () => {
    stopped = true;
    running = false;
    stopFollowing();
    stopWatching();
  };
}

/** Makes `target` the active playlist, and makes sure `previous` isn't still active too. */
async function switchTo(target: PlaylistSummary, previous: PlaylistSummary) {
  await playlists.update(target.id, { isActive: true });
  const all = await loadPlaylists();
  if (all.find((p) => p.id === previous.id)?.isActive) await playlists.update(previous.id, { isActive: false });
}

// --- options under the cog ------------------------------------------------------

function togglePlaylist(id: string, on: boolean) {
  const s = settings.peek();
  const ids = s.playlists.filter((p) => p !== id);
  setSettings({ ...s, playlists: on ? [...ids, id] : ids });
}

function PlaylistRow(props: { playlist: PlaylistSummary }) {
  const { playlist } = props;
  const id = `wt-rotate-${playlist.id}`;
  const on = computed(() => settings.value.playlists.includes(playlist.id));
  const count = songCount(playlist);
  const hint = computed(() => {
    const parts: string[] = [];
    if (count !== undefined) parts.push(plural(count, 'song', 'songs'));
    if (playlist.isActive) parts.push('active');
    const start = settings.value.starts[playlist.id];
    if (start?.name) parts.push(`started at ${start.name}`);
    return parts.join(' · ');
  });
  return (
    <div class={computed(() => (on.value ? 'wt-rule' : 'wt-rule wt-rule-off'))}>
      <input
        type="checkbox"
        id={id}
        checked={on}
        onchange={(e) => togglePlaylist(playlist.id, (e.currentTarget as HTMLInputElement).checked)}
      />
      <label for={id}>
        <span class="wt-ellipsis">{playlist.name}</span>
        <span class="wt-hint wt-ellipsis">{hint}</span>
      </label>
    </div>
  );
}

function options(): HTMLElement {
  const failed = signal(false);
  loadPlaylists().catch((err) => {
    console.warn('WavezFM Tools: loading playlists failed', err);
    failed.value = true;
  });
  return (
    <div class="wt-options">
      <span class="wt-label">Rotate through</span>
      {() => {
        const list = allPlaylists.value;
        if (list) return list.map((p) => <PlaylistRow playlist={p} />);
        return <span class="wt-hint">{failed.value ? "Couldn't load your playlists." : 'Loading playlists…'}</span>;
      }}
      <span class="wt-hint">
        Each playlist's starting song is the one at the front when it became active. When that song comes round to
        be next again, the next ticked playlist becomes active, in your WavezFM playlist order. OP songs moved to the
        end still count as played through.
      </span>
      <div>
        {button('Forget starting songs', () => setSettings({ ...settings.peek(), starts: {} }), {
          disabled: computed(() => Object.keys(settings.value.starts).length === 0),
        })}
      </div>
    </div>
  );
}

export const playlistRotation: ToggleTool = {
  kind: 'toggle',
  id: 'playlist-rotation',
  command: 'rotate',
  name: 'Playlist rotation',
  blurb: 'Off',
  onBlurb: 'On',
  glyph: 'R',
  enable: run,
  options,
};
