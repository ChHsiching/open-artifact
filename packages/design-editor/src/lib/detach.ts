/**
 * Detaching a component instance: replacing `<dc-import>` with a copy of the
 * component's template, its holes filled with the instance's values.
 */

import {
  attributeValue,
  elementChildren,
  parseDcDocument,
  parseHole,
  parseTemplate,
  styleMap,
  walkElements,
  type HtmlElement,
} from '@open-artifact/dc';

/** Attributes of an instance that are not props. */
const NOT_PROPS = new Set(['name', 'style', 'class', 'key', 'data-label', 'hint-size', 'hint-placeholder-count', 'hint-placeholder-val']);

/** Instance styles the wrapper keeps (where it sits, how big it is). */
const KEPT_STYLE = ['position', 'left', 'right', 'top', 'bottom', 'inset', 'width', 'height', 'z-index', 'transform'];

export type DetachResult = { ok: true; html: string; helmet: string } | { ok: false; reason: string };

/** The props an instance passes (kebab → camel); a reason when they come from the page's script. */
export function instanceProps(instance: HtmlElement): { ok: true; props: Record<string, unknown> } | { ok: false; reason: string } {
  const props: Record<string, unknown> = {};
  for (const attr of instance.attrs) {
    const name = attr.name.toLowerCase();
    if (NOT_PROPS.has(name)) continue;
    const key = attr.name.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
    const value = attr.value;
    if (value === null) {
      props[key] = true;
      continue;
    }
    if (value.includes('{{')) {
      const whole = /^\s*\{\{([\s\S]*?)\}\}\s*$/.exec(value);
      const hole = whole ? parseHole(whole[1]!) : null;
      if (!hole || hole.kind !== 'literal') return { ok: false, reason: 'This instance takes values from the page’s script.' };
      props[key] = hole.value;
      continue;
    }
    props[key] = value;
  }
  return { ok: true, props };
}

/** Why an element cannot be detached, or `null`. */
export function detachRefusal(element: HtmlElement): string | null {
  if (element.tag !== 'dc-import') return 'Select a component instance to detach it.';
  for (let node = element.parent; node; node = node.parent) {
    if (node.tag === 'sc-for') return 'This instance is repeated by a loop.';
    if (node.tag === 'p') return 'An instance inside a paragraph cannot be detached.';
  }
  if (element.children.some((child) => child.type === 'element' || (child.type === 'text' && child.value.trim()))) return 'This instance has content of its own.';
  const style = attributeValue(element, 'style') ?? '';
  if (style.includes('{{')) return 'This instance takes values from the page’s script.';
  return null;
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Looks up a dotted path in the values. */
function lookup(values: Record<string, unknown>, segments: readonly string[]): { found: boolean; value: unknown } {
  let current: unknown = values;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || !(segment in (current as object))) return { found: false, value: undefined };
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}

/**
 * The markup that replaces an instance: the component's template (without
 * its helmet) in a wrapper `<div>` carrying the instance's position and size.
 */
export function detachMarkup(componentSource: string, instance: HtmlElement, values: Record<string, unknown>): DetachResult {
  const doc = parseDcDocument(componentSource);
  if (!doc.template) return { ok: false, reason: 'The component has no template.' };
  const model = parseTemplate(doc.template.text);
  const tops = elementChildren(model.nodes);
  const helmet = tops.find((el) => el.tag === 'helmet');
  const body = tops.filter((el) => el.tag !== 'helmet' && el.tag !== 'script' && el.tag !== 'style');
  if (!body.length) return { ok: false, reason: 'The component is empty.' };

  // Loop variables stay holes: the copied loop still defines them.
  const loopNames = new Set<string>();
  walkElements(model.nodes, (el) => {
    if (el.tag === 'sc-for') {
      const as = attributeValue(el, 'as');
      if (as) loopNames.add(as);
      const index = attributeValue(el, 'index');
      if (index) loopNames.add(index);
    }
  });

  let failure: string | null = null;
  const fill = (text: string): string =>
    text.replace(/\{\{([\s\S]*?)\}\}/g, (match, inner: string) => {
      const hole = parseHole(inner);
      if (hole.kind === 'literal') return match;
      if (hole.kind === 'invalid') {
        failure ??= 'The component has a template value the editor cannot read.';
        return match;
      }
      if (hole.segments[0]!.startsWith('$') || loopNames.has(hole.segments[0]!)) return match;
      const { found, value } = lookup(values, hole.segments);
      if (!found || value === undefined || value === null) return '';
      if (typeof value === 'string') {
        if (/\{\{|\}\}|<script/i.test(value)) failure ??= 'A value of the component cannot be written into the page.';
        return escape(value);
      }
      if (typeof value === 'number') return String(value);
      // A literal hole keeps a boolean a boolean (`<sc-if value>`, attributes).
      if (typeof value === 'boolean') return `{{${value}}}`;
      failure ??= 'The component builds part of itself in its script (lists or objects), so it cannot be detached.';
      return match;
    });

  const html = body.map((el) => fill(model.text.slice(el.start, el.end))).join('\n');
  if (failure) return { ok: false, reason: failure };

  const inline = styleMap(attributeValue(instance, 'style') ?? '');
  const kept = KEPT_STYLE.filter((p) => inline[p]).map((p) => `${p}: ${inline[p]}`).join('; ');
  const label = attributeValue(instance, 'data-label') || attributeValue(instance, 'name') || 'Component';
  const open = `<div${kept ? ` style="${escape(kept)}"` : ''} data-label="${escape(label)}">`;
  const helmetText = helmet && helmet.closeStart >= 0 ? model.text.slice(helmet.openEnd, helmet.closeStart).trim() : '';
  return { ok: true, html: `${open}\n${html}\n</div>`, helmet: helmetText };
}
