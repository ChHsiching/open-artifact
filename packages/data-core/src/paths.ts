import { RESERVED_OBJECT_KEYS } from './text.ts';

export const DASH_COLLECTION = 'dash';
export const DASH_META_PATH = 'dash/meta';
export const DASH_PARAMS_PATH = 'dash/params';
export const DASH_LOOK_PATH = 'dash/look';
export const DASH_SETTINGS_PATH = 'dash/settings';
export const DATASETS_COLLECTION = 'datasets';
export const FILES_COLLECTION = 'files';
export const DRAFTS_COLLECTION = 'drafts';
export const USER_DATA_COLLECTION = 'data/users';
/** The page's entry file, `files/index.html`. */
export const DASHBOARD_ENTRY_FILENAME = 'index.html';
export const DASHBOARD_ENTRY_PATH = `${FILES_COLLECTION}/${DASHBOARD_ENTRY_FILENAME}`;

/** The collections a draft keeps its documents in, in the order a save writes them. */
export const DRAFT_COLLECTIONS: readonly string[] = [DATASETS_COLLECTION, DASH_COLLECTION, FILES_COLLECTION];

export const DATASET_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const FILE_NAME_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/;
export const DRAFT_ID_PATTERN = /^[a-z0-9]{1,32}$/;
const SEGMENT_PATTERN = /^[^/]{1,256}$/;

/** The names of a person's own documents under `data/users/<uid>/`. */
export const USER_CHECK_DOCUMENT = 'check';
export const USER_RUNS_DOCUMENT = 'runs';
export const USER_PAGE_DOCUMENT = 'page';
export const USER_HISTORY_PREFIX = 'history-';

export function isValidDatasetId(value: unknown): value is string {
  return typeof value === 'string' && DATASET_ID_PATTERN.test(value) && !RESERVED_OBJECT_KEYS.has(value);
}

export function isValidDashboardFilename(value: unknown): value is string {
  return typeof value === 'string' && FILE_NAME_PATTERN.test(value) && !RESERVED_OBJECT_KEYS.has(value);
}

export function isValidDraftId(value: unknown): value is string {
  return typeof value === 'string' && DRAFT_ID_PATTERN.test(value);
}

/** The collection part of a document path (`datasets` of `datasets/sales`). */
export function getCollectionPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/** The last segment of a document path. */
export function getDocumentId(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export const datasetPath = (id: string): string => `${DATASETS_COLLECTION}/${id}`;
export const filePath = (name: string): string => `${FILES_COLLECTION}/${name}`;
export const draftHeadPath = (draftId: string): string => `${DRAFTS_COLLECTION}/${draftId}`;
/** A draft's copy of a dashboard document (`datasets/sales` → `drafts/<id>/datasets/sales`). */
export const draftDocumentPath = (draftId: string, path: string): string => `${DRAFTS_COLLECTION}/${draftId}/${path}`;
export const userDocumentPath = (uid: string, name: string): string => `${USER_DATA_COLLECTION}/${uid}/${name}`;
export const userCheckPath = (uid: string): string => userDocumentPath(uid, USER_CHECK_DOCUMENT);
export const userRunsPath = (uid: string): string => userDocumentPath(uid, USER_RUNS_DOCUMENT);
export const userPagePath = (uid: string): string => userDocumentPath(uid, USER_PAGE_DOCUMENT);
/** The filter history of one dataset for one person. */
export const userHistoryPath = (uid: string, datasetId: string): string =>
  userDocumentPath(uid, USER_HISTORY_PREFIX + datasetId);

/** A dashboard document a draft may hold: the filters, a dataset or a page file. */
export type DraftDocumentPath =
  | { kind: 'params' }
  | { kind: 'dataset'; id: string }
  | { kind: 'file'; name: string };

/** What a store path names. */
export type DataDocumentPath =
  | { kind: 'meta' }
  | { kind: 'params' }
  | { kind: 'look' }
  | { kind: 'settings' }
  | { kind: 'dataset'; id: string }
  | { kind: 'file'; name: string }
  | { kind: 'draft'; draftId: string }
  | { kind: 'draft-document'; draftId: string; path: string; document: DraftDocumentPath }
  | { kind: 'user-check'; uid: string }
  | { kind: 'user-runs'; uid: string }
  | { kind: 'user-page'; uid: string }
  | { kind: 'user-history'; uid: string; datasetId: string }
  | { kind: 'user-other'; uid: string; name: string };

/** The dashboard document a path names, as a draft may hold it; `null` for any other path. */
export function parseDraftDocumentPath(path: string): DraftDocumentPath | null {
  if (path === DASH_PARAMS_PATH) return { kind: 'params' };
  const collection = getCollectionPath(path);
  const id = getDocumentId(path);
  if (collection === DATASETS_COLLECTION && isValidDatasetId(id)) return { kind: 'dataset', id };
  if (collection === FILES_COLLECTION && isValidDashboardFilename(id)) return { kind: 'file', name: id };
  return null;
}

/** Whether a path is one of the documents a draft keeps (`dash/params`, `datasets/<id>`, `files/<name>`). */
export function isDraftDocumentPath(path: string): boolean {
  return parseDraftDocumentPath(path) !== null;
}

/** What a store path (without `db/`) names, or `null` for a path the Data type doesn't read. */
export function parseDataPath(path: string): DataDocumentPath | null {
  switch (path) {
    case DASH_META_PATH:
      return { kind: 'meta' };
    case DASH_PARAMS_PATH:
      return { kind: 'params' };
    case DASH_LOOK_PATH:
      return { kind: 'look' };
    case DASH_SETTINGS_PATH:
      return { kind: 'settings' };
  }
  const parts = path.split('/');
  const [top, second, ...rest] = parts;
  if (top === undefined || second === undefined || !parts.every((part) => SEGMENT_PATTERN.test(part))) return null;
  if (parts.length === 2) {
    if (top === DATASETS_COLLECTION) return isValidDatasetId(second) ? { kind: 'dataset', id: second } : null;
    if (top === FILES_COLLECTION) return isValidDashboardFilename(second) ? { kind: 'file', name: second } : null;
    if (top === DRAFTS_COLLECTION) return isValidDraftId(second) ? { kind: 'draft', draftId: second } : null;
    return null;
  }
  if (top === DRAFTS_COLLECTION && isValidDraftId(second)) {
    const inner = rest.join('/');
    const document = parseDraftDocumentPath(inner);
    return document === null ? null : { kind: 'draft-document', draftId: second, path: inner, document };
  }
  if (top === 'data' && second === 'users' && rest.length === 2) {
    const [uid, name] = rest as [string, string];
    if (name === USER_CHECK_DOCUMENT) return { kind: 'user-check', uid };
    if (name === USER_RUNS_DOCUMENT) return { kind: 'user-runs', uid };
    if (name === USER_PAGE_DOCUMENT) return { kind: 'user-page', uid };
    if (name.startsWith(USER_HISTORY_PREFIX)) {
      const datasetId = name.slice(USER_HISTORY_PREFIX.length);
      if (isValidDatasetId(datasetId)) return { kind: 'user-history', uid, datasetId };
    }
    return { kind: 'user-other', uid, name };
  }
  return null;
}

