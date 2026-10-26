// Types and helpers for window.WavezFM, the Room Extension API (version "1").
// https://github.com/WavezFM/WavezFM-Extension-API

export interface Playback {
  playbackKey: string;
  trackId: string;
  source: 'youtube' | 'soundcloud';
  sourceId: string;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  durationMs: number;
  isLive: boolean;
  startedAtServerMs: number;
  djId: string;
  djUsername: string;
}

export interface QueueEntry {
  userId: string;
  username: string;
  displayUsername: string | null;
  position: number;
  queuedTrackDurationMs: number | null;
  estimatedWaitMs: number | null;
  estimatedWaitKind: 'ready' | 'live' | 'unknown';
}

export interface RoomState {
  room: {
    id: string;
    slug: string;
    name: string;
    description: string;
    viewerRole: string;
    queueLocked: boolean;
    activeUsersCount: number;
    queueCount: number;
  };
  currentUser: {
    id: string;
    username: string;
    displayUsername: string;
    roomRole: string | null;
    level: number | null;
  } | null;
  playback: Playback | null;
  votes: {
    trackId: string | null;
    woots: number;
    mehs: number;
    grabs: number;
    clientVote: 'woot' | 'meh' | null;
    canVote: boolean;
  };
  queue: {
    userIds: string[];
    count: number;
    isJoined: boolean;
    isCurrentDj: boolean;
    isLocked: boolean;
    isFull: boolean;
    currentDjId: string | null;
    currentDjUsername: string | null;
    entries: QueueEntry[];
  };
  permissions: {
    vote: boolean;
    joinQueue: boolean;
    sendChat: boolean;
  };
}

export type RoomEvent =
  | 'room_changed'
  | 'playback_changed'
  | 'votes_changed'
  | 'queue_changed'
  | 'users_changed'
  | 'chat_message'
  | 'social_changed'
  | 'progress_changed';

export interface ActionResult {
  ok: boolean;
  code: string;
  requestId?: string | null;
  value?: number;
}

export interface WavezBridge {
  version: string;
  room: {
    getState(): RoomState | null;
    subscribe(event: RoomEvent, handler: (payload: unknown) => void): () => void;
  };
  actions: {
    vote(type: 'woot' | 'meh'): ActionResult;
    joinQueue(): ActionResult;
    leaveQueue(): ActionResult;
    sendChat(content: string): ActionResult;
    setVolume(volume: number): ActionResult;
  };
}

declare global {
  interface Window {
    WavezFM?: WavezBridge;
  }
}

export function getBridge(): WavezBridge | null {
  const bridge = window.WavezFM;
  return bridge && bridge.version === '1' ? bridge : null;
}

export function requireBridge(): WavezBridge {
  const bridge = getBridge();
  if (!bridge) throw new Error('WavezFM bridge not found. Open a wavez.fm room page first.');
  return bridge;
}

export function getState(): RoomState | null {
  return requireBridge().room.getState();
}

export function requireState(): RoomState {
  const state = getState();
  if (!state) throw new Error('Not in a room.');
  return state;
}

export function sendChat(text: string): ActionResult {
  const result = requireBridge().actions.sendChat(text);
  if (!result.ok) throw new Error(`sendChat failed: ${result.code}`);
  return result;
}
