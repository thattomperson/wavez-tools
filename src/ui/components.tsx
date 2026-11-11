// Building blocks that tool screens share.
import type { ReadonlySignal } from '@preact/signals-core';
import type { OpcheckResult } from '../wavez/opcheck';
import { h, type Child } from './dom';
import { icon } from './icons';

export type Tone = 'op' | 'ok' | 'busy' | 'idle' | 'err';

export function chip(text: string, tone: Tone): HTMLSpanElement {
  return (<span class={`wt-chip wt-${tone}`}>{text}</span>) as HTMLSpanElement;
}

export function setChip(node: HTMLElement, text: string, tone: Tone): void {
  node.className = `wt-chip wt-${tone}`;
  node.textContent = text;
}

/** The chip text and tone for an opcheck result. */
export function opcheckLabel(result: OpcheckResult): [string, Tone] {
  if (result.blocked) return ['Blocked', 'op'];
  return result.op ? ['OP', 'op'] : ['OK', 'ok'];
}

export function button(
  label: string,
  onclick: () => void,
  opts: { primary?: boolean; disabled?: boolean | ReadonlySignal<boolean> } = {},
): HTMLButtonElement {
  return (
    <button type="button" class={opts.primary ? 'wt-btn wt-primary' : 'wt-btn'} disabled={opts.disabled} onclick={onclick}>
      {label}
    </button>
  ) as HTMLButtonElement;
}

export function banner(tone: Tone, ...children: Child[]): HTMLDivElement {
  return (
    <div class={`wt-banner wt-${tone}`}>
      {icon(tone === 'ok' ? 'check' : 'warning')}
      <span>{children}</span>
    </div>
  ) as HTMLDivElement;
}

export function stats(items: Array<{ value: number; label: string; hot?: boolean }>): HTMLDivElement {
  return (
    <div class="wt-stats">
      {items.map((s) => (
        <div class={s.hot ? 'wt-stat wt-hot' : 'wt-stat'}>
          <b>{s.value}</b>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  ) as HTMLDivElement;
}

export function keyValues(rows: Array<[string, Child] | false | null | undefined>): HTMLDListElement {
  return (
    <dl class="wt-kv">
      {rows.map(
        (row) =>
          row && [
            <dt>{row[0]}</dt>,
            <dd>{row[1]}</dd>,
          ],
      )}
    </dl>
  ) as HTMLDListElement;
}

export function message(text: string, tone: 'muted' | 'warn' | 'error' = 'muted'): HTMLDivElement {
  return (<div class={`wt-${tone}`}>{text}</div>) as HTMLDivElement;
}
