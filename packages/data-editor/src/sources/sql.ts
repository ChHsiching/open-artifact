/**
 * Code as the Sources panel shows it: SQL laid out one clause per line, SQL, GraphQL, JSON and JavaScript coloured,
 * and each `{{name}}` placeholder marked on its own.
 */

import hljs from 'highlight.js/lib/core';
import graphql from 'highlight.js/lib/languages/graphql';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import {
  PARAMETER_PLACEHOLDER_PATTERN,
  isSqlKeyword,
  isSqlLiteralKeyword,
  tokenizeSqlWithPlaceholders,
  type SqlQuoteMode,
  type SqlToken,
} from '@open-artifact/data-core';

export type CodeKind = 'keyword' | 'number' | 'function' | 'string' | 'comment' | 'placeholder';

export interface CodePiece {
  text: string;
  kind?: CodeKind;
}

/** How a piece of code is read: its language (`sql`, `graphql`, `json`, `javascript`…) and, for SQL, its quotes. */
export interface CodeReading {
  lang: string | null;
  quotes?: SqlQuoteMode;
}

interface SqlLayoutToken extends SqlToken {
  before: string;
  depth: number;
}

interface HighlightTree {
  scope?: string;
  children: (string | HighlightTree)[];
}

const SQL_INDENT = '  ';
const SQL_QUOTE_MODES: readonly SqlQuoteMode[] = ['backslash', 'spark', 'doubled'];
const SQL_SAFE_PUNCTUATION: ReadonlySet<string> = new Set('(),.;*+-/%=<>!|&^~:[]@?');
const SQL_BRACKET_PAIRS: Readonly<Record<string, string>> = { '(': ')', '[': ']' };
const SQL_CLOSING_BRACKETS: readonly string[] = Object.values(SQL_BRACKET_PAIRS);
const SQL_CLAUSE_KEYWORDS: ReadonlySet<string> = new Set(['SELECT', 'FROM', 'WHERE', 'HAVING', 'QUALIFY', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT']);
const SQL_JOIN_MODIFIERS: ReadonlySet<string> = new Set(['INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'NATURAL', 'ASOF', 'SEMI', 'ANTI']);
const SQL_PREDICATE_CLAUSES: ReadonlySet<string> = new Set(['WHERE', 'JOIN', 'HAVING', 'QUALIFY']);
const SQL_SELECT_MODIFIERS: ReadonlySet<string> = new Set(['DISTINCT', 'ALL']);
const SQL_COMPLEX_PREDICATES: ReadonlySet<string> = new Set(['BETWEEN', 'CASE']);

const CODE_HIGHLIGHT_SCOPE_MAP: ReadonlyMap<string, CodeKind | 'plain'> = new Map([
  ['keyword', 'keyword'],
  ['variable.language', 'keyword'],
  ['title.function', 'function'],
  ['string', 'string'],
  ['regexp', 'string'],
  ['number', 'number'],
  ['literal', 'number'],
  ['comment', 'comment'],
  ['subst', 'plain'],
] as const);

const MAX_HIGHLIGHT_DEPTH = 200;
/** Longer code is shown as it is, neither laid out nor coloured. */
export const MAX_HIGHLIGHT_CHARACTERS = 100_000;
/** A long code block shows this many lines until Show more. */
export const COLLAPSED_CODE_LINES = 8;

const highlighter = hljs.newInstance();
highlighter.registerLanguage('javascript', javascript);
highlighter.registerLanguage('json', json);
highlighter.registerLanguage('graphql', graphql);

export function isHighlightableLang(lang: string | null | undefined): lang is string {
  return lang === 'sql' || (typeof lang === 'string' && lang !== '' && highlighter.getLanguage(lang) !== undefined);
}

/** `{{name}}` is found in the text itself, unless it is SQL with a known quote mode (whose tokens say where it is). */
export function readsPlaceholdersAsText({ lang, quotes }: CodeReading): boolean {
  return lang !== 'sql' || quotes === undefined;
}

function codePiece(text: string, kind?: CodeKind): CodePiece {
  return kind === undefined ? { text } : { text, kind };
}

function sqlTokensEqual(left: readonly SqlToken[], right: readonly SqlToken[]): boolean {
  return (
    left.length === right.length &&
    left.every((token, index) => token.kind === right[index]?.kind && token.text === right[index]?.text && token.open === right[index]?.open)
  );
}

function getSqlTokenKeyword(token: SqlToken | undefined): string {
  return token?.kind === 'word' ? token.text.toUpperCase() : '';
}

function isLayoutSafeSqlToken(token: SqlToken, next?: SqlToken): boolean {
  if (token.open === true) return false;
  return token.kind !== 'punct' || (SQL_SAFE_PUNCTUATION.has(token.text) && !(token.text === '/' && next?.text === '/'));
}

function prepareSqlLayoutTokens(tokens: readonly SqlToken[]): SqlLayoutToken[] | null {
  const laid: SqlLayoutToken[] = [];
  const closers: string[] = [];
  let before = '';
  for (const [index, token] of tokens.entries()) {
    if (token.kind === 'space') {
      before = token.text;
      continue;
    }
    if (!isLayoutSafeSqlToken(token, tokens[index + 1])) return null;
    if (SQL_CLOSING_BRACKETS.includes(token.text) && closers.pop() !== token.text) return null;
    laid.push({ kind: token.kind, text: token.text, before, depth: closers.length });
    const closer = token.kind === 'punct' && Object.hasOwn(SQL_BRACKET_PAIRS, token.text) ? SQL_BRACKET_PAIRS[token.text] : undefined;
    if (closer !== undefined) closers.push(closer);
    before = '';
  }
  return closers.length === 0 ? laid : null;
}

/** The SQL's tokens, when every quote mode reads them alike (or with the one mode given). */
function tokenizeUnambiguousSql(sql: string, quotes?: SqlQuoteMode): SqlToken[] | null {
  if (quotes !== undefined) return tokenizeSqlWithPlaceholders(sql, quotes);
  const [first = [], ...others] = SQL_QUOTE_MODES.map((mode) => tokenizeSqlWithPlaceholders(sql, mode));
  return others.every((tokens) => sqlTokensEqual(first, tokens)) ? first : null;
}

function isJoinClauseStart(tokens: readonly SqlLayoutToken[], index: number): boolean {
  if (SQL_JOIN_MODIFIERS.has(getSqlTokenKeyword(tokens[index - 1]))) return false;
  let at = index;
  while (SQL_JOIN_MODIFIERS.has(getSqlTokenKeyword(tokens[at]))) at++;
  return getSqlTokenKeyword(tokens[at]) === 'JOIN';
}

/** The clause a token starts (`""` for none), or `null` when where it starts is unclear. */
function getSqlClause(tokens: readonly SqlLayoutToken[], index: number): string | null {
  const keyword = getSqlTokenKeyword(tokens[index]);
  const previous = tokens[index - 1];
  const next = tokens[index + 1];
  if (previous?.text === '.' || getSqlTokenKeyword(previous) === 'AS' || (keyword === 'EXCEPT' && previous?.text === '*')) return '';
  let clause = SQL_CLAUSE_KEYWORDS.has(keyword) ? keyword : '';
  if (keyword === 'WITH' && index === 0) clause = keyword;
  if ((keyword === 'GROUP' || keyword === 'ORDER') && getSqlTokenKeyword(next) === 'BY') clause = keyword;
  if ((keyword === 'JOIN' || SQL_JOIN_MODIFIERS.has(keyword)) && isJoinClauseStart(tokens, index)) clause = 'JOIN';
  const amid = previous?.text === ',' || next?.text === ',' || (keyword === 'FROM' && getSqlTokenKeyword(previous) === 'DISTINCT');
  return clause !== '' && amid ? null : clause;
}

function hasComplexSqlPredicate(tokens: readonly SqlLayoutToken[], index: number): boolean {
  for (let at = index + 1; at < tokens.length; at++) {
    if ((tokens[at] as SqlLayoutToken).depth > 0) continue;
    if (getSqlClause(tokens, at) !== '') return false;
    if (SQL_COMPLEX_PREDICATES.has(getSqlTokenKeyword(tokens[at]))) return true;
  }
  return false;
}

function getSqlLineBreaks(tokens: readonly SqlLayoutToken[]): Map<SqlLayoutToken, string> | null {
  const breaks = new Map<SqlLayoutToken, string>();
  let clause = '';
  let complex = false;
  let listing = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] as SqlLayoutToken;
    if (token.depth > 0) continue;
    const keyword = getSqlTokenKeyword(token);
    const starts = getSqlClause(tokens, index);
    if (starts === null) return null;
    const selectModifier = SQL_SELECT_MODIFIERS.has(keyword) && getSqlTokenKeyword(tokens[index - 1]) === 'SELECT';
    const condition = SQL_PREDICATE_CLAUSES.has(clause) && !complex && (keyword === 'AND' || keyword === 'OR');
    if (starts !== '') {
      clause = starts;
      complex = SQL_PREDICATE_CLAUSES.has(clause) && hasComplexSqlPredicate(tokens, index);
      breaks.set(token, '\n');
    } else if ((listing && !selectModifier) || condition) breaks.set(token, `\n${SQL_INDENT}`);
    const sameLineComma = token.text === ',' && !token.before.includes('\n');
    listing = clause === 'SELECT' && (sameLineComma || keyword === 'SELECT' || selectModifier);
  }
  return breaks;
}

/**
 * A `SELECT` or `WITH` query laid out one clause per line, with its select list and its plain `AND`/`OR` conditions
 * indented; the SQL as it is when its layout could change what it means (or it can't be read the same in every quote
 * mode, has unbalanced brackets, odd punctuation or several statements).
 */
export function formatSqlLayout(sql: string, quotes?: SqlQuoteMode): string {
  const tokens = tokenizeUnambiguousSql(sql, quotes);
  const laid = tokens === null ? null : prepareSqlLayoutTokens(tokens);
  if (tokens === null || laid === null) return sql;
  const code = laid.filter((token) => token.kind !== 'comment');
  const semicolon = code.findIndex((token) => token.text === ';');
  const breaks =
    ['SELECT', 'WITH'].includes(getSqlTokenKeyword(code[0])) && (semicolon === -1 || semicolon === code.length - 1) ? getSqlLineBreaks(code) : null;
  if (breaks === null) return sql;
  const spaceBefore = (token: SqlLayoutToken, first: boolean): string => {
    if (first || token.before === '') return '';
    return breaks.get(token) ?? token.before;
  };
  const text = laid.map((token, index) => spaceBefore(token, index === 0) + token.text).join('');
  const again = tokenizeSqlWithPlaceholders(text, quotes ?? SQL_QUOTE_MODES[0]).filter((token) => token.kind !== 'space');
  return sqlTokensEqual(
    again,
    tokens.filter((token) => token.kind !== 'space'),
  )
    ? text
    : sql;
}

function getSqlWordHighlight(word: string, next?: SqlToken): CodeKind | undefined {
  if (isSqlKeyword(word)) return 'keyword';
  if (isSqlLiteralKeyword(word)) return 'number';
  return next?.text === '(' ? 'function' : undefined;
}

function getSqlTokenHighlight(token: SqlToken, next?: SqlToken): CodeKind | undefined {
  if (token.kind === 'word') return getSqlWordHighlight(token.text, next);
  if (token.kind === 'space' || token.kind === 'punct') return undefined;
  return token.kind === 'name' ? 'string' : token.kind;
}

function flattenHighlightTree(node: string | HighlightTree, kind: CodeKind | 'plain', into: CodePiece[], depth = 0): void {
  if (typeof node === 'string') {
    into.push(codePiece(node, kind === 'plain' ? undefined : kind));
    return;
  }
  if (depth > MAX_HIGHLIGHT_DEPTH) throw new RangeError('nested too deep to colour');
  const scoped = CODE_HIGHLIGHT_SCOPE_MAP.get(node.scope ?? '');
  const next = kind === 'plain' || scoped === 'plain' ? (scoped ?? kind) : kind;
  for (const child of node.children) flattenHighlightTree(child, next, into, depth + 1);
}

function highlightCodePieces(code: string, lang: string): CodePiece[] {
  try {
    const result = highlighter.highlight(code, { language: lang, ignoreIllegals: true });
    const root = (result._emitter as unknown as { rootNode: HighlightTree }).rootNode;
    const pieces: CodePiece[] = [];
    flattenHighlightTree(root, 'plain', pieces);
    return pieces;
  } catch {
    return [{ text: code }];
  }
}

/** The code in coloured pieces (one plain piece when its language isn't coloured or it is too long). */
export function tokenizeHighlightedCode(code: string, lang: string | null, quotes?: SqlQuoteMode): CodePiece[] {
  if (code.length > MAX_HIGHLIGHT_CHARACTERS || !isHighlightableLang(lang)) return [{ text: code }];
  if (lang === 'sql') {
    const tokens = tokenizeSqlWithPlaceholders(code, quotes);
    return tokens.map((token, index) => codePiece(token.text, getSqlTokenHighlight(token, tokens[index + 1])));
  }
  return highlightCodePieces(code, lang);
}

/** The pieces cut into consecutive runs of the given lengths. */
export function splitCodePiecesByLengths(pieces: readonly CodePiece[], lengths: readonly number[]): CodePiece[][] {
  const queue = [...pieces];
  let index = 0;
  return lengths.map((length) => {
    const group: CodePiece[] = [];
    let left = length;
    while (left > 0 && index < queue.length) {
      const piece = queue[index] as CodePiece;
      const text = piece.text.slice(0, left);
      group.push({ ...piece, text });
      left -= text.length;
      if (text.length === piece.text.length) index++;
      else queue[index] = { ...piece, text: piece.text.slice(text.length) };
    }
    return group;
  });
}

/** Marks each `{{name}}` as one placeholder piece, found across the whole text (even when split over coloured pieces). */
export function highlightParameterPlaceholders(pieces: readonly CodePiece[]): CodePiece[] {
  const text = pieces.map((piece) => piece.text).join('');
  const lengths: number[] = [];
  let index = 0;
  for (const match of text.matchAll(new RegExp(PARAMETER_PLACEHOLDER_PATTERN.source, 'g'))) {
    lengths.push(match.index - index, match[0].length);
    index = match.index + match[0].length;
  }
  lengths.push(text.length - index);
  return splitCodePiecesByLengths(pieces, lengths).flatMap((group, at) =>
    at % 2 === 1 ? [{ text: group.map((piece) => piece.text).join(''), kind: 'placeholder' as const }] : group,
  );
}

/** The name in a placeholder piece's text. */
export function getPlaceholderName(text: string): string | undefined {
  return PARAMETER_PLACEHOLDER_PATTERN.exec(text)?.[1];
}

/** The filters an argument's text places (`{{name}}`), each once, in order. */
export function getPlacedParameterNames(text: string, reading: CodeReading): string[] {
  const pieces = readsPlaceholdersAsText(reading) ? highlightParameterPlaceholders([{ text }]) : tokenizeHighlightedCode(text, 'sql', reading.quotes);
  const names = pieces.flatMap((piece) => (piece.kind === 'placeholder' ? (getPlaceholderName(piece.text) ?? []) : []));
  return [...new Set(names)];
}

/** The code as shown: SQL laid out (unless too long), anything else as it is. */
export function formatCodeForDisplay(code: string, { lang, quotes }: CodeReading): string {
  return lang === 'sql' && code.length <= MAX_HIGHLIGHT_CHARACTERS ? formatSqlLayout(code, quotes) : code;
}

/**
 * The pieces a code block draws: coloured, laid out when asked, with placeholders marked when `placeholders` is on;
 * `null` when the code is shown as plain text.
 */
export function getHighlightedPieces(
  code: string,
  reading: CodeReading,
  { laidOut = false, placeholders = false }: { laidOut?: boolean; placeholders?: boolean } = {},
): CodePiece[] | null {
  const marks = placeholders && readsPlaceholdersAsText(reading);
  if (!isHighlightableLang(reading.lang)) return marks ? highlightParameterPlaceholders([{ text: code }]) : null;
  const pieces = tokenizeHighlightedCode(laidOut ? formatCodeForDisplay(code, reading) : code, reading.lang, reading.quotes);
  return marks ? highlightParameterPlaceholders(pieces) : pieces;
}
