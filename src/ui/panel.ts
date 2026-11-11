// The floating panel: a header pill showing the next song's opcheck, a list
// of tools, and a screen per tool with a back button. Collapses to the pill.
import { batch, computed, signal, untracked, type Signal } from '@preact/signals-core';
import type { ScreenTool, ToggleTool, Tool } from '../tools';
import { createNextSongStore, type NextSongStore } from '../wavez/next-song';
import { trackArtist, trackTitle } from '../wavez/tracks';
import { banner, opcheckLabel, type Tone } from './components';
import { h, scoped, watch } from './dom';
import { makeDraggable } from './drag';
import { icon, type IconName } from './icons';
import { css, PANEL_ID } from './styles';

export interface PanelHandle {
  unmount(): void;
}

/** Lets code outside the panel (such as chat commands) read and flip switches. */
export interface PanelControls {
  nextSong: NextSongStore;
  isOn(tool: ToggleTool): boolean;
  setToggle(tool: ToggleTool, on: boolean): void;
}

export interface PanelOptions {
  /** Tool opened by clicking the next-song line in the header. */
  pillTool?: ScreenTool;
  /** Runs once the panel is up; the returned function runs when it closes. */
  onMount?: (controls: PanelControls) => () => void;
}

declare global {
  interface Window {
    __wavezToolsPanel?: PanelHandle;
  }
}

const STORAGE_KEY = 'wavez-tools:toggles';

export function findPanel(): PanelHandle | null {
  if (window.__wavezToolsPanel) return window.__wavezToolsPanel;
  // A panel left by an older version of the script has no handle.
  const stale = document.getElementById(PANEL_ID);
  return stale && { unmount: () => stale.remove() };
}

export function mountPanel(tools: Tool[], opts: PanelOptions = {}): PanelHandle {
  // Everything below is built once. Signals hold the state, and each node that
  // shows a piece of it updates on its own (see src/ui/dom.ts), so a change
  // never rebuilds the header or the list and focus stays where it was.
  const [handle, disposeAll] = scoped(() => build(tools, opts));
  const unmount = handle.unmount;
  handle.unmount = () => {
    unmount();
    disposeAll();
  };
  return handle;
}

interface ToggleState {
  on: Signal<boolean>;
  /** Live line from a switch that's on. */
  status: Signal<{ text: string; tone?: 'soon' } | null>;
  /** Note left by a switch that turned itself off. */
  note: Signal<string | null>;
  /** Whether its cog is open. */
  open: Signal<boolean>;
}

interface Current {
  tool: ScreenTool;
  body: HTMLElement;
  controller: AbortController;
  subtitle: HTMLElement;
}

function build(tools: Tool[], opts: PanelOptions): PanelHandle {
  const nextSong = createNextSongStore();
  const collapsed = signal(false);
  const current = signal<Current | null>(null);
  // The tool whose screen is showing, or null for the pill and tool list.
  const inTool = computed(() => (collapsed.value ? null : current.value));
  const panel = h('div', { id: PANEL_ID });
  const drag = makeDraggable(panel);

  const iconButton = (name: IconName, label: string, onclick: () => void) =>
    h('button', { type: 'button', class: 'wt-icon-btn', 'aria-label': label, onclick }, icon(name));

  // --- header ---------------------------------------------------------------

  const pill = computed(() => {
    const state = nextSong.value;
    const { track } = state;
    const label = track
      ? [trackTitle(track), trackArtist(track)].filter(Boolean).join(' · ')
      : state.status === 'failed'
        ? state.error
        : 'Loading…';
    const [chipText, chipTone]: [string, Tone] =
      state.status === 'ready' ? opcheckLabel(state.result) : state.status === 'failed' ? ['?', 'err'] : ['Checking…', 'busy'];
    const dot = state.status === 'ready' ? (state.result.op || state.result.blocked ? 'op' : 'ok') : '';
    return { label, chipText, chipTone, chipTitle: state.status === 'failed' ? state.error : undefined, dot };
  });
  const pillNodes = () => [
    h('span', { class: computed(() => `wt-dot ${pill.value.dot && `wt-${pill.value.dot}`}`) }),
    h(
      'button',
      {
        type: 'button',
        class: 'wt-pill-text wt-ellipsis',
        title: computed(() => pill.value.label),
        onclick: () => {
          if (opts.pillTool) openTool(opts.pillTool);
          else collapsed.value = false;
        },
      },
      h('span', { class: 'wt-muted' }, 'Next: '),
      computed(() => pill.value.label),
    ),
    h(
      'span',
      { class: computed(() => `wt-chip wt-${pill.value.chipTone}`), title: computed(() => pill.value.chipTitle) },
      computed(() => pill.value.chipText),
    ),
  ];
  const toolTitle = (cur: Current) => [
    iconButton('back', 'Back to tools', back),
    h('div', { class: 'wt-title' }, h('b', { class: 'wt-ellipsis' }, cur.tool.name), cur.subtitle),
  ];
  const collapseButton = h(
    'button',
    {
      type: 'button',
      class: 'wt-icon-btn',
      'aria-label': computed(() => (collapsed.value ? 'Expand' : 'Collapse')),
      'aria-expanded': computed(() => String(!collapsed.value)),
      onclick: () => (collapsed.value = !collapsed.value),
    },
    () => icon(collapsed.value ? 'expand' : 'collapse'),
  );
  const header = h(
    'div',
    { class: computed(() => (inTool.value ? 'wt-header wt-in-tool' : 'wt-header')) },
    drag.grip,
    () => {
      const cur = inTool.value;
      return cur ? toolTitle(cur) : pillNodes();
    },
    collapseButton,
  );

  // --- switches -------------------------------------------------------------

  const stops = new Map<string, () => void>();
  const toggleStates = new Map<string, ToggleState>();
  const stateOf = (tool: ToggleTool): ToggleState => {
    let st = toggleStates.get(tool.id);
    if (!st) {
      st = { on: signal(false), status: signal(null), note: signal(null), open: signal(false) };
      toggleStates.set(tool.id, st);
    }
    return st;
  };

  function setToggle(tool: ToggleTool, on: boolean) {
    const st = stateOf(tool);
    stops.get(tool.id)?.();
    stops.delete(tool.id);
    batch(() => {
      st.on.value = false;
      st.status.value = null;
      st.note.value = null;
    });
    if (on) {
      try {
        let mine: (() => void) | undefined;
        // A context only acts while the run it was made for is still the current one.
        const live = () => mine !== undefined && stops.get(tool.id) === mine;
        // Untracked, so a tool reading a signal while it starts can't tie itself to whatever called this.
        mine = untracked(() =>
          tool.enable({
            nextSong,
            setStatus(text, tone) {
              if (mine !== undefined && !live()) return;
              st.status.value = text ? { text, tone } : null;
            },
            // Deferred, since enable() may still be running.
            turnOff(note) {
              queueMicrotask(() => {
                if (!live()) return;
                setToggle(tool, false);
                if (note) st.note.value = note;
              });
            },
            turnOffOther(id) {
              queueMicrotask(() => {
                const other = tools.find((t): t is ToggleTool => t.kind === 'toggle' && t.id === id);
                if (other && stops.has(id)) setToggle(other, false);
              });
            },
          }),
        );
        stops.set(tool.id, mine);
        st.on.value = true;
      } catch (err) {
        console.warn(`WavezFM Tools: ${tool.name} failed to start`, err);
      }
    }
    saveToggles([...stops.keys()]);
  }

  // --- tool list --------------------------------------------------------------

  function screenRow(tool: ScreenTool) {
    return h(
      'button',
      { type: 'button', class: 'wt-row', onclick: () => openTool(tool) },
      h('span', { class: 'wt-glyph', 'aria-hidden': 'true' }, tool.glyph),
      h('span', { class: 'wt-row-text' }, h('span', { class: 'wt-row-name' }, tool.name), h('span', { class: 'wt-muted' }, tool.blurb)),
      icon('open', 14),
    );
  }

  function toggleRow(tool: ToggleTool) {
    const st = stateOf(tool);
    const id = `wt-toggle-${tool.id}`;
    const optionsId = `wt-options-${tool.id}`;
    const line = computed(() => {
      if (st.on.value) {
        const status = st.status.value;
        if (!status) return { text: tool.onBlurb, class: 'wt-muted' };
        return { text: status.text, class: status.tone === 'soon' ? 'wt-warn' : 'wt-status' };
      }
      const note = st.note.value;
      return note ? { text: note, class: 'wt-done' } : { text: tool.blurb, class: 'wt-muted' };
    });
    const row = h(
      'div',
      { class: 'wt-row' },
      h('span', { class: 'wt-glyph', 'aria-hidden': 'true' }, tool.glyph),
      h(
        'label',
        { class: 'wt-row-text', for: id },
        h('span', { class: 'wt-row-name' }, tool.name),
        h('span', { class: computed(() => line.value.class) }, computed(() => line.value.text)),
      ),
      tool.options &&
        h(
          'button',
          {
            type: 'button',
            class: 'wt-icon-btn wt-cog',
            'aria-label': `${tool.name} options`,
            'aria-expanded': computed(() => String(st.open.value)),
            'aria-controls': optionsId,
            onclick: () => (st.open.value = !st.open.value),
          },
          icon('cog'),
        ),
      h(
        'button',
        {
          type: 'button',
          id,
          class: 'wt-switch',
          role: 'switch',
          'aria-checked': computed(() => String(st.on.value)),
          onclick: () => setToggle(tool, !st.on.peek()),
        },
        h('span'),
      ),
    );
    const { options } = tool;
    if (!options) return row;
    return h(
      'div',
      { class: computed(() => (st.open.value ? 'wt-group wt-open' : 'wt-group')) },
      row,
      // The options are built when the cog opens and thrown away (bindings and all) when it closes.
      () => st.open.value && h('div', { id: optionsId }, untracked(options)),
    );
  }

  const screens = tools.filter((t): t is ScreenTool => t.kind === 'screen');
  const toggles = tools.filter((t): t is ToggleTool => t.kind === 'toggle');
  const list = h(
    'div',
    { class: 'wt-list' },
    ...screens.map(screenRow),
    screens.length > 0 && toggles.length > 0 && h('div', { class: 'wt-divider' }),
    ...toggles.map(toggleRow),
  );

  // --- navigation -------------------------------------------------------------

  const content = h(
    'div',
    { class: 'wt-content', hidden: collapsed },
    () => (collapsed.value ? null : current.value ? current.value.body : list),
  );
  panel.append(h('style', null, css), header, content);
  // classList rather than a class binding, since dragging adds a class too.
  watch(() => void panel.classList.toggle('wt-collapsed', collapsed.value));

  function openTool(tool: ScreenTool) {
    current.peek()?.controller.abort();
    const controller = new AbortController();
    const body = h('div');
    const subtitle = h('span', { class: 'wt-sub wt-ellipsis' });
    batch(() => {
      current.value = { tool, body, controller, subtitle };
      collapsed.value = false;
    });
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return;
        // Live bindings the screen makes while it opens stop when it's left.
        const [opened, dispose] = scoped(() =>
          tool.open({
            body,
            signal: controller.signal,
            nextSong,
            setSubtitle: (text) => {
              subtitle.textContent = text;
            },
          }),
        );
        controller.signal.addEventListener('abort', dispose);
        return opened;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        body.replaceChildren(h('div', { class: 'wt-body' }, banner('err', err instanceof Error ? err.message : String(err))));
      });
  }

  function back() {
    current.peek()?.controller.abort();
    current.value = null;
  }

  // --- lifecycle --------------------------------------------------------------

  // Read the saved list once: each setToggle below re-saves it as it goes.
  const saved = loadToggles();
  for (const tool of toggles) {
    if (saved.includes(tool.id)) setToggle(tool, true);
  }
  document.body.appendChild(panel);

  const stopExtras = opts.onMount?.({
    nextSong,
    isOn: (tool) => stops.has(tool.id),
    setToggle(tool, on) {
      if (stops.has(tool.id) !== on) setToggle(tool, on);
    },
  });

  const handle: PanelHandle = {
    unmount() {
      stopExtras?.();
      current.peek()?.controller.abort();
      // Toggles stop with the panel but stay remembered for the next open.
      for (const stop of stops.values()) stop();
      nextSong.dispose();
      drag.dispose();
      panel.remove();
      delete window.__wavezToolsPanel;
    },
  };
  window.__wavezToolsPanel = handle;
  return handle;
}

function loadToggles(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function saveToggles(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: toggles just won't be remembered.
  }
}
