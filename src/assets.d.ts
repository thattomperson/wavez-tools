// Sound files are bundled into the script as base64 (see scripts/build.mjs).
declare module '*.mp3' {
  const base64: string;
  export default base64;
}
