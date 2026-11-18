// Token server for the Voice & video switch (src/tools/voice-call.tsx).
// A Cloudflare Worker with no dependencies. It hands out LiveKit join tokens
// for a WavezFM room's call, and lists who's in a call so the popup can show
// it before you join. See README.md in this folder to deploy it.
//
// Settings (wrangler.toml [vars] and `wrangler secret put`):
//   LIVEKIT_URL         wss://<project>.livekit.cloud
//   LIVEKIT_API_KEY     LiveKit API key
//   LIVEKIT_API_SECRET  LiveKit API secret (a secret, not a var)
//   ALLOWED_ORIGINS     comma-separated origins allowed to call this, e.g. https://wavez.fm

const TOKEN_TTL_S = 6 * 60 * 60;
const ADMIN_TTL_S = 60;
const MAX_FIELD = 128;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://wavez.fm')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const cors = allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
      : null;
    // Browsers send Origin on these cross-site requests; anything else isn't the bookmarklet.
    if (!cors) return json({ error: 'origin not allowed' }, 403);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST' } });
    }
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return json({ error: 'token server is missing its LiveKit settings' }, 500, cors);
    }

    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/token') {
        const body = await request.json().catch(() => ({}));
        const roomId = field(body.roomId);
        const identity = field(body.userId);
        const name = field(body.name) || identity;
        if (!roomId || !identity) return json({ error: 'roomId and userId are required' }, 400, cors);
        const token = await sign(env, {
          sub: identity,
          name,
          video: {
            room: callRoom(roomId),
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
          },
        }, TOKEN_TTL_S);
        return json({ url: env.LIVEKIT_URL, token }, 200, cors);
      }

      if (request.method === 'GET' && url.pathname === '/participants') {
        const roomId = field(url.searchParams.get('roomId'));
        if (!roomId) return json({ error: 'roomId is required' }, 400, cors);
        const participants = await listParticipants(env, callRoom(roomId));
        return json({ participants }, 200, cors);
      }

      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, 502, cors);
    }
  },
};

/** The LiveKit room for a WavezFM room. */
const callRoom = (roomId) => `wavez-${roomId}`;

function field(v) {
  return typeof v === 'string' ? v.trim().slice(0, MAX_FIELD) : '';
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

// Who's in a call, via LiveKit's RoomService API. A room nobody has joined
// yet doesn't exist, which LiveKit reports as an error; that's an empty call.
async function listParticipants(env, room) {
  const token = await sign(env, { video: { room, roomAdmin: true } }, ADMIN_TTL_S);
  const host = env.LIVEKIT_URL.replace(/^ws/, 'http').replace(/\/$/, '');
  const res = await fetch(`${host}/twirp/livekit.RoomService/ListParticipants`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ room }),
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    const text = await res.text();
    if (/not.?found/i.test(text)) return [];
    throw new Error(`LiveKit answered ${res.status}`);
  }
  const data = await res.json();
  return (data.participants || []).map((p) => ({ identity: p.identity, name: p.name || p.identity }));
}

// --- HS256 JWT, the format LiveKit access tokens use ---------------------------

const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(env, claims, ttl) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(
    enc.encode(JSON.stringify({ iss: env.LIVEKIT_API_KEY, nbf: now - 10, exp: now + ttl, ...claims })),
  );
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(env.LIVEKIT_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}
