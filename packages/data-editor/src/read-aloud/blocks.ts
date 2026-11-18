/**
 * What read aloud reads: the page's one `[data-read]` region, paragraph by paragraph (a `[data-read-step]` of a scroll
 * story is one part), leaving out tables, controls and hidden parts; a chart (`svg`, `role="img"`) is read by its
 * `aria-label` unless its figure has text of its own. Each part carries the language it is written in when a `lang`
 * says so.
 */

import { PAGE_LANGUAGE_PATTERN } from '@open-artifact/data-core';

export const READ_ATTRIBUTE = 'data-read';
export const READ_STEP_ATTRIBUTE = 'data-read-step';
export const READ_PLAY_ATTRIBUTE = 'data-read-play';
export const READ_STAGE_ATTRIBUTE = 'data-read-stage';
export const READ_SOUND_ATTRIBUTE = 'data-read-sound';
export const READ_PAUSE_ATTRIBUTE = 'data-read-pause';
export const READ_MOVE_ATTRIBUTE = 'data-read-move';
/** On `#dash-root`: `ready`, `reading` or `unavailable`. */
export const DASH_READ_ATTRIBUTE = 'data-dash-read';
/** On `#dash-root` while reading: `starting`, `playing`, `paused` or `ended`. */
export const DASH_READ_PHASE_ATTRIBUTE = 'data-dash-read-phase';
/** On the `[data-read-step]` being read. */
export const DASH_READ_NOW_ATTRIBUTE = 'data-dash-read-now';

export const READ_SKIP_SELECTOR = `canvas, table, template, script, style, button, select, input, textarea, label, [data-uncommentable], [${READ_PLAY_ATTRIBUTE}], [${READ_SOUND_ATTRIBUTE}], [${READ_PAUSE_ATTRIBUTE}], [${READ_MOVE_ATTRIBUTE}]`;
export const READ_START_CONTROL_SELECTOR = `[${READ_PLAY_ATTRIBUTE}], [${READ_SOUND_ATTRIBUTE}]`;
export const READ_CONTROL_SELECTOR = `${READ_START_CONTROL_SELECTOR}, [${READ_PAUSE_ATTRIBUTE}], [${READ_MOVE_ATTRIBUTE}]`;
/** The class a page's own piece carries while it plays. */
export const READ_PLAYING_CLASS = 'vs-playing';
export const PAUSE_CONTROL_SELECTOR = `[${READ_PAUSE_ATTRIBUTE}], .vs-controls .vs-toggle`;

const INLINE_SELECTOR =
  'a, abbr, b, bdi, bdo, br, cite, code, data, del, dfn, em, i, ins, kbd, mark, output, q, s, samp, small, span, strong, sub, sup, time, u, var';
const PICTURE_SELECTOR = '[role="img"], svg';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** One reading takes at most this many lines. */
export const MAX_READ_BLOCKS = 100;
/** The longest line; a longer part is said as several. */
export const MAX_READ_BLOCK_LENGTH = 2000;
/** One reading takes at most some this many seconds. */
export const MAX_READ_SECONDS = 1800;
const READ_SLOWEST_RATE = 0.8;

/** One spoken part of the page: the nodes it covers, the text read and, for a scroll-story step, the step element. */
export interface ReadBlock {
  first: Node;
  last: Node;
  text: string;
  step?: Element;
  /** The language the part is written in (a `lang` inside the region), when it is one plausible tag. */
  language?: string;
}

/** Where a part's language is looked up: `lang`s inside `root`, and the root's own when the page names one (`named`). */
interface ReadLanguageScope {
  root: Element;
  named: boolean;
}

const isElement = (node: Node): node is Element => node.nodeType === ELEMENT_NODE;

/** `value` when it is a plausible language tag. */
export function normalizeReadLanguage(value: unknown): string | undefined {
  return typeof value === 'string' && PAGE_LANGUAGE_PATTERN.test(value) ? value : undefined;
}

const readLangAttribute = (element: Element): string | undefined => normalizeReadLanguage((element.getAttribute('lang') ?? '').trim());

export const hasReadableChars = (text: string): boolean => /[\p{L}\p{N}]/u.test(text);

/** Some seconds a line takes at the slowest speed. */
export const estimateReadSeconds = (text: string): number => Math.max(5, Math.ceil(text.length / 15 / READ_SLOWEST_RATE));

/** The text as it is said: no bracketed asides, a middle dot as a full stop, no stray punctuation or spaces. */
export function tidyReadText(text: string): string {
  return text
    .replace(/\s*\[[^[\]]*\]/g, '')
    .replace(/\s+·\s+/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/[,;:] ?(?=[,;:.!?])/g, '')
    .replace(/ (?=[,;:.!?])/g, '')
    .replace(/^[,;:.!? ]+/, '')
    .trim();
}

/** Cuts text longer than one line (2,000 characters) at a sentence end, else a space, else mid-word. */
export function splitLongReadText(text: string): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > MAX_READ_BLOCK_LENGTH) {
    const head = rest.slice(0, MAX_READ_BLOCK_LENGTH);
    let cut = 0;
    for (const match of rest.slice(0, MAX_READ_BLOCK_LENGTH + 1).matchAll(/[.!?…](?=\s)|[。！？]/gu))
      if (match.index < MAX_READ_BLOCK_LENGTH) cut = match.index + match[0].length;
    if (cut < MAX_READ_BLOCK_LENGTH / 2) cut = head.lastIndexOf(' ') + 1;
    if (cut < MAX_READ_BLOCK_LENGTH / 2)
      cut = /[\uD800-\uDBFF]/.test(head.charAt(MAX_READ_BLOCK_LENGTH - 1)) ? MAX_READ_BLOCK_LENGTH - 1 : MAX_READ_BLOCK_LENGTH;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest !== '') parts.push(rest);
  return parts;
}

/** How many of the lines (from the first) one reading takes: at most 100 lines and some 30 minutes. */
export function fitReadLines(texts: readonly string[]): number {
  let seconds = 0;
  for (let index = 0; index < texts.length; index++) {
    seconds += estimateReadSeconds(texts[index] ?? '');
    if (index >= MAX_READ_BLOCKS || seconds > MAX_READ_SECONDS) return index;
  }
  return texts.length;
}

export function isReadHidden(element: Element): boolean {
  return (
    element.hasAttribute('hidden') ||
    element.getAttribute('aria-hidden') === 'true' ||
    (typeof element.checkVisibility === 'function' &&
      !element.checkVisibility({ visibilityProperty: true }) &&
      element.ownerDocument.defaultView?.getComputedStyle(element).display !== 'contents')
  );
}

function readNodeText(node: Node): string {
  if (node.nodeType === TEXT_NODE) return node.nodeValue ?? '';
  if (!isElement(node)) return '';
  if (node.localName === 'br' || isReadHidden(node) || node.matches(PICTURE_SELECTOR) || node.matches(READ_SKIP_SELECTOR)) return ' ';
  const text = [...node.childNodes].map(readNodeText).join('');
  return node.matches(INLINE_SELECTOR) ? text : ` ${text} `;
}

const hasReadableText = (node: Node): boolean => hasReadableChars(tidyReadText(readNodeText(node)));

function hasReadableBlockChild(element: Element): boolean {
  return [...element.children].some(
    (child) =>
      !isReadHidden(child) &&
      !child.matches(PICTURE_SELECTOR) &&
      !child.matches(READ_SKIP_SELECTOR) &&
      (child.matches(INLINE_SELECTOR) ? hasReadableBlockChild(child) : hasReadableText(child)),
  );
}

/**
 * The language an element's own (or nearest ancestor's, inside `scope.root`) `lang` names, when it is a plausible tag;
 * otherwise the root's own `lang` when the page names its language (`dash/meta.lang`), since the root's default
 * ("en") says nothing.
 */
function readElementLanguage(element: Element, scope: ReadLanguageScope): string | undefined {
  const marked = element.closest('[lang]');
  if (marked !== null && marked !== scope.root && scope.root.contains(marked)) return readLangAttribute(marked);
  return scope.named ? readLangAttribute(scope.root) : undefined;
}

/**
 * The language of a run of nodes: the `lang` they sit in when some of them are text; otherwise the language all the
 * readable elements agree on (undefined when they differ or none says).
 */
function readNodesLanguage(nodes: readonly Node[], parent: Element, scope: ReadLanguageScope): string | undefined {
  const readable = nodes.filter((node) => hasReadableChars(tidyReadText(readNodeText(node))));
  const lettered = readable.filter((node) => /\p{L}/u.test(tidyReadText(readNodeText(node))));
  const pool = lettered.length > 0 ? lettered : readable;
  if (!pool.every(isElement)) return readElementLanguage(parent, scope);
  const [first, ...others] = new Set(pool.map((node) => readNodesLanguage([...node.childNodes], node, scope)));
  return others.length === 0 ? first : undefined;
}

function collectReadBlocks(root: Element, steps: boolean, scope: ReadLanguageScope): ReadBlock[] {
  const blocks: ReadBlock[] = [];
  const add = (first: Node, last: Node, raw: string, language: string | undefined): void => {
    const text = tidyReadText(raw);
    if (hasReadableChars(text)) blocks.push({ first, last, text, ...(language !== undefined ? { language } : {}) });
  };
  const walk = (parent: Element): void => {
    let run: Node[] = [];
    const flush = (): void => {
      const [first, last] = [run[0], run.at(-1)];
      if (first !== undefined && last !== undefined) add(first, last, run.map(readNodeText).join(''), readNodesLanguage(run, parent, scope));
      run = [];
    };
    for (const node of parent.childNodes) {
      const element = isElement(node) ? node : null;
      if (
        node.nodeType === TEXT_NODE ||
        (element !== null &&
          element.matches(INLINE_SELECTOR) &&
          !element.matches(PICTURE_SELECTOR) &&
          !hasReadableBlockChild(element) &&
          !(steps && element.hasAttribute(READ_STEP_ATTRIBUTE)))
      )
        run.push(node);
      if (element === null || run.at(-1) === node) continue;
      flush();
      if (isReadHidden(element) || element.matches(READ_SKIP_SELECTOR)) continue;
      if (steps && element.hasAttribute(READ_STEP_ATTRIBUTE)) {
        const parts = collectReadBlocks(element, false, scope);
        const [language, ...otherLanguages] = new Set(parts.map((part) => part.language));
        const text = parts.map((part) => (/[\p{L}\p{N}]$/u.test(part.text) ? `${part.text}.` : part.text)).join(' ');
        if (text !== '')
          blocks.push({
            first: element.firstChild ?? element,
            last: element.lastChild ?? element,
            text,
            step: element,
            ...(language !== undefined && otherLanguages.length === 0 ? { language } : {}),
          });
      } else if (element.matches(PICTURE_SELECTOR))
        add(
          element,
          element,
          hasReadableText(element.closest('figure') ?? element) ? '' : (element.getAttribute('aria-label') ?? ''),
          readElementLanguage(element, scope),
        );
      else if (hasReadableBlockChild(element) || !hasReadableText(element)) walk(element);
      else add(element, element, readNodeText(element), readNodesLanguage([...element.childNodes], element, scope));
    }
    flush();
  };
  walk(root);
  return blocks;
}

/**
 * The parts to read: a step or paragraph over 2,000 characters is said as several lines. `language` is the page's
 * `dash/meta.lang`: when it is a valid tag, text with no `lang` of its own is read in the root's language.
 */
export function getReadBlocks(region: Element, root: Element, language?: string | null): ReadBlock[] {
  return collectReadBlocks(region, true, { root, named: normalizeReadLanguage(language) !== undefined }).flatMap((block) =>
    splitLongReadText(block.text)
      .filter(hasReadableChars)
      .map((text) => ({ ...block, text })),
  );
}

export const hasPlayOrSoundControl = (root: ParentNode): boolean => root.querySelector(READ_START_CONTROL_SELECTOR) !== null;

/** The page's `[data-read]` region; one with steps is read only on a stage, or on a page with its own play / sound control. */
export function findReadRoot(root: ParentNode): HTMLElement | null {
  const region = root.querySelector<HTMLElement>(`[${READ_ATTRIBUTE}]`);
  if (region === null || region.querySelector(`[${READ_STEP_ATTRIBUTE}]`) === null) return region;
  return region.closest(`[${READ_STAGE_ATTRIBUTE}]`) !== null || hasPlayOrSoundControl(root) ? region : null;
}

export const hasLoadingSource = (element: Element): boolean => element.querySelector('[data-dash-source-state="loading"]') !== null;
