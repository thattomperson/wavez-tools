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
  /** Returns true to keep an outgoing packet from being sent. */
  filter?: ((data: unknown) => boolean) | null;
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
    if (hook.filter?.(data)) return;
    return originalSend.call(this, data);
  };
  return hook;
}

/** Start watching for the room socket. Call early so it's found by the time it's needed. */
export function installSocketHook(): void {
  getHook();
}

/** Drop outgoing packets that `filter` returns true for. Pass null to stop. */
export function setSendFilter(filter: ((data: unknown) => boolean) | null): void {
  getHook().filter = filter;
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

function parsePacket(data: unknown): Packet | null {
  if (typeof data !== 'string') return null;
  try {
    const packet = JSON.parse(data);
    return typeof packet?.event === 'string' ? (packet as Packet) : null;
  } catch {
    return null;
  }
}

// How long to wait before looking for the room socket again after a failed try.
const RETRY_MS = 5000;

/**
 * Call `handler` for every packet the room socket receives, following the
 * site onto a new socket when it reconnects. Returns a function that stops it.
 */
export function onIncoming(handler: (packet: Packet) => void): () => void {
  let stopped = false;
  let current: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const onMessage = (message: MessageEvent) => {
    const packet = parsePacket(message.data);
    if (packet) handler(packet);
  };
  const detach = () => {
    current?.removeEventListener('message', onMessage);
    current?.removeEventListener('close', onClose);
    current = null;
  };
  const attach = () => {
    if (stopped) return;
    getRoomSocket().then(
      (socket) => {
        if (stopped) return;
        current = socket;
        socket.addEventListener('message', onMessage);
        socket.addEventListener('close', onClose);
      },
      () => {
        retry = setTimeout(attach, RETRY_MS);
      },
    );
  };
  function onClose() {
    detach();
    attach();
  }

  attach();
  return () => {
    stopped = true;
    clearTimeout(retry);
    detach();
  };
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
      const packet = parsePacket(message.data);
      if (packet && match(packet)) {
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
