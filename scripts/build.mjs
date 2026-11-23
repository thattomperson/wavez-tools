// Builds dist/ from src/main.ts:
//   wavez-tools.min.js   minified script the loader pulls in remotely
//   loader.txt           javascript: URL that loads wavez-tools.min.js from SCRIPT_URL
//   inline.txt           javascript: URL with the whole script inlined (no network needed)
//   index.html           install page with drag-to-bookmarks links and the features
//                        from site/features.mjs
//   screenshots/         the feature screenshots, copied from site/screenshots
//
// SCRIPT_URL is where wavez-tools.min.js is hosted. Set it with the
// WAVEZ_TOOLS_URL env var, otherwise it comes from package.json "scriptUrl".
import { build, transform } from 'esbuild';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { groups } from '../site/features.mjs';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const scriptUrl = process.env.WAVEZ_TOOLS_URL || pkg.scriptUrl;
const outDir = new URL('../dist/', import.meta.url);

await mkdir(outDir, { recursive: true });

// LiveKit is its own file next to the main script, loaded only when someone
// joins a call (src/call/load.ts). The global name must match GLOBAL there.
const livekitUrl = new URL('livekit.min.js', scriptUrl).href;
const buildId = Date.now().toString(36);
const livekit = await build({
  entryPoints: [new URL('../src/call/livekit-entry.ts', import.meta.url).pathname],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: '__wavezToolsLiveKit',
  target: 'es2020',
  write: false,
  legalComments: 'eof',
});

const result = await build({
  entryPoints: [new URL('../src/main.ts', import.meta.url).pathname],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
  // The notification sound is inlined as a base64 string (src/lib/sound.ts).
  loader: { '.mp3': 'base64' },
  define: { __LIVEKIT_URL__: JSON.stringify(livekitUrl), __BUILD_ID__: JSON.stringify(buildId) },
});
const script = result.outputFiles[0].text.trim();

// Cache-bust with a timestamp so the bookmark always runs the latest deploy.
const loaderSrc = `(()=>{
  const s = document.createElement('script');
  s.src = ${JSON.stringify(scriptUrl)} + '?t=' + Date.now();
  s.onerror = () => alert('WavezFM Tools: could not load ' + s.src);
  document.head.appendChild(s);
})()`;
const loader = (await transform(loaderSrc, { minify: true, target: 'es2020' })).code.trim();

const toBookmarklet = (code) => 'javascript:' + encodeURIComponent(code.replace(/;$/, ''));
const loaderUrl = toBookmarklet(loader);
const inlineUrl = toBookmarklet(script);

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// The install page shows each feature from site/features.mjs with its
// screenshot from site/screenshots/. Screenshots are taken at 2x, so they're
// shown at half their pixel size.
const screenshotDir = new URL('../site/screenshots/', import.meta.url);
await mkdir(new URL('screenshots/', outDir), { recursive: true });
const shots = {};
for (const name of await readdir(screenshotDir)) {
  if (!name.endsWith('.png')) continue;
  const png = await readFile(new URL(name, screenshotDir));
  await writeFile(new URL(`screenshots/${name}`, outDir), png);
  // PNG width and height are big-endian at bytes 16 and 20.
  shots[name] = { width: png.readUInt32BE(16) / 2, height: png.readUInt32BE(20) / 2 };
}

const featureHtml = (f) => {
  const shot = f.image && shots[f.image];
  if (f.image && !shot) throw new Error(`site/features.mjs: no screenshot site/screenshots/${f.image}`);
  return `<article class="feature${shot ? '' : ' no-shot'}">
  <div class="text"><h3>${f.name}</h3>${f.body}</div>
  ${shot ? `<img src="screenshots/${f.image}" width="${shot.width}" height="${shot.height}" alt="${escapeAttr(f.alt ?? f.name)}" loading="lazy">` : ''}
</article>`;
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WavezFM Tools</title>
<meta name="description" content="A bookmarklet that adds opchecks, auto-join and auto-leave, playlist rotation, notifications and voice calls to WavezFM rooms.">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; background: #0e0f15; color: #ecedf3; }
  main { max-width: 920px; margin: 0 auto; padding: 48px 16px 64px; }
  h1 { font-size: 34px; line-height: 1.2; margin: 0 0 8px; }
  h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #9a9cae; margin: 56px 0 4px; }
  h3 { font-size: 18px; margin: 0 0 6px; }
  p { margin: 0 0 10px; }
  .lead { font-size: 17px; color: #c4c6d6; max-width: 640px; }
  .install { margin: 28px 0 0; padding: 20px; border: 1px solid #2c2f40; border-radius: 16px; background: #171822; }
  .install p:last-child { margin: 0; }
  a { color: #b9c8ff; }
  a.bm { display: inline-block; padding: 10px 16px; margin: 4px 0; background: #8fb0ff; color: #0e0f15; font-weight: 600; border-radius: 999px; text-decoration: none; }
  a.bm.secondary { background: #262a3d; color: #ecedf3; border: 1px solid #3a3e55; }
  code { background: #262a3d; padding: 1px 5px; border-radius: 4px; font-size: .92em; }
  .muted { color: #9a9cae; }
  .feature { display: grid; grid-template-columns: 1fr auto; gap: 28px; align-items: start; padding: 28px 0; border-bottom: 1px solid #22243a; }
  .feature.no-shot { grid-template-columns: 1fr; padding: 18px 0; }
  .feature .text { max-width: 520px; color: #c4c6d6; }
  .feature h3 { color: #ecedf3; }
  .feature img { display: block; max-width: 100%; height: auto; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,.5); }
  @media (max-width: 720px) {
    .feature { grid-template-columns: 1fr; }
    .feature img { margin: 0 auto; }
  }
  footer { margin-top: 48px; font-size: 13px; }
</style>
</head>
<body>
<main>
<h1>WavezFM Tools</h1>
<p class="lead">A bookmarklet that adds a small panel to WavezFM rooms: see whether your next song is
overplayed before it plays, join and leave the queue on your own rules, work through all your
playlists, get pinged when chat is about you, and hop on a voice call with the room.</p>

<div class="install">
<p><b>Install:</b> drag this to your bookmarks bar, then click it on a wavez.fm room page.</p>
<p><a class="bm" href="${escapeAttr(loaderUrl)}">WavezFM Tools</a></p>
<p class="muted">It always loads the latest version from <code>${scriptUrl}</code>, so you never need to reinstall.
Click it again to close the panel.</p>
<p class="muted">If the room page blocks the remote script, use the self-contained version instead (it needs re-installing after each update):
<a class="bm secondary" href="${escapeAttr(inlineUrl)}">WavezFM Tools (inline)</a></p>
</div>

${groups
  .map(
    (g) => `<section>
<h2>${g.title}</h2>
${g.intro ? `<p class="muted">${g.intro}</p>` : ''}
${g.features.map(featureHtml).join('\n')}
</section>`,
  )
  .join('\n')}

<footer class="muted">
<p>Screenshots use a made-up room. Source and changelog on <a href="https://github.com/thattomperson/wavez-tools">GitHub</a>.</p>
<p>Notification sound: Sound Effect by <a href="https://pixabay.com/users/universfield-28281460/?utm_source=link-attribution&amp;utm_medium=referral&amp;utm_campaign=music&amp;utm_content=363746">Official Profile</a> from <a href="https://pixabay.com//?utm_source=link-attribution&amp;utm_medium=referral&amp;utm_campaign=music&amp;utm_content=363746">Pixabay</a>.</p>
</footer>
</main>
</body>
</html>
`;

await Promise.all([
  writeFile(new URL('wavez-tools.min.js', outDir), script + '\n'),
  writeFile(new URL('livekit.min.js', outDir), livekit.outputFiles[0].text),
  writeFile(new URL('loader.txt', outDir), loaderUrl + '\n'),
  writeFile(new URL('inline.txt', outDir), inlineUrl + '\n'),
  writeFile(new URL('index.html', outDir), html),
]);

console.log(
  `Built dist/ (script ${script.length} bytes, livekit ${livekit.outputFiles[0].text.length} bytes, loader -> ${scriptUrl})`,
);
