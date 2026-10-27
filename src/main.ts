// WavezFM Tools: clicking the bookmarklet toggles a floating panel of tools
// on a wavez.fm room page. Add new tools in src/tools.
import { tools } from './tools';
import { nextSongDetails } from './tools/next-song';
import { getBridge } from './wavez/bridge';
import { findPanel, mountPanel } from './ui/panel';
import { installSocketHook } from './wavez/socket';

const existing = findPanel();
if (existing) {
  existing.unmount();
} else if (!getBridge()) {
  alert('WavezFM bridge not found. Open a wavez.fm room page first.');
} else {
  installSocketHook();
  mountPanel(tools, { pillTool: nextSongDetails });
}
