# Changelog

Every merge to `main` deploys to GitHub Pages, so changes are grouped by date rather than version.
Newest first. See `CLAUDE.md` for how to add entries.

## [Unreleased]

### Added

- `CLAUDE.md` with project guidance, and this changelog, backfilled from history.

## 2026-10-29

### Added

- **Auto-join when queue is empty** switch: joins the DJ queue when nobody else is waiting (and
  the queue is open, not full, and you're allowed to join).
- **Auto-leave when others are queued** switch: leaves the queue once someone else is waiting,
  but never while your own song is playing. Both retry at most every 3 seconds.
  ([#5](https://github.com/thattomperson/wavez-tools/pull/5))

### Fixed

- Every saved switch is now restored when the panel opens. Previously only the first one came
  back and the rest were dropped from storage.
  ([#6](https://github.com/thattomperson/wavez-tools/pull/6))

## 2026-10-27

### Added

- Drag grip at the left of the panel header. Drag it, or focus it and use the arrow keys (Shift
  for bigger steps), to move the panel. The position is remembered and kept on screen when the
  window shrinks. ([#4](https://github.com/thattomperson/wavez-tools/pull/4))
- **Auto-move OP songs** switch: whenever the next song is OP or blocked, moves it to the end of
  the playlist. Stops after 10 OP songs in a row until one passes.
  ([#3](https://github.com/thattomperson/wavez-tools/pull/3))
- **AutoWoot** switch: woots every song. ([#2](https://github.com/thattomperson/wavez-tools/pull/2))
- Command that opchecks the next 10 songs and moves any OP ones to the end of the playlist.

### Changed

- Redesigned the panel as a tool list. The header always shows the next song and its opcheck and
  can collapse down to just that line. Screen tools open in place with a back button; switches
  sit in the list and are remembered between runs. The opcheck and move-OP-songs commands were
  merged into one **Queue check** screen that fills in a chip per song as the bot replies.
  ([#2](https://github.com/thattomperson/wavez-tools/pull/2))
- Opcheck is sent as a private bot command over the room WebSocket instead of a chat message, and
  the panel shows the bot's reply (OP, plays, last played).

## 2026-10-26

### Added

- First version as a repo: the bookmarklet built with esbuild, plus a GitHub Pages install page.
  The bookmark is a small loader that pulls the latest script from Pages on each click, with an
  inline fallback link for pages that block remote scripts.

### Changed

- Playlist requests use the official `@wavezfm/api` SDK instead of hand-written HTTP calls.
- Rewritten in TypeScript and split into `commands`, `ui` and `wavez` modules. CI typechecks
  before building.

### Security

- Bumped esbuild to 0.25.10 for GHSA-67mh-4wv8-2f99.
