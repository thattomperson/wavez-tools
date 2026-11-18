// One room's voice & video call: joining, leaving, mic/camera/screen, and
// the list of people the popup draws. Everything the popup shows is a signal
// here; the LiveKit Room itself stays private.
import { batch, signal } from '@preact/signals-core';
import type { LocalParticipant, Participant, RemoteTrack, Room } from 'livekit-client';
import { callConfigured, fetchMembers, fetchToken, type CallMember } from './client';
import { loadLiveKit, type LiveKit } from './load';

export type Phase = 'idle' | 'connecting' | 'connected';

export interface Person {
  id: string;
  name: string;
  isLocal: boolean;
  speaking: boolean;
  muted: boolean;
  /** Their camera or screen share, already playing. Null shows their initial. */
  video: HTMLVideoElement | null;
  /** Your own camera, shown mirrored like a mirror. */
  mirrored: boolean;
}

export type CallSession = ReturnType<typeof createCallSession>;

// How often to refresh "who's in the call" while you're not in it.
const MEMBERS_POLL_MS = 15_000;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const log = (...args: unknown[]) => console.log('WavezFM Tools [call]', ...args);

export function createCallSession(roomId: string, me: { id: string; name: string } | null) {
  const phase = signal<Phase>('idle');
  const people = signal<Person[]>([]);
  /** Who's in the call, while you aren't. */
  const members = signal<CallMember[]>([]);
  const error = signal<string | null>(
    !callConfigured()
      ? 'Calls aren’t set up yet: the token server address is missing (CALL.tokenUrl in src/config.ts).'
      : !me
        ? 'Sign in to WavezFM to join the call.'
        : null,
  );
  const mic = signal(false);
  const cam = signal(false);
  const screen = signal(false);
  const startedAt = signal<number | null>(null);
  /** The browser blocked call audio until there's a click. */
  const audioBlocked = signal(false);
  const canJoin = !error.value;

  let disposed = false;
  let lk: LiveKit | null = null;
  let room: Room | null = null;
  // One video element per person, reused across redraws so playback doesn't restart.
  const videos = new Map<string, { el: HTMLVideoElement; track: RemoteTrack | null | object }>();
  const audioBox = document.createElement('div');
  audioBox.hidden = true;
  audioBox.id = 'wavez-tools-call-audio';
  document.body.appendChild(audioBox);

  function videoFor(p: Participant): { el: HTMLVideoElement; mirrored: boolean } | null {
    const { Track } = lk!;
    const pick = (source: (typeof Track.Source)[keyof typeof Track.Source]) => {
      const pub = p.getTrackPublication(source);
      return pub && !pub.isMuted && pub.track ? pub.track : null;
    };
    const shared = pick(Track.Source.ScreenShare);
    const track = shared ?? pick(Track.Source.Camera);
    const had = videos.get(p.identity);
    if (!track) {
      if (had) {
        (had.track as RemoteTrack | null)?.detach(had.el);
        videos.delete(p.identity);
      }
      return null;
    }
    if (had && had.track === track) return { el: had.el, mirrored: p.isLocal && !shared };
    if (had) (had.track as RemoteTrack | null)?.detach(had.el);
    const el = (had?.el ?? document.createElement('video')) as HTMLVideoElement;
    el.muted = true;
    el.playsInline = true;
    track.attach(el);
    videos.set(p.identity, { el, track });
    return { el, mirrored: p.isLocal && !shared };
  }

  function refresh() {
    if (!room) return;
    const local: LocalParticipant = room.localParticipant;
    const all: Participant[] = [local, ...room.remoteParticipants.values()];
    const seen = new Set(all.map((p) => p.identity));
    for (const [id, v] of videos) {
      if (!seen.has(id)) {
        (v.track as RemoteTrack | null)?.detach(v.el);
        videos.delete(id);
      }
    }
    batch(() => {
      people.value = all.map((p) => {
        const v = videoFor(p);
        return {
          id: p.identity,
          name: p === local ? 'You' : p.name || p.identity,
          isLocal: p === local,
          speaking: p.isSpeaking,
          muted: !p.isMicrophoneEnabled,
          video: v?.el ?? null,
          mirrored: v?.mirrored ?? false,
        };
      });
      mic.value = local.isMicrophoneEnabled;
      cam.value = local.isCameraEnabled;
      screen.value = local.isScreenShareEnabled;
    });
  }

  async function loadMembers() {
    if (disposed || !canJoin || phase.peek() !== 'idle') return;
    try {
      members.value = await fetchMembers(roomId);
    } catch (err) {
      log('could not list the call:', err);
    }
  }
  void loadMembers();
  const poll = setInterval(loadMembers, MEMBERS_POLL_MS);

  function reset() {
    for (const v of videos.values()) (v.track as RemoteTrack | null)?.detach(v.el);
    videos.clear();
    audioBox.replaceChildren();
    room = null;
    batch(() => {
      phase.value = 'idle';
      people.value = [];
      mic.value = cam.value = screen.value = false;
      startedAt.value = null;
      audioBlocked.value = false;
    });
    void loadMembers();
  }

  async function join(withCamera: boolean) {
    if (disposed || !canJoin || !me || phase.peek() !== 'idle') return;
    error.value = null;
    phase.value = 'connecting';
    let joining: Room | null = null;
    try {
      const [mod, { url, token }] = await Promise.all([loadLiveKit(), fetchToken(roomId, me)]);
      lk = mod;
      const { Room, RoomEvent } = mod;
      joining = new Room({ adaptiveStream: true, dynacast: true });
      const r = joining;
      for (const e of [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.ActiveSpeakersChanged,
        RoomEvent.TrackPublished,
        RoomEvent.TrackUnpublished,
      ]) {
        r.on(e, () => room === r && refresh());
      }
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === 'audio') audioBox.appendChild(track.attach());
        if (room === r) refresh();
      });
      r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === 'audio') track.detach().forEach((el) => el.remove());
        if (room === r) refresh();
      });
      r.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (room === r) audioBlocked.value = !r.canPlaybackAudio;
      });
      r.on(RoomEvent.Disconnected, () => {
        if (room === r) reset();
      });

      await r.connect(url, token);
      if (disposed) {
        void r.disconnect();
        return;
      }
      room = r;
      batch(() => {
        phase.value = 'connected';
        startedAt.value = Date.now();
        members.value = [];
      });
      await r.startAudio().catch(() => undefined);
      audioBlocked.value = !r.canPlaybackAudio;
      try {
        await r.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        error.value = `Couldn’t use your microphone: ${message(err)}`;
      }
      if (withCamera) {
        try {
          await r.localParticipant.setCameraEnabled(true);
        } catch (err) {
          error.value = `Couldn’t use your camera: ${message(err)}`;
        }
      }
      refresh();
    } catch (err) {
      log('join failed:', err);
      if (joining) void joining.disconnect();
      reset();
      error.value = `Couldn’t join the call: ${message(err)}`;
    }
  }

  // Runs a mic/camera/screen change, keeping any error for the popup.
  async function change(what: string, fn: (p: LocalParticipant) => Promise<unknown>) {
    if (!room) return;
    error.value = null;
    try {
      await fn(room.localParticipant);
    } catch (err) {
      // Closing the browser's screen picker isn't an error worth showing.
      if (!(err instanceof DOMException && err.name === 'NotAllowedError' && what === 'screen')) {
        error.value = `Couldn’t change your ${what}: ${message(err)}`;
      }
    }
    refresh();
  }

  return {
    phase,
    people,
    members,
    error,
    mic,
    cam,
    screen,
    startedAt,
    audioBlocked,
    canJoin,
    join,
    leave: () => void room?.disconnect(),
    toggleMic: () => change('microphone', (p) => p.setMicrophoneEnabled(!p.isMicrophoneEnabled)),
    toggleCam: () => change('camera', (p) => p.setCameraEnabled(!p.isCameraEnabled)),
    toggleScreen: () => change('screen', (p) => p.setScreenShareEnabled(!p.isScreenShareEnabled)),
    startAudio: async () => {
      await room?.startAudio().catch(() => undefined);
      audioBlocked.value = !!room && !room.canPlaybackAudio;
    },
    /** Microphones or cameras, and the one in use. */
    async devices(kind: 'audioinput' | 'videoinput'): Promise<{ list: MediaDeviceInfo[]; active: string | undefined }> {
      if (!lk || !room) return { list: [], active: undefined };
      const list = await lk.Room.getLocalDevices(kind, false);
      return { list, active: room.getActiveDevice(kind) };
    },
    async switchDevice(kind: 'audioinput' | 'videoinput', id: string) {
      if (!room) return;
      try {
        await room.switchActiveDevice(kind, id);
      } catch (err) {
        error.value = `Couldn’t switch device: ${message(err)}`;
      }
    },
    dispose() {
      disposed = true;
      clearInterval(poll);
      const r = room;
      void r?.disconnect();
      reset();
      audioBox.remove();
    },
  };
}
