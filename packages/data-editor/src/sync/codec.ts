/**
 * How the dashboard's store documents map to the live value: the value is
 * the documents themselves (by path), from the collections the page reads,
 * this viewer's own folder under `data/users/<uid>/` included.
 */

import { DASH_COLLECTION, DASH_META_PATH, DATASETS_COLLECTION, FILES_COLLECTION, USER_DATA_COLLECTION, type UnknownRecord } from '@open-artifact/data-core';
import type { LiveCodec } from '@open-artifact/live-store';
import { jsonValueDepth } from '@open-artifact/live-store/json';
import { DB_LIMITS } from '@open-artifact/runtime/capabilities';

/** Documents by store path. */
export type DataDocuments = ReadonlyMap<string, UnknownRecord>;

/** The collection of this viewer's own documents. */
export function ownCollection(viewerId: string): string {
  return `${USER_DATA_COLLECTION}/${viewerId}`;
}

/** The collections the page keeps live, in write order. */
export function dataCollections(viewerId: string): string[] {
  return [DATASETS_COLLECTION, FILES_COLLECTION, DASH_COLLECTION, ownCollection(viewerId)];
}

/** Why the store would refuse a document, or `undefined`. */
export function refuseDataDocument(value: unknown): string | undefined {
  const bytes = new TextEncoder().encode(JSON.stringify(value) ?? '').length;
  if (bytes > DB_LIMITS.maxDocumentBytes) return `it is larger than ${Math.floor(DB_LIMITS.maxDocumentBytes / 1024)} KB`;
  if (jsonValueDepth(value, DB_LIMITS.maxDepth + 1) > DB_LIMITS.maxDepth) return `it nests deeper than ${DB_LIMITS.maxDepth} levels`;
  return undefined;
}

function sameDocuments(a: DataDocuments, b: DataDocuments): boolean {
  if (a.size !== b.size) return false;
  for (const [path, data] of a) if (b.get(path) !== data) return false;
  return true;
}

/** The live codec of a dashboard for one viewer. Documents keep `null` values, as the agent may store them. */
export function createDataLiveCodec(viewerId: string): LiveCodec<DataDocuments> {
  return {
    collections: dataCollections(viewerId),
    metaPath: DASH_META_PATH,
    keepsNulls: true,
    decompose: (value) => new Map(value),
    compose: (documents) => ({ value: new Map(documents) }),
    replaceOnly: () => false,
    refuse: (_path, value) => refuseDataDocument(value),
    share: (previous, next) => (sameDocuments(previous, next) ? previous : next),
  };
}
