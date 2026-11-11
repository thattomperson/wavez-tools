import type { NextSongStore } from '../wavez/next-song';

export interface ScreenContext {
  /** Empty container for the tool's screen. */
  body: HTMLElement;
  /** Small line under the tool's name in the header. */
  setSubtitle(text: string): void;
  /** Aborted when the user leaves the screen or the panel closes. */
  signal: AbortSignal;
  /** The next song and its opcheck, shared with the header pill. */
  nextSong: NextSongStore;
}

export interface ToggleContext {
  /** The next song and its opcheck, shared with the header pill. */
  nextSong: NextSongStore;
  /** Replaces the line under the switch's name while it's on; null goes back to `onBlurb`. `soon` shows it in orange. */
  setStatus(text: string | null, tone?: 'soon'): void;
  /** Switches this tool off, leaving `note` under its name until it's switched on again. */
  turnOff(note?: string): void;
  /** Switches another switch off by its id. */
  turnOffOther(id: string): void;
}

interface ToolBase {
  name: string;
  /** One line under the name in the tool list. */
  blurb: string;
  /** One or two characters on the tool's tile. */
  glyph: string;
}

/** Opens its own screen in the panel. */
export interface ScreenTool extends ToolBase {
  kind: 'screen';
  open(ctx: ScreenContext): void | Promise<void>;
}

/** An on/off switch in the tool list. Its state is remembered between runs. */
export interface ToggleTool extends ToolBase {
  kind: 'toggle';
  /** Storage key for the remembered state. */
  id: string;
  /** Name used with the chat command, e.g. "autowoot" for `/wt autowoot off`. */
  command: string;
  /** Blurb shown while it's on. */
  onBlurb: string;
  /** Starts the behaviour and returns a function that stops it. */
  enable(ctx: ToggleContext): () => void;
  /** Settings shown under the row when its cog is open. Without it the row has no cog. */
  options?(): HTMLElement;
  /** Extra chat subcommands, e.g. `test` for `/wt notify test`. Each returns lines to show. */
  subcommands?: Record<string, { help: string; run(): string[] }>;
}

export type Tool = ScreenTool | ToggleTool;
