// Reuses the room page's own WebSocket for packets the Extension API bridge
// doesn't expose (such as private bot commands). There is no public handle to
// that socket, so we wrap WebSocket.prototype.send and remember the first
// socket that sends a WavezFM protocol packet. The hook survives repeat runs
// of the bookmarklet via a property on window.

export interface Packet<T = unknown> {
  type: string;
  event: string;
  version: string;
  timestamp: string;
  requestId?: string;
  payload: T;
}

interface SocketHook {
  socket: WebSocket | null;
  waiters: Array<(socket: WebSocket) => void>;
}

declare global {
  interface Window {
    __wavezToolsSocket?: SocketHook;
  }
}

function isProtocolPacket(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  try {
    const packet = JSON.parse(data);
    return typeof packet?.event === 'string' && typeof packet?.type === 'string';
  } catch {
    return false;
  }
}

function getHook(): SocketHook {
  if (window.__wavezToolsSocket) return window.__wavezToolsSocket;

  const hook: SocketHook = { socket: null, waiters: [] };
  window.__wavezToolsSocket = hook;

  const originalSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (this: WebSocket, data) {
    if (this !== hook.socket && isProtocolPacket(data)) {
      hook.socket = this;
      hook.waiters.splice(0).forEach((resolve) => resolve(this));
    }
    return originalSend.call(this, data);
  };
  return hook;
}

/** Start watching for the room socket. Call early so it's found by the time it's needed. */
export function installSocketHook(): void {
  getHook();
}

export function getRoomSocket(timeoutMs = 30_000): Promise<WebSocket> {
  const hook = getHook();
  if (hook.socket && hook.socket.readyState === WebSocket.OPEN) {
    return Promise.resolve(hook.socket);
  }
  hook.socket = null;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      hook.waiters = hook.waiters.filter((w) => w !== done);
      reject(new Error('Room connection not found yet. Wait a few seconds and try again.'));
    }, timeoutMs);
    const done = (socket: WebSocket) => {
      window.clearTimeout(timer);
      resolve(socket);
    };
    hook.waiters.push(done);
  });
}

export function makeRequestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * Send a command packet and resolve with the first incoming packet that
 * `match` accepts.
 */
export async function request<TReply>(
  event: string,
  payload: unknown,
  requestId: string,
  match: (packet: Packet) => packet is Packet<TReply>,
  timeoutMs = 15_000,
): Promise<Packet<TReply>> {
  const socket = await getRoomSocket();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
    };
    const onMessage = (message: MessageEvent) => {
      if (typeof message.data !== 'string') return;
      let packet: Packet;
      try {
        packet = JSON.parse(message.data);
      } catch {
        return;
      }
      if (match(packet)) {
        cleanup();
        resolve(packet);
      }
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`No reply to ${event} within ${timeoutMs / 1000}s.`));
    }, timeoutMs);

    socket.addEventListener('message', onMessage);
    const packet: Packet = {
      type: 'command',
      event,
      requestId,
      version: 'v1',
      timestamp: new Date().toISOString(),
      payload,
    };
    socket.send(JSON.stringify(packet));
  });
}
