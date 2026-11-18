/**
 * Comment targets on the dashboard page. Only what the agent wrote into
 * `#dash-root` is commentable, minus anything marked `data-uncommentable`
 * or `data-comment-pass` (notes, notices, edit layers). The toolbar and the
 * side panels are not.
 *
 * - What a click picks: the nearest element, from the one under the pointer
 *   up, that a person would name: one with an id, a data mark
 *   (`data-source`) or a label, a heading, table, section, paragraph, list,
 *   image or control, or a card (a block with its own border, background or
 *   shadow). A click inside a chart's `<svg>` or `<canvas>` picks the chart
 *   around it; one inside a table picks the table (the cell goes in the detail).
 * - The anchor is a CSS selector the page finds again after a redraw: `#id`
 *   when unique, the data mark when unique, else an `nth-of-type` path from
 *   the nearest element with a unique id, or from `#dash-root`.
 * - `label` is for people (`Chart “Monthly revenue”`); `detail` is for the
 *   agent (kind, name, opening tag, text, what was clicked).
 */

export const ROOT_ID = 'dash-root';

/** Elements a person names by what they are, whatever their style. */
const NAMED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'section', 'article', 'figure', 'header', 'footer', 'aside', 'nav', 'p',
  'blockquote', 'ul', 'ol', 'li', 'dl', 'img', 'canvas', 'button', 'select', 'input', 'textarea', 'details', 'summary',
]);
const HEADINGS = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
/** The edit tool's layers over the page: a click there is about the page part beneath. */
const EDIT_LAYERS = '.dash-edit-layer, .dash-edit-washes';
const MARK_ATTRS = ['data-source', 'data-field', 'data-where', 'data-row'] as const;
const LABEL_QUOTE_MAX = 40;
const DETAIL_QUOTE_MAX = 160;

export interface DashTarget {
  el: Element;
  anchor: string;
  /** English kind: Page, Heading, Chart, Table, Value, Card, Section, Text, … */
  kind: string;
  /** What people call it: its heading, caption, label or text. */
  name: string;
  /** The card or section it sits in, when that has a name of its own. */
  context?: string;
  /** What exactly was clicked inside it: a table cell, a chart mark's data. */
  clicked?: string;
}

const squash = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

function quote(text: string, max: number): string {
  const squashed = squash(text);
  return squashed.length > max ? `${squashed.slice(0, max)}…` : squashed;
}

const rootOf = (doc: Document): HTMLElement | null => doc.getElementById(ROOT_ID);
const tagOf = (el: Element): string => el.tagName.toLowerCase();
const isSvgPart = (el: Element): boolean => el.namespaceURI === 'http://www.w3.org/2000/svg';

function hasBox(el: Element, win: Window): boolean {
  const style = win.getComputedStyle(el);
  const border = ['top', 'right', 'bottom', 'left'].filter(
    (side) => style.getPropertyValue(`border-${side}-style`) !== 'none' && parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0,
  ).length;
  const background = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent' && style.backgroundColor !== '';
  return border >= 3 || background || (style.boxShadow !== 'none' && style.boxShadow !== '');
}

function isNamed(el: Element, win: Window): boolean {
  if (el.id || el.hasAttribute('data-source') || el.getAttribute('role') === 'heading' || el.hasAttribute('aria-label')) return true;
  if (NAMED_TAGS.has(tagOf(el))) return true;
  const display = win.getComputedStyle(el).display;
  if (display === 'inline' || display === 'contents' || display === 'none') return false;
  return hasBox(el, win);
}

/** Inside the page and commentable. */
export const inPage = (el: Element, root: Element): boolean =>
  root.contains(el) && el.closest('[data-uncommentable]') === null && el.closest('[data-comment-pass]') === null;

function throughEditLayers(start: Element, root: Element, win: Window, point?: { x: number; y: number }): Element {
  if (point === undefined || start.closest(EDIT_LAYERS) === null) return start;
  return win.document.elementsFromPoint(point.x, point.y).find((el) => inPage(el, root)) ?? start;
}

const isElement = (value: EventTarget | null): value is Element => value !== null && typeof (value as Element).closest === 'function';

/** The element a click on `start` (at viewport `point`) is about, or null outside the page. */
export function pickElement(start: EventTarget | null, win: Window, point?: { x: number; y: number }): Element | null {
  if (!isElement(start)) return null;
  const root = rootOf(win.document);
  if (root === null) return null;
  let el = throughEditLayers(start, root, win, point);
  if (!inPage(el, root)) return null;
  if (isSvgPart(el)) {
    let svg: Element | null = el;
    while (svg?.parentElement && isSvgPart(svg.parentElement)) svg = svg.parentElement;
    el = svg?.parentElement && svg.parentElement !== root && !svg.id ? svg.parentElement : (svg ?? el);
  }
  const table = el.closest('table');
  if (table !== null && root.contains(table)) el = table;
  for (let at: Element | null = el; at !== null && at !== root; at = at.parentElement) if (isNamed(at, win)) return at;
  return root;
}

const cssString = (value: string): string => `"${value.replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ')}"`;

function uniqueId(el: Element, doc: Document): string | null {
  if (!el.id) return null;
  const selector = `#${CSS.escape(el.id)}`;
  return doc.querySelectorAll(selector).length === 1 ? selector : null;
}

/** A CSS selector that finds `el` again. */
export function anchorOf(el: Element, doc: Document): string {
  const root = rootOf(doc);
  if (root === null || el === root) return `#${ROOT_ID}`;
  const byId = uniqueId(el, doc);
  if (byId !== null) return byId;
  if (el.hasAttribute('data-source')) {
    const mark = MARK_ATTRS.filter((name) => el.hasAttribute(name))
      .map((name) => `[${name}=${cssString(el.getAttribute(name) ?? '')}]`)
      .join('');
    const selector = `#${ROOT_ID} ${tagOf(el)}${mark}`;
    const found = doc.querySelectorAll(selector);
    if (found.length === 1 && found[0] === el) return selector;
  }
  const steps: string[] = [];
  let at: Element = el;
  while (at !== root && at.parentElement !== null) {
    const id = uniqueId(at, doc);
    if (id !== null) return [id, ...steps].join(' > ');
    const tag = tagOf(at);
    let n = 1;
    for (let sibling = at.previousElementSibling; sibling !== null; sibling = sibling.previousElementSibling) if (tagOf(sibling) === tag) n++;
    steps.unshift(`${tag}:nth-of-type(${n})`);
    at = at.parentElement;
  }
  return [`#${ROOT_ID}`, ...steps].join(' > ');
}

/** The element an anchor names, if it is still on the page. */
export function findTarget(doc: Document, anchor: string): Element | null {
  const root = rootOf(doc);
  if (root === null) return null;
  if (anchor === `#${ROOT_ID}`) return root;
  try {
    const el = doc.querySelector(anchor);
    return el !== null && root.contains(el) ? el : null;
  } catch {
    return null;
  }
}

function isChart(el: Element): boolean {
  const tag = tagOf(el);
  if (tag === 'svg' || tag === 'canvas' || el.getAttribute('role') === 'img') return true;
  if (el.querySelector('table, h1, h2, h3, h4, h5, h6') !== null) return false;
  return el.querySelector('svg, canvas') !== null;
}

function kindOf(el: Element, root: Element, win: Window): string {
  if (el === root) return 'Page';
  const tag = tagOf(el);
  if (/^h[1-6]$/.test(tag) || el.getAttribute('role') === 'heading') return 'Heading';
  if (tag === 'table') return 'Table';
  if (isChart(el)) return 'Chart';
  if (tag === 'img') return 'Image';
  if (['button', 'select', 'input', 'textarea', 'summary'].includes(tag)) return 'Control';
  if (el.hasAttribute('data-source') && el.children.length === 0) return 'Value';
  if (tag === 'li') return 'List item';
  if (tag === 'ul' || tag === 'ol' || tag === 'dl') return 'List';
  if (tag === 'p' || tag === 'blockquote') return 'Text';
  if (tag === 'figure') return 'Figure';
  if (['section', 'article', 'header', 'footer', 'aside', 'nav', 'details'].includes(tag)) return 'Section';
  if (hasBox(el, win) && el.children.length > 0) return 'Card';
  return 'Element';
}

function headingBefore(el: Element): string {
  let sibling = el.previousElementSibling;
  for (let i = 0; sibling !== null && i < 3; i++, sibling = sibling.previousElementSibling) {
    if (sibling.matches(HEADINGS)) return squash(sibling.textContent);
    const inner = sibling.matches('svg, canvas, table') ? null : sibling.querySelector(HEADINGS);
    if (inner !== null && !sibling.nextElementSibling?.contains(inner)) return '';
  }
  return '';
}

function firstLine(el: Element): string {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent === null || parent.closest('svg, script, style') !== null) continue;
    const text = squash(node.textContent);
    if (text !== '' && text !== '—') return text;
  }
  return '';
}

function textOf(el: Element): string {
  const shown = (el as HTMLElement).innerText;
  return typeof shown === 'string' ? shown : (el.textContent ?? '');
}

function nameOf(el: Element, kind: string): string {
  const aria = squash(el.getAttribute('aria-label'));
  if (aria !== '') return aria;
  switch (kind) {
    case 'Page':
      return '';
    case 'Heading':
    case 'Value':
    case 'Text':
    case 'List item':
    case 'Control':
      return squash(textOf(el)) || (el as HTMLInputElement).value || '';
    case 'Image':
      return squash(el.getAttribute('alt'));
    case 'Table': {
      const caption = squash(el.querySelector('caption')?.textContent);
      return caption || headingBefore(el) || (el.parentElement !== null ? headingBefore(el.parentElement) : '') || el.id;
    }
    case 'Chart':
    case 'Figure': {
      const caption = squash(el.querySelector('figcaption, svg > title')?.textContent);
      const inner = squash(el.querySelector(HEADINGS)?.textContent);
      return caption || inner || headingBefore(el) || el.id;
    }
    default:
      return squash(el.querySelector(HEADINGS)?.textContent) || (kind === 'Card' ? firstLine(el) : '') || el.id;
  }
}

function contextOf(el: Element, root: Element, win: Window, name: string): string | undefined {
  for (let at = el.parentElement; at !== null && at !== root; at = at.parentElement) {
    const kind = kindOf(at, root, win);
    if (kind !== 'Card' && kind !== 'Section' && kind !== 'Figure' && kind !== 'Chart') continue;
    const said = nameOf(at, kind);
    if (said !== '' && said !== name) return said;
  }
  return undefined;
}

function clickedIn(target: Element, start: Element): string | undefined {
  const cell = start.closest('td, th');
  if (tagOf(target) === 'table' && cell !== null && target.contains(cell)) {
    const row = cell.parentElement as HTMLTableRowElement | null;
    const index = (cell as HTMLTableCellElement).cellIndex;
    const header = (target as HTMLTableElement).tHead?.rows[0]?.cells[index];
    const key = row?.getAttribute('data-key') ?? squash(row?.cells[0]?.textContent);
    const parts = [
      key && row?.parentElement?.tagName !== 'THEAD' ? `row "${quote(key, 60)}"` : null,
      header ? `column "${quote(header.textContent ?? '', 60)}"` : null,
      `cell text "${quote(cell.textContent ?? '', 80)}"`,
    ].filter((part): part is string => part !== null);
    return parts.join(', ');
  }
  if (!isSvgPart(start) || start === target) return undefined;
  const data = (start as Element & { __data__?: unknown }).__data__;
  if (data === undefined || data === null || typeof data === 'function') return undefined;
  try {
    const json = JSON.stringify(data);
    return json ? `a ${tagOf(start)} mark whose data is ${json.length > 240 ? `${json.slice(0, 240)}…` : json}` : undefined;
  } catch {
    return undefined;
  }
}

/** The target a click on `start` (at viewport `point`) picks, with its anchor and names. */
export function readTarget(start: EventTarget | null, win: Window, point?: { x: number; y: number }): DashTarget | null {
  const el = pickElement(start, win, point);
  const root = rootOf(win.document);
  if (el === null || root === null || !isElement(start)) return null;
  const kind = kindOf(el, root, win);
  const name = nameOf(el, kind);
  const context = el === root ? undefined : contextOf(el, root, win, name);
  const clicked = clickedIn(el, throughEditLayers(start, root, win, point));
  return { el, anchor: anchorOf(el, win.document), kind, name, ...(context === undefined ? {} : { context }), ...(clicked === undefined ? {} : { clicked }) };
}

function openingTag(el: Element): string {
  const keep = ['id', 'class', ...MARK_ATTRS, 'data-row-key', 'role', 'aria-label'];
  const attrs = keep
    .filter((name) => el.hasAttribute(name))
    .map((name) => `${name}="${quote(el.getAttribute(name) ?? '', 80)}"`)
    .join(' ');
  return `<${tagOf(el)}${attrs ? ` ${attrs}` : ''}>`;
}

/** What a target is called: `label` for people, `detail` for the agent. */
export function describeTarget(target: Pick<DashTarget, 'el' | 'kind' | 'name' | 'context' | 'clicked'>): { label: string; detail: string } {
  const { el, kind, name, context, clicked } = target;
  const said = quote(name, LABEL_QUOTE_MAX);
  const what = kind === 'Page' ? 'Page' : said ? `${kind} “${said}”` : kind;
  const label = context !== undefined ? `“${quote(context, LABEL_QUOTE_MAX)}” › ${what}` : what;
  const text = kind === 'Page' || kind === 'Chart' ? '' : quote(textOf(el), DETAIL_QUOTE_MAX);
  const head = `${kind}${name && kind !== 'Page' ? ` "${quote(name, 80)}"` : kind === 'Page' ? ' (the whole dashboard page)' : ''}${context !== undefined ? ` in "${quote(context, 80)}"` : ''}`;
  const parts = [head, kind === 'Page' ? null : openingTag(el), text && text !== squash(name) ? `text "${text}"` : null, clicked ? `clicked: ${clicked}` : null].filter(
    (part): part is string => part !== null && part !== '',
  );
  return { label, detail: parts.join(' · ') };
}

/** Where a target's pin sits: its top-right corner in viewport points; null when it is not laid out or out of view. */
export function pinPoint(el: Element, win: Window): { x: number; y: number } | null {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  if (rect.bottom < 0 || rect.top > win.innerHeight || rect.right < 0 || rect.left > win.innerWidth) return null;
  return { x: Math.min(rect.right, win.innerWidth - 12), y: Math.max(rect.top, 0) };
}

/** A keyboard event in a field, an editable area, a dialog or a menu (their C and Esc are theirs). */
export function inField(target: EventTarget | null): boolean {
  if (!isElement(target)) return false;
  if ((target as HTMLElement).isContentEditable) return true;
  return target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]') !== null;
}
