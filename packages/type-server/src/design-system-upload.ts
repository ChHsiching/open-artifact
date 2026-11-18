import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assetGroupKey, assetKey, isAssetGroupName, normalizeSystemIndex, pathProblem } from '@open-artifact/design-system-core';
import type { StoredBlob } from './store.ts';

export function systemUploadLimit(name: string, mime: string): number {
  return (/\.svg$/i.test(name) || mime.split(';')[0] === 'image/svg+xml' ? 2 : 20) * 1024 * 1024;
}

/** The CLI and host action hand authors the same record to write into the index. */
export async function prepareSystemUpload(root: string, group: unknown, name: string, size: number) {
  if (typeof group !== 'string' || !group) throw new Error('MISSING_GROUP: pass a group for a design-system asset (--group on the command line).');
  if (!isAssetGroupName(group) || pathProblem(`assets/${group}/${name}`)) {
    throw new Error('INVALID_GROUP: choose a valid asset folder and file name.');
  }
  if (!/\.(png|jpe?g|gif|webp|svg|mp4|webm|pdf|woff2?|ttf|otf)$/i.test(name)) throw new Error('UNSUPPORTED_TYPE: write text files directly under project/.');
  const limit = systemUploadLimit(name, '');
  if (!size || size > limit) throw new Error(`Choose a non-empty file no larger than ${limit / 1024 / 1024} MiB.`);
  const index = normalizeSystemIndex(JSON.parse(await readFile(join(root, 'project/design-system.json'), 'utf8')));
  return assetGroupKey(index.assetGroups, group);
}

export function groupUploadRecord(group: string, groupKey: string, name: string, blob: StoredBlob) {
  const key = assetKey(name);
  return {
    url: `/_blob/${blob.id}`,
    id: blob.id,
    bytes: blob.size,
    contentType: blob.contentType,
    record: { name, blob: blob.id, size: blob.size, type: blob.contentType },
    indexPath: ['assetGroups', groupKey, 'files', key],
    shownAs: `assets/${group}/${name}`,
    next: `Add the record at assetGroups[${JSON.stringify(groupKey)}].files[${JSON.stringify(key)}] and its name to the group's order in project/design-system.json. Add the group to groups if missing. Write the index last.`,
  };
}
