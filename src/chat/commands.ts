// The /wt chat commands. Each command returns the lines to show back to the
// user; nothing is ever posted to the room.
import type { Tool, ToggleTool } from '../tools';
import type { PanelControls } from '../ui/panel';
import { trackName } from '../wavez/tracks';

export const COMMAND_PREFIX = '/wt';

/** True for "/wt" on its own or followed by a space, in any case. */
export function isCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return trimmed === COMMAND_PREFIX || trimmed.startsWith(`${COMMAND_PREFIX} `);
}

export type CommandRunner = (text: string) => string[];

export function createCommandRunner(tools: Tool[], panel: PanelControls): CommandRunner {
  const toggles = tools.filter((t): t is ToggleTool => t.kind === 'toggle');

  const help = () => [
    'WavezFM Tools commands:',
    ...toggles.map((t) => `${COMMAND_PREFIX} ${t.command} on|off: ${t.name}`),
    `${COMMAND_PREFIX} status: which switches are on`,
    `${COMMAND_PREFIX} next: your next song and its opcheck`,
  ];

  const status = () => toggles.map((t) => `${t.name}: ${panel.isOn(t) ? 'on' : 'off'}`);

  const next = () => {
    const state = panel.nextSong.get();
    const name = state.track ? trackName(state.track) : null;
    if (state.status === 'ready') {
      const verdict = state.result.blocked ? 'blocked' : state.result.op ? 'OP' : 'not OP';
      return [`Next: ${name} (${verdict})`];
    }
    if (state.status === 'failed') return [name ? `Next: ${name}` : 'Next song unknown', `Opcheck failed: ${state.error}`];
    return [name ? `Next: ${name} (checking…)` : 'Still looking up your next song…'];
  };

  return (text) => {
    const [, sub = 'help', arg, ...rest] = text.trim().toLowerCase().split(/\s+/);
    if (sub === 'help') return help();
    if (sub === 'status') return status();
    if (sub === 'next') return next();

    const tool = toggles.find((t) => t.command === sub);
    if (!tool) return [`Unknown command "${sub}".`, ...help()];
    if (rest.length > 0) return [`Usage: ${COMMAND_PREFIX} ${tool.command} on|off`];

    let on: boolean;
    if (arg === undefined || arg === 'toggle') on = !panel.isOn(tool);
    else if (arg === 'on') on = true;
    else if (arg === 'off') on = false;
    else return [`Usage: ${COMMAND_PREFIX} ${tool.command} on|off`];

    panel.setToggle(tool, on);
    return [`${tool.name}: ${panel.isOn(tool) ? 'on' : 'off'}`];
  };
}
