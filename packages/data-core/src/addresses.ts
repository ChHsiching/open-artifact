import type { SourceAddress, SourceResolution, Table } from './types.ts';
import { isValidDatasetId } from './paths.ts';
import { cellToString } from './tables.ts';

/** The attributes a page marks an element's data with. */
export const SOURCE_ATTRIBUTE = 'data-source';
export const FIELD_ATTRIBUTE = 'data-field';
export const WHERE_ATTRIBUTE = 'data-where';
export const ROW_ATTRIBUTE = 'data-row';
export const NO_MATCHING_ROW_MESSAGE = 'no matching row';

/** The one part of an element the address readers use. */
export interface AttributeReader {
  getAttribute(name: string): string | null;
}

export type SourceWhere = NonNullable<SourceAddress['where']>;

export function decodeWhereComponent(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** `data-where="col=value&other=value"`, each part URI-decoded; parts without a column are skipped. */
export function parseWhereAddress(text: string): SourceWhere {
  const where: SourceWhere = [];
  for (const part of text.split('&')) {
    const equals = part.indexOf('=');
    const column = equals <= 0 ? '' : decodeWhereComponent(part.slice(0, equals)).trim();
    if (column === '') continue;
    where.push({ column, value: decodeWhereComponent(part.slice(equals + 1)) });
  }
  return where;
}

/** `data-row`: a whole number, or `-1` when it isn't one. */
export function parseRowIndex(text: string): number {
  const index = /^\d+$/.test(text.trim()) ? Number(text.trim()) : -1;
  return Number.isSafeInteger(index) ? index : -1;
}

/** The distinct dataset ids an element's `data-source` names. */
export function getElementSourceIds(element: AttributeReader): string[] {
  return [...new Set((element.getAttribute(SOURCE_ATTRIBUTE) ?? '').split(/\s+/).filter(isValidDatasetId))];
}

/** Where a marked element's value comes from (`data-row` counts only without `data-where`). */
export function readSourceAddress(
  element: AttributeReader,
  source: string = getElementSourceIds(element)[0] ?? '',
): SourceAddress {
  const address: SourceAddress = { source };
  const field = element.getAttribute(FIELD_ATTRIBUTE)?.trim();
  if (field !== undefined && field !== '') address.field = field;
  const where = element.getAttribute(WHERE_ATTRIBUTE);
  if (where !== null) address.where = parseWhereAddress(where);
  const row = element.getAttribute(ROW_ATTRIBUTE);
  if (row !== null && where === null) address.row = parseRowIndex(row);
  return address;
}

export function hasCellAddress(address: SourceAddress): boolean {
  return address.field !== undefined || address.where !== undefined || address.row !== undefined;
}

export function unresolvedSourceResolution(kind: SourceResolution['kind'], reason: string): SourceResolution {
  return { status: 'unresolved', kind, reason, rowIndexes: [] };
}

const rowIndexCache = new WeakMap<Table, Map<string, Map<string, number[]>>>();

function getTableRowIndex(table: Table, columns: string[]): Map<string, number[]> {
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

function resolveWhereRows(where: SourceWhere, table: Table): string | number[] {
  if (where.length === 0) return 'data-where isn’t col=value';
  const missing = where.find((part) => !table.columns.includes(part.column));
  if (missing !== undefined) return `no column “${missing.column}”`;
  const rows =
    getTableRowIndex(
      table,
      where.map((part) => part.column),
    ).get(JSON.stringify(where.map((part) => part.value))) ?? [];
  return rows.length === 0 ? NO_MATCHING_ROW_MESSAGE : [...rows];
}

function resolveAddressRows(address: SourceAddress, table: Table): string | number[] {
  if (address.where !== undefined) return resolveWhereRows(address.where, table);
  if (address.row === undefined) return table.rows.map((_, index) => index);
  return address.row >= 0 && address.row < table.rows.length
    ? [address.row]
    : `no row ${address.row < 0 ? 'by that number' : String(address.row)}`;
}

/** The rows (and cell, for one row and a field) an address picks from a table, or why it picks none. */
export function resolveTableAddress(address: SourceAddress, table: Table): SourceResolution {
  if (address.field !== undefined && !table.columns.includes(address.field))
    return unresolvedSourceResolution('cells', `no column “${address.field}”`);
  const rows = resolveAddressRows(address, table);
  if (typeof rows === 'string') return unresolvedSourceResolution('cells', rows);
  const resolution: SourceResolution = { status: 'ok', kind: 'cells', table, rowIndexes: rows };
  if (address.field === undefined) return resolution;
  resolution.field = address.field;
  if (rows.length === 1) resolution.cell = table.rows[rows[0] as number]?.[address.field] ?? null;
  return resolution;
}

/** An address resolved against the loaded tables (`null` while a table is still loading). */
export function resolveSourceAddress(
  address: SourceAddress,
  tables: ReadonlyMap<string, Table | null>,
): SourceResolution {
  const table = tables.get(address.source);
  if (table === undefined) return unresolvedSourceResolution('cells', `no dataset “${address.source}”`);
  if (table === null) return { status: 'pending', kind: 'cells', rowIndexes: [] };
  return resolveTableAddress(address, table);
}
