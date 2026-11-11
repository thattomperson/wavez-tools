import { effect, Signal, untracked, type ReadonlySignal } from '@preact/signals-core';

/** A function child is a live region: it re-runs, and its nodes are swapped, when a signal it reads changes. */
export type Child = Node | string | number | null | undefined | false | Child[] | ReadonlySignal<unknown> | (() => Child);
type Value = string | boolean | undefined;
type Attrs = Record<string, Value | ReadonlySignal<Value> | ((event: Event) => void)>;
type Component<P> = (props: P & { children?: Child[] }) => HTMLElement;

// Small hyperscript helper: h('button', { class: 'wt-btn', onclick: fn }, 'Save').
// Keys starting with "on" become listeners, true sets an empty attribute and
// false/undefined skips it. Children can be nested arrays; null/false are skipped.
//
// It's also the JSX factory (see tsconfig.json), so in a .tsx file that
// imports `h`, <button class="wt-btn" onclick={fn}>Save</button> does the
// same. Attribute names are the HTML ones (class, for, aria-*), not React's.
// A function as the tag is a component: it gets the attributes plus `children`.
//
// Live updates use signals (@preact/signals-core):
// - an attribute set to a signal follows it: { disabled: computed(() => busy.value) }
// - a signal child is a text node that follows it: h('b', null, count)
// - a function child re-runs when a signal it reads changes, and its nodes are
//   swapped: h('div', null, () => (open.value ? details() : null))
// Only the node or region that reads a signal is touched. The effects behind
// these belong to the enclosing scoped() call and stop when it's disposed.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K];
export function h<P>(tag: Component<P>, attrs: P | null, ...children: Child[]): HTMLElement;
export function h(tag: string | Component<unknown>, attrs: Attrs | null = null, ...children: Child[]): HTMLElement {
  if (typeof tag === 'function') return tag({ ...(attrs ?? {}), children });
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (isSignal(value)) watch(() => setAttr(node, key, value.value));
    else setAttr(node, key, value);
  }
  node.append(...flatten(children));
  return node;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSignal(v: unknown): v is ReadonlySignal<any> {
  return v instanceof Signal;
}

function setAttr(node: HTMLElement, key: string, value: Value) {
  // Form state lives in properties; the attribute only sets the starting value.
  if (key === 'checked' || key === 'value') {
    (node as HTMLInputElement)[key as 'value'] = (key === 'checked' ? !!value : (value ?? '')) as string;
  } else if (value === true) node.setAttribute(key, '');
  else if (typeof value === 'string') node.setAttribute(key, value);
  else node.removeAttribute(key);
}

function flatten(children: Child[]): Array<Node | string> {
  const out: Array<Node | string> = [];
  for (const c of children) {
    if (Array.isArray(c)) out.push(...flatten(c));
    else if (isSignal(c)) out.push(liveText(c));
    else if (typeof c === 'function') out.push(region(c));
    else if (typeof c === 'number') out.push(String(c));
    else if (c != null && c !== false) out.push(c);
  }
  return out;
}

function liveText(sig: ReadonlySignal<unknown>): Text {
  const text = document.createTextNode('');
  watch(() => {
    const v = sig.value;
    text.data = v == null || v === false ? '' : String(v);
  });
  return text;
}

// The region's nodes sit between two empty text nodes, so it needs no wrapper
// element and the parent's layout is untouched.
function region(render: () => Child): DocumentFragment {
  const start = document.createTextNode('');
  const end = document.createTextNode('');
  const frag = document.createDocumentFragment();
  frag.append(start, end);
  watch(() => {
    const [nodes, dispose] = scoped(() => flatten([render()]));
    const parent = end.parentNode!;
    while (start.nextSibling && start.nextSibling !== end) start.nextSibling.remove();
    // Insert untracked so nothing done while attaching subscribes the region.
    untracked(() => {
      for (const n of nodes) parent.insertBefore(typeof n === 'string' ? document.createTextNode(n) : n, end);
    });
    return dispose;
  });
  return frag;
}

// --- scopes ---------------------------------------------------------------------

let owner: Array<() => void> | null = null;

/**
 * Runs `fn`, collecting the effects that watch() and live h() bindings start
 * while it runs (synchronously). Returns its result and a function that stops them.
 */
export function scoped<T>(fn: () => T): [T, () => void] {
  const prev = owner;
  const mine: Array<() => void> = [];
  owner = mine;
  try {
    return [fn(), () => mine.splice(0).forEach((stop) => stop())];
  } finally {
    owner = prev;
  }
}

/** effect() that also stops with the enclosing scoped() call. */
export function watch(fn: () => void | (() => void)): () => void {
  const stop = effect(fn);
  owner?.push(stop);
  return stop;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = HTMLElement;
    type IntrinsicElements = { [K in keyof HTMLElementTagNameMap]: Attrs };
  }
}
