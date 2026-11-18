/**
 * The live dashboard document, free of the page: the shared live store
 * (`@open-artifact/live-store`) bound to the dashboard's documents, the
 * writes the page makes, and what the document state shows of a snapshot.
 *
 * Every write goes through the store: it shows at once, is debounced and
 * coalesced per document, retried with backoff while the store is out of
 * reach, and kept in the saved copy. A write's promise settles when the
 * store has it.
 */

import {
  DASH_SETTINGS_PATH,
  composeDashboardDocuments,
  datasetPath,
  filePath,
  isValidDashboardFilename,
  isValidDatasetId,
  parseDashboardContent,
  userDocumentPath,
  type DashboardContent,
  type DocumentEditStamp,
  type UnknownRecord,
} from '@open-artifact/data-core';
import {
  LIVE_MESSAGES,
  LiveWriteError,
  collectionOfPath,
  createLiveStore,
  isAccessError,
  type LiveCache,
  type LiveSnapshot,
  type LiveStore,
  type SyncErrorCode,
  type SyncTimers,
  type SyncTransport,
} from '@open-artifact/live-store';
import { createDataLiveCodec, dataCollections, ownCollection, type DataDocuments } from './codec.ts';
import { applyStorePatch } from './patch.ts';

/** Why a viewer without edit rights cannot write. */
export const READ_ONLY_REASON = 'Read-only. You can view live changes.';
/** Shown when the page could not reach its store at all. */
export const LIVE_SYNC_UNAVAILABLE = 'Live sync is unavailable here. Reload to retry.';

/** Options of {@link DataLiveDocument.writeFile}. */
export interface WriteFileOptions {
  /** Write only while the file is still this one (its `documentSha256`), or `null`: only while there is none. */
  ifMatch?: string | null;
}

export interface DataLiveDocumentOptions {
  transport: SyncTransport;
  /** The viewer's id: names the edit stamps and the `data/users/<id>/` folder. */
  viewerId: string;
  /** Viewers who may not edit never write. */
  readOnly?: boolean;
  cache?: LiveCache;
  timers?: SyncTimers;
  formatTime?: (epochMs: number) => string;
  /** Called for each local edit the store takes (the view context's edit count). */
  onEdit?: () => void;
}

/** The live dashboard and the writes the page makes to it. */
export interface DataLiveDocument {
  readonly store: LiveStore<DataDocuments>;
  readonly viewerId: string;
  /** Every live document by path (this viewer's own included). */
  documents(): DataDocuments;
  /** Merges a patch into `datasets/<id>` with this viewer's edit stamp (not for a change of `certifiedAs` alone). */
  writeDataset(id: string, patch: UnknownRecord): Promise<void>;
  /** Merges a patch into `dash/settings`. */
  writeSettings(patch: UnknownRecord): Promise<void>;
  /** Stores a page file's text with this viewer's edit stamp; with `ifMatch`, only while the file is unchanged. */
  writeFile(name: string, text: string, options?: WriteFileOptions): Promise<void>;
  /** Merges a patch into a document, creating it when absent (`DELETE_FIELD` removes a field). */
  mergeDocument(path: string, patch: UnknownRecord): Promise<void>;
  /** Replaces a document. */
  setDocument(path: string, value: UnknownRecord): Promise<void>;
  deleteDocument(path: string): Promise<void>;
  /** Replaces (or with `null` deletes) one of this viewer's own documents, `data/users/<uid>/<name>`. */
  writeOwnDocument(name: string, value: UnknownRecord | null): Promise<void>;
  /** Sends every waiting write now; resolves when nothing more can be sent. */
  flush(): Promise<void>;
  dispose(): void;
}

/** True when a patch only changes fields that carry no edit stamp. */
function isUnstampedPatch(patch: UnknownRecord): boolean {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((key) => key === 'certifiedAs');
}

/** Marks a write's promise handled, so a caller that does not wait on it leaves no unhandled rejection. */
function quiet(promise: Promise<void>): Promise<void> {
  promise.catch(() => undefined);
  return promise;
}

export function createDataLiveDocument(options: DataLiveDocumentOptions): DataLiveDocument {
  const { viewerId } = options;
  const collections = new Set(dataCollections(viewerId));
  const store = createLiveStore<DataDocuments>({
    transport: options.transport,
    codec: createDataLiveCodec(viewerId),
    initial: new Map(),
    ...(options.cache !== undefined ? { cache: options.cache } : {}),
    ...(options.readOnly !== undefined ? { readOnly: options.readOnly } : {}),
    ...(options.timers !== undefined ? { timers: options.timers } : {}),
    ...(options.formatTime !== undefined ? { formatTime: options.formatTime } : {}),
  });
  const now = (): number => (options.timers ?? { now: Date.now }).now();
  const stamp = (): DocumentEditStamp => ({ by: viewerId, byAt: now() });

  function refusedCommit(): LiveWriteError {
    const snapshot = store.getSnapshot();
    if (snapshot.readOnly) return new LiveWriteError(snapshot.lastError !== undefined && isAccessError(snapshot.lastError.code as SyncErrorCode) ? snapshot.lastError.code : 'readonly', snapshot.message);
    return new LiveWriteError('unavailable', snapshot.message);
  }

  function checkPath(path: string): LiveWriteError | undefined {
    return collections.has(collectionOfPath(path)) ? undefined : new LiveWriteError('invalid', `${path} is not a document this page writes.`, path);
  }

  /** Commits a change of one document: `next` gets its current value and returns the new one (`undefined` deletes). */
  function change(path: string, next: (current: UnknownRecord | undefined) => UnknownRecord | undefined): Promise<void> {
    const invalid = checkPath(path);
    if (invalid !== undefined) return quiet(Promise.reject(invalid));
    const documents = new Map(store.value());
    const value = next(documents.get(path));
    if (value === undefined) documents.delete(path);
    else documents.set(path, value);
    if (!store.commit(documents)) return quiet(Promise.reject(refusedCommit()));
    options.onEdit?.();
    return quiet(store.whenWritten([path]));
  }

  const mergeDocument = (path: string, patch: UnknownRecord): Promise<void> => change(path, (current) => applyStorePatch(current, patch));

  return {
    store,
    viewerId,
    documents: () => store.value(),
    writeDataset(id, patch) {
      if (!isValidDatasetId(id)) return quiet(Promise.reject(new LiveWriteError('invalid', `${id} is not a dataset id.`)));
      return mergeDocument(datasetPath(id), isUnstampedPatch(patch) ? patch : { ...patch, edit: stamp() });
    },
    writeSettings: (patch) => mergeDocument(DASH_SETTINGS_PATH, patch),
    writeFile(name, text, writeOptions = {}) {
      if (!isValidDashboardFilename(name)) return quiet(Promise.reject(new LiveWriteError('invalid', `${name} is not a page file name.`)));
      const path = filePath(name);
      const patch = { text, edit: stamp() };
      if (writeOptions.ifMatch === undefined) return mergeDocument(path, patch);
      const written = store.writeNow([{ op: 'update', path, patch, ifMatch: writeOptions.ifMatch }]);
      return quiet(written.then(() => options.onEdit?.()));
    },
    mergeDocument,
    setDocument: (path, value) => change(path, () => value),
    deleteDocument: (path) => change(path, () => undefined),
    writeOwnDocument(name, value) {
      const path = userDocumentPath(viewerId, name);
      return value === null ? change(path, () => undefined) : change(path, () => value);
    },
    flush: () => store.flush(),
    dispose: () => store.dispose(),
  };
}

/* -------------------------------------------------------------------------- */
/* The document state of a snapshot                                           */
/* -------------------------------------------------------------------------- */

/** What the page shows of the live document (see `state/document.ts`). */
export interface DocumentView {
  status: 'connecting' | 'ready' | 'offline' | 'unavailable';
  documents: ReadonlyMap<string, UnknownRecord>;
  ownDocuments: ReadonlyMap<string, UnknownRecord>;
  title: string;
  content: DashboardContent;
  canWrite: boolean;
  readOnlyReason: string | null;
  save: 'saved' | 'saving' | 'unsaved' | 'failed';
  saveError: string | null;
  saveMessage: string;
  saveHint: string | null;
  retryable: boolean;
  pending: number;
  refusal: string | null;
}

/** Splits the live documents into the shared ones and this viewer's own (by name). */
export function splitDocuments(documents: DataDocuments, viewerId: string): { shared: Map<string, UnknownRecord>; own: Map<string, UnknownRecord> } {
  const prefix = `${ownCollection(viewerId)}/`;
  const shared = new Map<string, UnknownRecord>();
  const own = new Map<string, UnknownRecord>();
  for (const [path, data] of documents) {
    if (path.startsWith(prefix)) own.set(path.slice(prefix.length), data);
    else shared.set(path, data);
  }
  return { shared, own };
}

function sameEntries(a: ReadonlyMap<string, UnknownRecord>, b: ReadonlyMap<string, UnknownRecord>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

function documentStatus(snapshot: LiveSnapshot<DataDocuments>): DocumentView['status'] {
  switch (snapshot.loadState) {
    case 'loading':
      return 'connecting';
    case 'cached':
      return 'offline';
    case 'failed':
      return snapshot.lastError !== undefined && snapshot.lastError.code !== 'refused' && isAccessError(snapshot.lastError.code) ? 'unavailable' : 'offline';
    default:
      return 'ready';
  }
}

function saveState(snapshot: LiveSnapshot<DataDocuments>): DocumentView['save'] {
  switch (snapshot.status) {
    case 'saving':
      return 'saving';
    case 'dirty':
    case 'offline':
      return 'unsaved';
    case 'cached':
      return snapshot.pending > 0 ? 'unsaved' : 'saved';
    case 'error':
      return snapshot.loadState === 'failed' ? 'saved' : 'failed';
    default:
      return 'saved';
  }
}

/**
 * Builds document views from snapshots, reusing the parsed content (and
 * the maps) while the documents behind them are unchanged.
 */
export function createDocumentViewer(viewerId: string, roleCanEdit: boolean): (snapshot: LiveSnapshot<DataDocuments>) => DocumentView {
  let lastValue: DataDocuments | undefined;
  let shared: ReadonlyMap<string, UnknownRecord> = new Map();
  let own: ReadonlyMap<string, UnknownRecord> = new Map();
  let title = '';
  let content: DashboardContent = parseDashboardContent(composeDashboardDocuments(new Map()).content);
  return (snapshot) => {
    if (snapshot.value !== lastValue) {
      lastValue = snapshot.value;
      const split = splitDocuments(snapshot.value, viewerId);
      if (!sameEntries(shared, split.shared)) {
        shared = split.shared;
        const composed = composeDashboardDocuments(shared);
        title = composed.title;
        content = parseDashboardContent(composed.content);
      }
      if (!sameEntries(own, split.own)) own = split.own;
    }
    const stopped = roleCanEdit && snapshot.readOnly;
    const status = documentStatus(snapshot);
    const save = saveState(snapshot);
    const failing = snapshot.status === 'error' || snapshot.status === 'offline';
    return {
      status,
      documents: shared,
      ownDocuments: own,
      title,
      content,
      canWrite: roleCanEdit && !snapshot.readOnly && status !== 'unavailable',
      readOnlyReason: !roleCanEdit ? READ_ONLY_REASON : stopped ? LIVE_MESSAGES.accessEnded : null,
      save,
      saveError: failing && snapshot.loadState !== 'failed' ? snapshot.message : null,
      saveMessage: snapshot.message,
      saveHint: snapshot.hint ?? null,
      retryable: snapshot.retryable,
      pending: snapshot.pending,
      refusal: snapshot.refusal ?? null,
    };
  };
}
