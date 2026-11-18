/**
 * While the page shows where its data comes from (Sources open, or edit
 * mode), short marked text is underlined in place and charts, tables and
 * longer marked blocks are outlined, each tinted for the ground under it.
 * With Sources open each marked target is also a keyboard stop that says
 * its source.
 */

import { useLayoutEffect } from 'react';
import { relativeLuminance, toRgba, type Rgba } from '@open-artifact/ui';
import { MARK_SOURCE_ATTRIBUTE, getMarkedSourceIds } from '../page/sources.ts';
import { LINED_RULE_ATTRIBUTE } from './pieces.ts';
import { BULK_SOURCE_ATTRIBUTE } from './SourceMarksLayer.tsx';

export const SOURCE_STOP_ATTRIBUTE = 'data-dash-stop';
export const PAGE_MODE_ATTRIBUTE = 'data-dash-mode';

export type SourceTint = 'light' | 'dark' | 'violet';
type KnownSource = (id: string) => boolean;

const CONTROL_SELECTOR = 'button, select, input, textarea, a[href], label, summary, [role="button"], [role="tab"], [role="option"]';
const INTERACTIVE_SELECTOR = `${CONTROL_SELECTOR}, [contenteditable]`;
const RULE_EXCLUDED_SELECTOR = 'svg, canvas, img, table, tr, select, input, button, textarea';
const LINK_TAGS = 'span, b, i, em, strong, small, sup, sub, time, data, mark';
const MAX_RULE_TEXT = 48;
const DARK_LUMINANCE_LIMIT = 0.18;
const VIOLET_LUMINANCE_LIMIT = 0.3;
const OPAQUE_BACKGROUND_ALPHA = 0.5;

const interactiveSelector = (root: Element): string => (root.getAttribute(PAGE_MODE_ATTRIBUTE) === 'edit' ? CONTROL_SELECTOR : INTERACTIVE_SELECTOR);

const isBlueDominant = ({ r, g, b }: Rgba): boolean => {
  const lead = b - Math.min(r, g);
  return b >= r && b >= g && lead >= 60 && 2 * (g - r) <= lead;
};

/** The tint a source mark takes on an opaque ground of this color. */
export function classifySourceTint(color: Rgba): SourceTint {
  const luminance = relativeLuminance(color);
  if (luminance < VIOLET_LUMINANCE_LIMIT && isBlueDominant(color)) return 'violet';
  return luminance < DARK_LUMINANCE_LIMIT ? 'dark' : 'light';
}

/** An element's own ground: a tint, null when it can't tell (an image), undefined when it lets its parent's show. */
function ownGround(element: Element): SourceTint | null | undefined {
  const style = getComputedStyle(element);
  if (style.backgroundImage !== '' && style.backgroundImage !== 'none') return null;
  if (style.backgroundColor === '' || style.backgroundColor === 'transparent') return undefined;
  const color = toRgba(style.backgroundColor);
  if (color === null) return null;
  return color.a >= OPAQUE_BACKGROUND_ALPHA ? classifySourceTint(color) : undefined;
}

function groundOf(element: Element, root: Element, cache: Map<Element, SourceTint | null>): SourceTint | null {
  const cached = cache.get(element);
  if (cached !== undefined) return cached;
  let ground = ownGround(element);
  if (ground === undefined) ground = element === root || element.parentElement === null ? null : groundOf(element.parentElement, root, cache);
  cache.set(element, ground);
  return ground;
}

function syncAttribute(root: Element, name: string, values: ReadonlyMap<Element, string>): void {
  for (const element of root.querySelectorAll(`[${name}]`)) if (!values.has(element)) element.removeAttribute(name);
  for (const [element, value] of values) if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** Short marked text outside tables and charts: underlined in place. */
export function collectSourceRuleTargets(root: Element, known: KnownSource): Element[] {
  const shortText = (element: Element): boolean => {
    const text = (element.textContent ?? '').trim();
    return text !== '' && text.length <= MAX_RULE_TEXT && element.querySelector(RULE_EXCLUDED_SELECTOR) === null;
  };
  return [...root.querySelectorAll(`[${MARK_SOURCE_ATTRIBUTE}]`)].filter(
    (element) =>
      !element.matches(`${interactiveSelector(root)}, ${RULE_EXCLUDED_SELECTOR}`) &&
      element.closest('td, th, svg') === null &&
      shortText(element) &&
      getMarkedSourceIds(element).some(known),
  );
}

/** Charts, tables and longer marked blocks: outlined as a whole, outside the underlined text. */
export function collectSourceBulkTargets(root: Element, known: KnownSource, rules: readonly Element[]): Element[] {
  const targets: Element[] = [];
  for (const marked of root.querySelectorAll(`[${MARK_SOURCE_ATTRIBUTE}]`)) {
    const target = marked.closest('svg, table') ?? marked;
    if (
      target.matches(interactiveSelector(root)) ||
      !getMarkedSourceIds(marked).some(known) ||
      rules.some((rule) => target.contains(rule)) ||
      targets.some((other) => other.contains(target))
    )
      continue;
    targets.push(target);
  }
  return targets;
}

/** Makes each marked target a keyboard stop (inline text a link) that says where it comes from; clears the rest. */
export function updateSourceStops(root: Element, targets: readonly Element[], describe: (element: Element) => string | null): void {
  const wanted = new Set(targets);
  for (const element of root.querySelectorAll(`[${SOURCE_STOP_ATTRIBUTE}]`)) {
    if (wanted.has(element)) continue;
    if (element.getAttribute(SOURCE_STOP_ATTRIBUTE) === 'link') element.removeAttribute('role');
    for (const name of [SOURCE_STOP_ATTRIBUTE, 'tabindex', 'aria-description']) element.removeAttribute(name);
  }
  for (const element of targets) {
    const description = describe(element);
    if (element.hasAttribute(SOURCE_STOP_ATTRIBUTE)) {
      if (description !== null) element.setAttribute('aria-description', description);
      continue;
    }
    if (
      !element.hasAttribute(MARK_SOURCE_ATTRIBUTE) ||
      element.hasAttribute('tabindex') ||
      element.hasAttribute('role') ||
      element.hasAttribute('aria-description') ||
      element.parentElement?.closest(`[${SOURCE_STOP_ATTRIBUTE}]`) != null ||
      element.closest('[aria-hidden="true"]') !== null ||
      element.querySelector(INTERACTIVE_SELECTOR) !== null
    )
      continue;
    const asLink = element.hasAttribute(LINED_RULE_ATTRIBUTE) && element.matches(LINK_TAGS);
    element.setAttribute(SOURCE_STOP_ATTRIBUTE, asLink ? 'link' : '');
    element.setAttribute('tabindex', '0');
    if (asLink) element.setAttribute('role', 'link');
    if (description !== null) element.setAttribute('aria-description', description);
  }
}

export interface SourceRulesOptions {
  /** 'data' while Sources is open (marks are stops), 'edit' in edit mode, null when the page shows no marks. */
  mode: 'data' | 'edit' | null;
  known: KnownSource;
  describe: (element: Element) => string | null;
  /** Moves with every change to the page, so the marks follow it. */
  version: number;
}

/** Keeps the page's source rules, outlines and (with Sources open) keyboard stops. */
export function useSourceRules(root: Element | null, { mode, known, describe, version }: SourceRulesOptions): void {
  useLayoutEffect(() => {
    if (root === null || mode !== 'data') return;
    if (root.getAttribute(PAGE_MODE_ATTRIBUTE) !== 'data') root.setAttribute(PAGE_MODE_ATTRIBUTE, 'data');
    return () => {
      if (root.getAttribute(PAGE_MODE_ATTRIBUTE) === 'data') root.removeAttribute(PAGE_MODE_ATTRIBUTE);
    };
  }, [root, mode]);

  useLayoutEffect(() => {
    if (root === null || mode === null) return;
    const redraw = (): void => {
      const cache = new Map<Element, SourceTint | null>();
      const tints = (elements: readonly Element[]): Map<Element, string> => new Map(elements.map((element) => [element, groundOf(element, root, cache) ?? '']));
      const rules = collectSourceRuleTargets(root, known);
      const bulks = collectSourceBulkTargets(root, known, rules);
      syncAttribute(root, LINED_RULE_ATTRIBUTE, tints(rules));
      syncAttribute(root, BULK_SOURCE_ATTRIBUTE, tints(bulks));
      updateSourceStops(root, mode === 'data' ? [...rules, ...bulks] : [], describe);
    };
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame === 0)
        frame = requestAnimationFrame(() => {
          frame = 0;
          redraw();
        });
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [MARK_SOURCE_ATTRIBUTE, 'hidden'] });
    redraw();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [root, mode, known, describe, version]);

  useLayoutEffect(() => {
    if (root === null || mode === null) return;
    return () => {
      syncAttribute(root, LINED_RULE_ATTRIBUTE, new Map());
      syncAttribute(root, BULK_SOURCE_ATTRIBUTE, new Map());
      updateSourceStops(root, [], describe);
    };
  }, [root, mode, describe]);
}
