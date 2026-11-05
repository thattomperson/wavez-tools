// WavezFM Tools: clicking the bookmarklet toggles a floating panel of tools
// on a wavez.fm room page. Add new tools in src/tools.
import { createCommandRunner } from './chat/commands';
import { installChatCommands } from './chat/intercept';
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
  mountPanel(tools, {
    pillTool: nextSongDetails,
    // /wt commands work while the panel is open, in this tab and the pop-out chat.
    onMount: (controls) => installChatCommands(createCommandRunner(tools, controls)),
  });
}
