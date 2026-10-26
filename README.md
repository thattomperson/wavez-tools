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
| `src/commands/` | One file per button, registered in `commands/index.ts` |
| `src/ui/` | Panel, DOM helper and styles |
| `src/wavez/bridge.ts` | Types and helpers for the `window.WavezFM` bridge |
| `src/wavez/api.ts` | Playlist calls through the official [`@wavezfm/api`](https://www.npmjs.com/package/@wavezfm/api) SDK (session cookies) |
| `src/wavez/tracks.ts` | Track links, names and "next track" logic |
| `src/lib/` | Small shared helpers |

## Adding a button

Create `src/commands/my-command.ts`:

```ts
import { requireState } from '../wavez/bridge';
import type { Command } from './types';

export const myCommand: Command = {
  label: 'My button',
  run({ show }) {
    show(`Room: ${requireState().room.name}`);
  },
};
```

Then add it to the `commands` array in `src/commands/index.ts`.

The bridge is documented in the [Room Extension API](https://github.com/WavezFM/WavezFM-Extension-API).
