# WavezFM Tools

A bookmarklet that adds a small panel to WavezFM room pages:

- **Opcheck next song**: sends `!opcheck <link>` in chat for the next track in your active playlist
- **Next song**: shows the next track without posting
- **Room info**: room name, users, queue, current track, votes, your queue position
- **Playlist info**: active playlist length and first few tracks

## Install

Open the GitHub Pages site for this repo (`https://<owner>.github.io/wavez-tools/`) and drag the
**WavezFM Tools** link to your bookmarks bar. The bookmark is a tiny loader that pulls in the latest
`wavez-tools.min.js` from Pages each time you click it, so you never need to reinstall after an update.

If the room page refuses to load the remote script, use the **inline** link on the same page instead.
It contains the whole script, so it works anywhere but has to be reinstalled after changes.

## Develop

```sh
npm install
npm run build
```

`dist/` then contains:

| File | What it is |
| --- | --- |
| `wavez-tools.min.js` | Minified script that the loader fetches |
| `loader.txt` | `javascript:` URL for the remote-loading bookmark |
| `inline.txt` | `javascript:` URL with the whole script inlined |
| `index.html` | Install page with drag-to-bookmarks links |

The loader points at `scriptUrl` in `package.json`. Override it with `WAVEZ_TOOLS_URL=... npm run build`.
In CI it's set automatically to this repo's Pages URL.

Pushing to `main` builds and deploys `dist/` to GitHub Pages via `.github/workflows/pages.yml`.
Enable it once under **Settings → Pages → Source: GitHub Actions**.

## Adding a button

Add an entry to `BUTTONS` in `src/wavez-tools.js`:

```js
{
  label: 'My button',
  async run(ctx) {
    const s = ctx.state();
    ctx.show(`Room: ${s.room.name}`);
  },
},
```

`ctx` provides:

- `api`: the `window.WavezFM` bridge ([Room Extension API](https://github.com/WavezFM/WavezFM-Extension-API))
- `state()`: current room snapshot
- `http(path)`: GET against `https://api.wavez.fm` with your session cookies
- `activePlaylist()`, `tracks(playlistId)`: playlist data
- `link(track)`: YouTube or SoundCloud URL for a track
- `say(text)`: send a chat message
- `show(textOrLines)`: write to the panel output

Playlist endpoints come from the [`@wavezfm/api`](https://www.npmjs.com/package/@wavezfm/api) SDK source
(`GET /playlists`, `GET /playlists/:id/tracks`).
