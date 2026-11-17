/**
 * What in-place text editing needs to know about an element before it
 * starts: when its words come
 * from holes, the template markup to edit, the text props that may supply
 * them, and the logic script's string literals.
 */

import {
  hasTextHoles,
  importTextTargets,
  parseDcDocument,
  scriptLiterals,
  squashSpaces,
  type HtmlElement,
  type ImportTextTarget,
  type TextEditOptions,
} from '@open-artifact/dc';

/**
 * Options for `editText` on `element` of the board `source` (whose template
 * text is `templateText`); `overrides` are the viewer's tweak values.
 */
export function textEditOptions(
  source: string,
  templateText: string,
  element: HtmlElement,
  overrides: Record<string, unknown> | undefined,
  caret: TextEditOptions['caret'] = 'all',
): TextEditOptions {
  if (!hasTextHoles(element)) return { caret };
  const doc = parseDcDocument(source);
  const props: Record<string, string> = {};
  for (const [key, spec] of Object.entries(doc.props ?? {})) {
    if (key === '$preview' || !spec || typeof spec !== 'object' || !('editor' in spec) || spec.editor !== 'text') continue;
    const value = overrides && Object.hasOwn(overrides, key) ? overrides[key] : spec.default;
    if (typeof value === 'string') props[key] = value;
  }
  return {
    caret,
    seed: templateText.slice(element.openEnd, element.closeStart),
    props,
    literals: doc.script ? scriptLiterals(doc.script.body.text) : [],
  };
}

/**
 * Words a hole of board `source` could be supplying: the logic script's
 * strings and the text props' values (`overrides` are the viewer's tweak
 * values). An instance fed by holes does not claim these as its own.
 */
export function knownWords(source: string, overrides?: Record<string, unknown>): Set<string> {
  const doc = parseDcDocument(source);
  const known = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === 'string' && value.trim() !== '') known.add(squashSpaces(value));
  };
  if (doc.script) for (const literal of scriptLiterals(doc.script.body.text)) add(literal.value);
  for (const [key, spec] of Object.entries(doc.props ?? {})) {
    if (key === '$preview' || !spec || typeof spec !== 'object') continue;
    if ('default' in spec) add(spec.default);
    if ('options' in spec && Array.isArray(spec.options)) for (const option of spec.options) add(typeof option === 'object' && option ? (option as { value?: unknown }).value : option);
  }
  for (const value of Object.values(overrides ?? {})) add(value);
  return known;
}

/** The words of component instance `element` that can be retyped on the canvas. */
export function importTargets(source: string, element: HtmlElement, overrides?: Record<string, unknown>): ImportTextTarget[] {
  return importTextTargets(element, knownWords(source, overrides));
}
