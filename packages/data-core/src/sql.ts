import type { JsonPrimitive, ParameterValue, Parameters, SqlQuoteMode, SqlToken } from './types.ts';

export const SQL_KEYWORDS: ReadonlySet<string> = new Set(
  'ALL AND AS ASC BETWEEN BY CASE CROSS DESC DISTINCT ELSE END EXCEPT EXISTS FROM FULL GROUP HAVING IN INNER INTERSECT INTERVAL IS JOIN LEFT LIKE LIMIT NOT OFFSET ON OR ORDER OUTER OVER PARTITION QUALIFY RIGHT SELECT THEN UNION USING WHEN WHERE WINDOW WITH'.split(
    ' ',
  ),
);
export const SQL_LITERAL_KEYWORDS: ReadonlySet<string> = new Set(['TRUE', 'FALSE', 'NULL']);
const SQL_WORD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*/;
const SQL_NUMBER_PATTERN = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/;
const SQL_WHITESPACE_PATTERN = /^[ \t\r\n]+/;

/** `{{name}}`, with spaces or tabs inside the braces; group 1 is the filter name. */
export const PARAMETER_PLACEHOLDER_PATTERN = /\{\{[ \t]*([A-Za-z_][A-Za-z0-9_]{0,63})[ \t]*\}\}/;
/** A whole `{{name}}` argument of a `call` source: spaces and tabs around it are the only text allowed. */
export const STICKY_PARAMETER_PLACEHOLDER_PATTERN = new RegExp(`^[ \\t]*${PARAMETER_PLACEHOLDER_PATTERN.source}[ \\t]*$`);
/** A whole `{{name}}` argument of a `kind: "query"` source (any white space around it). */
export const EXACT_PARAMETER_PLACEHOLDER_PATTERN = new RegExp(`^\\s*${PARAMETER_PLACEHOLDER_PATTERN.source}\\s*$`);
const GLOBAL_PLACEHOLDER_SOURCE = PARAMETER_PLACEHOLDER_PATTERN.source;

export function isSqlKeyword(word: string): boolean {
  return SQL_KEYWORDS.has(word.toUpperCase());
}

export function isSqlLiteralKeyword(word: string): boolean {
  return SQL_LITERAL_KEYWORDS.has(word.toUpperCase());
}

function findPlaceholderEnd(text: string, offset: number): number {
  const sticky = new RegExp(GLOBAL_PLACEHOLDER_SOURCE, 'y');
  sticky.lastIndex = offset;
  return sticky.test(text) ? sticky.lastIndex : -1;
}

function findSqlQuoteEnd(text: string, offset: number, quote: string, mode: SqlQuoteMode, raw: boolean): number {
  const fence = mode === 'backslash' && quote !== '`' && text.startsWith(quote + quote + quote, offset) ? quote.repeat(3) : quote;
  const escapes = mode !== 'doubled' && !raw;
  for (let index = offset + fence.length; index < text.length; index++)
    if (escapes && text[index] === '\\') index++;
    else if (text.startsWith(fence, index)) return index + fence.length;
  return -1;
}

function scanSqlTokens(sql: string, quotes: SqlQuoteMode, withPlaceholders: boolean): SqlToken[] {
  const tokens: SqlToken[] = [];
  const length = sql.length;
  const findLineEnd = (from: number): number => {
    let index = from;
    while (index < length && sql[index] !== '\n' && sql[index] !== '\r') index++;
    return index;
  };
  let offset = 0;
  while (offset < length) {
    const char = sql[offset] as string;
    const ahead = sql.slice(offset, offset + 256);
    let kind: SqlToken['kind'] = 'punct';
    let end = offset + 1;
    let open = false;
    const space = SQL_WHITESPACE_PATTERN.exec(ahead)?.[0];
    if (space !== undefined) {
      kind = 'space';
      end = offset + space.length;
      while (end < length && SQL_WHITESPACE_PATTERN.test(sql[end] as string)) end++;
    } else if ((char === '-' && sql[offset + 1] === '-') || (char === '#' && quotes !== 'spark')) {
      kind = 'comment';
      end = findLineEnd(offset);
    } else if (char === '/' && sql[offset + 1] === '*') {
      kind = 'comment';
      const close = sql.indexOf('*/', offset + 2);
      open = close === -1;
      end = open ? length : close + 2;
    } else if (char === "'" || char === '"' || char === '`') {
      kind = char === '`' ? 'name' : 'string';
      const raw = quotes === 'spark' && (char === '`' || /^[rR]$/.test(tokens.at(-1)?.text ?? ''));
      const close = findSqlQuoteEnd(sql, offset, char, quotes, raw);
      open = close === -1;
      end = open ? length : close;
    } else if (SQL_WORD_PATTERN.test(ahead)) {
      kind = 'word';
      end = offset + 1;
      while (end < length && /[A-Za-z0-9_]/.test(sql[end] as string)) end++;
    } else if (SQL_NUMBER_PATTERN.test(ahead)) {
      kind = 'number';
      end = offset + (SQL_NUMBER_PATTERN.exec(ahead) as RegExpExecArray)[0].length;
    } else if (withPlaceholders) {
      const placeholderEnd = findPlaceholderEnd(sql, offset);
      if (placeholderEnd !== -1) {
        kind = 'placeholder';
        end = placeholderEnd;
      }
    }
    tokens.push(open ? { kind, text: sql.slice(offset, end), open } : { kind, text: sql.slice(offset, end) });
    offset = end;
  }
  return tokens;
}

/**
 * SQL split into tokens: spaces, comments (`--`, `#` except Spark, `/* *\/`), quoted strings and names
 * (`open` when unclosed), words, numbers and punctuation. `quotes` says how a quote is escaped inside one.
 */
export function tokenizeSql(sql: string, quotes: SqlQuoteMode = 'backslash'): SqlToken[] {
  return scanSqlTokens(sql, quotes, false);
}

/** Like `tokenizeSql`, with each `{{name}}` outside quotes as a "placeholder" token. */
export function tokenizeSqlWithPlaceholders(sql: string, quotes: SqlQuoteMode = 'backslash'): SqlToken[] {
  return scanSqlTokens(sql, quotes, true);
}

/** One value as a SQL literal: `NULL`, `TRUE`/`FALSE`, a number (negative in parentheses), or a quoted text. */
export function sqlScalarLiteral(value: JsonPrimitive, quotes?: SqlQuoteMode): string {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return value < 0 ? `(${String(value)})` : String(value);
  const escaped = quotes !== 'doubled' ? value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : value.replace(/'/g, "''");
  return `'${escaped}'`;
}

/** A filter's value as SQL: a scalar literal, or a list as `(a, b)` (`(NULL)` when empty). */
export function sqlParameterLiteral(value: ParameterValue, quotes?: SqlQuoteMode): string {
  if (typeof value !== 'object' || value === null) return sqlScalarLiteral(value, quotes);
  return `(${value.length === 0 ? 'NULL' : value.map((item) => sqlScalarLiteral(item, quotes)).join(', ')})`;
}

/** A literal any SQL dialect reads alike (quotes doubled, never backslashed). */
export function portableSqlParameterLiteral(value: ParameterValue): string {
  return sqlParameterLiteral(value, 'doubled');
}

/** A filter's value: `null` when unset. */
export function getParameterValue(params: Parameters, name: string): ParameterValue {
  return Object.hasOwn(params, name) ? (params[name] ?? null) : null;
}

/** A filter's value as plain text: a list joined with commas, `null` as nothing. */
export function parameterToText(value: ParameterValue): string {
  return value === null ? '' : typeof value === 'object' ? value.join(',') : String(value);
}

/**
 * SQL with each `{{filter}}` outside quotes and comments replaced by its literal (spaced on both sides);
 * `quoted` names the first filter written inside a quoted string or name, which is never filled in.
 */
export function fillSqlParameters(
  sql: string,
  params: Parameters,
  quotes?: SqlQuoteMode,
): { text: string; quoted: string | null } {
  let filled = '';
  let unquoted = '';
  let quoted: string | null = null;
  const flush = (): void => {
    filled += unquoted.replace(
      new RegExp(GLOBAL_PLACEHOLDER_SOURCE, 'g'),
      (_whole: string, name: string) => ` ${sqlParameterLiteral(getParameterValue(params, name), quotes)} `,
    );
    unquoted = '';
  };
  for (const token of tokenizeSql(sql, quotes)) {
    if (token.kind !== 'string' && token.kind !== 'name' && token.kind !== 'comment') {
      unquoted += token.text;
      continue;
    }
    flush();
    filled += token.text;
    if (token.kind !== 'comment') quoted ??= PARAMETER_PLACEHOLDER_PATTERN.exec(token.text)?.[1] ?? null;
  }
  flush();
  return { text: filled, quoted };
}
