// A pretend WavezFM room for scripts/screenshots/run.mjs. It runs before the
// bookmarklet and stands in for everything the bookmarklet talks to on the
// real site: the window.WavezFM bridge, the room WebSocket (for opchecks) and
// Notification. Playlist HTTP calls are answered by the runner (page.route).
// All names here are made up.
(() => {
  const ME = { id: 'u-me', username: 'ttp', displayUsername: 'ttp', roomRole: 'bouncer', level: 12 };
  const entry = (userId, username, position, wait) => ({
    userId,
    username,
    displayUsername: username,
    position,
    queuedTrackDurationMs: 215000,
    estimatedWaitMs: wait,
    estimatedWaitKind: 'ready',
  });
  const queue = (entries, extra = {}) => ({
    userIds: entries.map((e) => e.userId),
    count: entries.length,
    isJoined: entries.some((e) => e.userId === ME.id),
    isCurrentDj: false,
    isLocked: false,
    isFull: false,
    currentDjId: 'u-dj',
    currentDjUsername: 'lunaflux',
    entries,
    ...extra,
  });

  const state = {
    room: {
      id: 'room-demo',
      slug: 'late-night-lofi',
      name: 'Late Night Lofi',
      description: '',
      viewerRole: 'bouncer',
      queueLocked: false,
      activeUsersCount: 37,
      queueCount: 3,
    },
    currentUser: ME,
    playback: {
      playbackKey: 'p1',
      trackId: 't-now',
      source: 'youtube',
      sourceId: 'demo-now',
      title: 'Paper Lanterns',
      artist: 'Harbor Static',
      thumbnailUrl: null,
      durationMs: 198000,
      isLive: false,
      startedAtServerMs: Date.now() - 60000,
      djId: 'u-dj',
      djUsername: 'lunaflux',
    },
    votes: { trackId: 't-now', woots: 14, mehs: 1, grabs: 3, clientVote: 'woot', canVote: true },
    queue: queue([entry('u-a', 'mossgarden', 1, 140000), entry('u-b', 'kiwi_beats', 2, 350000), entry(ME.id, ME.username, 3, 575000)]),
    permissions: { vote: true, joinQueue: true, sendChat: true },
  };

  const handlers = new Map();
  const emit = (event, payload) => (handlers.get(event) || []).forEach((h) => h(payload));
  const ok = { ok: true, code: 'ok' };

  window.WavezFM = {
    version: '1',
    room: {
      getState: () => state,
      subscribe(event, handler) {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event).add(handler);
        return () => handlers.get(event).delete(handler);
      },
    },
    actions: {
      vote: () => ok,
      joinQueue: () => ok,
      leaveQueue: () => ok,
      sendChat: () => ok,
      setVolume: () => ok,
    },
  };

  // Opcheck answers, by the end of the track's link (its sourceId). The runner
  // fills this in from the same data it serves playlists from.
  const opchecks = {};

  class FakeSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 1;
    send(data) {
      const packet = JSON.parse(data);
      if (packet.event !== 'send_bot_command') return;
      const link = packet.payload.content.split(' ').pop();
      const id = link.split(/[=/]/).pop();
      const result = {
        cmd: 'opcheck',
        link,
        trackId: id,
        title: null,
        op: false,
        reason: null,
        blocked: false,
        plays: { all: 3, day: 0, week: 0, month: 1 },
        lastPlayed: new Date(Date.now() - 9 * 86400000).toISOString(),
        label: null,
        ...opchecks[id],
      };
      const reply = {
        type: 'event',
        event: 'bot_private_reply',
        version: 'v1',
        timestamp: new Date().toISOString(),
        payload: { id: 'r', commandId: packet.requestId, roomId: state.room.id, botUserId: 'bot', content: `tp1 ${JSON.stringify(result)}`, private: true },
      };
      setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(reply) })), 120);
    }
    close() {}
  }
  window.WebSocket = FakeSocket;
  const socket = new FakeSocket();
  // The bookmarklet finds the room socket by the first packet it sends.
  const ping = JSON.stringify({ type: 'command', event: 'ping', version: 'v1', timestamp: '', payload: {} });
  setInterval(() => socket.send(ping), 100);

  window.Notification = class {
    static permission = 'granted';
    static requestPermission = () => Promise.resolve('granted');
    close() {}
  };

  window.__mock = { state, emit, opchecks, ME, entry, queue };
})();
