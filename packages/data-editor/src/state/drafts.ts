/**
 * The `drafts` collection: every draft head (`drafts/<id>`) and the
 * documents of the draft being followed (`drafts/<id>/{datasets,dash,files}`).
 *
 * Drafts are not part of the live dashboard, so they are read and written
 * through the session's store directly. The host does not echo this page's
 * own writes, so each write updates the state here as well.
 */

import { create } from 'zustand';
import type { DbCapability, DbDocument, JsonRecord } from '@open-artifact/runtime';
import {
  DRAFT_COLLECTIONS,
  DRAFTS_COLLECTION,
  draftDocumentPath,
  draftHasPage,
  draftHeadPath,
  parseDataPath,
  parseDraftHead,
  toDraftHeadRecord,
  type DraftDocs,
  type DraftHead,
  type UnknownRecord,
} from '@open-artifact/data-core';
import { maybeSession } from '../services/session.ts';

export interface DraftsState {
  /** Every draft head, parsed (unreadable ones left out). */
  heads: DraftHead[];
  /** The heads were listed at least once. */
  loaded: boolean;
  /** The draft whose documents are followed. */
  id: string | null;
  /** Its documents by path under `drafts/<id>/` (`files/index.html`, `datasets/sales`, `dash/params`). */
  docs: DraftDocs;
  /** Its documents were listed at least once. */
  heard: boolean;
}

const EMPTY_DOCS: DraftDocs = new Map();

export const useDrafts = create<DraftsState>()(() => ({ heads: [], loaded: false, id: null, docs: EMPTY_DOCS, heard: false }));

/** Waits between failed listings, ms. */
export const DRAFTS_RETRY_MS: readonly number[] = [2000, 4000, 8000, 15000, 30000];

function db(): DbCapability | null {
  return maybeSession()?.db ?? null;
}

function draftPrefix(id: string): string {
  return `${DRAFTS_COLLECTION}/${id}/`;
}

function sortHeads(heads: DraftHead[]): DraftHead[] {
  return heads.sort((left, right) => left.at - right.at || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function headsFrom(documents: readonly DbDocument[]): DraftHead[] {
  return sortHeads(
    documents.flatMap((document) => {
      const parsed = parseDataPath(document.path);
      if (parsed?.kind !== 'draft') return [];
      const head = parseDraftHead(parsed.draftId, document.data);
      return head === null ? [] : [head];
    }),
  );
}

function putHead(head: DraftHead | null, id: string): void {
  const heads = useDrafts.getState().heads.filter((item) => item.id !== id);
  useDrafts.setState({ heads: sortHeads(head === null ? heads : [...heads, head]) });
}

async function listDraftDocs(store: DbCapability, id: string): Promise<DraftDocs> {
  const prefix = draftPrefix(id);
  const lists = await Promise.all(DRAFT_COLLECTIONS.map((collection) => store.list(prefix + collection)));
  const docs: DraftDocs = new Map();
  for (const document of lists.flat()) {
    if (document.path.startsWith(prefix)) docs.set(document.path.slice(prefix.length), document.data as UnknownRecord);
  }
  return docs;
}

let followRequest = 0;

/** Follows the documents of draft `id` (`null`: none). */
export function followDraft(id: string | null): void {
  if (useDrafts.getState().id === id) return;
  const request = ++followRequest;
  useDrafts.setState({ id, docs: EMPTY_DOCS, heard: false });
  const store = db();
  if (id === null || store === null) return;
  let attempt = 0;
  const load = (): void => {
    listDraftDocs(store, id).then(
      (docs) => {
        if (request === followRequest) useDrafts.setState({ docs, heard: true });
      },
      () => {
        if (request !== followRequest) return;
        setTimeout(load, DRAFTS_RETRY_MS[Math.min(attempt++, DRAFTS_RETRY_MS.length - 1)]);
      },
    );
  };
  load();
}

/** Reads draft `id`'s documents fresh; `null` when they could not be read. */
export async function readDraft(id: string): Promise<DraftDocs | null> {
  const store = db();
  if (store === null) return null;
  try {
    return await listDraftDocs(store, id);
  } catch {
    return null;
  }
}

/** Writes a new draft head; false when the store refused it. */
export async function beginDraft(head: DraftHead): Promise<boolean> {
  const store = db();
  if (store === null) return false;
  try {
    await store.write([{ op: 'set', path: draftHeadPath(head.id), data: toDraftHeadRecord(head) as unknown as JsonRecord, ifMatch: null }]);
    putHead(head, head.id);
    return true;
  } catch {
    return false;
  }
}

/** Marks draft `id` saved, so every page stops offering it. */
export async function markDraftSaved(id: string): Promise<boolean> {
  const store = db();
  if (store === null) return false;
  try {
    await store.write([{ op: 'update', path: draftHeadPath(id), patch: { saved: true } }]);
    const head = useDrafts.getState().heads.find((item) => item.id === id);
    if (head !== undefined) putHead({ ...head, saved: true }, id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes drafts: each head and its documents, in one batch. With `bareOnly`,
 * a draft that has a page is kept (and the result is false). True when every
 * draft is gone.
 */
export async function dropDrafts(ids: readonly string[], bareOnly = false): Promise<boolean> {
  const store = db();
  if (store === null || ids.length === 0) return ids.length === 0;
  try {
    const found = await Promise.all(ids.map(async (id) => [id, await listDraftDocs(store, id)] as const));
    const dropped = found.filter(([, docs]) => !bareOnly || !draftHasPage(docs));
    if (dropped.length > 0) {
      await store.write(
        dropped.flatMap(([id, docs]) => [
          ...[...docs.keys()].map((path) => ({ op: 'delete' as const, path: draftDocumentPath(id, path) })),
          { op: 'delete' as const, path: draftHeadPath(id) },
        ]),
      );
      const gone = new Set(dropped.map(([id]) => id));
      useDrafts.setState((state) => ({
        heads: state.heads.filter((head) => !gone.has(head.id)),
        ...(state.id !== null && gone.has(state.id) ? { docs: EMPTY_DOCS } : {}),
      }));
    }
    return dropped.length === ids.length;
  } catch {
    return false;
  }
}

/** Lists the heads and follows changes to drafts. Returns a stop function. */
export function startDrafts(): () => void {
  const store = db();
  if (store === null) return () => {};
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const list = (): void => {
    store.list(DRAFTS_COLLECTION).then(
      (documents) => {
        if (!stopped) useDrafts.setState({ heads: headsFrom(documents), loaded: true });
      },
      () => {
        if (!stopped) timer = setTimeout(list, DRAFTS_RETRY_MS[Math.min(attempt++, DRAFTS_RETRY_MS.length - 1)]);
      },
    );
  };
  list();
  const off = store.onChange(({ changes }) => {
    let docs: DraftDocs | null = null;
    const { id } = useDrafts.getState();
    for (const [path, data] of Object.entries(changes)) {
      const parsed = parseDataPath(path);
      if (parsed?.kind === 'draft') putHead(data === null ? null : parseDraftHead(parsed.draftId, data), parsed.draftId);
      else if (parsed?.kind === 'draft-document' && parsed.draftId === id) {
        docs ??= new Map(useDrafts.getState().docs);
        if (data === null) docs.delete(parsed.path);
        else docs.set(parsed.path, data as UnknownRecord);
      }
    }
    if (docs !== null) useDrafts.setState({ docs });
  });
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    off();
    followRequest++;
    useDrafts.setState({ heads: [], loaded: false, id: null, docs: EMPTY_DOCS, heard: false });
  };
}
