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
  /** Blurb shown while it's on. */
  onBlurb: string;
  /** Starts the behaviour and returns a function that stops it. */
  enable(): () => void;
}

export type Tool = ScreenTool | ToggleTool;
