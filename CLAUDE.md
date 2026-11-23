# CLAUDE.md

Guidance for Claude (and anyone else) working in this repo.

## What this is

WavezFM Tools is a bookmarklet that adds a small panel to WavezFM room pages. The panel header
always shows the next song in your active playlist and whether the room bot says it's OP. Below it
is a list of tools: screen tools (Queue check, Next song details, Room info, Playlist info) and
on/off switches (AutoWoot, Auto-move OP songs, Auto-join, Auto-leave, Notifications, Voice &
video). See `README.md` for the user-facing description, install steps and the full file layout.

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
- `/wt` chat commands live in `src/chat/`. `intercept.ts` catches them on Enter in the chat box
  (and as a fallback on the outgoing socket packet), and wraps `window.open` to add the same
  listeners to the pop-out chat window. Each switch's `command` field is its chat name.
- Voice & video calls live in `src/call/` and use LiveKit. The LiveKit client is built as its own
  file (`dist/livekit.min.js`, entry `src/call/livekit-entry.ts`) and loaded on demand by
  `src/call/load.ts`; only `import type` from `livekit-client` elsewhere, or it lands in the main
  bundle. Join tokens come from the Cloudflare Worker in `server/call-token` (address in
  `src/config.ts`), deployed separately from Pages.
- Styles are scoped CSS in `src/ui/styles.ts`. Switch state is saved in localStorage under
  `wavez-tools:toggles`, panel position under `wavez-tools:position`
  (the call popup's under `wavez-tools:call-position` and `wavez-tools:call-size`; `src/ui/drag.tsx`
  moves both).

## Conventions

- Match the surrounding code: small modules, plain DOM, shared widgets from
  `src/ui/components.tsx`.
- Write DOM in TSX, not `h()` calls. JSX compiles to the `h()` helper in `src/ui/dom.ts` (no
  React): import `h` from there, use HTML attribute names (`class`, `for`, `onclick`), and cast
  when you need a specific element type (`<input /> as HTMLInputElement`). A function tag is a
  component that gets its attributes plus `children`. Any file with markup is `.tsx`;
  `src/tools/auto-leave.tsx` is a good example.
- State that the panel shows lives in signals (`@preact/signals-core`). Give an attribute or child
  a signal, or a function child that reads signals, and only that node updates; don't rebuild a
  whole screen with `replaceChildren` on every change. The bindings stop with the screen (or cog,
  or panel); use `watch()` from `src/ui/dom.ts` for other effects so they stop too. The next-song
  store (`ctx.nextSong`) is itself a read-only signal.
- Keep the bundle small; it's injected into someone else's page.
- When you add or change a tool, update the tool list in `README.md` too, and the GitHub Pages site
  (see below).

## Keep the GitHub Pages site up to date

The Pages site (`dist/index.html`, built by `scripts/build.mjs`) shows every feature with a short
description and a screenshot. **Every user-facing feature or change gets reflected there in the same
PR**, just like the README and changelog.

- Descriptions live in `site/features.mjs`, grouped as on the page. Add an entry for a new tool or
  switch, and edit the entry when a change alters what it does or looks like. Write for a user of
  the bookmarklet, in a sentence or two, like the README.
- Screenshots live in `site/screenshots/` and are taken by `npm run screenshots`
  (`scripts/screenshots/run.mjs`, after `npm run build`). It runs the real built panel in a pretend
  room: `scripts/screenshots/mock-room.js` stands in for the bridge, the room socket and
  notifications, and `run.mjs` answers the playlist API and call token server with made-up data.
  The live site needs a login, so don't try to screenshot it.
- For a new feature, add a scenario to `run.mjs` (switches to turn on, saved settings, and what to
  click, such as opening its cog), give it a `shot` selector if a cropped row reads better than the
  whole panel, and point the entry's `image` at it. Re-run the scenarios whose look changed
  (`npm run screenshots -- auto-join panel`) and look at the images before committing.
- The build fails if an entry names a screenshot that doesn't exist.

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
