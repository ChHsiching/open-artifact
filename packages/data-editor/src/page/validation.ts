import type { Table } from '@open-artifact/data-core';
import { FIELD_ATTRIBUTE, SOURCE_ATTRIBUTE, WHERE_ATTRIBUTE, decodeWhereComponent } from '@open-artifact/data-core';
import { DRAW_ATTRIBUTE, findTopDrawings } from './draw.ts';
import { EMPTY_VALUE_PATTERN } from './numbers.ts';
import { isOneWriterAttr } from './parse.ts';
import type { RowKeyResolver } from './sources.ts';
import {
  DERIVED_SOURCE_ATTRIBUTE,
  ROW_KEY_ATTRIBUTE,
  ROW_KEY_VALUES_ATTRIBUTE,
  createRowKeyResolver,
  encodeWhereAddress,
  getMarkedSourceIds,
} from './sources.ts';

export type DrawingFaultWhat = 'not_empty' | 'nested' | 'no_function' | 'stray_write';
export interface DrawingFault {
  kind: 'drawing';
  what: DrawingFaultWhat;
  count: number;
}

/** One-writer pages: scripts may write only inside drawings (and a few attributes outside). */
export interface OneWriterGuard {
  during(fn: () => void): void;
  faults(names: ReadonlySet<string>): DrawingFault[];
  stop(): void;
}

export type OutputFaultWhat = 'not_a_number' | 'empty_chart' | 'labels_overlap' | 'labels_cut';
export interface OutputFault {
  kind: 'output';
  what: OutputFaultWhat;
  count: number;
}

export interface OutputCheckContext {
  shown(element: Element): boolean;
  box(element: Element): DOMRect;
  dataHasNaN(): boolean;
  /** Rows behind a chart's source, or null when unknown. */
  rows(element: Element): number | null;
}

export interface LabelCheckContext {
  shown(element: Element): boolean;
  /** Laid out on the page, transparent or not. */
  placed(element: Element): boolean;
  box(element: Element): DOMRect;
  clips(element: Element): boolean;
  turned(element: Element): boolean;
  style(element: Element): CSSStyleDeclaration;
  /** The box of a text node's words. */
  words(node: Node): DOMRect;
}

/** The sides of a box, as the label checks compare them. */
export interface LabelRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A chart label's box and its words; `seen` when the label is visible too. */
export interface LabelBox {
  box: LabelRect;
  words: string;
  seen: boolean;
}

const MAX_STRAY_WRITE_TARGETS = 99;
const MIN_LABEL_CHART_WIDTH = 120;
const MIN_LABEL_CHART_HEIGHT = 80;
const LABEL_BOX_SLACK = 2;
const LABEL_OVERLAP_SHARE = 0.25;
const LABEL_CUT_SLACK = 4;
const MAX_CHECKED_LABELS = 2000;
const MAX_LABELS_PER_CHART = 200;
const SVG_NON_RENDERED_SELECTOR = 'defs,clipPath,mask,pattern,marker,symbol';
const NAN_TEXT_PATTERN = /(^|[^A-Za-z0-9_])NaN(?![0-9_]|s(?![A-Za-z])|[A-Za-z]{4})/;
const NAN_SVG_ATTRIBUTE_SELECTOR = [
  'd*',
  'points*',
  'transform*',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'width',
  'height',
]
  .map((name) => `svg [${name}="NaN"]`)
  .join(',');

/** A text that prints NaN as a word (not "NaNs", "Nancy", or part of an identifier). */
export function hasNaNText(text: string): boolean {
  return NAN_TEXT_PATTERN.test(text);
}

export const NO_ONE_WRITER_GUARD: OneWriterGuard = {
  during: (fn) => fn(),
  faults: () => [],
  stop: () => undefined,
};

/**
 * Watches a one-writer page: outside its top `data-draw` elements, a script may only set the attributes
 * isOneWriterAttr allows. Writes made while `during` runs page code are strays (up to 99 targets are kept).
 */
export function createOneWriterGuard(root: Element): OneWriterGuard {
  const drawings = findTopDrawings(root);
  const isEmptyDrawing = (element: Element): boolean =>
    element.childElementCount === 0 && EMPTY_VALUE_PATTERN.test((element.textContent ?? '').trim());
  const counts = {
    names: new Set(drawings.map((element) => element.getAttribute(DRAW_ATTRIBUTE) ?? '')),
    notEmpty: drawings.filter((element) => !isEmptyDrawing(element)).length,
    nested: root.querySelectorAll(`[${DRAW_ATTRIBUTE}]`).length - drawings.length,
  };
  const strays = new Set<Node>();
  const watchAdded = (records: MutationRecord[]): void => records.forEach((record) => record.addedNodes.forEach(watch));
  const observer = new MutationObserver(watchAdded);
  let running = false;
  function watch(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) observer.observe(node, { characterData: true });
    if (!(node instanceof Element)) return;
    const isDrawing = node.hasAttribute(DRAW_ATTRIBUTE);
    observer.observe(node, {
      attributes: true,
      ...(isDrawing ? { attributeFilter: [DRAW_ATTRIBUTE] } : { childList: true }),
    });
    if (!isDrawing) for (const child of node.childNodes) watch(child);
  }
  watch(root);
  function recordStrays(records: MutationRecord[]): void {
    const writes = records.filter((record) => record.type !== 'attributes' || !isOneWriterAttr(record.attributeName ?? ''));
    for (const record of writes)
      if (strays.size < MAX_STRAY_WRITE_TARGETS)
        strays.add(record.type === 'characterData' ? (record.target.parentNode ?? record.target) : record.target);
    if (writes.length > 0) observer.disconnect();
  }
  return {
    during(fn) {
      if (running) return fn();
      watchAdded(observer.takeRecords());
      running = true;
      try {
        fn();
      } finally {
        running = false;
        recordStrays(observer.takeRecords());
      }
    },
    faults: (names) => countDrawingFaults({ ...counts, missing: [...counts.names].filter((name) => !names.has(name)).length, strays: strays.size }),
    stop: () => observer.disconnect(),
  };
}

/** The drawing faults with a count above zero, in report order. */
export function countDrawingFaults(counts: { notEmpty: number; nested: number; missing: number; strays: number }): DrawingFault[] {
  const entries: [DrawingFaultWhat, number][] = [
    ['not_empty', counts.notEmpty],
    ['nested', counts.nested],
    ['no_function', counts.missing],
    ['stray_write', counts.strays],
  ];
  return entries.filter(([, count]) => count > 0).map(([what, count]) => ({ kind: 'drawing', what, count }));
}

const getMatchingChildren = (element: Element, selector: string): Element[] =>
  [...element.children].filter((child) => child.matches(selector));
const getRowCells = (row: Element): Element[] => getMatchingChildren(row, 'td, th');
const getCellSpan = (cell: Element | undefined, span: 'colSpan' | 'rowSpan'): number =>
  (cell as Partial<Pick<HTMLTableCellElement, 'colSpan' | 'rowSpan'>> | undefined)?.[span] || 1;
const isHeaderOnlyRow = (row: Element): boolean =>
  getRowCells(row).length > 0 && getRowCells(row).every((cell) => cell.localName === 'th');
const setAttributeIfChanged = (element: Element, name: string, value: string): void => {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
};

/** The key columns a table's `data-row-key` names. */
export function parseRowKeyColumns(text: string | null): string[] {
  return (text ?? '')
    .split(',')
    .map((column) => column.trim())
    .filter((column) => column !== '');
}

/** The key values a row's `data-key` gives: the whole value for one key, else comma-separated and URI-decoded parts. */
export function parseRowKeyValues(text: string, keyCount: number): string[] | null {
  const values = keyCount === 1 ? [text] : text.split(',').map((part) => decodeWhereComponent(part));
  return values.length === keyCount ? values : null;
}

function splitTableHeaderBodies(table: Element): { head: Element[]; bodies: Element[][] } {
  const bodies = [
    getMatchingChildren(table, 'tr'),
    ...getMatchingChildren(table, 'tbody').map((body) => getMatchingChildren(body, 'tr')),
  ].filter((rows) => rows.length > 0);
  const thead = getMatchingChildren(table, 'thead')[0];
  if (thead !== undefined) return { head: getMatchingChildren(thead, 'tr'), bodies };
  const first = bodies[0] ?? [];
  const bodyStart = first.findIndex((row) => !isHeaderOnlyRow(row));
  const end = bodyStart < 0 ? first.length : bodyStart;
  return { head: first.slice(0, end), bodies: [first.slice(end), ...bodies.slice(1)] };
}

/** The rows' cells by grid position: a cell spanning rows or columns fills every position it covers. */
function buildTableCellGrid(rows: Element[]): Element[][] {
  const grid: Element[][] = rows.map(() => []);
  rows.forEach((row, rowIndex) => {
    let column = 0;
    for (const cell of getRowCells(row)) {
      while (grid[rowIndex]?.[column] !== undefined) column++;
      for (const spanned of grid.slice(rowIndex, rowIndex + getCellSpan(cell, 'rowSpan')))
        for (let offset = 0; offset < getCellSpan(cell, 'colSpan'); offset++) spanned[column + offset] = cell;
    }
  });
  return grid;
}

/** Each column's source and field, from the lowest header cell over it (a cell spanning columns names none). */
function getHeaderSourceColumns(head: Element[], sourceId: string): ({ source: string; field: string } | null)[] {
  const columns: Element[] = [];
  for (const row of buildTableCellGrid(head))
    row.forEach((cell, index) => {
      columns[index] = cell;
    });
  return Array.from(columns, (cell) => {
    const field = getCellSpan(cell, 'colSpan') > 1 ? '' : (cell?.getAttribute(FIELD_ATTRIBUTE)?.trim() ?? '');
    return field === '' || cell === undefined ? null : { source: getMarkedSourceIds(cell)[0] ?? sourceId, field };
  });
}

/** A body's rows with one cell per column and no spans touching them. */
function getSimpleBodyRows(rows: Element[], width: number): Element[] {
  const grid = buildTableCellGrid(rows);
  return rows.filter((_row, index) => {
    const cells = grid[index];
    return cells?.length === width && cells.every((cell) => getCellSpan(cell, 'colSpan') * getCellSpan(cell, 'rowSpan') === 1);
  });
}

function getRowKeyText(cell: Element): string {
  for (const node of cell.childNodes)
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') return (node.textContent ?? '').trim();
  return (cell.textContent ?? '').trim();
}

function readRowKeyValues(row: Element, keyCells: number[]): string[] | null {
  const given = row.getAttribute(ROW_KEY_VALUES_ATTRIBUTE);
  if (given !== null) return parseRowKeyValues(given, keyCells.length);
  const cells = getRowCells(row);
  const values = keyCells.map((index) => {
    const cell = cells[index];
    return cell === undefined ? null : getRowKeyText(cell);
  });
  return values.some((value) => value === null) ? null : (values as string[]);
}

function clearDerivedSourceAddress(element: Element): void {
  for (const name of [SOURCE_ATTRIBUTE, FIELD_ATTRIBUTE, WHERE_ATTRIBUTE, DERIVED_SOURCE_ATTRIBUTE]) element.removeAttribute(name);
}

export type TableSourceLookup = (sourceId: string) => Table | null | undefined;

function deriveTableCellSources(table: Element, lookup: TableSourceLookup, derived: Set<Element>): void {
  const sourceId = getMarkedSourceIds(table)[0];
  const keyColumns = parseRowKeyColumns(table.getAttribute(ROW_KEY_ATTRIBUTE));
  const sourceTable = sourceId === undefined ? undefined : lookup(sourceId);
  if (sourceId === undefined || sourceTable === undefined || keyColumns.length === 0) return;
  const { head, bodies } = splitTableHeaderBodies(table);
  const headerColumns = getHeaderSourceColumns(head, sourceId);
  const resolvers = new Map<string, RowKeyResolver>();
  for (const id of new Set(headerColumns.map((column) => column?.source ?? sourceId))) {
    const found = lookup(id);
    if (found !== undefined) resolvers.set(id, createRowKeyResolver(found, keyColumns));
  }
  const base = resolvers.get(sourceId);
  const resolveBaseColumn = (column: string): string | null => base?.column(column) ?? column;
  const keyCells = keyColumns.map((key) =>
    headerColumns.findIndex(
      (column) => column !== null && column.source === sourceId && resolveBaseColumn(column.field) === resolveBaseColumn(key),
    ),
  );
  for (const row of bodies.flatMap((rows) => getSimpleBodyRows(rows, headerColumns.length))) {
    const values = readRowKeyValues(row, keyCells);
    if (values === null) continue;
    getRowCells(row).forEach((cell, index) => {
      const column = headerColumns[index] ?? null;
      const resolver = column === null ? undefined : resolvers.get(column.source);
      if (column === null || resolver === undefined || resolver.keys === null) return;
      if (cell.hasAttribute(SOURCE_ATTRIBUTE) && !cell.hasAttribute(DERIVED_SOURCE_ATTRIBUTE)) return;
      const field = resolver.column(column.field);
      const where = encodeWhereAddress(resolver.keys, values);
      const count = resolver.count(values);
      if (field === null || where === null || (count !== null && count !== 1)) return;
      setAttributeIfChanged(cell, SOURCE_ATTRIBUTE, column.source);
      setAttributeIfChanged(cell, FIELD_ATTRIBUTE, field);
      setAttributeIfChanged(cell, WHERE_ATTRIBUTE, where);
      setAttributeIfChanged(cell, DERIVED_SOURCE_ATTRIBUTE, '');
      derived.add(cell);
    });
  }
}

/**
 * Tables marked with a source and `data-row-key`: each body cell under a header with `data-field` gets the source,
 * field and row (`data-where`) it shows, marked `data-derived`; cells that no longer qualify lose them.
 */
export function derivePageTableSources(root: Element, lookup: TableSourceLookup): void {
  const derived = new Set<Element>();
  for (const table of root.querySelectorAll(`table[${SOURCE_ATTRIBUTE}][${ROW_KEY_ATTRIBUTE}]`))
    deriveTableCellSources(table, lookup, derived);
  for (const element of root.querySelectorAll(`[${DERIVED_SOURCE_ATTRIBUTE}]`))
    if (!derived.has(element)) clearDerivedSourceAddress(element);
}

const isChartSurface = (element: Element): boolean => ['svg', 'canvas'].includes(element.tagName.toLowerCase());

/** Text nodes that print NaN where a reader sees them (capped at 99). */
function countNaNTextNodes(root: Element, context: OutputCheckContext): number {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  for (let step = 0; step < 20000 && count < 99; step++) {
    const node = walker.nextNode();
    if (node === null) break;
    if (!hasNaNText(node.nodeValue ?? '')) continue;
    const parent = node.parentElement;
    if (
      parent === null ||
      parent.closest('script,style,template,noscript,code,pre,textarea,title,desc') !== null ||
      !context.shown(parent)
    )
      continue;
    count++;
  }
  return count;
}

function countNaNSvgAttributes(root: Element, context: OutputCheckContext): number {
  let count = 0;
  for (const element of root.querySelectorAll(NAN_SVG_ATTRIBUTE_SELECTOR)) {
    if (count >= 99) break;
    if (element.closest(SVG_NON_RENDERED_SELECTOR) === null && context.shown(element)) count++;
  }
  return count;
}

/** A chart-sized top-level `<svg>` with nothing drawn in it, alone in its box, over a source that has rows. */
function isEmptyChart(svg: Element, context: OutputCheckContext): boolean {
  const parent = svg.parentElement;
  if (parent === null || parent.closest('svg') !== null || !context.shown(svg)) return false;
  const { width, height } = context.box(svg);
  if (width < MIN_LABEL_CHART_WIDTH || height < MIN_LABEL_CHART_HEIGHT) return false;
  for (const element of svg.querySelectorAll('rect,circle,ellipse,path,line,polyline,polygon,image,use,text')) {
    if (element.closest(SVG_NON_RENDERED_SELECTOR) !== null) continue;
    const box = context.box(element);
    if (box.width + box.height > 0) return false;
  }
  if ([...parent.children].filter(isChartSurface).length > 1) return false;
  return (context.rows(svg) ?? 0) > 0;
}

/** NaN printed on the page (when the data has none) and empty charts over rows. */
export function findOutputFaults(root: Element, context: OutputCheckContext): OutputFault[] {
  try {
    const faults: OutputFault[] = [];
    const notANumber = Math.min(99, countNaNTextNodes(root, context) + countNaNSvgAttributes(root, context));
    if (notANumber > 0 && !context.dataHasNaN()) faults.push({ kind: 'output', what: 'not_a_number', count: notANumber });
    let emptyCharts = 0;
    for (const svg of root.querySelectorAll('svg')) {
      if (emptyCharts === 99) break;
      if (isEmptyChart(svg, context)) emptyCharts++;
    }
    if (emptyCharts > 0) faults.push({ kind: 'output', what: 'empty_chart', count: emptyCharts });
    return faults;
  } catch {
    return [];
  }
}

export const areBoxesApartHorizontally = (a: LabelRect, b: LabelRect): boolean => a.right <= b.left || b.right <= a.left;
export const areBoxesDisjoint = (a: LabelRect, b: LabelRect): boolean =>
  areBoxesApartHorizontally(a, b) || a.bottom <= b.top || b.bottom <= a.top;
const boxArea = (box: LabelRect): number => (box.right - box.left) * (box.bottom - box.top);

/** Two label boxes overlapping by more than the slack each way and by a quarter of the smaller one's area. */
export function doLabelBoxesOverlap(a: LabelRect, b: LabelRect): boolean {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > LABEL_BOX_SLACK && height > LABEL_BOX_SLACK && width * height >= LABEL_OVERLAP_SHARE * Math.min(boxArea(a), boxArea(b));
}

const isSameLabelPlacement = (a: LabelBox, b: LabelBox): boolean =>
  a.words === b.words && Math.abs(a.box.left - b.box.left) <= LABEL_BOX_SLACK && Math.abs(a.box.top - b.box.top) <= LABEL_BOX_SLACK;

/** Whether any two labels overlap (the same words drawn twice in the same place do not count). */
export function hasOverlappingLabels(labels: readonly LabelBox[]): boolean {
  return labels.some((label, index) =>
    labels.slice(index + 1).some((other) => doLabelBoxesOverlap(label.box, other.box) && !isSameLabelPlacement(label, other)),
  );
}

export const isLabelCutHorizontally = (label: LabelRect, clip: LabelRect): boolean =>
  clip.left - label.left > LABEL_CUT_SLACK || label.right - clip.right > LABEL_CUT_SLACK;
export const isLabelCut = (label: LabelRect, chart: LabelRect): boolean =>
  isLabelCutHorizontally(label, chart) || chart.top - label.top > LABEL_CUT_SLACK || label.bottom - chart.bottom > LABEL_CUT_SLACK;
export const isLabelChartSized = (box: LabelRect): boolean =>
  box.right - box.left >= MIN_LABEL_CHART_WIDTH && box.bottom - box.top >= MIN_LABEL_CHART_HEIGHT;

function getOutermostDrawing(element: Element): Element | null {
  let outermost: Element | null = null;
  for (
    let node = element.closest(`[${DRAW_ATTRIBUTE}]`);
    node !== null;
    node = node.parentElement?.closest(`[${DRAW_ATTRIBUTE}]`) ?? null
  )
    outermost = node;
  return outermost;
}

function findLabelCharts(root: Element, context: LabelCheckContext): Element[] {
  return [...root.querySelectorAll('svg')].filter(
    (svg) => !svg.parentElement?.closest('svg') && context.placed(svg) && isLabelChartSized(context.box(svg)),
  );
}

function findLabelDrawings(root: Element, context: LabelCheckContext): Element[] {
  return [...root.querySelectorAll(`[${DRAW_ATTRIBUTE}]`)].filter(
    (drawing) =>
      drawing.closest('svg') === null &&
      getOutermostDrawing(drawing) === drawing &&
      context.placed(drawing) &&
      isLabelChartSized(context.box(drawing)),
  );
}

function hasTransparentAncestor(element: Element, root: Element, context: LabelCheckContext): boolean {
  for (let node: Element | null = element; node !== null && node !== root; node = node.parentElement)
    if (context.style(node).opacity === '0') return true;
  return false;
}

function hasScrollOrFixedAncestor(element: Element, root: Element, context: LabelCheckContext): boolean {
  for (let node: Element | null = element; node !== null && node !== root; node = node.parentElement) {
    const { overflowX, position } = context.style(node);
    if (overflowX !== 'visible' || position === 'fixed') return true;
  }
  return false;
}

/** The box of the nearest parent below `root` that clips sideways (when big enough); null when none does or one scrolls. */
function findClippingBox(element: Element, root: Element, context: LabelCheckContext): DOMRect | null {
  for (let node: Element | null = element; node !== null && node !== root; node = node.parentElement) {
    const { overflowX } = context.style(node);
    if (overflowX === 'auto' || overflowX === 'scroll') return null;
    if (overflowX === 'hidden' || overflowX === 'clip') {
      const box = context.box(node);
      return isLabelChartSized(box) ? box : null;
    }
  }
  return null;
}

function collectLabelBoxes(
  chart: Element,
  labels: Element[],
  context: LabelCheckContext,
  outside: (box: LabelRect) => boolean,
): LabelBox[] {
  const boxes: LabelBox[] = [];
  for (const label of labels) {
    if (boxes.length === MAX_LABELS_PER_CHART) break;
    const words = (label.textContent ?? '').trim();
    if (
      words === '' ||
      label.closest(SVG_NON_RENDERED_SELECTOR) !== null ||
      !context.placed(label) ||
      hasTransparentAncestor(label, chart, context) ||
      context.turned(label)
    )
      continue;
    const box = context.box(label);
    if (box.right - box.left <= 0 || box.bottom - box.top <= 0 || outside(box)) continue;
    boxes.push({ box, words, seen: context.shown(label) });
  }
  return boxes;
}

function findCutDrawingText(
  drawing: Element,
  context: LabelCheckContext,
  clip: LabelRect,
  budget: number,
): { cut: boolean; read: number } {
  const walker = drawing.ownerDocument.createTreeWalker(drawing, NodeFilter.SHOW_TEXT);
  let read = 0;
  for (let node = walker.nextNode(); node !== null && read < budget; node = walker.nextNode()) {
    const parent = node.parentElement;
    if ((node.nodeValue ?? '').trim() === '' || parent === null || parent.closest('svg') !== null) continue;
    read++;
    if (
      !context.placed(parent) ||
      hasTransparentAncestor(parent, drawing, context) ||
      hasScrollOrFixedAncestor(parent, drawing, context)
    )
      continue;
    const words = context.words(node);
    if (!areBoxesApartHorizontally(words, clip) && isLabelCutHorizontally(words, clip)) return { cut: true, read };
  }
  return { cut: false, read };
}

/**
 * Charts whose shown `<text>` labels overlap each other, or stick out of a chart that clips them (or, when the chart
 * does not, sideways out of a parent that does); and HTML drawings whose text sticks out sideways of such a parent.
 */
export function findLabelFaults(root: Element, context: LabelCheckContext): OutputFault[] {
  try {
    let overlapping = 0;
    let cut = 0;
    let budget = MAX_CHECKED_LABELS;
    const cutDrawings = new Set<Element | null>();
    for (const chart of findLabelCharts(root, context)) {
      const labels = [...chart.querySelectorAll('text')].slice(0, budget);
      budget -= labels.length;
      const clip = context.clips(chart) ? context.box(chart) : null;
      const parentClip = clip === null ? findClippingBox(chart, root, context) : null;
      const boxes = collectLabelBoxes(chart, labels, context, (box) =>
        clip !== null ? areBoxesDisjoint(box, clip) : parentClip !== null && areBoxesApartHorizontally(box, parentClip),
      );
      if (hasOverlappingLabels(boxes.filter((label) => label.seen))) overlapping++;
      if (
        clip !== null
          ? boxes.some((label) => isLabelCut(label.box, clip))
          : parentClip !== null && boxes.some((label) => isLabelCutHorizontally(label.box, parentClip))
      ) {
        cut++;
        cutDrawings.add(getOutermostDrawing(chart));
      }
    }
    for (const drawing of findLabelDrawings(root, context)) {
      const clip = cutDrawings.has(drawing) ? null : findClippingBox(drawing, root, context);
      if (clip === null) continue;
      const result = findCutDrawingText(drawing, context, clip, budget);
      budget -= result.read;
      if (result.cut) cut++;
    }
    const faults: OutputFault[] = [];
    if (overlapping > 0) faults.push({ kind: 'output', what: 'labels_overlap', count: overlapping });
    if (cut > 0) faults.push({ kind: 'output', what: 'labels_cut', count: cut });
    return faults;
  } catch {
    return [];
  }
}
