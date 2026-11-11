export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, string | boolean | ((event: Event) => void) | undefined>;
type Component<P> = (props: P & { children?: Child[] }) => HTMLElement;

// Small hyperscript helper: h('button', { class: 'wt-btn', onclick: fn }, 'Save').
// Keys starting with "on" become listeners, true sets an empty attribute and
// false/undefined skips it. Children can be nested arrays; null/false are skipped.
//
// It's also the JSX factory (see tsconfig.json), so in a .tsx file that
// imports `h`, <button class="wt-btn" onclick={fn}>Save</button> does the
// same. Attribute names are the HTML ones (class, for, aria-*), not React's.
// A function as the tag is a component: it gets the attributes plus `children`.
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
    else if (value === true) node.setAttribute(key, '');
    else if (typeof value === 'string') node.setAttribute(key, value);
  }
  node.append(...flatten(children));
  return node;
}

function flatten(children: Child[]): Array<Node | string> {
  const out: Array<Node | string> = [];
  for (const c of children) {
    if (Array.isArray(c)) out.push(...flatten(c));
    else if (typeof c === 'number') out.push(String(c));
    else if (c != null && c !== false) out.push(c);
  }
  return out;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = HTMLElement;
    type IntrinsicElements = { [K in keyof HTMLElementTagNameMap]: Attrs };
  }
}
