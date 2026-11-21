/**
 * Which elements of an artboard's template a change added or changed, for
 * the canvas's build show of an edit (services/build.ts): it replays only the
 * blocks rendered from them.
 *
 * Elements are numbered depth-first in source order (their tid, which the
 * board runtime writes on each element it renders as `data-dc-tpl`).
 */

import { parseDcDocument, parseTemplate, type HtmlElement } from '@open-artifact/dc';

/** An element on its own: its tag, its attributes and its own text, not its children. */
function signature(element: HtmlElement): string {
  const attrs = element.attrs.map((attr) => `${attr.name}=${attr.value ?? ''}`).sort();
  let text = '';
  for (const child of element.children) if (child.type === 'text') text += child.value;
  return `${element.tag}\u0001${attrs.join('\u0002')}\u0001${text.replace(/\s+/g, ' ').trim()}`;
}

const elementsOf = (source: string): HtmlElement[] => parseTemplate(parseDcDocument(source).template?.text ?? '').elements;

/**
 * The tids of `after`'s template elements that `before` did not have as they
 * are now. Elements that only moved keep their signature and are not counted.
 */
export function changedTids(before: string, after: string): Set<number> {
  const left = new Map<string, number>();
  for (const element of elementsOf(before)) {
    const key = signature(element);
    left.set(key, (left.get(key) ?? 0) + 1);
  }
  const changed = new Set<number>();
  elementsOf(after).forEach((element, tid) => {
    const key = signature(element);
    const n = left.get(key) ?? 0;
    if (n > 0) left.set(key, n - 1);
    else changed.add(tid);
  });
  return changed;
}
