// The call popup: at the bottom right of the room, just left of the chat,
// until you drag it somewhere else by the grip in its header (remembered).
// Its free side edge resizes it, which makes the video tiles bigger. Three looks: a join card (who's in the call, Join voice / With
// camera), the call itself (a tile per person, mic/camera/screen/settings,
// Leave), and a small pill when minimized. Mocked up as G1 on the design
// canvas. Lives outside the panel, so it has its own scoped CSS.
import { computed, signal } from '@preact/signals-core';
import { h, scoped, watch } from '../ui/dom';
import { makeDraggable } from '../ui/drag';
import { icon } from '../ui/icons';
import { callSettings, setCallVolume, VOLUME_MAX, VOLUME_STEP } from './audio';
import type { CallMember } from './client';
import type { CallSession, Person } from './session';
import { CALL_ID, callCss } from './styles';

const GAP = 16;
// Narrower than this and the chat is probably a drawer over the page, not a column.
const MIN_LEFT_OF_CHAT = 360;
const SIZE_KEY = 'wavez-tools:call-size';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 280;
const MAX_WIDTH = 960;
const RESIZE_STEP = 20;

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

/** Where the chat column starts, so the popup can sit just left of it. */
function rightOffset(): number {
  const chat = document.querySelector('[role="log"][aria-label="Room Chat"]');
  if (!chat) return GAP;
  // The log scrolls inside the chat column; its left edge is close enough.
  const r = chat.getBoundingClientRect();
  if (!r.width || r.left < MIN_LEFT_OF_CHAT) return GAP;
  return Math.max(GAP, Math.round(window.innerWidth - r.left + GAP));
}

function loadWidth(): number {
  try {
    const w = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null')?.width;
    return typeof w === 'number' ? w : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function saveWidth(width: number) {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify({ width }));
  } catch {
    // Storage blocked: the size just won't be remembered.
  }
}

/** Shows the popup for a call session. Returns a function that removes it. */
export function mountCallPopup(call: CallSession): () => void {
  document.getElementById(CALL_ID)?.remove();

  const [root, dispose] = scoped(() => {
    const minimized = signal(false);
    const settingsOpen = signal(false);
    const now = signal(Date.now());
    const root = (<div id={CALL_ID} role="region" aria-label="Voice and video call" />) as HTMLDivElement;

    // Until it's dragged, it sits just left of the chat. The chat can move or
    // resize as the page lays out, so follow it cheaply.
    const place = () => {
      const s = root.style;
      if (drag.placed()) {
        root.dataset.anchor = 'left';
        const bottom = parseFloat(s.bottom) || GAP;
        s.setProperty('--wtc-max', `${Math.max(200, window.innerHeight - bottom - GAP)}px`);
        return;
      }
      root.dataset.anchor = 'right';
      s.left = s.top = '';
      s.right = `${rightOffset()}px`;
      s.bottom = `${GAP}px`;
      s.setProperty('--wtc-max', `${window.innerHeight - 2 * GAP}px`);
    };
    const drag = makeDraggable(root, {
      storageKey: 'wavez-tools:call-position',
      label: 'Move the call (drag, or use the arrow keys; double-click to put it back)',
      gripClass: 'wtc-grip',
      draggingClass: 'wtc-dragging',
      anchor: 'bottom',
      minVisible: 60,
      onMove: () => place(),
      onReset: () => place(),
    });
    watch(() => () => drag.dispose());
    place();

    // Width, from the edge on the side away from where it's anchored. Video
    // tiles keep their shape, so a wider popup has bigger videos.
    let width = DEFAULT_WIDTH;
    const setWidth = (w: number) => {
      width = Math.round(Math.max(MIN_WIDTH, Math.min(w, MAX_WIDTH, window.innerWidth - 2 * GAP)));
      root.style.setProperty('--wtc-w', `${width}px`);
    };
    setWidth(loadWidth());
    // Growing towards the free side: leftwards while it's docked by the chat.
    const growSign = () => (root.dataset.anchor === 'right' ? -1 : 1);
    let resizeFrom: { x: number; width: number } | null = null;
    const endResize = () => {
      if (!resizeFrom) return;
      resizeFrom = null;
      root.classList.remove('wtc-resizing');
      saveWidth(width);
    };
    const resizer = (
      <button
        type="button"
        class="wtc-resize"
        aria-label="Resize the call (drag, or use the arrow keys; double-click for the normal size)"
        title="Drag to resize, double-click for the normal size"
        onpointerdown={(event) => {
          const e = event as PointerEvent;
          if (e.button !== 0) return;
          resizeFrom = { x: e.clientX, width };
          resizer.setPointerCapture(e.pointerId);
          root.classList.add('wtc-resizing');
          e.preventDefault();
        }}
        onpointermove={(event) => {
          const e = event as PointerEvent;
          if (resizeFrom) setWidth(resizeFrom.width + growSign() * (e.clientX - resizeFrom.x));
        }}
        onpointerup={endResize}
        onpointercancel={endResize}
        ondblclick={() => {
          setWidth(DEFAULT_WIDTH);
          saveWidth(width);
        }}
        onkeydown={(event) => {
          const e = event as KeyboardEvent;
          const step = e.shiftKey ? RESIZE_STEP * 3 : RESIZE_STEP;
          const by = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
          if (!by) return;
          e.preventDefault();
          setWidth(width + by);
          saveWidth(width);
        }}
      />
    ) as HTMLButtonElement;

    const onWindowResize = () => {
      place();
      setWidth(width);
    };
    window.addEventListener('resize', onWindowResize);
    const tick = setInterval(() => {
      place();
      if (call.phase.value === 'connected') now.value = Date.now();
    }, 1000);
    watch(() => () => {
      window.removeEventListener('resize', onWindowResize);
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
        {resizer}
        <div class="wtc-head">
          {drag.grip}
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
        {resizer}
        <div class="wtc-head">
          {drag.grip}
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
        {drag.grip}
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

    root.append(
      <style>{callCss}</style>,
      <div style="display:contents">
        {() => (minimized.value ? pill() : connected.value ? callCard() : joinCard())}
      </div>,
    );
    return root;
  });

  document.body.appendChild(root);
  return () => {
    dispose();
    root.remove();
  };
}
