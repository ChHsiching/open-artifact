/**
 * The page's patch convention for store documents: records merge deeply,
 * `DELETE_FIELD` removes a field, and every other value (`null` and arrays
 * included) is stored as given.
 */

import type { UnknownRecord } from '@open-artifact/data-core';

/** True for the `DELETE_FIELD` marker (`{__delete__: true}`). */
export function isDeleteField(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as UnknownRecord).__delete__ === true && Object.keys(value).length === 1;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A patch applied to a document; the document itself is not changed. */
export function applyStorePatch(base: UnknownRecord | undefined, patch: UnknownRecord): UnknownRecord {
  const result: UnknownRecord = { ...(base ?? {}) };
  for (const key of Object.keys(patch)) {
    if (key === '__proto__') continue;
    const value = patch[key];
    if (value === undefined) continue;
    if (isDeleteField(value)) delete result[key];
    else if (isRecord(value)) {
      const held = result[key];
      result[key] = applyStorePatch(isRecord(held) ? held : undefined, value);
    } else result[key] = value;
  }
  return result;
}

/** A patch with its `DELETE_FIELD` markers dropped: the document a patch makes from nothing. */
export function stripDeleteFields(patch: UnknownRecord): UnknownRecord {
  return applyStorePatch(undefined, patch);
}
