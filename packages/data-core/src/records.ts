import type { UnknownRecord } from './types.ts';
import { isPlainObject, sanitizeText } from './text.ts';
import {
  DASH_LOOK_PATH,
  DASH_META_PATH,
  DASH_PARAMS_PATH,
  DASH_SETTINGS_PATH,
  DATASETS_COLLECTION,
  FILES_COLLECTION,
  getCollectionPath,
  getDocumentId,
  isValidDashboardFilename,
  isValidDatasetId,
} from './paths.ts';

/** The marker an `update` patch uses for a field to remove. */
export const DELETE_FIELD: Readonly<{ __delete__: true }> = Object.freeze({ __delete__: true });

/** The dashboard's documents gathered into the shape `parseDashboardContent` reads. */
export interface ComposedDashboardDocuments {
  title: string;
  content: {
    meta: UnknownRecord | undefined;
    params: UnknownRecord | undefined;
    settings: UnknownRecord | undefined;
    look: UnknownRecord | undefined;
    datasets: Record<string, UnknownRecord>;
    files: Record<string, UnknownRecord>;
  };
}

/** A patch that turns `from` into `to`: fields `to` lacks become `DELETE_FIELD`, nested records are patched in turn. */
export function createDeleteFieldPatch(from: unknown, to: unknown): unknown {
  if (!isPlainObject(from) || !isPlainObject(to)) return to;
  const patch: UnknownRecord = {};
  for (const key of Object.keys(from)) if (!Object.hasOwn(to, key)) patch[key] = DELETE_FIELD;
  for (const key of Object.keys(to)) patch[key] = createDeleteFieldPatch(from[key], to[key]);
  return patch;
}

/** Store documents by path (`dash/meta`, `datasets/<id>`, `files/<name>` …) composed into the dashboard's parts. */
export function composeDashboardDocuments(documents: ReadonlyMap<string, UnknownRecord>): ComposedDashboardDocuments {
  const meta = documents.get(DASH_META_PATH);
  const datasets: [string, UnknownRecord][] = [];
  const files: [string, UnknownRecord][] = [];
  for (const [path, data] of documents) {
    const collection = getCollectionPath(path);
    const id = getDocumentId(path);
    if (collection === DATASETS_COLLECTION && isValidDatasetId(id)) datasets.push([id, data]);
    else if (collection === FILES_COLLECTION && isValidDashboardFilename(id)) files.push([id, data]);
  }
  return {
    title: sanitizeText(meta?.title),
    content: {
      meta,
      params: documents.get(DASH_PARAMS_PATH),
      settings: documents.get(DASH_SETTINGS_PATH),
      look: documents.get(DASH_LOOK_PATH),
      datasets: Object.fromEntries(datasets),
      files: Object.fromEntries(files),
    },
  };
}
