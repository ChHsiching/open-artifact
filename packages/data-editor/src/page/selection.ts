import type { SourceAddress } from '@open-artifact/data-core';
import { SOURCE_ATTRIBUTE, getElementSourceIds, readSourceAddress } from '@open-artifact/data-core';
import { isInternalDashboardAttribute } from './parse.ts';
import { FETCH_PRIORITY_ATTRIBUTE } from './runtime.ts';

/** What "Ask the agent" says about a picked piece of the page or a text selection on it. */
export interface ElementSelection {
  kind: string;
  text: string;
  title: string;
  /** The heading the piece sits under. */
  under: string;
  /** Where the piece is in the page's files: its id, a data attribute, or the nearest id it is inside. */
  hook: string;
  tab: string;
  source: SourceAddress | null;
  within?: string;
  sources?: SourceAddress[];
}

/** Where a selection is: the ids it sits inside (nearest first), the sources under it and the field it shows. */
export interface SelectionPoint {
  at: string[];
  sources: string[];
  field: string;
}

export const INTERACTIVE_ELEMENT_SELECTOR = [
  'a[href], button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"])',
  '[role="button"], [role="tab"], [role="link"]:not([data-dash-stop]), [role="switch"], [role="checkbox"], [role="radio"], [role="option"]',
  '[role="menuitem"], [role="slider"], [role="combobox"], [role="textbox"]',
  '[tabindex]:not([tabindex="-1"]):not([role]):not([data-dash-stop])',
].join(', ');
export const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';
const CHART_ELEMENT_SELECTOR = 'svg, canvas';
const BLOCK_CONTAINER_SELECTOR = 'section, article, figure, aside';
const SELECTABLE_BLOCK_SELECTOR = [
  `[${SOURCE_ATTRIBUTE}]`,
  HEADING_SELECTOR,
  'p, li, dt, dd, td, th, blockquote, figcaption, caption, table',
  CHART_ELEMENT_SELECTOR,
  BLOCK_CONTAINER_SELECTOR,
].join(', ');
const TEXT_BLOCK_SELECTOR = [HEADING_SELECTOR, 'p, li, dt, dd, td, th, blockquote, figcaption, caption'].join(', ');
export const MIN_SELECTION_CHARACTERS = 2;
export const SELECTED_TEXT_KIND = 'Selected text';
const SELECTABLE_BLOCK_LABELS: readonly (readonly [string, string])[] = [
  [HEADING_SELECTOR, 'Heading'],
  ['td, th', 'Table cell'],
  ['figcaption, caption', 'Caption'],
  ['li, dt, dd', 'List item'],
  ['table', 'Table'],
  ['p, blockquote', 'Paragraph'],
];
/** Kinds labelled by their heading rather than their text. */
export const TITLED_SELECTION_KINDS: readonly string[] = ['Chart', 'Card', 'Table'];

const isContainedDescendant = <T extends Node>(node: T | null | undefined, root: Node): node is T =>
  node !== null && node !== undefined && node !== root && root.contains(node);
const hasDirectText = (element: Element): boolean =>
  [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '');
const hasNestedBlockContainer = (element: Element): boolean =>
  element.matches(BLOCK_CONTAINER_SELECTOR) && element.querySelector(BLOCK_CONTAINER_SELECTOR) !== null;
const isElementVisible = (element: Element): boolean =>
  typeof element.checkVisibility !== 'function' || element.checkVisibility();
const elementOf = (node: Node): Element | null => (node instanceof Element ? node : node.parentElement);

/** Collapses whitespace in the label of a selection. */
export const collapseSelectionText = (text: string): string => text.replace(/\s+/g, ' ').trim();

function getChartSelectionContainer(element: Element, root: Element): Element {
  const mark = element.closest(`[${SOURCE_ATTRIBUTE}]`);
  if (isContainedDescendant(mark, root)) return mark;
  return isContainedDescendant(element.parentElement, root) ? element.parentElement : element;
}

/** The block a pick or a selection starting at `node` is about, or null outside the page or on a control. */
export function getSelectableBlock(node: Node | null, root: Element): Element | null {
  const element = node === null ? null : elementOf(node);
  if (!isContainedDescendant(element, root) || isContainedDescendant(element.closest(INTERACTIVE_ELEMENT_SELECTOR), root))
    return null;
  const found = element.closest(SELECTABLE_BLOCK_SELECTOR);
  const block = isContainedDescendant(found, root) ? found : null;
  if ((block === null || block.matches(BLOCK_CONTAINER_SELECTOR)) && hasDirectText(element)) return element;
  if (block === null || hasNestedBlockContainer(block)) return null;
  return block.matches(CHART_ELEMENT_SELECTOR) ? getChartSelectionContainer(block, root) : block;
}

/** The document's text selection when it lies in the page, has some text and starts in a selectable block. */
export function getDashboardTextSelection(root: Element): Range | null {
  const selection = root.ownerDocument.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  if (selection.toString().trim().length < MIN_SELECTION_CHARACTERS) return null;
  return getSelectableBlock(range.startContainer, root) === null ? null : range;
}

function getCollapsedElementText(element: Element): string {
  return collapseSelectionText(
    element instanceof HTMLElement && typeof element.innerText === 'string' ? element.innerText : (element.textContent ?? ''),
  );
}

function isMostlyChart(element: Element): boolean {
  const chart = element.querySelector(CHART_ELEMENT_SELECTOR);
  if (chart === null) return false;
  const [outer, inner] = [element.getBoundingClientRect(), chart.getBoundingClientRect()];
  return inner.width * inner.height * 2 >= outer.width * outer.height;
}

function getSelectionKind(element: Element): string {
  const label = SELECTABLE_BLOCK_LABELS.find(([selector]) => element.matches(selector));
  if (label !== undefined) return label[1];
  if (element.childElementCount === 0) return 'Text';
  return isMostlyChart(element) ? 'Chart' : 'Card';
}

function isPrecedingSectionHeading(heading: Element, element: Element, root: Element): boolean {
  const before = (heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  const container = heading.closest(BLOCK_CONTAINER_SELECTOR);
  return before && isElementVisible(heading) && (!isContainedDescendant(container, root) || container.contains(element));
}

function findPrecedingHeading(element: Element, root: Element): string {
  const heading = [...root.querySelectorAll(HEADING_SELECTOR)]
    .filter((candidate) => isPrecedingSectionHeading(candidate, element, root))
    .at(-1);
  return heading === undefined ? '' : getCollapsedElementText(heading);
}

function getContainedHeading(element: Element): string {
  const heading = element.matches(HEADING_SELECTOR) ? null : element.querySelector(HEADING_SELECTOR);
  return heading === null ? '' : getCollapsedElementText(heading);
}

function getElementLocationHint(element: Element, root: Element): string {
  if (element.id !== '') return `id="${element.id}"`;
  const attribute = [...element.attributes].find(
    (candidate) =>
      candidate.name.startsWith('data-') &&
      candidate.value !== '' &&
      !isInternalDashboardAttribute(candidate.name) &&
      candidate.name !== FETCH_PRIORITY_ATTRIBUTE,
  );
  if (attribute !== undefined) return `${attribute.name}="${attribute.value}"`;
  const holder = element.parentElement?.closest('[id]');
  return isContainedDescendant(holder, root) ? `inside id="${holder.id}"` : '';
}

function getElementTabLabel(element: Element): string {
  const panel = element.closest('[role="tabpanel"][aria-labelledby]');
  const tab = panel === null ? null : element.ownerDocument.getElementById(panel.getAttribute('aria-labelledby') ?? '');
  return tab === null ? '' : getCollapsedElementText(tab);
}

/** A picked piece of the page: its kind, text, heading, where it is in the files, its tab and its source. */
export function describeElementSelection(element: Element, root: Element): ElementSelection {
  const mark = element.closest(`[${SOURCE_ATTRIBUTE}]`);
  return {
    kind: getSelectionKind(element),
    text: getCollapsedElementText(element),
    title: getContainedHeading(element),
    under: findPrecedingHeading(element, root),
    hook: getElementLocationHint(element, root),
    tab: getElementTabLabel(element),
    source: isContainedDescendant(mark, root) ? readSourceAddress(mark) : null,
  };
}

function describeSelectionSpan(range: Range, block: Element, kind: string, root: Element): string {
  const more = [...root.querySelectorAll(TEXT_BLOCK_SELECTOR)].filter(
    (other) =>
      other !== block && !block.contains(other) && !other.contains(block) && isElementVisible(other) && range.intersectsNode(other),
  ).length;
  return more === 0 ? kind : `${kind} and ${String(more)}${more === 1 ? ' more block' : ' more blocks'}`;
}

function getRangeSourceElements(range: Range, root: Element): Element[] {
  const common = elementOf(range.commonAncestorContainer);
  if (common === null) return [];
  const mark = common.closest(`[${SOURCE_ATTRIBUTE}]`);
  const inside = [...common.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`)].filter(
    (element) => isElementVisible(element) && range.intersectsNode(element),
  );
  return isContainedDescendant(mark, root) ? [mark, ...inside] : inside;
}

/** A text selection on the page: the selected text, the block it starts in and the sources it covers. */
export function describeRangeSelection(range: Range, root: Element): ElementSelection | null {
  const block = getSelectableBlock(range.startContainer, root);
  if (block === null) return null;
  const described = describeElementSelection(block, root);
  const mark = elementOf(range.commonAncestorContainer)?.closest(`[${SOURCE_ATTRIBUTE}]`);
  return {
    ...described,
    kind: SELECTED_TEXT_KIND,
    text: collapseSelectionText(root.ownerDocument.getSelection()?.toString() ?? ''),
    within: describeSelectionSpan(range, block, described.kind, root),
    title: '',
    under: described.title !== '' ? described.title : described.under,
    source: isContainedDescendant(mark, root) ? readSourceAddress(mark) : null,
    sources: getRangeSourceElements(range, root).map((element) => readSourceAddress(element)),
  };
}

/** The ids `element` sits inside, nearest first, up to the page root. */
export function getAncestorIds(element: Element, root: Element): string[] {
  const ids: string[] = [];
  for (let at: Element | null = element; isContainedDescendant(at, root); at = at.parentElement) if (at.id !== '') ids.push(at.id);
  return ids;
}

export function describeRangePoint(range: Range, root: Element): SelectionPoint | null {
  const block = getSelectableBlock(range.startContainer, root);
  if (block === null || !isElementVisible(block)) return null;
  return {
    at: getAncestorIds(block, root),
    sources: [...new Set(getRangeSourceElements(range, root).flatMap((element) => getElementSourceIds(element)))],
    field: '',
  };
}

export function describeElementPoint(element: Element, root: Element): SelectionPoint {
  return { at: getAncestorIds(element, root), sources: getElementSourceIds(element), field: readSourceAddress(element).field ?? '' };
}

/** The selection's label: its heading, else (for a chart, card or table) the heading it is under, else its text. */
export function getSelectionLabelText(selection: ElementSelection): string {
  if (selection.title !== '') return selection.title;
  if (TITLED_SELECTION_KINDS.includes(selection.kind) && selection.under !== '') return selection.under;
  return selection.text;
}
