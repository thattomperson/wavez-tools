// Takes the feature screenshots shown on the GitHub Pages site
// (site/screenshots/*.png). The live site needs a login, so this runs the real
// built bookmarklet (dist/wavez-tools.min.js) in a pretend room with made-up
// data: mock-room.js stands in for the WavezFM bridge and room socket, and the
// playlist API and call token server are answered here.
//
//   npm run build && npm run screenshots
//
// Needs Playwright with Chromium. It isn't a dependency (it's big); install it
// with `npm i --no-save playwright && npx playwright install chromium` if
// `require('playwright')` doesn't already work.
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = new URL('../../', import.meta.url);
const outDir = new URL('site/screenshots/', root);
const only = process.argv.slice(2);

const [script, mock, roomHtml] = await Promise.all([
  readFile(new URL('dist/wavez-tools.min.js', root), 'utf8'),
  readFile(new URL('scripts/screenshots/mock-room.js', root), 'utf8'),
  readFile(new URL('scripts/screenshots/room.html', root), 'utf8'),
]);

// --- made-up playlists ---------------------------------------------------------

const names = [
  ['Velvet Hours', 'Nightjar Ensemble'],
  ['Coastline Radio', 'Mira Vale'],
  ['Slow Orbit', 'The Quiet Arcade'],
  ['Neon Rain', 'Kites Over Tokyo'],
  ['Sunday Static', 'Low Tide Club'],
  ['Glasshouse', 'Juniper & Ash'],
  ['Midnight Ferry', 'Harbor Static'],
  ['Tape Hiss Lullaby', 'Pocket Moon'],
  ['Amber Streetlights', 'Mira Vale'],
  ['Fog Machine', 'Nightjar Ensemble'],
  ['Last Train Home', 'Cassette Garden'],
  ['Window Seat', 'The Quiet Arcade'],
];
const track = (pl, i) => {
  const [title, artist] = names[i % names.length];
  const n = Math.floor(i / names.length);
  return {
    id: `${pl}-t${i}`,
    source: 'youtube',
    sourceId: `${pl}-${i}`,
    title: n ? `${title} (Take ${n + 1})` : title,
    artist,
    durationMs: 150000 + ((i * 37) % 120) * 1000,
    position: i,
  };
};
const playlists = [
  { id: 'pl1', name: 'Lofi 1 (A–L)', isActive: true, totalTracks: 48 },
  { id: 'pl2', name: 'Lofi 2 (M–Z)', isActive: false, totalTracks: 40 },
  { id: 'pl3', name: 'Lofi 3 (new)', isActive: false, totalTracks: 22 },
  { id: 'pl4', name: 'Party', isActive: false, totalTracks: 30 },
];
const tracks = Object.fromEntries(playlists.map((p) => [p.id, Array.from({ length: p.totalTracks }, (_, i) => track(p.id, i))]));
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
// Opcheck answers by sourceId; anything else comes back not OP.
const opchecks = {
  'pl1-0': { plays: { all: 12, day: 0, week: 1, month: 3 }, lastPlayed: hoursAgo(6 * 24) },
  'pl1-2': { op: true, reason: 'Played 2 hours ago', plays: { all: 41, day: 2, week: 5, month: 11 }, lastPlayed: hoursAgo(2) },
  'pl1-5': { op: true, reason: 'Played 3 times today', plays: { all: 63, day: 3, week: 7, month: 18 }, lastPlayed: hoursAgo(4) },
};

// --- scenarios -----------------------------------------------------------------

const toggles = (...ids) => ({ 'wavez-tools:toggles': ids });
const panel = '#wavez-tools-panel';
const openScreen = (name) => async (page) => {
  await page.locator(`${panel} .wt-row-name`, { hasText: name }).first().click();
};
const openCog = (name) => async (page) => {
  await page.locator(`${panel} button[aria-label="${name} options"]`).click();
};
const collapse = async (page) => {
  await page.locator(`${panel} button[aria-label="Collapse"]`).click();
};
// Just one switch's row (and its cog's options when open).
const row = (name) => `${panel} .wt-list > :has(.wt-row-name:text-is("${name}"))`;

const scenarios = [
  {
    name: 'panel',
    storage: {
      ...toggles('auto-woot', 'auto-move-op', 'playlist-rotation', 'auto-join', 'auto-leave', 'notifications'),
      'wavez-tools:rotation': { playlists: ['pl1', 'pl2', 'pl3'], starts: { pl1: { trackId: 'pl1-t6', name: '', armed: true } } },
      'wavez-tools:auto-leave': { plays: { on: true, n: 2 }, waiting: { on: true, n: 3 }, timer: { on: false, n: 60 }, stopJoin: true },
    },
  },
  {
    name: 'opcheck-op',
    // The next song is one the bot says is OP.
    before: (m) => (m.opchecks['pl1-0'] = { op: true, reason: 'Played 3 hours ago', plays: { all: 52, day: 1, week: 4, month: 9 }, lastPlayed: new Date(Date.now() - 3 * 3600000).toISOString() }),
    run: openScreen('Next song details'),
  },
  { name: 'queue-check', run: openScreen('Queue check'), wait: 2500 },
  { name: 'room-info', run: openScreen('Room info') },
  { name: 'playlist-info', run: openScreen('Playlist info') },
  {
    name: 'auto-join',
    storage: { ...toggles('auto-join'), 'wavez-tools:auto-join': { fewerThan: 3 } },
    run: openCog('Auto-join'),
    shot: row('Auto-join'),
  },
  {
    name: 'auto-join-removed',
    storage: toggles('auto-join'),
    run: async (page) => {
      // A mod takes you out of the queue.
      await page.evaluate(() => {
        const m = window.__mock;
        m.state.queue = m.queue(m.state.queue.entries.filter((e) => e.userId !== m.ME.id));
        m.emit('queue_changed', m.state.queue);
      });
    },
    shot: row('Auto-join'),
  },
  {
    name: 'auto-leave',
    storage: {
      ...toggles('auto-leave'),
      'wavez-tools:auto-leave': { plays: { on: true, n: 2 }, waiting: { on: true, n: 3 }, timer: { on: true, n: 90 }, stopJoin: true },
    },
    run: openCog('Auto-leave'),
    shot: row('Auto-leave'),
  },
  {
    name: 'playlist-rotation',
    storage: {
      ...toggles('playlist-rotation', 'auto-move-op'),
      'wavez-tools:rotation': { playlists: ['pl1', 'pl2', 'pl3'], starts: { pl1: { trackId: 'pl1-t6', name: 'Harbor Static - Midnight Ferry', armed: true } } },
    },
    run: openCog('Playlist rotation'),
    shot: row('Playlist rotation'),
  },
  {
    name: 'notifications',
    storage: {
      ...toggles('notifications'),
      'wavez-tools:notifications': { words: ['tom', 'ttp', 'thomas'], desktop: true, sound: true, soundAway: true, volume: 60 },
    },
    run: openCog('Notifications'),
    shot: row('Notifications'),
  },
  {
    name: 'chat-commands',
    full: true,
    storage: toggles('auto-woot', 'auto-join', 'notifications'),
    run: async (page) => {
      await collapse(page);
      await page.locator('aside input').fill('/wt status');
      await page.locator('aside input').press('Enter');
    },
  },
  {
    name: 'voice-call',
    full: true,
    storage: toggles('voice-call'),
    run: collapse,
  },
];

// --- runner --------------------------------------------------------------------

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const ROOM = 'https://wavez.fm/room/late-night-lofi';
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

for (const s of scenarios) {
  if (only.length && !only.includes(s.name)) continue;
  const context = await browser.newContext({ viewport: { width: 1100, height: s.height ?? (s.full ? 720 : 1600) }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await context.route('**/*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.href === ROOM) return route.fulfill({ status: 200, contentType: 'text/html', body: roomHtml });
    if (url.host === 'api.wavez.fm') {
      if (req.method() !== 'GET') return route.fulfill(json({}));
      const m = url.pathname.match(/^\/playlists\/([^/]+)\/tracks$/);
      if (m) return route.fulfill(json(tracks[m[1]] ?? []));
      if (url.pathname === '/playlists') return route.fulfill(json(playlists));
    }
    if (url.pathname === '/participants') {
      return route.fulfill(json({ participants: [{ identity: 'u-a', name: 'mossgarden' }, { identity: 'u-b', name: 'kiwi_beats' }] }));
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await context.addInitScript(
    ({ storage, mock, opchecks }) => {
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, JSON.stringify(v));
      localStorage.setItem('wavez-tools:position', 'null');
      (0, eval)(mock);
      Object.assign(window.__mock.opchecks, opchecks);
    },
    { storage: s.storage ?? {}, mock, opchecks },
  );
  const page = await context.newPage();
  page.on('pageerror', (err) => console.warn(`[${s.name}]`, err.message));
  await page.goto(ROOM);
  if (s.before) await page.evaluate(`(${s.before.toString()})(window.__mock)`);
  await page.addScriptTag({ content: script });
  // Show the whole tool list rather than scrolling it.
  await page.addStyleTag({ content: `${panel} .wt-content{max-height:none!important}` });
  await page.locator(`${panel} .wt-chip`).filter({ hasNotText: 'Checking' }).first().waitFor();
  await page.waitForTimeout(600);
  if (s.run) await s.run(page);
  await page.waitForTimeout(s.wait ?? 900);
  const path = new URL(`${s.name}.png`, outDir).pathname;
  // The chat side of the room, where the panel, chat and call popup sit.
  if (s.full) await page.screenshot({ path, clip: { x: 700, y: 0, width: 400, height: 720 } });
  else await page.locator(s.shot ?? panel).screenshot({ path });
  console.log(`site/screenshots/${s.name}.png`);
  await context.close();
}
await browser.close();
