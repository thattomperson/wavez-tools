// Values scripts/build.mjs fills in at build time.

/** Where dist/livekit.min.js is hosted, next to wavez-tools.min.js. */
declare const __LIVEKIT_URL__: string;
/** Changes with every build, to cache-bust livekit.min.js. */
declare const __BUILD_ID__: string;
