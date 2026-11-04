# CLAUDE.md

Guidance for Claude (and anyone else) working in this repo.

## What this is

WavezFM Tools is a bookmarklet that adds a small panel to WavezFM room pages. The panel header
always shows the next song in your active playlist and whether the room bot says it's OP. Below it
is a list of tools: screen tools (Queue check, Next song details, Room info, Playlist info) and
on/off switches (AutoWoot, Auto-move OP songs, Auto-join, Auto-leave). See `README.md` for the
user-facing description, install steps and the full file layout.

The bookmark itself is a tiny loader that fetches `wavez-tools.min.js` from GitHub Pages, so
merging to `main` ships to every user on their next click.

## Commands

```sh
npm install
npm run typecheck   # tsc, no emit
npm run build       # esbuild -> dist/
```

Run both before committing. CI (`.github/workflows/pages.yml`) typechecks, builds and deploys
`dist/` to Pages on every push to `main`. There are no automated tests; behaviour on the live site
has to be checked by hand by running the bookmarklet in a WavezFM room.

## How the code fits together

- `src/main.ts` toggles the panel; `src/ui/panel.ts` builds it.
- `src/tools/` holds one file per tool, registered in `src/tools/index.ts`. A tool is either a
  `ScreenTool` (`open()` renders into a body and gets an abort `signal`) or a `ToggleTool`
  (`enable()` starts a behaviour and returns a stop function). Types are in `src/tools/types.ts`.
- Room state and actions come from the `window.WavezFM` bridge (`src/wavez/bridge.ts`), documented
  in the [Room Extension API](https://github.com/WavezFM/WavezFM-Extension-API). The bridge has no
  playlist access.
- Playlists go through the official `@wavezfm/api` SDK (`src/wavez/api.ts`) using the page's
  session cookies. Use the SDK rather than hand-written HTTP. Pass
  `fetch: (i, init) => window.fetch(i, init)`, because the SDK calls fetch unbound.
- Opcheck is a private bot command sent over the page's own room WebSocket
  (`src/wavez/socket.ts`, `bot.ts`, `opcheck.ts`). The socket is captured by wrapping
  `WebSocket.prototype.send`, so it needs the site to send a packet first. Bot id and command
  prefix live in `src/config.ts`.
- Styles are scoped CSS in `src/ui/styles.ts`. Switch state is saved in localStorage under
  `wavez-tools:toggles`, panel position under `wavez-tools:position`.

## Conventions

- Match the surrounding code: small modules, plain DOM via the `h()` helper in `src/ui/dom.ts`,
  shared widgets from `src/ui/components.ts`.
- Keep the bundle small; it's injected into someone else's page.
- When you add or change a tool, update the tool list in `README.md` too.

## Keep the changelog up to date

**Every change that lands in this repo gets an entry in [`CHANGELOG.md`](CHANGELOG.md), in the
same commit or PR as the change.** That includes features, fixes, refactors, dependency bumps and
build or CI changes. Docs-only tweaks can skip it.

- Add entries under `## [Unreleased]` at the top, in the right group: `Added`, `Changed`,
  `Fixed`, `Removed`, `Security`.
- Write one line per change, in plain words a user of the bookmarklet would understand, and link
  the PR once it exists (e.g. `([#7](https://github.com/thattomperson/wavez-tools/pull/7))`).
- Since every merge to `main` deploys, there are no version numbers. When a batch of
  Unreleased entries merges, move them under a dated heading (`## 2026-10-29`), newest first.
- If you notice an earlier change that's missing, add it under its date.
