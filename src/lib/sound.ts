// Plays the notification sound. The mp3 is bundled into the script as base64
// so it works with the inline bookmark too, and it's played through Web Audio
// from memory, so the room page's content security policy can't block it
// the way it might block an <audio> element loading a URL.
// Sound: Sound Effect by Universfield (https://pixabay.com/users/universfield-28281460/) from
// Pixabay, credited in the README and on the install page.
import notificationMp3 from '../assets/notification.mp3';

let ctx: AudioContext | null = null;
let buffer: Promise<AudioBuffer> | null = null;

function context(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

function decode(): Promise<AudioBuffer> {
  buffer ??= (() => {
    const bytes = Uint8Array.from(atob(notificationMp3), (c) => c.charCodeAt(0));
    return context().decodeAudioData(bytes.buffer);
  })();
  return buffer;
}

/**
 * Get audio ready. Call from a click or keypress: browsers only let a page
 * start audio after the person has interacted with it.
 */
export function primeSound(): void {
  void context().resume();
  void decode().catch((err) => console.warn('WavezFM Tools: could not load the notification sound', err));
}

export async function playSound(volume = 0.8): Promise<void> {
  const audio = context();
  if (audio.state === 'suspended') await audio.resume();
  const source = audio.createBufferSource();
  source.buffer = await decode();
  const gain = audio.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(audio.destination);
  source.start();
}
