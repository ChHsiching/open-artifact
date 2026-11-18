/**
 * The inline-run model a text block is rewritten with: read a block's runs,
 * write them back, keep atoms (values the page draws, data fields, images,
 * controls) whole, normalize links, and restore the spaces around atoms.
 */

import { FIELD_ATTRIBUTE, SOURCE_ATTRIBUTE } from '@open-artifact/data-core';
import { DRAW_ATTRIBUTE } from '../page/draw.ts';

/** `[href, target, rel]` as written on a link; null removes that attribute. */
export type LinkAttributes = (string | null)[];
/** An existing node, kept; an inline wrapper also carries its rewritten runs and its link attributes. */
export type InlineRefRun = { ref: Node; runs?: InlineRun[]; link?: LinkAttributes };
export type InlineFormatTag = 'b' | 'i';
export type InlineFormatRun = { tag: InlineFormatTag; runs: InlineRun[] };
export type InlineLinkRun = { tag: 'a'; href: string; runs: InlineRun[] };
export type InlineTagRun = InlineFormatRun | InlineLinkRun;
/** One run of a text block: plain text, a kept node, or a new wrapper. */
export type InlineRun = string | InlineRefRun | InlineTagRun;

/** The words being edited, the atoms inside them (kept whole), and the elements whose insides are not visited. */
export interface WordsAtoms {
  words: Element;
  atoms: Element[];
  unseen: Element[];
}

/** The character next to a caret: its text node, the offset of its first code unit, and the character. */
export interface CaretNeighbour {
  node: Text;
  at: number;
  ch: string;
}

export const LINK_ATTRIBUTES = ['href', 'target', 'rel'] as const;
export const INLINE_TAG_SELECTOR =
  'a, abbr, b, bdi, bdo, cite, code, data, del, dfn, em, i, ins, kbd, mark, q, s, samp, small, span, strong, sub, sup, time, u, var';
export const FORM_CONTROL_SELECTOR = 'input, select, textarea';
export const SOURCE_FIELD_SELECTOR = `[${SOURCE_ATTRIBUTE}][${FIELD_ATTRIBUTE}]:not(th)`;
export const WORDS_ATOM_SELECTOR = `[${DRAW_ATTRIBUTE}], ${SOURCE_FIELD_SELECTOR}, br, wbr, img, svg, ${FORM_CONTROL_SELECTOR}`;
export const WORDS_SKIP_SELECTOR = `${WORDS_ATOM_SELECTOR}, script, style, template, noscript, title, [hidden]`;
export const INLINE_FORMAT_TAGS: Readonly<Record<string, InlineFormatTag | undefined>> = { b: 'b', strong: 'b', i: 'i', em: 'i' };
export const CLOSING_PUNCTUATION = /^[,.;:!?%)\]”’]/;
export const OPENING_PUNCTUATION = /[([“‘$]$/;
export const MAX_LINK_LENGTH = 2048;

export function linkAttributesFor(href: string): LinkAttributes {
  return href.startsWith('#') ? [href, null, null] : [href, '_blank', 'noopener noreferrer'];
}

/** An http(s) address from what was typed (a bare host gets https://), or null. */
export function normalizeHttpUrl(input: string): string | null {
  const trimmed = input.trim();
  let url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  url = url.replace(/^https?:\/\//i, (scheme) => scheme.toLowerCase());
  return /^https?:\/\/\S+$/.test(url) && url.length <= MAX_LINK_LENGTH ? url : null;
}

/** A link's address as the page keeps it: `#id` within the page, or http(s); other schemes are refused. */
export function normalizeLinkHref(input: string): string | null {
  const href = input.trim();
  if (href.startsWith('#')) return /^#[\w-]+$/.test(href) ? href : null;
  return /^(?!https?:)[a-z][a-z\d+.-]*:(?!\d)/i.test(href) ? null : normalizeHttpUrl(href);
}

/** Adds `run` to `runs`, joining it to a neighbouring string or a wrapper of the same kind (and address). */
export function pushInlineRun(runs: InlineRun[], run: InlineRun): void {
  const last = runs.at(-1);
  if (typeof run === 'string') {
    if (typeof last === 'string') runs[runs.length - 1] = last + run;
    else if (run !== '') runs.push(run);
    return;
  }
  if (typeof last === 'object' && 'tag' in last && 'tag' in run && last.tag === run.tag && (last.tag !== 'a' || run.tag !== 'a' || last.href === run.href)) {
    for (const child of run.runs) pushInlineRun(last.runs, child);
    return;
  }
  runs.push(run);
}

/** The plain text of runs (kept nodes read through `textOf`). */
export function inlineRunsText(runs: readonly InlineRun[], textOf: (node: Node) => string = (node) => node.textContent ?? ''): string {
  return runs
    .map((run) => (typeof run === 'string' ? run : 'ref' in run ? (run.runs !== undefined ? inlineRunsText(run.runs, textOf) : textOf(run.ref)) : inlineRunsText(run.runs, textOf)))
    .join('');
}

export const hasHiddenInline = (element: Element): boolean => element.matches(INLINE_TAG_SELECTOR) && element.querySelector('[hidden]') !== null;

/** Kept whole while the words around it are edited. */
export const isWordsAtom = (element: Element): boolean =>
  element.matches(WORDS_ATOM_SELECTOR) || hasHiddenInline(element) || (element.textContent ?? '').trim() === '';

export const isInlineWrapper = (node: Node): node is Element =>
  node instanceof Element && node.matches(INLINE_TAG_SELECTOR) && !node.matches(WORDS_ATOM_SELECTOR) && !hasHiddenInline(node);

/** The page (not its author) writes this: a drawing, or an inline part that hides some of itself. */
export const isPageWritten = (element: Element): boolean => element.hasAttribute(DRAW_ATTRIBUTE) || hasHiddenInline(element);

export const readShownText = (element: Element): string => (element instanceof HTMLElement ? element.innerText : element.textContent) ?? '';

/** A letter typed against a written value gets a space between them, unless the value's own punctuation sits there. */
export function needsSpaceBeside(ch: string, shownText: string, direction: number): boolean {
  return /[\p{L}\p{M}\p{N}]/u.test(ch) && !(direction < 0 ? CLOSING_PUNCTUATION : OPENING_PUNCTUATION).test(shownText);
}

export const needsAtomSpace = (ch: string, atom: Element, direction: number): boolean =>
  isPageWritten(atom) && needsSpaceBeside(ch, readShownText(atom), direction);

export function readInlineRuns(words: Element): InlineRefRun[] {
  return [...words.childNodes].map((node) =>
    isInlineWrapper(node) ? { ref: node, runs: readInlineRuns(node), link: LINK_ATTRIBUTES.map((name) => node.getAttribute(name)) } : { ref: node },
  );
}

export function applyLinkAttributes(element: Element, link: LinkAttributes): void {
  LINK_ATTRIBUTES.forEach((name, index) => {
    const value = link[index] ?? null;
    if (value === null) element.removeAttribute(name);
    else if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  });
}

export function buildInlineRun(run: InlineRun, doc: Document): Node {
  if (typeof run === 'string') return doc.createTextNode(run);
  const node = 'ref' in run ? run.ref : doc.createElement(run.tag);
  if (!(node instanceof Element)) return node;
  if (run.runs !== undefined) writeInlineRuns(node, run.runs);
  const link = 'link' in run ? run.link : 'href' in run ? linkAttributesFor(run.href) : undefined;
  if (link !== undefined) applyLinkAttributes(node, link);
  return node;
}

export function writeInlineRuns(element: Element, runs: readonly InlineRun[]): void {
  element.replaceChildren(...runs.map((run) => buildInlineRun(run, element.ownerDocument)));
}

export function inlineFormatRunFor(element: Element, runs: InlineRun[], inLink: boolean): InlineTagRun | null {
  const href = element.localName === 'a' && !inLink ? normalizeLinkHref(element.getAttribute('href') ?? '') : null;
  const tag = INLINE_FORMAT_TAGS[element.localName];
  return href !== null ? { tag: 'a', href, runs } : tag !== undefined ? { tag, runs } : null;
}

/** The runs of edited (live) words, with the stored nodes they came from kept by reference. */
export function collectWordsRuns(words: Element, storedOf: (live: Node | null) => Element | null): InlineRun[] {
  const storedWords = storedOf(words);
  const keepsNbsp = storedWords?.textContent?.includes(' ') === true;
  const collect = (parent: Element, inLink = false): InlineRun[] => {
    const runs: InlineRun[] = [];
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) pushInlineRun(runs, keepsNbsp ? (child.nodeValue ?? '') : (child.nodeValue ?? '').replaceAll(' ', ' '));
      if (!(child instanceof Element)) continue;
      const stored = storedOf(child);
      const kept = stored !== null && stored !== storedWords && storedWords?.contains(stored) === true && !(inLink && child.localName === 'a') ? stored : null;
      if (kept !== null) {
        if (isInlineWrapper(kept) && !isWordsAtom(kept)) collectWrapper(child, kept, runs, inLink);
        else runs.push({ ref: kept });
      } else if (child.localName === 'br') pushInlineRun(runs, child.nextSibling === null ? '' : ' ');
      else if (!child.matches(WORDS_SKIP_SELECTOR)) {
        const inner = collect(child, inLink || child.localName === 'a');
        const wrapper = inlineFormatRunFor(child, inner, inLink);
        if (wrapper === null) for (const run of inner) pushInlineRun(runs, run);
        else if (inner.length > 0) pushInlineRun(runs, wrapper);
      }
    }
    return runs;
  };
  const collectWrapper = (live: Element, stored: Element, runs: InlineRun[], inLink: boolean): void => {
    const inner = collect(live, inLink || live.localName === 'a');
    if (inner.length === 0) return;
    const href = live.localName === 'a' && live.getAttribute('href') !== stored.getAttribute('href') ? normalizeLinkHref(live.getAttribute('href') ?? '') : null;
    runs.push({ ref: stored, runs: inner, ...(href === null ? {} : { link: linkAttributesFor(href) }) });
  };
  return collect(words);
}

/** The character (or atom) next to a caret within the words, looking back (`direction` < 0) or ahead; null at a break or the end. */
export function findCaretNeighbour({ words, atoms, unseen }: WordsAtoms, container: Node, offset: number, direction: number): CaretNeighbour | Element | null {
  const charAt = (node: Text, at: number): CaretNeighbour => {
    const start = direction > 0 ? at : at > 1 && /[\udc00-\udfff]/.test(node.data.charAt(at - 1)) ? at - 2 : at - 1;
    return { node, at: start, ch: String.fromCodePoint(node.data.codePointAt(start) ?? 0) };
  };
  if (container instanceof Text && (direction < 0 ? offset > 0 : offset < container.length)) return charAt(container, offset);
  const nextOutside = (from: Node): Node | null => {
    for (let node: Node | null = from; node !== null && node !== words; node = node.parentNode) {
      const sibling = direction < 0 ? node.previousSibling : node.nextSibling;
      if (sibling !== null) return sibling;
    }
    return null;
  };
  let node: Node | null = container.childNodes[direction < 0 ? offset - 1 : offset] ?? nextOutside(container);
  while (node !== null) {
    if (node instanceof Text && node.data !== '') return charAt(node, direction < 0 ? node.length : 0);
    if (node instanceof Element && atoms.includes(node)) return node;
    if (node instanceof Element && node.localName === 'br') return null;
    node = (node instanceof Element && unseen.includes(node) ? null : direction < 0 ? node.lastChild : node.firstChild) ?? nextOutside(node);
  }
  return null;
}

export function findAtomNeighbour(context: WordsAtoms, atom: Element, direction: number): CaretNeighbour | null {
  const parent = atom.parentNode;
  const neighbour = parent === null ? null : findCaretNeighbour(context, parent, [...parent.childNodes].indexOf(atom) + (direction < 0 ? 0 : 1), direction);
  return neighbour instanceof Element ? null : neighbour;
}

/** The characters on each side of every atom (two per atom), to tell later which spaces were typed. */
export function readAtomNeighbours(context: WordsAtoms): string[] {
  return context.atoms.flatMap((atom) => [findAtomNeighbour(context, atom, -1)?.ch ?? '', findAtomNeighbour(context, atom, 1)?.ch ?? '']);
}

/** Puts back a space between a written value and a letter that now touches it. */
export function restoreAtomSpacing(context: WordsAtoms, before: readonly string[]): void {
  context.atoms.forEach((atom, index) => {
    for (const direction of [-1, 1]) {
      const neighbour = context.words.contains(atom) ? findAtomNeighbour(context, atom, direction) : null;
      if (neighbour !== null && needsAtomSpace(neighbour.ch, atom, direction) && before[2 * index + (direction < 0 ? 0 : 1)] !== neighbour.ch)
        neighbour.node.insertData(direction < 0 ? neighbour.at + neighbour.ch.length : neighbour.at, ' ');
    }
  });
}
