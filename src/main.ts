// WavezFM Tools: clicking the bookmarklet toggles a floating panel of commands
// on a wavez.fm room page. Add new buttons in src/commands.
import { commands } from './commands';
import { getBridge } from './wavez/bridge';
import { findPanel, mountPanel } from './ui/panel';
import { installSocketHook } from './wavez/socket';

const existing = findPanel();
if (existing) {
  existing.remove();
} else if (!getBridge()) {
  alert('WavezFM bridge not found. Open a wavez.fm room page first.');
} else {
  installSocketHook();
  mountPanel(commands);
}
