# Changelog

Every merge to `main` deploys to GitHub Pages, so changes are grouped by date rather than version.
Newest first. See `CLAUDE.md` for how to add entries.

## [Unreleased]

### Added

- **Auto-leave** has a cog with rules: leave when N people are waiting, after your next N plays,
  or after a set time (sleep timer), and optionally turn off Auto-join too. The line under the
  name counts down what happens next, e.g. "Leaving after 2 more songs".
  ([#12](https://github.com/thattomperson/wavez-tools/pull/12))
- `/wt notify test`: checks why desktop notifications aren't showing (browser permission, the
  last chat message seen and what happened to it) and sends a test notification after 5 seconds.
  ([#11](https://github.com/thattomperson/wavez-tools/pull/11))
- Desktop notifications log each step to the browser console (filter by `[notify]`): every chat
  message seen, whether it mentions you, whether it's a bot message, and why it did or didn't
  notify. ([#11](https://github.com/thattomperson/wavez-tools/pull/11))

### Changed

- The panel now updates only the part that changed (a status line, a chip, one line in Room info)
  instead of redrawing the header, the tool list or the whole screen. Flipping a switch or opening
  a cog no longer jumps focus, and Room info no longer flickers on every woot. Built on
  `@preact/signals-core` (about 2 KB gzipped).
  ([#13](https://github.com/thattomperson/wavez-tools/pull/13))
- All of the panel's markup (the panel itself, its widgets, the drag grip, the notice card and
  the Queue check, Next song details, Room info and Playlist info screens) is now written in TSX
  instead of `h()` calls. No change in behaviour.
- Panel code can now be written in TSX, which compiles to the existing `h()` helper (no React
  added). Auto-leave's options are the first to use it.
  ([#12](https://github.com/thattomperson/wavez-tools/pull/12))

### Fixed

- Desktop notifications read more shapes of chat message, in case the room sends the sender or
  text under different names.

## 2026-11-09
### Added

- **Desktop notifications** switch (`/wt notify on|off`): notifies you when someone @mentions
  you (including `@staff` if you're staff), or when the room bot sends you a notice or private reply, while you're in another tab or
  app. A bot message's buttons are listed in the notification; clicking it brings you back to the
  room with a card that has the working buttons.
  ([#10](https://github.com/thattomperson/wavez-tools/pull/10))
- `/wt` chat commands: `/wt autowoot off`, `/wt status`, `/wt next` and the like flip the panel's
  switches and answer in a small note, without posting to the room. They also work in the pop-out
  chat window if it's opened after the bookmark is clicked. ([#9](https://github.com/thattomperson/wavez-tools/pull/9))
- `CLAUDE.md` with project guidance, and this changelog, backfilled from history.

### Fixed

- AutoWoot no longer woots over your vote. It woots each song at most once, and leaves a song
  alone once you've voted on it yourself, so a manual meh sticks.
  ([#8](https://github.com/thattomperson/wavez-tools/pull/8))

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
