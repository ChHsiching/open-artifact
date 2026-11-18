/**
 * A doc, or one tab of it, as a file: markdown, Word, PDF or the print page. The page's export route and the CLI's
 * `export` both end up here.
 */
import path from 'node:path';
import { committed, type DocFont, type ExportNote, ExportNotes, ExportRefusal, type ExportSource, languageOf, linkAnchors, type Paper } from '@open-artifact/docs-core';
import { readDocBlob } from './blobs.ts';
import { type DocPerson, exportMarkdown } from './calls.ts';
import { DOCX_MIME, renderDocx } from './docx.ts';
import { printHtml, renderPdf } from './print.ts';
import { type DocStore, StoreError } from './store.ts';

export { ExportRefusal } from '@open-artifact/docs-core';
export type { ExportNote, Paper } from '@open-artifact/docs-core';

export const EXPORT_FORMATS = ['markdown', 'docx', 'pdf', 'html'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const isExportFormat = (value: unknown): value is ExportFormat => EXPORT_FORMATS.includes(value as ExportFormat);
export const isPaper = (value: unknown): value is Paper => value === 'a4' || value === 'letter';

const EXTENSION: Record<ExportFormat, string> = { markdown: 'md', docx: 'docx', pdf: 'pdf', html: 'html' };
const MIME: Record<ExportFormat, string> = { markdown: 'text/markdown; charset=utf-8', docx: DOCX_MIME, pdf: 'application/pdf', html: 'text/html; charset=utf-8' };

export function formatOfFile(file: string): ExportFormat | undefined {
  const extension = /\.([a-z]+)$/i.exec(file)?.[1]?.toLowerCase();
  if (extension === 'markdown') return 'markdown';
  return EXPORT_FORMATS.find(format => EXTENSION[format] === extension);
}

/** The paper this computer's region uses: the US and Canada print on letter, the rest of the world on A4. */
export function defaultPaper(): Paper {
  const locale = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale);
  const region = locale.region ?? locale.maximize().region;
  return region === 'US' || region === 'CA' ? 'letter' : 'a4';
}

export interface ExportRequest {
  format: ExportFormat;
  /** A tab by id, content node or name; the whole doc when absent. */
  tab?: string | undefined;
  paper?: Paper | undefined;
}

export interface ExportFile {
  format: ExportFormat;
  /** Its name: the doc's, with the tab's when one tab of several is exported. */
  name: string;
  mime: string;
  bytes: Buffer;
  notes: ExportNote[];
  pages?: number;
}

function refusalOf(error: unknown): ExportRefusal {
  return new ExportRefusal('no_node', (error as Error).message, 404);
}

const fontOf = (value: unknown, fallback: DocFont): DocFont => (value === 'serif' || value === 'sans' || value === 'mono' ? value : fallback);

function sourceOf(store: DocStore, person: DocPerson, tabId: string | undefined, paper: Paper, title: string): ExportSource {
  const ids = tabId ? [tabId] : store.tabIds();
  // An export is the doc as it reads now: open suggestions are not in it until the person accepts them.
  const { tabs, anchors } = linkAnchors(ids.map(id => ({ id, name: store.tab(id).name, blocks: committed(store.doc(id)).blocks })));
  const display = store.manifest.display ?? {};
  return {
    title,
    rev: Math.max(...ids.map(id => store.doc(id).rev)),
    paper,
    tabs,
    anchors,
    enums: Object.fromEntries(Object.entries(store.manifest.enums).map(([id, def]) => [id, def.options.map(option => option.name)])),
    names: { [person.id]: person.name },
    // The doc is the artifact's `doc/` folder; its images are the artifact's uploads.
    blob: ref => readDocBlob(path.dirname(store.root), ref),
    refs: Object.fromEntries(store.tabIds().map(id => [`file/${id}`, store.tab(id).name])),
    fonts: { headings: fontOf(display.headingFont, 'serif'), text: fontOf(display.textFont, 'sans') },
    language: languageOf(tabs),
  };
}

export async function exportFile(store: DocStore, person: DocPerson, request: ExportRequest): Promise<ExportFile> {
  let tabId: string | undefined;
  try {
    if (request.tab) tabId = store.findTab(request.tab);
  } catch (error) {
    if (error instanceof StoreError) throw refusalOf(error);
    throw error;
  }
  const docName = store.manifest.name.trim() || 'Untitled';
  const title = tabId && store.tabIds().length > 1 ? `${docName} - ${store.tab(tabId).name}` : docName;
  const { format } = request;
  const name = `${title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim() || 'Untitled'}.${EXTENSION[format]}`;
  const done = (bytes: Buffer, notes: ExportNote[], pages?: number): ExportFile => ({ format, name, mime: MIME[format], bytes, notes, ...(pages ? { pages } : {}) });
  if (format === 'markdown') return done(Buffer.from(exportMarkdown(store, person, tabId), 'utf8'), []);
  const source = sourceOf(store, person, tabId, request.paper ?? defaultPaper(), title);
  if (format === 'html') {
    const notes = new ExportNotes();
    const html = printHtml(source, notes);
    return done(Buffer.from(html, 'utf8'), notes.list());
  }
  if (format === 'docx') {
    const { bytes, notes } = await renderDocx(source);
    return done(bytes, notes);
  }
  const { bytes, notes, pages } = await renderPdf(source);
  return done(bytes, notes, pages);
}
