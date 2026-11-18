/**
 * A doc's images on disk. They are the artifact's uploads: `<artifact>/_blobs/<id>.<ext>`, the id the first 32 hex
 * digits of the bytes' SHA-256 (as ArtifactStore names its uploads), the extension from the picture's own header. A
 * `media` atom names one as `blob/<id>`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BLOB_ID, blobRef, imageInfo } from '@open-artifact/docs-core';
import { extensionOf } from '../http.ts';
import { sha256 } from '../store.ts';

export const BLOBS_DIR = '_blobs';

export const blobIdOf = (bytes: Uint8Array): string => sha256(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)).slice(0, 32);

/** The stored file of a blob id, whatever its extension; null when there is none. */
function blobFile(artifactRoot: string, id: string): string | null {
  if (!BLOB_ID.test(id)) return null;
  let names: string[];
  try {
    names = fs.readdirSync(path.join(artifactRoot, BLOBS_DIR));
  } catch {
    return null;
  }
  const name = names.find((entry) => entry.startsWith(`${id}.`) && !entry.endsWith('.tmp'));
  return name ? path.join(artifactRoot, BLOBS_DIR, name) : null;
}

/** Stores the bytes once (the same bytes are the same blob) and answers their `blob/<id>`. */
export function putDocBlob(artifactRoot: string, bytes: Uint8Array): string {
  const id = blobIdOf(bytes);
  if (blobFile(artifactRoot, id)) return blobRef(id);
  const dir = path.join(artifactRoot, BLOBS_DIR);
  const mime = imageInfo(bytes)?.mime ?? 'application/octet-stream';
  const file = path.join(dir, `${id}.${extensionOf(mime)}`);
  fs.mkdirSync(dir, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, file);
  return blobRef(id);
}

/** The bytes of `blob/<id>` (or a bare id); null when the artifact holds none. */
export function readDocBlob(artifactRoot: string, ref: string): Buffer | null {
  const file = blobFile(artifactRoot, ref.replace(/^blob\//, ''));
  if (!file) return null;
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}
