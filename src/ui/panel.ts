import type { Command, CommandContext } from '../commands';
import type { Output } from '../commands/types';
import { el } from './dom';
import { colors, PANEL_ID, styles } from './styles';

export function findPanel(): HTMLElement | null {
  return document.getElementById(PANEL_ID);
}

export function mountPanel(commands: Command[]): HTMLElement {
  const panel = el('div', styles.panel);
  panel.id = PANEL_ID;

  const header = el('div', styles.header, 'WavezFM Tools');
  const close = el('button', styles.close, '×');
  close.onclick = () => panel.remove();
  header.appendChild(close);

  const buttons = el('div', styles.buttons);
  const output = el('pre', styles.output);

  const write = (text: string, color: string) => {
    output.style.color = color;
    output.textContent = text;
  };
  const ctx: CommandContext = {
    show: (value: Output) =>
      write(Array.isArray(value) ? value.filter(Boolean).join('\n') : value, colors.ok),
  };

  for (const command of commands) {
    const button = el('button', styles.button, command.label);
    button.onclick = async () => {
      button.disabled = true;
      write('…', colors.ok);
      try {
        await command.run(ctx);
      } catch (err) {
        write(err instanceof Error ? err.message : String(err), colors.error);
      } finally {
        button.disabled = false;
      }
    };
    buttons.appendChild(button);
  }

  panel.append(header, buttons, output);
  document.body.appendChild(panel);
  return panel;
}
