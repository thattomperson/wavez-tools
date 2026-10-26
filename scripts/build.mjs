// Builds dist/ from src/wavez-tools.js:
//   wavez-tools.min.js   minified script the loader pulls in remotely
//   loader.txt           javascript: URL that loads wavez-tools.min.js from SCRIPT_URL
//   inline.txt           javascript: URL with the whole script inlined (no network needed)
//   index.html           install page with drag-to-bookmarks links
//
// SCRIPT_URL is where wavez-tools.min.js is hosted. Set it with the
// WAVEZ_TOOLS_URL env var, otherwise it comes from package.json "scriptUrl".
import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const scriptUrl = process.env.WAVEZ_TOOLS_URL || pkg.scriptUrl;
const outDir = new URL('../dist/', import.meta.url);

await mkdir(outDir, { recursive: true });

const result = await build({
  entryPoints: [new URL('../src/wavez-tools.js', import.meta.url).pathname],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
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
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WavezFM Tools</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; background: #16161d; color: #eee; }
  a.bm { display: inline-block; padding: 8px 14px; margin: 4px 0; background: #2d2d3a; color: #fff; border: 1px solid #555; border-radius: 6px; text-decoration: none; }
  code { background: #2d2d3a; padding: 1px 4px; border-radius: 3px; }
  .muted { color: #999; }
</style>
</head>
<body>
<h1>WavezFM Tools</h1>
<p>Drag this to your bookmarks bar, then click it on a wavez.fm room page:</p>
<p><a class="bm" href="${escapeAttr(loaderUrl)}">WavezFM Tools</a></p>
<p class="muted">This one always loads the latest version from <code>${scriptUrl}</code>.</p>
<p>If the room page blocks the remote script, use the self-contained version instead (it needs re-installing after each update):</p>
<p><a class="bm" href="${escapeAttr(inlineUrl)}">WavezFM Tools (inline)</a></p>
</body>
</html>
`;

await Promise.all([
  writeFile(new URL('wavez-tools.min.js', outDir), script + '\n'),
  writeFile(new URL('loader.txt', outDir), loaderUrl + '\n'),
  writeFile(new URL('inline.txt', outDir), inlineUrl + '\n'),
  writeFile(new URL('index.html', outDir), html),
]);

console.log(`Built dist/ (script ${script.length} bytes, loader -> ${scriptUrl})`);
