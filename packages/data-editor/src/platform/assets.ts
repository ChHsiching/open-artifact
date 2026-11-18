/**
 * Stored uploads: data files a dataset reads (`/_blob/<id>`), through the
 * `assets` capability.
 */

import { STORED_BLOB_PATH_PATTERN } from '@open-artifact/data-core';
import { maybeSession } from '../services/session.ts';
import { holdLeaveLosesWork } from '../sync/leave.ts';

/** A stored upload as the host returns it. */
export interface UploadedAsset {
  id: string;
  url: string;
}

/** Why nothing was stored: `unavailable` (no `assets` capability), `failed`, or the host's error code. */
export interface UploadRefusal {
  refused: string;
}

const BLOB_ID_PATTERN = /^[0-9a-f]{32}$/;

/** The stored url of an upload (`/_blob/<id>`), or `null` when it has none. */
export function resolveStoredAssetUrl(asset: UploadedAsset): string | null {
  if (STORED_BLOB_PATH_PATTERN.test(asset.url)) return asset.url.startsWith('/') ? asset.url : `/${asset.url}`;
  return BLOB_ID_PATTERN.test(asset.id) ? `/_blob/${asset.id}` : null;
}

/**
 * Uploads bytes. Unless `unseen`, leaving the page warns that work would
 * be lost until the upload ends.
 */
export async function uploadAsset(data: Blob, options: { name?: string; unseen?: boolean } = {}): Promise<UploadedAsset | UploadRefusal> {
  const assets = maybeSession()?.assets ?? null;
  if (assets === null) return { refused: 'unavailable' };
  const release = options.unseen === true ? undefined : holdLeaveLosesWork();
  try {
    const record = await assets.upload(data, options.name !== undefined ? { name: options.name } : {});
    return typeof record?.id === 'string' && typeof record.url === 'string' && record.url !== '' ? { id: record.id, url: record.url } : { refused: 'failed' };
  } catch (error) {
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    return { refused: typeof code === 'string' && code !== '' ? code : 'failed' };
  } finally {
    release?.();
  }
}

/**
 * Removing an upload: the `assets` capability has no delete, so uploads
 * stay until the agent removes them (`delete-asset`); this does nothing.
 */
export async function deleteAsset(_url: string): Promise<void> {}

/** Stores a data file: its stored url (`ref`), or why nothing was stored (`refused`). */
export async function uploadDatasetBlob(data: Blob, name?: string): Promise<{ ref: string } | UploadRefusal> {
  const stored = await uploadAsset(data, name !== undefined ? { name } : {});
  if ('refused' in stored) return stored;
  const ref = resolveStoredAssetUrl(stored);
  return ref === null ? { refused: 'failed' } : { ref };
}
