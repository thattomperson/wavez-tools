// Building blocks that tool screens share.
import type { OpcheckResult } from '../wavez/opcheck';
import { h, type Child } from './dom';
import { icon } from './icons';

export type Tone = 'op' | 'ok' | 'busy' | 'idle' | 'err';

export function chip(text: string, tone: Tone): HTMLSpanElement {
  return h('span', { class: `wt-chip wt-${tone}` }, text);
}

export function setChip(node: HTMLElement, text: string, tone: Tone): void {
  node.className = `wt-chip wt-${tone}`;
  node.textContent = text;
}

export function opcheckChip(result: OpcheckResult): HTMLSpanElement {
  if (result.blocked) return chip('Blocked', 'op');
  return result.op ? chip('OP', 'op') : chip('OK', 'ok');
}

export function button(
  label: string,
  onclick: () => void,
  opts: { primary?: boolean; disabled?: boolean } = {},
): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: opts.primary ? 'wt-btn wt-primary' : 'wt-btn', disabled: opts.disabled, onclick },
    label,
  );
}

export function banner(tone: Tone, ...children: Child[]): HTMLDivElement {
  return h('div', { class: `wt-banner wt-${tone}` }, icon(tone === 'ok' ? 'check' : 'warning'), h('span', null, ...children));
}

export function stats(items: Array<{ value: number; label: string; hot?: boolean }>): HTMLDivElement {
  return h(
    'div',
    { class: 'wt-stats' },
    ...items.map((s) => h('div', { class: s.hot ? 'wt-stat wt-hot' : 'wt-stat' }, h('b', null, String(s.value)), h('span', null, s.label))),
  );
}

export function keyValues(rows: Array<[string, Child] | false | null | undefined>): HTMLDListElement {
  const list = h('dl', { class: 'wt-kv' });
  for (const row of rows) if (row) list.append(h('dt', null, row[0]), h('dd', null, row[1]));
  return list;
}

export function message(text: string, tone: 'muted' | 'warn' | 'error' = 'muted'): HTMLDivElement {
  return h('div', { class: `wt-${tone}` }, text);
}
