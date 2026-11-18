// Call volume settings: how loud the others are (speaker) and how loud you
// are to them (microphone), remembered between runs. The microphone volume
// is a Web Audio gain node that LiveKit runs your mic through before sending
// it, which also measures your level for the meter under the slider.
import { signal } from '@preact/signals-core';
import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';

const STORAGE_KEY = 'wavez-tools:call';
export const VOLUME_MAX = 200;
export const VOLUME_STEP = 5;

interface CallSettings {
  /** Everyone else's volume, 0-200 (%). */
  speaker: number;
  /** Your microphone's volume, 0-200 (%). */
  mic: number;
}

const DEFAULTS: CallSettings = { speaker: 100, mic: 100 };

const clamp = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n)
    ? Math.min(VOLUME_MAX, Math.max(0, Math.round(n / VOLUME_STEP) * VOLUME_STEP))
    : undefined;

function load(): CallSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<CallSettings>;
    return { speaker: clamp(raw.speaker) ?? DEFAULTS.speaker, mic: clamp(raw.mic) ?? DEFAULTS.mic };
  } catch {
    return { ...DEFAULTS };
  }
}

export const callSettings = signal(load());

export function setCallVolume(key: keyof CallSettings, value: number): void {
  const v = clamp(value);
  if (v === undefined) return;
  callSettings.value = { ...callSettings.value, [key]: v };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(callSettings.value));
  } catch {
    // Private mode etc.: the setting just won't be remembered.
  }
}

export type MicProcessor = TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> & {
  setGain(volume: number): void;
  /** Your current loudness after the gain, 0-1. */
  level(): number;
};

/** A LiveKit audio processor that scales the microphone by `volume` (0-200). */
export function createMicProcessor(volume: number): MicProcessor {
  let source: MediaStreamAudioSourceNode | null = null;
  let gain: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let dest: MediaStreamAudioDestinationNode | null = null;
  let current = volume / 100;
  let buf: Float32Array | null = null;

  const proc: MicProcessor = {
    name: 'wavez-tools-mic-volume',
    processedTrack: undefined,
    async init({ track, audioContext }) {
      source = audioContext.createMediaStreamSource(new MediaStream([track]));
      gain = audioContext.createGain();
      gain.gain.value = current;
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      buf = new Float32Array(analyser.fftSize);
      dest = audioContext.createMediaStreamDestination();
      source.connect(gain);
      gain.connect(dest);
      gain.connect(analyser);
      proc.processedTrack = dest.stream.getAudioTracks()[0];
    },
    async restart(opts) {
      await proc.destroy();
      await proc.init(opts);
    },
    async destroy() {
      source?.disconnect();
      gain?.disconnect();
      analyser?.disconnect();
      proc.processedTrack?.stop();
      source = gain = analyser = dest = null;
      proc.processedTrack = undefined;
    },
    setGain(v) {
      current = v / 100;
      if (gain) gain.gain.value = current;
    },
    level() {
      if (!analyser || !buf) return 0;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += x * x;
      // RMS, scaled so ordinary speech fills most of the bar.
      return Math.min(1, Math.sqrt(sum / buf.length) * 4);
    },
  };
  return proc;
}
