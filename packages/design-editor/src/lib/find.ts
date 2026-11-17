/**
 * Find in the design: every text of every artboard and every note, page by
 * page, matched case-insensitively. An artboard element matches by its own
 * text (its direct text, not its children's), so each match names exactly
 * one element; a note matches by its text. (Matching and stepping in
 * general: `@open-artifact/editor-kit`, find.)
 */

import { elementPath, type HtmlElement, type TemplateModel } from '@open-artifact/dc';
import { boardsOnPage, notesOnPage, type Canvas } from '@open-artifact/design-core';
import { excerpt, occurrences } from '@open-artifact/editor-kit';

/** One match: which occurrence of the query in an element's or a note's text. */
export type FindMatch =
  | { kind: 'element'; page: string | null; board: string; tid: number; path: number[]; occurrence: number; text: string }
  | { kind: 'note'; page: string | null; note: string; occurrence: number; text: string };

/** Elements whose text is code, not words. */
const SKIPPED = new Set(['script', 'style', 'template', 'svg', 'noscript', 'helmet']);

/** The element's own text: its direct text children, whitespace collapsed. */
export function ownText(element: HtmlElement): string {
  return element.children
    .map((child) => (child.type === 'text' ? child.value : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function skipped(element: HtmlElement): boolean {
  for (let node: HtmlElement | null = element; node; node = node.parent) if (SKIPPED.has(node.tag)) return true;
  return false;
}

/**
 * Every match of `query`, pages in order; on a page, artboards in canvas
 * order (elements in document order), then notes top to bottom.
 * `template(path)` gives an artboard's parsed template, or `null`.
 */
export function findMatches(canvas: Canvas, template: (path: string) => TemplateModel | null, query: string): FindMatch[] {
  const needle = query.trim();
  if (!needle) return [];
  const pages: (string | null)[] = canvas.pages.length ? canvas.pages.map((p) => p.id) : [null];
  const out: FindMatch[] = [];
  for (const page of pages) {
    for (const board of boardsOnPage(canvas, page)) {
      const model = template(board);
      if (!model) continue;
      for (const element of model.elements) {
        if (!element || skipped(element)) continue;
        const text = ownText(element);
        const found = occurrences(text, needle);
        if (!found.length) continue;
        const tid = model.tidOf.get(element)!;
        const path = elementPath(model, element);
        found.forEach((at, occurrence) => out.push({ kind: 'element', page, board, tid, path, occurrence, text: excerpt(text, at, needle.length) }));
      }
    }
    const notes = notesOnPage(canvas, page)
      .map((id) => [id, canvas.notes[id]!] as const)
      .sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
    for (const [id, note] of notes) {
      const text = `${note.text ?? ''}`;
      occurrences(text, needle).forEach((at, occurrence) => out.push({ kind: 'note', page, note: id, occurrence, text: excerpt(text, at, needle.length) }));
    }
  }
  return out;
}

/** The match to start at: the first on the current page or after it. */
export function firstMatchFrom(matches: readonly FindMatch[], pages: readonly (string | null)[], page: string | null): number {
  if (!matches.length) return -1;
  const from = Math.max(0, pages.indexOf(page));
  const index = matches.findIndex((m) => pages.indexOf(m.page) >= from);
  return index < 0 ? 0 : index;
}
