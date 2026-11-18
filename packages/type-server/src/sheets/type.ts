/**
 * What the server knows of the Sheets type beyond its store: the marker and a new Sheet's files, the check of a
 * folder, and the view context its page publishes.
 */

import { randomUUID } from 'node:crypto';
import { isObject } from '@open-artifact/sheets-core';
import type { CheckFinding } from '../types.ts';
import { DEFAULT_TITLE, EDITS_FILE, META_FILE } from './store.ts';

export const SHEET_MARKER = META_FILE;

/** The largest view context a page may publish, in bytes of JSON. */
const MAX_CONTEXT_BYTES = 64 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A new Sheet's files under `sheet/`: its meta alone (the page adds the first sheet when it opens). */
export function scaffoldSheet(title: string): Record<string, string> {
  const meta = { id: randomUUID(), createdAt: new Date().toISOString(), title: title.trim() || DEFAULT_TITLE };
  return { [META_FILE]: `${JSON.stringify(meta, null, 2)}\n` };
}

/** Checks a Sheet's meta and that its edit log reads to the end. */
export function checkSheet(files: ReadonlyMap<string, string>): CheckFinding[] {
  const findings: CheckFinding[] = [];
  const metaText = files.get(META_FILE);
  if (metaText === undefined) {
    findings.push({ file: META_FILE, level: 'error', message: `There is no ${META_FILE}: open the folder as a Sheet to start one.` });
  } else {
    let meta: unknown;
    try {
      meta = JSON.parse(metaText);
    } catch (error) {
      findings.push({ file: META_FILE, level: 'error', message: `${META_FILE} is not JSON: ${(error as Error).message}` });
    }
    if (meta !== undefined && (!isObject(meta) || typeof meta.id !== 'string' || !UUID.test(meta.id))) {
      findings.push({ file: META_FILE, level: 'error', message: `${META_FILE} needs an "id" that is a UUID.` });
    }
  }
  const log = files.get(EDITS_FILE);
  if (log === undefined) return findings;
  const lines = log.split('\n');
  let revision = 0;
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    const last = index === lines.length - 1;
    let edit: unknown;
    try {
      edit = JSON.parse(line);
    } catch {
      findings.push({
        file: EDITS_FILE,
        level: last ? 'warning' : 'error',
        line: index + 1,
        message: last ? 'The last line is cut short; it is left out until it is whole.' : 'This line is not JSON: the Sheet stops at the line before it.',
      });
      break;
    }
    if (!isObject(edit) || edit.revision !== revision + 1 || !Array.isArray(edit.ops)) {
      findings.push({ file: EDITS_FILE, level: 'error', line: index + 1, message: `This line is not edit ${revision + 1}: the Sheet stops at the line before it.` });
      break;
    }
    revision += 1;
  }
  return findings;
}

/** The view context a Sheet's page publishes: a plain object of modest size, or `null` to discard it. */
export function validateSheetContext(value: unknown): unknown {
  if (!isObject(value)) return null;
  return JSON.stringify(value).length <= MAX_CONTEXT_BYTES ? value : null;
}
