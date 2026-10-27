// The floating panel: a header pill showing the next song's opcheck, a list
// of tools, and a screen per tool with a back button. Collapses to the pill.
import type { ScreenTool, ToggleTool, Tool } from '../tools';
import { createNextSongStore, type NextSongState } from '../wavez/next-song';
import { trackArtist, trackTitle } from '../wavez/tracks';
import { banner, chip, opcheckChip } from './components';
import { h } from './dom';
import { icon, type IconName } from './icons';
import { css, PANEL_ID } from './styles';

export interface PanelHandle {
  unmount(): void;
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

export function mountPanel(tools: Tool[], opts: { pillTool?: ScreenTool } = {}): PanelHandle {
  const nextSong = createNextSongStore();
  const panel = h('div', { id: PANEL_ID }, h('style', null, css));
  const header = h('div', { class: 'wt-header' });
  const content = h('div', { class: 'wt-content' });
  panel.append(header, content);

  let collapsed = false;
  let current: { tool: ScreenTool; body: HTMLElement; controller: AbortController; subtitle: HTMLElement } | null = null;

  const iconButton = (name: IconName, label: string, onclick: () => void, expanded?: boolean) =>
    h(
      'button',
      { type: 'button', class: 'wt-icon-btn', 'aria-label': label, 'aria-expanded': expanded === undefined ? undefined : String(expanded), onclick },
      icon(name),
    );
  const toggleButton = () =>
    collapsed
      ? iconButton('expand', 'Expand', () => setCollapsed(false), false)
      : iconButton('collapse', 'Collapse', () => setCollapsed(true), true);

  // --- header ---------------------------------------------------------------

  function pillHeader(state: NextSongState) {
    const { track } = state;
    const tone = state.status === 'ready' ? (state.result.op || state.result.blocked ? 'op' : 'ok') : '';
    const label = track
      ? [trackTitle(track), trackArtist(track)].filter(Boolean).join(' · ')
      : state.status === 'failed'
        ? state.error
        : 'Loading…';
    const status =
      state.status === 'ready'
        ? opcheckChip(state.result)
        : state.status === 'failed'
          ? chip('?', 'err')
          : chip('Checking…', 'busy');
    if (state.status === 'failed') status.title = state.error;
    const text = h(
      'button',
      {
        type: 'button',
        class: 'wt-pill-text wt-ellipsis',
        title: label,
        onclick: () => {
          if (opts.pillTool) openTool(opts.pillTool);
          else setCollapsed(false);
        },
      },
      h('span', { class: 'wt-muted' }, 'Next: '),
      label,
    );
    header.className = 'wt-header';
    header.replaceChildren(h('span', { class: `wt-dot ${tone && `wt-${tone}`}` }), text, status, toggleButton());
  }

  function renderHeader() {
    if (current && !collapsed) {
      header.className = 'wt-header wt-in-tool';
      header.replaceChildren(
        iconButton('back', 'Back to tools', back),
        h('div', { class: 'wt-title' }, h('b', { class: 'wt-ellipsis' }, current.tool.name), current.subtitle),
        toggleButton(),
      );
    } else {
      pillHeader(nextSong.get());
    }
  }

  // --- tool list --------------------------------------------------------------

  const stops = new Map<string, () => void>();

  function setToggle(tool: ToggleTool, on: boolean) {
    stops.get(tool.id)?.();
    stops.delete(tool.id);
    if (on) {
      try {
        stops.set(tool.id, tool.enable({ nextSong }));
      } catch (err) {
        console.warn(`WavezFM Tools: ${tool.name} failed to start`, err);
      }
    }
    saveToggles([...stops.keys()]);
  }

  function toolRow(tool: Tool) {
    const glyph = h('span', { class: 'wt-glyph', 'aria-hidden': 'true' }, tool.glyph);
    if (tool.kind === 'screen') {
      return h(
        'button',
        { type: 'button', class: 'wt-row', onclick: () => openTool(tool) },
        glyph,
        h('span', { class: 'wt-row-text' }, h('span', { class: 'wt-row-name' }, tool.name), h('span', { class: 'wt-muted' }, tool.blurb)),
        icon('open', 14),
      );
    }
    const on = stops.has(tool.id);
    const id = `wt-toggle-${tool.id}`;
    return h(
      'div',
      { class: 'wt-row' },
      glyph,
      h(
        'label',
        { class: 'wt-row-text', for: id },
        h('span', { class: 'wt-row-name' }, tool.name),
        h('span', { class: 'wt-muted' }, on ? tool.onBlurb : tool.blurb),
      ),
      h(
        'button',
        {
          type: 'button',
          id,
          class: 'wt-switch',
          role: 'switch',
          'aria-checked': String(on),
          onclick: () => {
            setToggle(tool, !on);
            renderContent();
          },
        },
        h('span'),
      ),
    );
  }

  function toolList() {
    const screens = tools.filter((t) => t.kind === 'screen');
    const toggles = tools.filter((t) => t.kind === 'toggle');
    return h(
      'div',
      { class: 'wt-list' },
      ...screens.map(toolRow),
      screens.length > 0 && toggles.length > 0 && h('div', { class: 'wt-divider' }),
      ...toggles.map(toolRow),
    );
  }

  // --- navigation -------------------------------------------------------------

  function renderContent() {
    content.hidden = collapsed;
    if (!collapsed) content.replaceChildren(current ? current.body : toolList());
  }

  function render() {
    panel.classList.toggle('wt-collapsed', collapsed);
    renderHeader();
    renderContent();
  }

  function setCollapsed(value: boolean) {
    collapsed = value;
    render();
  }

  function openTool(tool: ScreenTool) {
    current?.controller.abort();
    const controller = new AbortController();
    const body = h('div');
    const subtitle = h('span', { class: 'wt-sub wt-ellipsis' });
    current = { tool, body, controller, subtitle };
    collapsed = false;
    render();
    Promise.resolve()
      .then(() =>
        tool.open({
          body,
          signal: controller.signal,
          nextSong,
          setSubtitle: (text) => {
            subtitle.textContent = text;
          },
        }),
      )
      .catch((err) => {
        if (controller.signal.aborted) return;
        body.replaceChildren(h('div', { class: 'wt-body' }, banner('err', err instanceof Error ? err.message : String(err))));
      });
  }

  function back() {
    current?.controller.abort();
    current = null;
    render();
  }

  // --- lifecycle --------------------------------------------------------------

  for (const tool of tools) {
    if (tool.kind === 'toggle' && loadToggles().includes(tool.id)) setToggle(tool, true);
  }
  const unsubscribe = nextSong.subscribe(() => {
    if (collapsed || !current) renderHeader();
  });
  render();
  document.body.appendChild(panel);

  const handle: PanelHandle = {
    unmount() {
      current?.controller.abort();
      // Toggles stop with the panel but stay remembered for the next open.
      for (const stop of stops.values()) stop();
      unsubscribe();
      nextSong.dispose();
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
