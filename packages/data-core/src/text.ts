import type { UnknownRecord } from './types.ts';

/** Object keys never read from stored data. */
export const RESERVED_OBJECT_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

const CONTROL_CHARACTER_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

export function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A plain object, or an empty one for anything else. */
export function asRecord(value: unknown): UnknownRecord {
  return isPlainObject(value) ? value : {};
}

export function getOwnProperty(record: UnknownRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Text with control characters turned into spaces, cut to `maxCharacters` code points. */
export function sanitizeText(value: unknown, maxCharacters: number = Infinity): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(CONTROL_CHARACTER_PATTERN, ' ');
  return text.length <= maxCharacters ? text : Array.from(text).slice(0, maxCharacters).join('');
}

/** Sanitized text on one line, trimmed. */
export function sanitizeSingleLine(value: unknown, maxCharacters: number = Infinity): string {
  return sanitizeText(value, maxCharacters).replace(/[\r\n]+/g, ' ').trim();
}

export function trimLineEnd(line: string): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--;
  return line.slice(0, end);
}

/** A description: sanitized, line ends trimmed, at most one blank line in a row. */
export function normalizeDescription(value: unknown): string {
  return sanitizeText(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(trimLineEnd)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseEnumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

/** A number (or numeric text) rounded and held to `min`–`max`; `null` when it isn't one. */
export function parseBoundedInteger(value: unknown, min: number, max: number): number | null {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : null;
}

/** Epoch milliseconds from a number (seconds below 1e11) or a date text; `null` otherwise. */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value < 100000000000 ? value * 1000 : value;
  if (typeof value === 'string' && value.trim() !== '') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

/** A code language name, lower-cased; `undefined` when blank. */
export function normalizeCodeLanguage(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? sanitizeSingleLine(value).toLowerCase() : undefined;
}

export function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
