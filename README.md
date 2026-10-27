# WavezFM Tools

A bookmarklet that adds a small panel to WavezFM room pages. The top of the panel always shows
the next song in your active playlist and whether the room bot says it's OP (re-checked when the
song changes). Click it for details, or collapse the panel down to just that line.

Tools in the panel:

- **Queue check**: opchecks the next 10 tracks and moves any that are OP to the end of the playlist
- **Next song details**: play counts and last played for the next song (bot settings in `src/config.ts`)
- **Room info**: room name, users, queue, current track, votes, your queue position
- **Playlist info**: active playlist length and first tracks
- **AutoWoot** (switch): woots every song
- **Auto-move OP songs** (switch): whenever the next song is OP, moves it to the end of the playlist.
  Stops after 10 in a row until a song passes

Switches are remembered between runs and stop when the panel is closed.

## Install

Open the GitHub Pages site for this repo (`https://<owner>.github.io/wavez-tools/`) and drag the
**WavezFM Tools** link to your bookmarks bar. The bookmark is a tiny loader that pulls in the latest
`wavez-tools.min.js` from Pages each time you click it, so you never need to reinstall after an update.

If the room page refuses to load the remote script, use the **inline** link on the same page instead.
It contains the whole script, so it works anywhere but has to be reinstalled after changes.

## Develop

```sh
npm install
npm run typecheck
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

Pushing to `main` typechecks, builds and deploys `dist/` to GitHub Pages via `.github/workflows/pages.yml`.
Enable it once under **Settings → Pages → Source: GitHub Actions**.

## Layout

| Path | What lives there |
| --- | --- |
| `src/main.ts` | Entry point: toggles the panel |
| `src/tools/` | One file per tool, registered in `tools/index.ts` |
| `src/ui/` | Panel, shared components, icons, DOM helper and styles |
| `src/wavez/next-song.ts` | Next song + opcheck shown in the panel header |
| `src/wavez/bridge.ts` | Types and helpers for the `window.WavezFM` bridge |
| `src/wavez/api.ts` | Playlist calls through the official [`@wavezfm/api`](https://www.npmjs.com/package/@wavezfm/api) SDK (session cookies) |
| `src/wavez/opcheck.ts` | Opcheck via the room bot, shared by the opcheck commands |
| `src/wavez/socket.ts`, `bot.ts` | Private bot commands over the page's own room WebSocket |
| `src/config.ts` | Opcheck bot user id and command prefix |
| `src/wavez/tracks.ts` | Track links, names and "next track" logic |
| `src/lib/` | Small shared helpers |

## Adding a tool

A tool either opens its own screen or is an on/off switch. A screen tool, `src/tools/my-tool.ts`:

```ts
import { requireState } from '../wavez/bridge';
import { h } from '../ui/dom';
import type { ScreenTool } from './types';

export const myTool: ScreenTool = {
  kind: 'screen',
  name: 'My tool',
  blurb: 'One line for the tool list',
  glyph: 'M',
  open({ body, setSubtitle }) {
    setSubtitle(requireState().room.name);
    body.replaceChildren(h('div', { class: 'wt-body' }, 'Hello'));
  },
};
```

`open` also gets a `signal` that aborts when the user leaves the screen, so stop work and
unsubscribe from room events with it. Shared pieces (chips, buttons, stat tiles, key/value lists)
are in `src/ui/components.ts`.

A switch is a `ToggleTool` (`kind: 'toggle'`) with an `id` and an `enable()` that starts the
behaviour and returns a function that stops it; see `src/tools/auto-woot.ts`.

Then add it to the `tools` array in `src/tools/index.ts`.

The bridge is documented in the [Room Extension API](https://github.com/WavezFM/WavezFM-Extension-API).
