/**
 * A doc's files in and out, for the server's export and import routes and the CLI's actions: the refusals of the
 * exporters, importers and store come out as one error with an HTTP status and a code.
 */
import path from 'node:path';
import { ExportRefusal } from '@open-artifact/docs-core';
import type { DocExportFormat, DocImportResponse } from '@open-artifact/runtime/doc-api';
import type { DocPerson } from './calls.ts';
import { exportFile, type ExportFile, type ExportNote, type ExportRequest, isExportFormat, isPaper } from './export.ts';
import type { DocHost } from './host.ts';
import { inlineLocalImages } from './import-markdown.ts';
import { docFromImport, IMPORT_MAX_BYTES, importIntoDoc, ImportRefusal, readImport } from './import.ts';
import { DocStore, StoreError, docDirOf, isDocFolder } from './store.ts';

export { defaultPaper, exportFile, formatOfFile, isExportFormat, isPaper } from './export.ts';
export type { ExportFile, ExportNote, ExportRequest, Paper } from './export.ts';
export { IMPORT_MAX_BYTES, importIntoDoc, readImport } from './import.ts';
export type { Imported, ImportNote } from './import.ts';

export type ExportFormat = DocExportFormat;

/** A refused export or import: `status` for the HTTP answer, `code` for the page's message and the CLI's. */
export class DocTransferError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** The file an export makes. */
export interface DocExportFile {
  name: string;
  mime: string;
  bytes: Buffer;
  notes: ExportNote[];
  pages?: number;
}

/** The store's codes for something that isn't there. */
const MISSING = new Set(['NOT_A_DOC', 'NO_TAB', 'NO_VERSION']);

/** A refusal of the exporters, importers or store as a transfer error; anything else as it is. */
function transferError(error: unknown): unknown {
  if (error instanceof ExportRefusal || error instanceof ImportRefusal) return new DocTransferError(error.status, error.code, error.message);
  if (error instanceof StoreError) return new DocTransferError(MISSING.has(error.code) ? 404 : 409, error.code.toLowerCase(), error.message);
  return error;
}

/** The request a query names: `format` (markdown, docx, pdf or html; markdown when absent), `tab`, `paper`. */
function exportRequestOf(query: URLSearchParams): ExportRequest {
  const format = query.get('format') ?? 'markdown';
  const paper = query.get('paper') ?? undefined;
  if (!isExportFormat(format)) throw new DocTransferError(400, 'bad_format', `No export as ${format}.`);
  if (paper !== undefined && !isPaper(paper)) throw new DocTransferError(400, 'bad_paper', `No paper called ${paper}: a4 or letter.`);
  const tab = query.get('tab') ?? undefined;
  return { format, ...(tab ? { tab } : {}), ...(paper ? { paper } : {}) };
}

/**
 * The doc, or one tab of it, as a file. `query` is the export route's (`format`, `tab` by id or name, `paper`), or the
 * request itself.
 */
export async function exportDocFile(store: DocStore, owner: DocPerson, query: URLSearchParams | ExportRequest): Promise<DocExportFile> {
  const request = query instanceof URLSearchParams ? exportRequestOf(query) : query;
  let file: ExportFile;
  try {
    file = await exportFile(store, owner, request);
  } catch (error) {
    throw transferError(error);
  }
  return { name: file.name, mime: file.mime, bytes: file.bytes, notes: file.notes, ...(file.pages ? { pages: file.pages } : {}) };
}

/** Refuses what is not a file to read at all: nothing, or more than an import takes. */
function checkSize(bytes: Uint8Array): void {
  if (!bytes.length) throw new DocTransferError(400, 'empty', 'The file is empty.');
  if (bytes.length > IMPORT_MAX_BYTES) throw new DocTransferError(413, 'too_large', `The file is over ${IMPORT_MAX_BYTES / 1024 / 1024} MB.`);
}

/** A failure that is not a refusal: the file broke a reader. */
const readFailure = (error: unknown) => new DocTransferError(500, 'import_failed', `This file couldn't be read: ${(error as Error).message}`);

/** A file read and added to the open doc as new tabs, announced to the pages as the person's. */
async function importThroughHost(host: DocHost, name: string, tabName: string | undefined, bytes: Uint8Array): Promise<DocImportResponse> {
  checkSize(bytes);
  try {
    const imported = await readImport(name, bytes);
    const { answer, changes } = importIntoDoc(host.store, imported, { tabName, bytes: bytes.length });
    host.announce(changes, { by: 'person' });
    return answer;
  } catch (error) {
    const refused = transferError(error);
    throw refused instanceof DocTransferError ? refused : readFailure(error);
  }
}

/**
 * `query`: `name`, the file's name (required: markdown and text are told by it), and `tabName`, the new tab's name when
 * the file makes one. Imports .md/.markdown/.txt, .docx and .pdf as new tabs after the last.
 */
export async function importDocFile(host: DocHost, query: URLSearchParams, bytes: Buffer): Promise<DocImportResponse> {
  const name = query.get('name')?.trim();
  if (!name) throw new DocTransferError(400, 'bad_request', 'Name the file: ?name=<file name>.');
  return importThroughHost(host, name, query.get('tabName') ?? undefined, bytes);
}

export interface ImportContext {
  /** The artifact folder; the doc is in its `doc/`. */
  root: string;
  owner: DocPerson;
  /** The open doc, when the server holds one: the import goes through it and the pages hear of it. */
  host?: DocHost;
}

export interface ImportSource {
  /** Where the file is: a markdown file's own pictures are found beside it. */
  file: string;
  bytes: Uint8Array;
  /** The new tab's name in a doc; the new doc's name when there is none yet. */
  name?: string;
}

/**
 * A file on this computer into the artifact: new tabs of its doc (through the open host when there is one), or a new
 * doc when the folder holds none. A markdown file brings the pictures beside it that it names.
 */
export async function importIntoFolder(context: ImportContext, source: ImportSource): Promise<DocImportResponse> {
  const fileName = path.basename(source.file);
  // The file's own pictures travel with it: the readers see only these bytes.
  const bytes = /\.(md|markdown|mdown|mkd)$/i.test(fileName) ? inlineLocalImages(source.bytes, source.file) : source.bytes;
  if (context.host) return importThroughHost(context.host, fileName, source.name, bytes);
  checkSize(bytes);
  const dir = docDirOf(context.root);
  try {
    const imported = await readImport(fileName, bytes);
    if (isDocFolder(dir)) return importIntoDoc(DocStore.open(dir), imported, { tabName: source.name, bytes: bytes.length }).answer;
    const made = docFromImport(dir, imported, { name: source.name, bytes: bytes.length });
    return { ...made, created: { ...made.created, root: context.root } };
  } catch (error) {
    const refused = transferError(error);
    throw refused instanceof DocTransferError ? refused : readFailure(error);
  }
}
