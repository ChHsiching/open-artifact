import { sanitizeSingleLine, type JsonValue } from '@open-artifact/data-core';

/** JSON with object keys sorted, so equal values give equal text; `undefined` for what JSON can't hold. */
export function stableStringify(value: unknown): string | undefined {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item) ?? 'null').join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  const entries: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const text = stableStringify(record[key]);
    if (text !== undefined) entries.push(`${JSON.stringify(key)}:${text}`);
  }
  return `{${entries.join(',')}}`;
}

/** "a", "a or b", "a, b or c". */
export function joinAlternatives(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** "a and b", "a, b, and c". */
export function joinConjunction(items: readonly string[]): string {
  return items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

const conjunctionFormat = new Intl.ListFormat('en', { type: 'conjunction' });
const disjunctionFormat = new Intl.ListFormat('en-GB', { type: 'disjunction' });

export function formatConjunctionList(items: readonly string[]): string {
  return conjunctionFormat.format(items);
}

export function formatDisjunctionList(items: readonly string[]): string {
  return disjunctionFormat.format(items);
}

export function joinSentences(first: string, second: string): string {
  return `${first} ${second}`;
}

/** At most `max` characters on one line, cut with an ellipsis. */
export function truncateSingleLine(text: string, max: number): string {
  return Array.from(text).length <= max ? text : `${sanitizeSingleLine(text, Math.max(max - 1, 0))}…`;
}

/** What a thrown value says: an error's message (or name), else the value as text. */
export function errorToMessage(error: unknown): string {
  const isAbort = typeof DOMException !== 'undefined' && error instanceof DOMException;
  return error instanceof Error && !isAbort ? error.message || error.name : String(error);
}

/** A JSON copy of a value, or `undefined` when it isn't plain data. */
export function cloneJsonData(value: unknown): JsonValue | undefined {
  try {
    const text = JSON.stringify(value);
    return typeof text === 'string' ? (JSON.parse(text) as JsonValue) : undefined;
  } catch {
    return undefined;
  }
}

export function parseJsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const ARTIFACTS_CONNECTOR_PATTERN = /^\s*artifacts(?![a-z0-9])/i;
const NON_DATA_CONNECTORS: readonly string[] = ['artifacts_data'];
const normalizeConnectorName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** A connector that serves artifacts rather than data, which a dashboard can't query. */
export function isNonDataConnector(connector: string): boolean {
  return (
    ARTIFACTS_CONNECTOR_PATTERN.test(connector) ||
    NON_DATA_CONNECTORS.some((name) => normalizeConnectorName(name) === normalizeConnectorName(connector))
  );
}

export function getErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
}
