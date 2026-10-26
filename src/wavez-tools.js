// WavezFM Tools bookmarklet.
// Click the bookmark on a wavez.fm room page to toggle a small floating panel.
//
// Data sources:
//  - window.WavezFM (Room Extension API v1): room state + actions.sendChat
//  - https://api.wavez.fm (same endpoints as @wavezfm/api), using your browser
//    session cookies: GET /playlists, GET /playlists/:id/tracks
//
// To add a button, push another entry onto BUTTONS: { label, run(ctx) }.
// ctx gives you: api (the bridge), state(), http(path), activePlaylist(),
// tracks(id), link(track), say(text), show(textOrLines).
(() => {
  const PANEL_ID = 'wavez-tools-panel';
  const API_BASES = ['https://api.wavez.fm', location.origin + '/api'];

  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const api = window.WavezFM;
  if (!api || api.version !== '1') {
    alert('WavezFM bridge not found. Open a wavez.fm room page first.');
    return;
  }

  // ---- helpers -----------------------------------------------------------

  let apiBase = null;
  async function http(path) {
    const bases = apiBase ? [apiBase] : API_BASES;
    let lastErr;
    for (const base of bases) {
      try {
        const res = await fetch(base + path, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((body && (body.error || body.message)) || `HTTP ${res.status}`);
        }
        apiBase = base;
        return body;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  const state = () => api.room.getState();

  async function activePlaylist() {
    const lists = await http('/playlists');
    const active = (lists || []).find((p) => p.isActive);
    if (!active) throw new Error('No active playlist.');
    return active;
  }

  async function tracks(playlistId) {
    const list = await http(`/playlists/${encodeURIComponent(playlistId)}/tracks`);
    return (list || [])
      .map((t, i) => ({ t, i }))
      .sort((a, b) => (a.t.position ?? a.i) - (b.t.position ?? b.i))
      .map(({ t }) => t);
  }

  function link(track) {
    const id = String(track.sourceId);
    for (const key of ['url', 'permalinkUrl', 'permalink_url', 'sourceUrl']) {
      if (typeof track[key] === 'string' && /^https?:/.test(track[key])) return track[key];
    }
    if (/^https?:/.test(id)) return id;
    if (track.source === 'youtube') return `https://youtu.be/${id}`;
    if (track.source === 'soundcloud') {
      return /^\d+$/.test(id)
        ? `https://api.soundcloud.com/tracks/${id}`
        : `https://soundcloud.com/${id.replace(/^\/+/, '')}`;
    }
    return id;
  }

  const name = (t) => {
    const title = t.customTitle || t.title;
    const artist = t.customArtist || t.artist;
    return artist ? `${artist} - ${title}` : title;
  };

  const fmtMs = (ms) => {
    if (!ms && ms !== 0) return '?';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function say(text) {
    const result = api.actions.sendChat(text);
    if (!result.ok) throw new Error(`sendChat failed: ${result.code}`);
    return result;
  }

  // Is this playlist track the one currently playing for me?
  function isPlayingNow(track) {
    const s = state();
    const pb = s && s.playback;
    if (!pb || !s.queue.isCurrentDj) return false;
    return pb.trackId === track.id || (pb.source === track.source && pb.sourceId === track.sourceId);
  }

  async function nextTrack() {
    const playlist = await activePlaylist();
    const list = await tracks(playlist.id);
    if (!list.length) throw new Error(`"${playlist.name}" is empty.`);
    // While you're DJing, the playing track may still sit at the top; skip it.
    const next = isPlayingNow(list[0]) && list.length > 1 ? list[1] : list[0];
    return { playlist, track: next };
  }

  // ---- buttons -----------------------------------------------------------

  const BUTTONS = [
    {
      label: 'Opcheck next song',
      async run(ctx) {
        const { playlist, track } = await nextTrack();
        const url = ctx.link(track);
        ctx.say(`!opcheck ${url}`);
        ctx.show([`Sent: !opcheck ${url}`, `${name(track)} (${playlist.name})`]);
      },
    },
    {
      label: 'Next song',
      async run(ctx) {
        const { playlist, track } = await nextTrack();
        ctx.show([
          `Playlist: ${playlist.name}`,
          `Next: ${name(track)} [${fmtMs(track.durationMs)}]`,
          ctx.link(track),
        ]);
      },
    },
    {
      label: 'Room info',
      async run(ctx) {
        const s = ctx.state();
        if (!s) throw new Error('Not in a room.');
        const pb = s.playback;
        const me = s.queue.entries.find((e) => s.currentUser && e.userId === s.currentUser.id);
        ctx.show([
          `${s.room.name} (/${s.room.slug})`,
          `Users: ${s.room.activeUsersCount}  Queue: ${s.queue.count}${s.queue.isLocked ? ' (locked)' : ''}`,
          pb ? `Playing: ${pb.artist ? pb.artist + ' - ' : ''}${pb.title} [${fmtMs(pb.durationMs)}]` : 'Nothing playing',
          pb ? `DJ: ${pb.djUsername}` : '',
          `Votes: ${s.votes.woots} woot / ${s.votes.mehs} meh / ${s.votes.grabs} grab`,
          me ? `You: #${me.position} in queue, ETA ${fmtMs(me.estimatedWaitMs)}` : s.queue.isCurrentDj ? 'You: DJing now' : 'You: not in queue',
        ]);
      },
    },
    {
      label: 'Playlist info',
      async run(ctx) {
        const playlist = await ctx.activePlaylist();
        const list = await ctx.tracks(playlist.id);
        const total = list.reduce((sum, t) => sum + (t.durationMs || 0), 0);
        ctx.show([
          `${playlist.name}: ${list.length} tracks, ${fmtMs(total)}`,
          ...list.slice(0, 5).map((t, i) => `${i + 1}. ${name(t)}`),
        ]);
      },
    },
  ];

  // ---- UI ----------------------------------------------------------------

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText =
    'position:fixed;top:72px;right:16px;z-index:2147483647;width:280px;padding:10px;' +
    'background:#16161d;color:#eee;border:1px solid #444;border-radius:8px;' +
    'font:12px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:8px;font-weight:600';
  header.textContent = 'WavezFM Tools';
  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = 'background:none;border:0;color:#aaa;font-size:16px;cursor:pointer;line-height:1';
  close.onclick = () => panel.remove();
  header.appendChild(close);
  panel.appendChild(header);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
  panel.appendChild(row);

  const out = document.createElement('pre');
  out.style.cssText =
    'margin:8px 0 0;white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;' +
    'font:11px/1.4 ui-monospace,monospace;color:#cfc';
  panel.appendChild(out);

  const show = (v) => {
    out.style.color = '#cfc';
    out.textContent = Array.isArray(v) ? v.filter(Boolean).join('\n') : String(v);
  };

  const ctx = { api, state, http, activePlaylist, tracks, link, say, show };

  for (const b of BUTTONS) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    btn.style.cssText =
      'padding:5px 8px;background:#2d2d3a;color:#eee;border:1px solid #555;border-radius:5px;cursor:pointer';
    btn.onclick = async () => {
      btn.disabled = true;
      show('…');
      try {
        await b.run(ctx);
      } catch (err) {
        out.style.color = '#f99';
        out.textContent = String((err && err.message) || err);
      } finally {
        btn.disabled = false;
      }
    };
    row.appendChild(btn);
  }

  document.body.appendChild(panel);
})();
