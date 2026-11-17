/**
 * Markdown editing on a plain text selection: the toolbar's formats
 * (bold, italic, code, link, heading, lists, quote) and the autoformat of
 * Enter (continue a list or quote, end it on an empty item) and Tab
 * (indent list items). Pure: text and selection in, text and selection out.
 */

/** A text with a selection (`start` ≤ `end`). */
export interface TextEdit {
  text: string;
  start: number;
  end: number;
}

export type InlineFormat = 'bold' | 'italic' | 'code' | 'strike' | 'link';
export type BlockFormat = 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'task' | 'quote';

const MARKS: Record<Exclude<InlineFormat, 'link'>, string> = { bold: '**', italic: '_', code: '`', strike: '~~' };

/** Wraps the selection in a mark, or unwraps it when already wrapped. Links get `[text](url)` with `url` selected. */
export function applyInline(edit: TextEdit, format: InlineFormat): TextEdit {
  const { text, start, end } = edit;
  const selected = text.slice(start, end);
  if (format === 'link') {
    const label = selected || 'link';
    const next = `${text.slice(0, start)}[${label}](https://)${text.slice(end)}`;
    const urlStart = start + label.length + 3;
    return { text: next, start: urlStart, end: urlStart + 'https://'.length };
  }
  const mark = MARKS[format];
  // Already wrapped (marks just outside or just inside the selection): unwrap.
  if (text.slice(start - mark.length, start) === mark && text.slice(end, end + mark.length) === mark) {
    return { text: text.slice(0, start - mark.length) + selected + text.slice(end + mark.length), start: start - mark.length, end: end - mark.length };
  }
  if (selected.length >= mark.length * 2 && selected.startsWith(mark) && selected.endsWith(mark)) {
    const inner = selected.slice(mark.length, -mark.length);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  const next = `${text.slice(0, start)}${mark}${selected}${mark}${text.slice(end)}`;
  return { text: next, start: start + mark.length, end: end + mark.length };
}

/** The range of whole lines the selection touches. */
function lineRange(text: string, start: number, end: number): { from: number; to: number } {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const stop = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end);
  return { from, to: stop === -1 ? text.length : stop };
}

const BLOCK_PREFIX = /^(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/;

function prefixOf(format: BlockFormat, index: number): string {
  switch (format) {
    case 'h1':
      return '# ';
    case 'h2':
      return '## ';
    case 'h3':
      return '### ';
    case 'bullet':
      return '- ';
    case 'number':
      return `${index + 1}. `;
    case 'task':
      return '- [ ] ';
    case 'quote':
      return '> ';
  }
}

/**
 * Turns the selected lines into a heading, list or quote; lines that
 * already are one (all of them) go back to plain text.
 */
export function applyBlock(edit: TextEdit, format: BlockFormat): TextEdit {
  const { text, start, end } = edit;
  const { from, to } = lineRange(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const matches = (line: string, i: number): boolean => {
    const bare = line.trimStart();
    if (format === 'number') return /^\d+[.)]\s+/.test(bare);
    // `- [ ] ` is a task, not a bullet.
    if (format === 'bullet' && /^[-*+]\s+\[[ xX]\]\s/.test(bare)) return false;
    if (format === 'bullet') return /^[-*+]\s+/.test(bare);
    if (format === 'task') return /^[-*+]\s+\[[ xX]\]\s+/.test(bare);
    return bare.startsWith(prefixOf(format, i));
  };
  const remove = lines.some((line) => line.trim()) && lines.every((line, i) => !line.trim() || matches(line, i));
  let n = 0;
  const next = lines.map((line) => {
    if (!line.trim()) return line;
    const indent = /^\s*/.exec(line)![0];
    const bare = line.slice(indent.length).replace(BLOCK_PREFIX, '');
    if (remove) return indent + bare;
    return indent + prefixOf(format, n++) + bare;
  });
  const replaced = next.join('\n');
  const result = text.slice(0, from) + replaced + text.slice(to);
  // A collapsed caret stays at the end of its line's text; a selection covers the lines.
  if (start === end) {
    const caret = start + (replaced.length - (to - from));
    return { text: result, start: Math.max(from, caret), end: Math.max(from, caret) };
  }
  return { text: result, start: from, end: from + replaced.length };
}

const CONTINUE = /^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|(\d+)([.)])\s+|>\s?)(.*)$/;

/**
 * Enter at a collapsed caret: continues a list or quote on the next line
 * (numbers counting up, tasks unchecked), or ends it when the item is
 * empty. `null` when Enter should do what it always does.
 */
export function continueOnEnter(edit: TextEdit): TextEdit | null {
  const { text, start, end } = edit;
  if (start !== end) return null;
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const line = text.slice(from, start);
  const match = CONTINUE.exec(line);
  if (!match) return null;
  const [, indent = '', marker = '', number, delimiter, rest = ''] = match;
  // Only at the end of the line's text.
  const after = text.indexOf('\n', start);
  if (text.slice(start, after === -1 ? text.length : after).trim()) return null;
  if (!rest.trim()) {
    // An empty item ends the list: drop its marker.
    const next = text.slice(0, from) + text.slice(start);
    return { text: next, start: from, end: from };
  }
  let nextMarker = marker;
  if (number !== undefined) nextMarker = `${Number(number) + 1}${delimiter} `;
  else if (/\[[ xX]\]/.test(marker)) nextMarker = marker.replace(/\[[xX]\]/, '[ ]');
  const insert = `\n${indent}${nextMarker}`;
  const next = text.slice(0, start) + insert + text.slice(end);
  return { text: next, start: start + insert.length, end: start + insert.length };
}

/** Tab (or Shift+Tab) on list lines: indents (or outdents) them by two spaces. `null` off a list. */
export function indentList(edit: TextEdit, outdent: boolean): TextEdit | null {
  const { text, start, end } = edit;
  const { from, to } = lineRange(text, start, end);
  const lines = text.slice(from, to).split('\n');
  if (!lines.every((line) => !line.trim() || /^\s*([-*+]|\d+[.)])\s+/.test(line))) return null;
  let firstShift = 0;
  let total = 0;
  const next = lines.map((line, i) => {
    if (!line.trim()) return line;
    let shifted: string;
    if (outdent) shifted = line.replace(/^ {1,2}/, '');
    else shifted = `  ${line}`;
    const delta = shifted.length - line.length;
    if (i === 0) firstShift = delta;
    total += delta;
    return shifted;
  });
  return { text: text.slice(0, from) + next.join('\n') + text.slice(to), start: Math.max(from, start + firstShift), end: Math.max(from, end + total) };
}

/** Keyboard shortcuts of the formats (with ⌘ or Ctrl). */
export const FORMAT_KEYS: Record<string, InlineFormat> = { b: 'bold', i: 'italic', e: 'code', k: 'link' };
