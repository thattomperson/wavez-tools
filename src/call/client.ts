// Talks to the token Worker (server/call-token/worker.js).
import { CALL } from '../config';

export interface CallMember {
  identity: string;
  name: string;
}

const base = () => CALL.tokenUrl.replace(/\/+$/, '');

export const callConfigured = () => !!CALL.tokenUrl;

async function read<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ? `Token server: ${data.error}` : `Token server answered ${res.status}`);
  return data;
}

/** A LiveKit URL and join token for this WavezFM room's call. */
export async function fetchToken(roomId: string, user: { id: string; name: string }): Promise<{ url: string; token: string }> {
  const res = await window.fetch(`${base()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, userId: user.id, name: user.name }),
  });
  const data = await read<{ url?: string; token?: string }>(res);
  if (!data.url || !data.token) throw new Error('Token server sent no token');
  return { url: data.url, token: data.token };
}

/** Who's in this room's call right now. */
export async function fetchMembers(roomId: string): Promise<CallMember[]> {
  const res = await window.fetch(`${base()}/participants?roomId=${encodeURIComponent(roomId)}`);
  const data = await read<{ participants?: CallMember[] }>(res);
  return data.participants ?? [];
}
