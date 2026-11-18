// Loads dist/livekit.min.js the first time it's needed. The main script
// stays small, and people who never join a call never download LiveKit.
export type LiveKit = typeof import('./livekit-entry');

// Must match globalName in scripts/build.mjs.
const GLOBAL = '__wavezToolsLiveKit';

// Read while this script is first running: a copy hosted somewhere else
// loads the LiveKit file that sits next to it. The inline bookmark has no
// script URL, so it uses the Pages one from the build.
const here = (document.currentScript as HTMLScriptElement | null)?.src;
const SCRIPT_URL = `${here && /^https?:/.test(here) ? new URL('livekit.min.js', here).href : __LIVEKIT_URL__}?v=${__BUILD_ID__}`;

let loading: Promise<LiveKit> | null = null;

export function loadLiveKit(): Promise<LiveKit> {
  const w = window as unknown as Record<string, LiveKit | undefined>;
  const ready = w[GLOBAL];
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<LiveKit>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.onload = () => {
      const lk = w[GLOBAL];
      if (lk) resolve(lk);
      else reject(new Error('LiveKit loaded but did not start'));
    };
    s.onerror = () => reject(new Error(`Could not load LiveKit from ${SCRIPT_URL}`));
    document.head.appendChild(s);
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}
