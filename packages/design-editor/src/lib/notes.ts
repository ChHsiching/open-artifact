/**
 * How canvas notes look: colors, text sizes, bounds of drawn shapes and a
 * tiny Markdown subset for stickies.
 */

import type { CanvasNote, NoteColor, NoteSize, Rect } from '@open-artifact/design-core';

/** Sticky backgrounds and stroke colors for the named note colors. */
export const NOTE_PALETTE: Record<NoteColor, { sticky: string; stroke: string }> = {
  gray: { sticky: '#ecebe8', stroke: '#6b6a66' },
  red: { sticky: '#fbd9d5', stroke: '#d4483b' },
  orange: { sticky: '#fde3c4', stroke: '#e07a1f' },
  green: { sticky: '#d7efd2', stroke: '#3f9a4a' },
  teal: { sticky: '#cdeeea', stroke: '#1f9488' },
  blue: { sticky: '#d6e6fb', stroke: '#2f6fd6' },
  purple: { sticky: '#e6dcf8', stroke: '#7a4fd1' },
  pink: { sticky: '#f8d8ea', stroke: '#cf4b93' },
};

/** Default sticky color. */
export const DEFAULT_STICKY = '#fdf0b2';

/** A named color's value, or the string itself (any CSS color). */
export function noteColor(value: string | undefined, use: 'sticky' | 'stroke', fallback: string): string {
  if (!value) return fallback;
  return value in NOTE_PALETTE ? NOTE_PALETTE[value as NoteColor][use] : value;
}

/** Font size in px of a note size. */
export function noteFontSize(size: NoteSize | undefined, kind: CanvasNote['kind']): number {
  if (typeof size === 'number') return size;
  const base = kind === 'title1' ? 48 : 16;
  const scale = { s: 0.75, m: 1, l: 1.5, xl: 2, xxl: 3 }[size ?? 'm'];
  return Math.round(base * scale);
}

/** Notes drawn from points. */
export const isPathNote = (note: CanvasNote): boolean => note.kind === 'pen' || note.kind === 'line' || note.kind === 'arrow';

/** World bounds of a note (text notes use their size or a typical one). */
export function noteBounds(note: CanvasNote): Rect {
  if (isPathNote(note) && note.points?.length) {
    const xs = note.points.map((p) => p[0]);
    const ys = note.points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: note.x + minX, y: note.y + minY, w: Math.max(1, Math.max(...xs) - minX), h: Math.max(1, Math.max(...ys) - minY) };
  }
  const w = note.w ?? (note.kind === 'title1' ? Math.min(note.maxW ?? 1200, 480) : 240);
  const h = note.h ?? (note.kind === 'title1' ? noteFontSize(note.size, note.kind) * 1.3 : 80);
  return { x: note.x, y: note.y, w, h };
}

/** One rendered piece of a sticky's Markdown. */
export type MarkdownBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'item'; text: string; ordered: boolean }
  | { kind: 'paragraph'; text: string };

/** Splits sticky text into headings, list items and paragraphs. */
export function markdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (const line of text.split('\n')) {
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) blocks.push({ kind: 'heading', text: heading[1]! });
    else if (bullet) blocks.push({ kind: 'item', text: bullet[1]!, ordered: false });
    else if (ordered) blocks.push({ kind: 'item', text: ordered[1]!, ordered: true });
    else blocks.push({ kind: 'paragraph', text: line });
  }
  return blocks;
}

/** Inline runs: `**bold**`, `*italic*` and `` `code` ``. */
export type InlineRun = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

/** Splits a line into inline runs. */
export function inlineRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index) });
    const token = match[0];
    if (token.startsWith('**')) runs.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith('`')) runs.push({ text: token.slice(1, -1), code: true });
    else runs.push({ text: token.slice(1, -1), italic: true });
    last = match.index + token.length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}

/** SVG dash pattern of a pen stroke. */
export function dashArray(dash: string | undefined, width: number): string | undefined {
  if (dash === 'dashed') return `${width * 3} ${width * 2.5}`;
  if (dash === 'dotted') return `0 ${width * 2}`;
  return undefined;
}
