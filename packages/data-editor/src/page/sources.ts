import type { CalculationReport, SourceAddress, SourceResolution, Table } from '@open-artifact/data-core';
import {
  NO_MATCHING_ROW_MESSAGE,
  SOURCE_ATTRIBUTE,
  cellToString,
  coerceCellNumber,
  hasCellAddress,
  isValidDatasetId,
  resolveTableAddress,
  unresolvedSourceResolution,
} from '@open-artifact/data-core';
import { getCalculationTable } from '../data/calculations.ts';
import {
  EMPTY_VALUE_PATTERN,
  MAX_MARK_NUMBER_CHARACTERS,
  matchesPossiblyScaledNumber,
  parseDisplayedNumbers,
  truncateRawText,
} from './numbers.ts';

/** The attribute a mark is tied to its source with. */
export const MARK_SOURCE_ATTRIBUTE = SOURCE_ATTRIBUTE;
/** Set on table cells whose source address the runtime derived from the table's `data-row-key`. */
export const DERIVED_SOURCE_ATTRIBUTE = 'data-derived';
export const ROW_KEY_ATTRIBUTE = 'data-row-key';
export const ROW_KEY_VALUES_ATTRIBUTE = 'data-key';
/** How many mismatched marks the run report lists (it counts them all). */
export const MAX_REPORTED_MARKS = 20;

/** A calculation as the source checks see it. */
export interface SourceCalculationState {
  inputs: string[];
  status: 'ok' | 'loading' | 'error';
  value: unknown;
}

export type PageSourceResolution = SourceResolution & { calc?: SourceCalculationState };

export interface SourceMarkAddress {
  source: string;
  field?: string;
  where?: string;
  row?: number;
}

/** What is wrong with one source mark, before the mark's selector is added. */
export type SourceMarkFinding = SourceMarkAddress & ({ shown: string; inData: string } | { reason: string });
export type SourceMarkIssue = SourceMarkFinding & { mark: string };

interface AttributeReader {
  getAttribute(name: string): string | null;
}

/** The distinct valid dataset ids an element's `data-source` names, in order. */
export function getMarkedSourceIds(element: AttributeReader): string[] {
  return [...new Set((element.getAttribute(MARK_SOURCE_ATTRIBUTE) ?? '').split(/\s+/).filter(isValidDatasetId))];
}

/** Each calculation's inputs, status and value, from the engine's reports. */
export function getCalculationStates(
  reports: ReadonlyMap<string, CalculationReport>,
): Map<string, SourceCalculationState> {
  const calcs = new Map<string, SourceCalculationState>();
  for (const [id, report] of reports)
    calcs.set(id, { inputs: report.inputs, status: report.status ?? 'loading', value: report.result });
  return calcs;
}

/** The datasets under a calculation (through calculations it reads), or undefined when `id` is not one. */
export function getUnderlyingSources(
  id: string,
  calcs: ReadonlyMap<string, { inputs: readonly string[] }>,
): string[] | undefined {
  if (!calcs.has(id)) return undefined;
  const found = new Set<string>();
  const seen = new Set<string>();
  const visit = (calcId: string): void => {
    if (seen.has(calcId)) return;
    seen.add(calcId);
    for (const input of calcs.get(calcId)?.inputs ?? [])
      if (calcs.has(input)) visit(input);
      else found.add(input);
  };
  visit(id);
  return [...found];
}

const isEmptyArray = (value: unknown): boolean => Array.isArray(value) && value.length === 0;

/** A source's table: a dataset's (null while loading), else a calculation's table result; undefined when it has none. */
export function getSourceTable(
  id: string,
  tables: ReadonlyMap<string, Table | null>,
  calcs: ReadonlyMap<string, SourceCalculationState>,
): Table | null | undefined {
  const table = tables.get(id);
  if (table !== undefined) return table;
  const calc = calcs.get(id);
  if (calc === undefined) return undefined;
  if (calc.status !== 'ok' || calc.value === undefined || isEmptyArray(calc.value)) return null;
  return getCalculationTable(calc.value) ?? undefined;
}

function resolveCalculationAddress(address: SourceAddress, calc: SourceCalculationState): PageSourceResolution {
  const cells = hasCellAddress(address);
  const pending: PageSourceResolution = { status: 'pending', kind: cells ? 'cells' : 'calc', rowIndexes: [], calc };
  if (calc.status !== 'ok') return pending;
  if (!cells) return { status: 'ok', kind: 'calc', rowIndexes: [], calc };
  if (calc.value === undefined || isEmptyArray(calc.value)) return pending;
  const table = getCalculationTable(calc.value);
  if (table === null) return { ...unresolvedSourceResolution('calc', 'not a table'), calc };
  return { ...resolveTableAddress(address, table), calc };
}

/** An address resolved against the loaded tables and the page's calculations. */
export function resolvePageSourceAddress(
  address: SourceAddress,
  tables: ReadonlyMap<string, Table | null>,
  calcs: ReadonlyMap<string, SourceCalculationState>,
): PageSourceResolution {
  const table = tables.get(address.source);
  const calc = calcs.get(address.source);
  if (table === undefined && calc !== undefined) return resolveCalculationAddress(address, calc);
  if (table === undefined) return unresolvedSourceResolution('cells', `no dataset “${address.source}”`);
  if (table === null) return { status: 'pending', kind: 'cells', rowIndexes: [] };
  return resolveTableAddress(address, table);
}

/** `data-where` as the issue list shows it: `col=value&…`, not encoded. */
export function serializeWhereLabel(where: NonNullable<SourceAddress['where']>): string {
  return where.map((part) => `${part.column}=${part.value}`).join('&');
}

/**
 * What is wrong with one source mark, or null when nothing is (or its source is still loading): its address does not
 * resolve (an empty-looking value on a missing row is fine), or the number it shows is not the value in the data.
 */
export function findSourceMarkIssue(
  address: SourceAddress,
  shownText: string,
  tables: ReadonlyMap<string, Table | null>,
  calcs: ReadonlyMap<string, SourceCalculationState>,
  allowScaling = false,
  localeMultipliers?: Readonly<Record<string, number>>,
): SourceMarkFinding | null {
  const resolved = resolvePageSourceAddress(address, tables, calcs);
  const shown = shownText.replace(/\s+/g, ' ').trim();
  const described: SourceMarkAddress = {
    source: address.source,
    ...(address.field !== undefined ? { field: truncateRawText(address.field, 64) } : {}),
    ...(address.where !== undefined ? { where: truncateRawText(serializeWhereLabel(address.where), 96) } : {}),
    ...(address.row !== undefined ? { row: address.row } : {}),
  };
  if (resolved.status === 'unresolved')
    return resolved.reason === NO_MATCHING_ROW_MESSAGE && EMPTY_VALUE_PATTERN.test(shown)
      ? null
      : { ...described, reason: truncateRawText(resolved.reason ?? 'not found', 80) };
  const inData =
    resolved.kind === 'cells'
      ? coerceCellNumber(resolved.cell)
      : typeof resolved.calc?.value === 'number'
        ? resolved.calc.value
        : null;
  const displays = shown.length > MAX_MARK_NUMBER_CHARACTERS ? [] : parseDisplayedNumbers(shown, localeMultipliers);
  if (
    resolved.status === 'pending' ||
    inData === null ||
    displays.length === 0 ||
    displays.some((display) => matchesPossiblyScaledNumber(display, inData, allowScaling))
  )
    return null;
  return { ...described, shown, inData: String(Number(inData.toPrecision(15))) };
}

/** A column by its name, or the one column namespaced to it (`table__name`) when exactly one is. */
export function resolveNamespacedColumn(name: string, columns: readonly string[]): string | null {
  if (columns.includes(name)) return name;
  const found = columns.filter((column) => column.endsWith(`__${name}`));
  return found.length === 1 ? (found[0] ?? null) : null;
}

const rowIndexCache = new WeakMap<Table, Map<string, Map<string, number[]>>>();

/** The table's rows grouped by their values in `columns` (each key the JSON of the cell strings). */
export function getTableRowIndex(table: Table, columns: readonly string[]): Map<string, number[]> {
  const byColumns = rowIndexCache.get(table) ?? new Map<string, Map<string, number[]>>();
  rowIndexCache.set(table, byColumns);
  const key = JSON.stringify(columns);
  const found = byColumns.get(key);
  if (found !== undefined) return found;
  const index = new Map<string, number[]>();
  table.rows.forEach((row, rowIndex) => {
    const value = JSON.stringify(columns.map((column) => cellToString(row[column])));
    const rows = index.get(value);
    if (rows === undefined) index.set(value, [rowIndex]);
    else rows.push(rowIndex);
  });
  byColumns.set(key, index);
  return index;
}

export interface RowKeyResolver {
  column(column: string): string | null;
  keys: string[] | null;
  /** null while the source has no table yet. */
  count(keyValues: string[]): number | null;
}

export function createRowKeyResolver(table: Table | null, keyColumns: readonly string[]): RowKeyResolver {
  if (table === null) return { column: (column) => column, keys: [...keyColumns], count: () => null };
  const resolved = keyColumns.map((column) => resolveNamespacedColumn(column, table.columns));
  const keys = resolved.every((column): column is string => column !== null) ? resolved : null;
  const index = keys === null ? null : getTableRowIndex(table, keys);
  return {
    column: (column) => resolveNamespacedColumn(column, table.columns),
    keys,
    count: (values) => index?.get(JSON.stringify(values))?.length ?? 0,
  };
}

function encodeRowKey(text: string): string | null {
  try {
    return encodeURIComponent(text);
  } catch {
    return null;
  }
}

/** `data-where` for a row's key values: `col=value&…`, each part URI-encoded; null when a part can't be. */
export function encodeWhereAddress(columns: readonly string[], values: readonly string[]): string | null {
  const parts = columns.map((column, index) => [encodeRowKey(column), encodeRowKey(values[index] ?? '')] as const);
  return parts.some(([column, value]) => column === null || value === null)
    ? null
    : parts.map(([column, value]) => `${String(column)}=${String(value)}`).join('&');
}
