// The call popup: docked at the bottom left of the room's stage
// ([data-wavezfm-stage-background]), clear of the chat and the bottom bar. Three looks: a join card (who's in the call, Join voice / With
// camera), the call itself (a tile per person, mic/camera/screen/settings,
// Leave), and a small pill when minimized. Mocked up as G1 on the design
// canvas. Lives outside the panel, so it has its own scoped CSS.
import { computed, signal } from '@preact/signals-core';
import { h, scoped, watch } from '../ui/dom';
import { icon } from '../ui/icons';
import { callSettings, setCallVolume, VOLUME_MAX, VOLUME_STEP } from './audio';
import type { CallMember } from './client';
import type { CallSession, Person } from './session';
import { CALL_ID, callCss } from './styles';

const GAP = 16;
const STAGE = '[data-wavezfm-stage-background]';

const FACE_COLORS = [
  ['#2a3350', '#c4d2ff'],
  ['#1f3a2c', '#8fe0b2'],
  ['#3a2c1c', '#ffc58a'],
  ['#33233f', '#e0b8ff'],
];

function faceStyle(id: string): string {
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = FACE_COLORS[n % FACE_COLORS.length]!;
  return `background:${bg};color:${fg}`;
}

const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

function Face({ id, name }: { id: string; name: string }) {
  return (
    <span class="wtc-face" style={faceStyle(id)} aria-hidden="true">
      {initial(name)}
    </span>
  );
}

function faces(list: Array<{ id: string; name: string }>) {
  if (!list.length) return null;
  return <span class="wtc-faces">{list.slice(0, 3).map((p) => <Face id={p.id} name={p.name} />)}</span>;
}

function whoLine(members: CallMember[]): string {
  const names = members.map((m) => m.name);
  if (!names.length) return 'Nobody’s in this room’s call yet. Start it and others can join.';
  if (names.length === 1) return `${names[0]} is in the room’s call`;
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are in the room’s call`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others are in the room’s call`;
}

function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Inline position: the stage's bottom-left corner, or the window's bottom right without a stage. */
function placement(): string {
  const stage = document.querySelector(STAGE);
  const r = stage?.getBoundingClientRect();
  if (!r || !r.width || !r.height) return `right:${GAP}px;bottom:${GAP}px`;
  const left = Math.max(GAP, Math.round(r.left + GAP));
  // Keep it on screen if the stage runs past the bottom of the window.
  const bottom = Math.max(GAP, Math.round(window.innerHeight - r.bottom + GAP));
  // A tall card (settings open) scrolls rather than poking out of the top of the stage.
  const top = Math.max(GAP, Math.round(r.top + GAP));
  const max = Math.max(240, window.innerHeight - bottom - top);
  return `left:${left}px;bottom:${bottom}px;align-items:flex-start;--wtc-max:${max}px`;
}

/** Shows the popup for a call session. Returns a function that removes it. */
export function mountCallPopup(call: CallSession): () => void {
  document.getElementById(CALL_ID)?.remove();

  const [root, dispose] = scoped(() => {
    const minimized = signal(false);
    const settingsOpen = signal(false);
    const position = signal(placement());
    const now = signal(Date.now());

    // The stage can move or resize as the page lays out; follow it cheaply.
    const place = () => (position.value = placement());
    window.addEventListener('resize', place);
    const tick = setInterval(() => {
      place();
      if (call.phase.value === 'connected') now.value = Date.now();
    }, 1000);
    watch(() => () => {
      window.removeEventListener('resize', place);
      clearInterval(tick);
    });

    const connected = computed(() => call.phase.value === 'connected');
    const elapsed = computed(() => (call.startedAt.value ? duration(now.value - call.startedAt.value) : ''));

    const micButton = (cls: string) => (
      <button
        type="button"
        class={computed(() => `wtc-ctl ${cls}${call.mic.value ? '' : ' wtc-off'}`)}
        aria-label={computed(() => (call.mic.value ? 'Mute microphone' : 'Unmute microphone'))}
        aria-pressed={computed(() => String(!call.mic.value))}
        onclick={() => void call.toggleMic()}
      >
        {() => icon(call.mic.value ? 'mic' : 'micOff', 18)}
      </button>
    );

    const minimizeButton = (
      <button type="button" class="wtc-icon" aria-label="Minimize" onclick={() => (minimized.value = true)}>
        {icon('expand')}
      </button>
    );

    const errorLine = () => (call.error.value ? <div class="wtc-error" role="alert">{call.error.value}</div> : null);

    // --- join card ---------------------------------------------------------------

    const joinCard = () => (
      <div class="wtc-card">
        <div class="wtc-head">
          <span class="wtc-title">Voice &amp; video</span>
          <span class="wtc-sub">
            {() => (call.members.value.length ? `${call.members.value.length} in call` : '')}
          </span>
          {minimizeButton}
        </div>
        <div class="wtc-body">
          <div class="wtc-who">
            {() => faces(call.members.value.map((m) => ({ id: m.identity, name: m.name })))}
            <span>{() => whoLine(call.members.value)}</span>
          </div>
          {errorLine}
          {call.canJoin && (
            <div class="wtc-join">
              <button
                type="button"
                class="wtc-btn wtc-primary"
                disabled={computed(() => call.phase.value !== 'idle')}
                onclick={() => void call.join(false)}
              >
                {icon('mic')}
                {() => (call.phase.value === 'connecting' ? 'Joining…' : 'Join voice')}
              </button>
              <button
                type="button"
                class="wtc-btn"
                disabled={computed(() => call.phase.value !== 'idle')}
                onclick={() => void call.join(true)}
              >
                {icon('video')}
                With camera
              </button>
            </div>
          )}
          <span class="wtc-note">Your browser asks for your microphone (and camera) the first time.</span>
        </div>
      </div>
    );

    // --- in call -------------------------------------------------------------------

    const tile = (p: Person) => {
      const v = p.video;
      if (v) {
        v.classList.toggle('wtc-mirror', p.mirrored);
        void v.play().catch(() => undefined);
      }
      return (
        <div class={`wtc-tile${p.speaking ? ' wtc-speaking' : ''}`}>
          {v ?? <Face id={p.id} name={p.name} />}
          <span class="wtc-name">
            {p.muted && icon('micOff', 12)}
            {p.muted && <span class="wtc-sr">Muted: </span>}
            {p.name}
          </span>
        </div>
      );
    };

    const deviceSelect = (kind: 'audioinput' | 'videoinput', label: string) => {
      const select = (<select aria-label={label} />) as HTMLSelectElement;
      void call.devices(kind).then(({ list, active }) => {
        select.replaceChildren(
          ...(list.length
            ? list.map((d, i) => {
                const o = (<option value={d.deviceId}>{d.label || `${label} ${i + 1}`}</option>) as HTMLOptionElement;
                o.selected = d.deviceId === active;
                return o;
              })
            : [<option value="">None found</option>]),
        );
      });
      select.addEventListener('change', () => void call.switchDevice(kind, select.value));
      return (
        <label>
          {label}
          {select}
        </label>
      );
    };

    // A slider for how loud you are (mic) or everyone else is (speaker), 0-200%.
    const volumeRow = (key: 'mic' | 'speaker', label: string) => {
      const id = `wtc-vol-${key}`;
      return (
        <div class="wtc-vol">
          <label for={id}>{label}</label>
          <div class="wtc-vol-row">
            {icon(key === 'mic' ? 'mic' : 'volume')}
            <input
              id={id}
              type="range"
              min="0"
              max={String(VOLUME_MAX)}
              step={String(VOLUME_STEP)}
              value={computed(() => String(callSettings.value[key]))}
              oninput={(e: Event) => setCallVolume(key, Number((e.target as HTMLInputElement).value))}
            />
            <output for={id}>{computed(() => `${callSettings.value[key]}%`)}</output>
          </div>
        </div>
      );
    };

    // How loud you are right now, after the mic volume. Animates only while settings are open.
    const micMeter = () => {
      const fill = <div />;
      let frame = requestAnimationFrame(function draw() {
        fill.style.width = `${Math.round(call.micLevel() * 100)}%`;
        frame = requestAnimationFrame(draw);
      });
      watch(() => () => cancelAnimationFrame(frame));
      return (
        <div class="wtc-meter" role="img" aria-label="Your microphone level">
          {fill}
        </div>
      );
    };

    const callCard = () => (
      <div class="wtc-card">
        <div class="wtc-head">
          <span class="wtc-dot" aria-hidden="true" />
          <span class="wtc-title">In call</span>
          <span class="wtc-sub">{() => `${call.people.value.length} · ${elapsed.value}`}</span>
          {minimizeButton}
        </div>
        <div class="wtc-grid">{() => call.people.value.map(tile)}</div>
        {() =>
          call.audioBlocked.value || call.error.value ? (
            <div class="wtc-msg" style="display:flex;flex-direction:column;gap:6px">
              {call.audioBlocked.value && (
                <button type="button" class="wtc-banner" onclick={() => void call.startAudio()}>
                  Your browser paused the call’s sound. Click to hear it.
                </button>
              )}
              {errorLine()}
            </div>
          ) : null
        }
        <div class="wtc-controls">
          {micButton('')}
          <button
            type="button"
            class={computed(() => `wtc-ctl${call.cam.value ? '' : ' wtc-off'}`)}
            aria-label={computed(() => (call.cam.value ? 'Turn camera off' : 'Turn camera on'))}
            aria-pressed={computed(() => String(call.cam.value))}
            onclick={() => void call.toggleCam()}
          >
            {() => icon(call.cam.value ? 'video' : 'videoOff', 18)}
          </button>
          <button
            type="button"
            class={computed(() => `wtc-ctl${call.screen.value ? ' wtc-on' : ''}`)}
            aria-label={computed(() => (call.screen.value ? 'Stop sharing your screen' : 'Share your screen'))}
            aria-pressed={computed(() => String(call.screen.value))}
            onclick={() => void call.toggleScreen()}
          >
            {icon('screen', 18)}
          </button>
          <button
            type="button"
            class={computed(() => `wtc-ctl${settingsOpen.value ? ' wtc-on' : ''}`)}
            aria-label="Microphone and camera"
            aria-expanded={computed(() => String(settingsOpen.value))}
            onclick={() => (settingsOpen.value = !settingsOpen.value)}
          >
            {icon('sliders', 18)}
          </button>
          <span class="wtc-grow" />
          <button type="button" class="wtc-leave" onclick={() => call.leave()}>
            Leave
          </button>
        </div>
        {() =>
          settingsOpen.value ? (
            <div class="wtc-settings">
              {deviceSelect('audioinput', 'Microphone')}
              {volumeRow('mic', 'Microphone volume')}
              {micMeter()}
              {volumeRow('speaker', 'Speaker volume')}
              {deviceSelect('videoinput', 'Camera')}
            </div>
          ) : null
        }
      </div>
    );

    // --- minimized -----------------------------------------------------------------

    const pill = () => (
      <div class="wtc-pill">
        {() =>
          connected.value
            ? faces(call.people.value.filter((p) => !p.isLocal))
            : faces(call.members.value.map((m) => ({ id: m.identity, name: m.name })))
        }
        <span class="wtc-pill-text">
          {() =>
            connected.value ? (
              <span>
                <b>In call</b> <span style="color:#9a9cae">{`${call.people.value.length} · ${elapsed.value}`}</span>
              </span>
            ) : (
              <span>
                <b>Voice</b>{' '}
                <span style="color:#9a9cae">
                  {call.members.value.length ? `${call.members.value.length} in call` : 'nobody in call'}
                </span>
              </span>
            )
          }
        </span>
        {() => (connected.value ? micButton('') : null)}
        <button type="button" class="wtc-icon" aria-label="Expand" onclick={() => (minimized.value = false)} style="width:36px;height:36px">
          {icon('collapse')}
        </button>
      </div>
    );

    return (
      <div
        id={CALL_ID}
        role="region"
        aria-label="Voice and video call"
        style={position}
      >
        <style>{callCss}</style>
        {() => (minimized.value ? pill() : connected.value ? callCard() : joinCard())}
      </div>
    );
  });

  document.body.appendChild(root);
  return () => {
    dispose();
    root.remove();
  };
}
