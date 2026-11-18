/** The top bar's words that need no page: the doc's name as typed, the default paper, and an export's notes. Pure. */
import type { DocExportFormat, DocPaper } from '@open-artifact/runtime/doc-api';

/** The name as typed, ready to save: trimmed, one line. Empty when there is nothing to save. */
export function cleanDocName(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

export const FORMAT_NAMES: Record<DocExportFormat, string> = { docx: 'Word', pdf: 'PDF', markdown: 'Markdown', html: 'HTML' };

/** Letter where it is the usual paper (the US, Canada and a few others), else A4. */
export function defaultPaper(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): DocPaper {
  const region = languages[0]?.split(/[-_]/)[1]?.toUpperCase();
  return region && ['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'PR'].includes(region) ? 'letter' : 'a4';
}

/** A note the file came with, in either of the shapes a host may send. */
export interface ExportNoteLike {
  code: string;
  message?: string;
  what?: string;
  count?: number;
}

/** What the file could not carry over, in a sentence: "In the file: 2 × image (not available here) kept as text." */
export function notesText(notes: readonly ExportNoteLike[]): string | undefined {
  const words = notes
    .map(note => {
      const what = note.message ?? note.what;
      if (!what) return null;
      const count = note.count && note.count > 1 ? `${note.count} × ` : '';
      const fate = note.code === 'kept_as_text' ? ' kept as text' : note.code === 'dropped' ? ' left out' : '';
      return `${count}${what}${note.message ? '' : fate}`;
    })
    .filter((line): line is string => !!line);
  return words.length ? `In the file: ${words.join('; ')}.` : undefined;
}
