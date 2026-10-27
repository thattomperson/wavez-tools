export type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | ((event: Event) => void) | undefined>;

// Small hyperscript helper: h('button', { class: 'wt-btn', onclick: fn }, 'Save').
// Keys starting with "on" become listeners, true sets an empty attribute and
// false/undefined skips it.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else if (typeof value === 'string') node.setAttribute(key, value);
  }
  node.append(...children.filter((c): c is Node | string => c != null && c !== false));
  return node;
}
