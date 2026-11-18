# Call token server

The **Voice & video** switch uses [LiveKit](https://livekit.io) for the call. LiveKit only lets
people in with a signed token, and the secret that signs them can't live in a bookmarklet, so
this small Cloudflare Worker hands them out.

It has two endpoints:

- `POST /token` with `{ roomId, userId, name }` returns `{ url, token }` for the WavezFM room's
  call (LiveKit room `wavez-<roomId>`), valid for 6 hours.
- `GET /participants?roomId=...` returns `{ participants: [{ identity, name }] }`, so the popup
  can show who's in the call before you join.

## Deploy

1. Make a project on [LiveKit Cloud](https://cloud.livekit.io) (the free tier is fine) and create
   an API key. Note the project URL (`wss://...livekit.cloud`), the key and the secret.
2. In this folder, put the URL and key in `wrangler.toml`.
3. Run:

   ```sh
   npx wrangler login
   npx wrangler secret put LIVEKIT_API_SECRET
   npx wrangler deploy
   ```

4. Put the Worker's URL (e.g. `https://wavez-tools-call-token.<you>.workers.dev`) in
   `CALL.tokenUrl` in `src/config.ts` and merge. Everyone's next click of the bookmark picks it up.

## What it doesn't check

The Worker only accepts requests from the origins in `ALLOWED_ORIGINS`, but it can't tell who is
asking: it takes the WavezFM user id and name the bookmarklet sends. Someone who wants to could
call it directly and join a room's call under any name. That's fine for a friendly room; if it
becomes a problem, the next step is to have the Worker check the user against WavezFM before it
signs a token.
