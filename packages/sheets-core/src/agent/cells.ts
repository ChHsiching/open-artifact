/**
 * What a cell holds, as the agent's reads give it and its writeCells takes it:
 *
 *   null                                      nothing
 *   1200                                      a number with no number format
 *   {"number": 12.5, "shown": "$12.50"}       a number under a number format
 *   {"date": "2026-03-15"} {"time": "14:30:00"} {"dateTime": "2026-03-15T14:30:00"}
 *   true / false                              a boolean (a checkbox too)
 *   "Rent", "'02139"                          text; a leading ' marks text that would be read as something else
 *   {"markdown": "**Blocked** on [legal](https://…)"}   text with words in another look
 *   {"formula": "=SUM(B2:B3)", "value": …, "spill"?: "D2:D9"}
 *   {"error": "#REF!"}                        as a formula's value
 *   {"spilledFrom": "D2", "value": …}         a value another cell's formula spills into it
 *   a dropdown option                         its label
 *
 * Numbers, dates and formulas are written and read the US way in every locale. A formula's US text is built from the
 * engine's own parts (`textBetweenReferences`, which are US text, and the references between them); the engine's
 * `formulaText` is in the workbook's locale, so it is used as it is only in en-US.
 */

import { columnLetters } from './addresses.ts';
import { type EngineMessage, isObject } from './engine.ts';

/** Where things are on a sheet: its row and column ids by place, and its name. */
export interface Lines {
  name: string;
  rowIndex(id: string): number | undefined;
  columnIndex(id: string): number | undefined;
}

// ---------- formulas ----------

/** A sheet's name as a formula names it: bare, or in quotes with '' for each '. */
export function sheetPrefix(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !/^[A-Za-z]{1,3}[0-9]+$/.test(name) && !/^(TRUE|FALSE)$/i.test(name) ? `${name}!` : `'${name.replaceAll("'", "''")}'!`;
}

/**
 * A formula's US text, from its parts. `sheets` finds a sheet by id; `own` is the formula's own sheet (no prefix). Null
 * when a part is not one this knows (the caller then uses the engine's own text).
 */
export function usFormulaText(formula: unknown, own: string, sheets: (sheetId: string) => Lines | undefined): string | null {
  if (!isObject(formula) || !Array.isArray(formula.textBetweenReferences) || !Array.isArray(formula.references)) return null;
  const texts: unknown[] = formula.textBetweenReferences;
  const refs: unknown[] = formula.references;
  if (texts.length !== refs.length + 1 || !texts.every((t): t is string => typeof t === 'string')) return null;
  let out = texts[0]!;
  for (let i = 0; i < refs.length; i++) {
    const ref = referenceText(refs[i], own, sheets);
    if (ref === null) return null;
    out += ref + texts[i + 1]!;
  }
  return out;
}

function referenceText(ref: unknown, own: string, sheets: (sheetId: string) => Lines | undefined): string | null {
  if (!isObject(ref) || typeof ref.kind !== 'string') return null;
  const sheet = typeof ref.sheetId === 'string' ? sheets(ref.sheetId) : undefined;
  if (!sheet) return '#REF!';
  const prefix = ref.sheetId === own ? '' : sheetPrefix(sheet.name);
  const row = (p: unknown): string | null => {
    if (!isObject(p) || typeof p.r !== 'string') return null;
    const i = sheet.rowIndex(p.r);
    return i === undefined ? null : `${p.isRowAbsolute === true ? '$' : ''}${i + 1}`;
  };
  const column = (p: unknown): string | null => {
    if (!isObject(p) || typeof p.c !== 'string') return null;
    const i = sheet.columnIndex(p.c);
    return i === undefined ? null : `${p.isColumnAbsolute === true ? '$' : ''}${columnLetters(i)}`;
  };
  const cell = (p: unknown): string | null => {
    const [c, r] = [column(p), row(p)];
    return c === null || r === null ? null : c + r;
  };
  let text: string | null;
  switch (ref.kind) {
    case 'cell':
      text = cell(ref.cell);
      break;
    case 'range': {
      const [p, q] = [cell(ref.topLeft), cell(ref.bottomRight)];
      text = p === null || q === null ? null : `${p}:${q}`;
      break;
    }
    case 'columns': {
      const [l, r] = [column(ref.left), column(ref.right)];
      const top = isObject(ref.top) ? row(ref.top) : '';
      text = l === null || r === null || top === null ? null : `${l}${top}:${r}`;
      break;
    }
    case 'rows': {
      const [t, b] = [row(ref.top), row(ref.bottom)];
      const left = isObject(ref.left) ? column(ref.left) : '';
      text = t === null || b === null || left === null ? null : `${left}${t}:${b}`;
      break;
    }
    default:
      return null;
  }
  return text === null ? '#REF!' : prefix + text;
}

// ---------- dates ----------

const EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86_400_000;

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** A date serial (days since 1899-12-30) as `yyyy-mm-dd`. */
export function dateOfSerial(serial: number): string {
  const d = new Date(EPOCH + Math.floor(serial) * DAY);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The time of day of a serial as `hh:mm:ss`. */
export function timeOfSerial(serial: number): string {
  let seconds = Math.round((serial - Math.floor(serial)) * 86_400);
  if (seconds >= 86_400) seconds = 86_399;
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

function dateTimeOfSerial(serial: number): string {
  // A time that rounds up to the next day is that day at 00:00:00.
  const whole = Math.round(serial * 86_400) / 86_400;
  return `${dateOfSerial(whole)}T${timeOfSerial(whole)}`;
}

// ---------- rich text as markdown ----------

/** A run of a paragraph: its text, its marks and its link. */
export interface TextRun {
  text: string;
  marks: string[];
  link: string | null;
}

/** A paragraph's list: none, bullets, numbers or checkboxes, nested up to level 7. */
export type ParagraphList = { kind: 'none' } | { kind: 'bullet' | 'numbered'; level: number } | { kind: 'checkbox'; level: number; isChecked: boolean };

/** The engine's rich text. */
export interface RichText {
  paragraphs: { list: ParagraphList; runs: TextRun[] }[];
}

const MARK_ORDER = ['bold', 'italic', 'underline', 'strikethrough'];
const OPEN: Record<string, string> = { bold: '**', italic: '*', underline: '<u>', strikethrough: '~~' };
const CLOSE: Record<string, string> = { bold: '**', italic: '*', underline: '</u>', strikethrough: '~~' };
const MAX_LIST_LEVEL = 7;

const escapeMarkdown = (text: string): string => text.replace(/[\\*~[\]<#_`]/g, (ch) => `\\${ch}`);

/** A list in markdown: two spaces a level, then `- `, `1. `, `- [ ] ` or `- [x] `. */
function listPrefix(list: unknown): string {
  if (!isObject(list) || list.kind === 'none' || list.kind === undefined) return '';
  const level = typeof list.level === 'number' && Number.isInteger(list.level) ? Math.min(Math.max(list.level, 0), MAX_LIST_LEVEL) : 0;
  const sign = list.kind === 'numbered' ? '1. ' : list.kind === 'checkbox' ? (list.isChecked === true ? '- [x] ' : '- [ ] ') : '- ';
  return '  '.repeat(level) + sign;
}

/** A line's list sign, if it starts with one: the list and the length of the sign with its indent. */
function listOfLine(line: string): { list: ParagraphList; length: number } | null {
  const m = /^( *)(?:([-*+]) )?(?:\[([ xX])\] )?/.exec(line)!;
  const numbered = m[2] || m[3] !== undefined ? null : /^( *)\d+[.)] /.exec(line);
  if (!m[2] && m[3] === undefined && !numbered) return null;
  const level = Math.min(Math.floor((numbered ?? m)[1]!.length / 2), MAX_LIST_LEVEL);
  if (numbered) return { list: { kind: 'numbered', level }, length: numbered[0].length };
  if (m[3] !== undefined) return { list: { kind: 'checkbox', level, isChecked: m[3] !== ' ' }, length: m[0].length };
  return { list: { kind: 'bullet', level }, length: m[0].length };
}

const runOf = (value: unknown): TextRun | null => {
  if (!isObject(value)) return null;
  const marks = Array.isArray(value.marks) ? value.marks.filter((m): m is string => typeof m === 'string') : [];
  return { text: typeof value.text === 'string' ? value.text : '', marks, link: typeof value.link === 'string' ? value.link : null };
};

/** The engine's rich text ({paragraphs: [{list, runs: [{text, marks, link}]}]}) as markdown. */
export function markdownOfRichText(input: EngineMessage): string | null {
  if (!Array.isArray(input.paragraphs)) return null;
  const lines: string[] = [];
  for (const paragraph of input.paragraphs) {
    if (!isObject(paragraph) || !Array.isArray(paragraph.runs)) return null;
    let line = '';
    for (const raw of paragraph.runs) {
      const run = runOf(raw);
      if (!run) return null;
      const marks = MARK_ORDER.filter((m) => run.marks.includes(m));
      let text = escapeMarkdown(run.text);
      // A mark's signs go inside the run's spaces: "** bold**" is no bold in markdown.
      const lead = /^\s*/.exec(text)![0];
      const tail = /\s*$/.exec(text.slice(lead.length))![0];
      const core = text.slice(lead.length, text.length - tail.length);
      text = core === '' ? text : lead + marks.map((m) => OPEN[m]).join('') + core + [...marks].reverse().map((m) => CLOSE[m]).join('') + tail;
      line += run.link ? `[${text}](${run.link.replace(/[()\\]/g, (ch) => `\\${ch}`)})` : text;
    }
    const prefix = listPrefix(paragraph.list);
    // A line that is no list item but starts like one ("- 3 left", "1. Rent") keeps its sign as itself.
    if (!prefix && listOfLine(line)) line = line.replace(/^( *)(\d+)?([-+.)])/, (_, indent: string, digits: string | undefined, sign: string) => `${indent}${digits ?? ''}\\${sign}`);
    lines.push(prefix + line);
  }
  return lines.join('\n');
}

function findClose(line: string, from: number): number {
  for (let i = from; i < line.length; i++) {
    if (line[i] === '\\') i++;
    else if (line[i] === ']') return i;
  }
  return -1;
}

/**
 * Markdown as the engine's rich text: `**bold**`, `*italic*`, `~~struck~~`, `<u>underlined</u>`, `[words](https://…)`,
 * a paragraph for each line, a list sign at its start; `\` before a sign meant as itself. Null when it is not readable.
 */
export function richTextOfMarkdown(markdown: string, lists = true): RichText | null {
  const paragraphs: RichText['paragraphs'] = [];
  for (const whole of markdown.replaceAll('\r\n', '\n').split('\n')) {
    const item = lists ? listOfLine(whole) : null;
    const line = item ? whole.slice(item.length) : whole;
    const runs: TextRun[] = [];
    const on = new Set<string>();
    let link: string | null = null;
    let text = '';
    const flush = (): void => {
      if (text === '') return;
      const marks = MARK_ORDER.filter((m) => on.has(m));
      const last = runs.at(-1);
      if (last && last.link === link && last.marks.join() === marks.join()) last.text += text;
      else runs.push({ text, marks, link });
      text = '';
    };
    const toggle = (mark: string): void => {
      flush();
      if (on.has(mark)) on.delete(mark);
      else on.add(mark);
    };
    for (let i = 0; i < line.length; ) {
      const rest = line.slice(i);
      if (rest[0] === '\\' && rest.length > 1) {
        text += rest[1];
        i += 2;
      } else if (rest.startsWith('**')) {
        toggle('bold');
        i += 2;
      } else if (rest.startsWith('~~')) {
        toggle('strikethrough');
        i += 2;
      } else if (rest[0] === '*') {
        toggle('italic');
        i += 1;
      } else if (/^<u>/i.test(rest)) {
        flush();
        on.add('underline');
        i += 3;
      } else if (/^<\/u>/i.test(rest)) {
        flush();
        on.delete('underline');
        i += 4;
      } else if (rest[0] === '[' && link === null) {
        // [words](address): the words go on as runs of their own, with the address.
        const close = findClose(line, i + 1);
        const m = close < 0 ? null : /^\(((?:\\.|[^()\\])*)\)/.exec(line.slice(close + 1));
        if (!m) {
          text += '[';
          i += 1;
          continue;
        }
        flush();
        link = m[1]!.replace(/\\(.)/g, '$1');
        const inner = richTextOfMarkdown(line.slice(i + 1, close), false);
        if (!inner || inner.paragraphs.length !== 1) return null;
        for (const run of inner.paragraphs[0]!.runs) {
          const marks = MARK_ORDER.filter((mark) => on.has(mark) || run.marks.includes(mark));
          runs.push({ text: run.text, marks, link });
        }
        link = null;
        i = close + 1 + m[0].length;
      } else {
        text += rest[0];
        i += 1;
      }
    }
    flush();
    if (on.size > 0) return null;
    paragraphs.push({ list: item?.list ?? { kind: 'none' }, runs });
  }
  return paragraphs.length ? { paragraphs } : null;
}

// ---------- reading a cell ----------

/** What reads a cell needs beyond the cell: its number format's kind, dropdown labels, US formula text. */
export interface CellReading {
  /** The kind of a number format pattern (readKindOfPattern), or null for none. */
  kindOf(pattern: string): string | null;
  optionLabel(optionId: string): string | undefined;
  /** The formula's text the US way (null: the engine's own). */
  formulaText(cell: EngineMessage): string | null;
}

/** A text that, written as it is, would be read as a number, a date, a time, a boolean or a formula. */
export function looksLikeSomethingElse(text: string): boolean {
  const t = text.trim();
  if (t === '') return false;
  if (/^[=+'@]/.test(t)) return true;
  if (/^(true|false)$/i.test(t)) return true;
  if (/^[-+(]?\s*[$€£¥]?\s*[-+]?(\d[\d,]*\.?\d*|\.\d+)(e[-+]?\d+)?\s*%?\)?$/i.test(t)) return true;
  if (/^\d{1,4}[-/.]\d{1,2}([-/.]\d{1,4})?(\s|T|$)/.test(t)) return true;
  if (/^\d{1,2}:\d{2}/.test(t)) return true;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(\b|,)/i.test(t)) return true;
  if (/^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) return true;
  return false;
}

/** A value (a cell's own, or a formula's result) as a read gives it, by the cell's number format. */
export function encodeValue(value: unknown, pattern: string | null, shown: string | undefined, reading: CellReading): unknown {
  if (!isObject(value)) return null;
  switch (value.kind) {
    case 'number': {
      const n = typeof value.value === 'number' ? value.value : 0;
      const kind = pattern === null ? null : reading.kindOf(pattern);
      if (kind === 'date') return { date: dateOfSerial(n) };
      if (kind === 'time') return { time: timeOfSerial(n) };
      if (kind === 'dateAndTime') return { dateTime: dateTimeOfSerial(n) };
      if (kind && kind !== 'general' && typeof shown === 'string') return { number: n, shown };
      return n;
    }
    case 'boolean':
      return value.value === true;
    case 'text':
      return typeof value.value === 'string' ? value.value : '';
    case 'error':
      return { error: value.value };
    case 'blank':
    case 'nothing':
      return null;
    case 'dropdownOption':
      return typeof value.optionId === 'string' ? (reading.optionLabel(value.optionId) ?? null) : null;
    default:
      return shown ?? null;
  }
}

/** The text a cell shows, or undefined. */
export const shownText = (cell: EngineMessage): string | undefined => (isObject(cell.shown) && typeof cell.shown.text === 'string' ? cell.shown.text : undefined);

/** What a cell holds, as a read gives it. */
export function encodeCell(cell: EngineMessage, pattern: string | null, reading: CellReading): unknown {
  const shown = shownText(cell);
  const input = isObject(cell.input) ? cell.input : null;
  if (!input) return encodeValue(cell.value, pattern, shown, reading);
  switch (input.kind) {
    case 'formula': {
      const text = reading.formulaText(cell) ?? (typeof cell.formulaText === 'string' ? cell.formulaText : '=');
      return { formula: text, value: encodeValue(cell.value ?? { kind: 'blank' }, pattern, shown, reading) };
    }
    case 'text': {
      const text = typeof input.value === 'string' ? input.value : '';
      return cell.textIsEditedAfterTheMark === true || looksLikeSomethingElse(text) ? `'${text}` : text;
    }
    case 'richText':
      return { markdown: markdownOfRichText(input) ?? (isObject(cell.value) ? cell.value.value : '') };
    case 'users':
    case 'user': {
      const users = (Array.isArray(input.users) ? input.users : [input]).filter(isObject);
      const people = users.map((u) => ({ user: u.userId ?? u.user ?? u.id ?? null, name: u.label ?? u.name ?? '' }));
      return people.length === 1 ? people[0] : people;
    }
    default:
      return encodeValue(input, pattern, shown, reading);
  }
}
