/**
 * The PDF's invisible text layer and links, from words and link boxes
 * measured on the rendered artboard (services/print.ts) and grouped into
 * lines by `@open-artifact/export-kit`. Pure: placing lines and links on a
 * page is tested without a browser.
 *
 * Coordinates come in document px (from the artboard's top left) and leave
 * in PDF points from the page's top left.
 */

import { isWebLink, type LinkArea, type TextLine } from '@open-artifact/export-kit';
import type { PageSlice } from './pagination.ts';

/** A text run as the PDF writer takes it (points). */
export interface PdfRun {
  text: string;
  x: number;
  baseline: number;
  size: number;
  width: number;
}

/** A link as the PDF writer takes it (points). */
export interface PdfLinkBox {
  uri: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Lines whose middle lies on the page, moved to the page and converted to points. Lines past `width` are left out. */
export function pageRuns(lines: readonly TextLine[], slice: PageSlice, width: number, ptPerPx: number): PdfRun[] {
  const out: PdfRun[] = [];
  for (const line of lines) {
    const middle = (line.top + line.bottom) / 2;
    if (middle < slice.top || middle >= slice.bottom) continue;
    if (line.x + line.width < 0 || line.x > width || !line.text.trim()) continue;
    out.push({
      text: line.text,
      x: line.x * ptPerPx,
      baseline: (line.baseline - slice.top + slice.offset) * ptPerPx,
      size: line.size * ptPerPx,
      width: Math.max(0, line.width) * ptPerPx,
    });
  }
  return out;
}

/** Web links (http, https, mailto) on the page, clipped to it and converted to points. */
export function pageLinks(areas: readonly LinkArea[], slice: PageSlice, width: number, ptPerPx: number): PdfLinkBox[] {
  const out: PdfLinkBox[] = [];
  for (const area of areas) {
    if (!isWebLink(area.href)) continue;
    const top = Math.max(area.y, slice.top);
    const bottom = Math.min(area.y + area.h, slice.bottom);
    const left = Math.max(0, area.x);
    const right = Math.min(width, area.x + area.w);
    if (bottom - top < 1 || right - left < 1) continue;
    out.push({ uri: area.href, x: left * ptPerPx, y: (top - slice.top + slice.offset) * ptPerPx, width: (right - left) * ptPerPx, height: (bottom - top) * ptPerPx });
  }
  return out;
}

/** The outline entry of a page: the artboard's title on its first page only. */
export function pageBookmark(title: string, index: number): string | undefined {
  return index === 0 ? title : undefined;
}
