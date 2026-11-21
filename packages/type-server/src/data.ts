/**
 * The Data type as the server sees it: a db-backed type whose content is the
 * documents under `db/` (see `@open-artifact/data-core`).
 *
 * ```
 * db/dash/meta.json          {title, lang}                 the marker
 * db/dash/{params,look,settings}.json
 * db/datasets/<id>.json      one dataset each
 * db/files/<name>.json       {text}: index.html and the page's other files
 * db/drafts/<id>/…           drafts and remixes
 * db/data/users/<uid>/…      each person's own documents (check, runs, page…)
 * comments.json              review threads
 * ```
 */

import {
  DATASETS_COLLECTION,
  DASH_META_PATH,
  FILES_COLLECTION,
  USER_DATA_COLLECTION,
  checkDataProject,
  dataHistoryIgnores,
  isInViewerFolder,
  isValidDashboardFilename,
  isValidDatasetId,
  scaffoldDataProject,
  validateDataViewContext,
  type DataCheckContext,
} from '@open-artifact/data-core';
import { DOC_MAX_BYTES, mergePatch, splitPath } from '@open-artifact/server-sdk/db';
import type { CheckFinding, WriteRefusal } from './types.ts';

/** The marker file, relative to the content folder (`db/`). */
export const DATA_MARKER = `${DASH_META_PATH}.json`;

/** Files of a new data artifact, relative to `db/`. */
export function scaffoldData(title: string): Record<string, string> {
  return Object.fromEntries(Object.entries(scaffoldDataProject(title)).map(([path, text]) => [`${path}.json`, text]));
}

export const validateDataContext = (value: unknown): unknown => validateDataViewContext(value);

export const dataHistoryIgnoresPath = (path: string): boolean => dataHistoryIgnores(path);

/** A commenter of a share link writes only their own folder, `data/users/<their id>/…` (their saved rows and reports). */
export const dataCommenterWrites = (path: string, guestId: string): boolean => isInViewerFolder(path, guestId);

/** Checks a data artifact. `files` maps document paths (`datasets/sales`) to the raw JSON text on disk. */
export function checkData(files: ReadonlyMap<string, string>, context: DataCheckContext = {}): CheckFinding[] {
  return checkDataProject(files, context);
}

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a document would hold after one write, or `undefined` for a delete or a write the store reports itself. */
function writtenData(write: Record<string, unknown>, current: unknown): unknown {
  if (write.op === 'set') return write.data;
  if (write.op === 'update' && isPlain(write.data)) return mergePatch(current ?? {}, write.data);
  return undefined;
}

/**
 * Refuses an agent's batch that the page would drop part of: a dataset id or
 * file name it ignores, a page file without its text, or a person's own
 * document (`data/users/…`, written by the open page only).
 */
export function dataWritesProblem(writes: readonly unknown[], read: (path: string) => unknown): WriteRefusal | null {
  for (const [index, write] of writes.entries()) {
    if (!isPlain(write)) continue;
    const named = write.path ?? (write.collection != null && write.doc_id != null ? `${String(write.collection)}/${String(write.doc_id)}` : '');
    let segments: string[];
    try {
      segments = splitPath(String(named), 'doc');
    } catch {
      continue;
    }
    const path = segments.join('/');
    const where = `writes[${index}]`;
    if (path.startsWith(`${USER_DATA_COLLECTION}/`))
      return { code: 'READ_ONLY_PATH', message: `${where}: ${path} is written by the open page; you only read it.` };
    if (segments.length !== 2) continue;
    const [collection, id] = segments as [string, string];
    if (collection === DATASETS_COLLECTION && !isValidDatasetId(id) && write.op !== 'delete')
      return { code: 'REFUSED', message: `${where}: datasets/${id}: a dataset id is 1–64 of A–Z a–z 0–9 _ - (the page ignores any other).` };
    if (collection !== FILES_COLLECTION || write.op === 'delete') continue;
    if (!isValidDashboardFilename(id))
      return { code: 'REFUSED', message: `${where}: files/${id}: a file name is letters, digits, _ - . (up to 64, no folders).` };
    const data = writtenData(write, read(path));
    if (data === undefined || !isPlain(data)) continue;
    if (typeof data.text !== 'string') return { code: 'REFUSED', message: `${where}: files/${id} needs {text}: the whole file as a string.` };
    const bytes = Buffer.byteLength(JSON.stringify(data));
    if (bytes > DOC_MAX_BYTES)
      return {
        code: 'TOO_LARGE',
        message: `${where}: files/${id} would be ${Math.ceil(bytes / 1024)} KB; the store refuses any document over 256 KB. Split it: a <script src> or <link href> naming another files/<name> loads it.`,
      };
  }
  return null;
}
