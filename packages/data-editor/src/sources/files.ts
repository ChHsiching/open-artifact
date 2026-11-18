/** The file editor's checks: reading a picked file, parsing the edited text, and the columns a replacement loses. */

import { parseDataFileTable, parseFileAnswer, type DataFileFormat, type Table } from '@open-artifact/data-core';
import { NO_READABLE_ROWS } from '../data/files.ts';
import { describeLoadFailure } from '../data/status.ts';
import { formatResultFileSize } from './result.ts';
import { NOT_SAVED_LABEL } from './words.ts';

/** Files larger than this (512 KB) aren't edited as text; they can only be replaced. */
export const MAX_EDITABLE_FILE_BYTES = 524_288;

export const DATA_FILE_ACCEPT =
  '.csv,.tsv,.tab,.json,.geojson,text/csv,text/tab-separated-values,application/json,application/geo+json';

export const DATA_FILE_FORMAT_LABELS: Readonly<Record<DataFileFormat, string>> = {
  csv: 'CSV',
  tsv: 'TSV',
  json: 'JSON',
  text: 'Text',
};

/** What a text that has no rows parses to (a text file, or a value a loader reads): saving it says "Saved". */
export const EMPTY_EDITED_TABLE: Table = Object.freeze({ columns: [], rows: [] }) as unknown as Table;

/** A data file as the file editor holds it (`bytes` is its UTF-8 size; `file` is a picked file as it is). */
export interface EditedDataFile {
  name: string;
  format: DataFileFormat;
  text: string;
  bytes: number;
  file?: Blob;
}

/** What the file save stores: the text, or a picked file as it is. */
export interface SavedDataFile {
  body: string | Blob;
  name: string;
  format: DataFileFormat;
}

export type FileEditPhase = 'idle' | 'saving' | { warn: string[] } | { error: string };

export type ReadDataFile = { text: string } | { problem: 'notUtf8' | 'unread' };

/** The text of a picked data file, or why it can't be read: not UTF-8 (the one encoding the page reads), or unreadable. */
export async function readDataFileText(file: Blob): Promise<ReadDataFile> {
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { problem: 'unread' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer) };
  } catch (error) {
    return { problem: error instanceof TypeError ? 'notUtf8' : 'unread' };
  }
}

/** The edited text's rows, or why it has none. A loader takes the text as it is; a text without rows parses to no rows. */
export function parseEditedFileText(text: string, format: DataFileFormat, hasLoader: boolean): { table: Table } | { problem: string } {
  const answer = hasLoader ? { value: text } : parseFileAnswer(text, format);
  if (answer === null) return { problem: describeLoadFailure(NO_READABLE_ROWS) };
  return { table: 'table' in answer ? answer.table : EMPTY_EDITED_TABLE };
}

/** The stored file's columns the new rows don't have. */
export function findLostColumns(stored: Pick<EditedDataFile, 'text' | 'format'>, table: Table): string[] {
  const before = parseDataFileTable(stored.text, stored.format);
  return before === null ? [] : before.columns.filter((column) => !table.columns.includes(column));
}

/** "sales.csv · CSV · 12 KB · not saved". */
export function describeFileNote(name: string, format: DataFileFormat, bytes: number | null, replaced: boolean): string {
  return [name, DATA_FILE_FORMAT_LABELS[format], bytes === null ? '' : formatResultFileSize(bytes), replaced ? NOT_SAVED_LABEL : '']
    .filter((part) => part !== '')
    .join(' · ');
}

export function isEditableFile(file: Pick<EditedDataFile, 'bytes'> | null): boolean {
  return file !== null && file.bytes <= MAX_EDITABLE_FILE_BYTES;
}
