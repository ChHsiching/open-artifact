/**
 * What the server knows of the Docs type beyond its store: the marker and a new doc's files, the check of a folder,
 * and the view context its page publishes.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type DiskDoc, docFromDisk, shapeProblems } from '@open-artifact/docs-core';
import type { CheckFinding } from '../types.ts';
import { DOC_DIR, DOC_FORMAT, MANIFEST_FILE, type Manifest, TABS_DIR, scaffoldDoc } from './store.ts';

export const DOC_MARKER = MANIFEST_FILE;

/** The largest view context a page may publish, in bytes of JSON. */
const MAX_CONTEXT_BYTES = 64 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const scaffoldDocType = (title: string): Record<string, string> => scaffoldDoc(title.trim() || 'Untitled doc');

/** A doc's manifest and tab files (paths under `doc/`), the files its check reads. */
export function readDocFiles(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const dir = join(root, DOC_DIR);
  try {
    files.set(MANIFEST_FILE, readFileSync(join(dir, MANIFEST_FILE), 'utf8'));
  } catch {
    return files;
  }
  let names: string[] = [];
  try {
    names = readdirSync(join(dir, TABS_DIR)).filter((name) => name.endsWith('.json'));
  } catch {
    // No tabs folder: the check says so.
  }
  for (const name of names) {
    try {
      files.set(`${TABS_DIR}/${name}`, readFileSync(join(dir, TABS_DIR, name), 'utf8'));
    } catch {
      // Unreadable: reported as missing.
    }
  }
  return files;
}

/** Checks the manifest, that every tab it lists has a readable file, and that each tab's blocks fit the editor. */
export function checkDoc(files: ReadonlyMap<string, string>): CheckFinding[] {
  const findings: CheckFinding[] = [];
  const text = files.get(MANIFEST_FILE);
  if (text === undefined) return [{ file: MANIFEST_FILE, level: 'error', message: `There is no ${MANIFEST_FILE}: open the folder as a doc to start one.` }];
  let manifest: Manifest;
  try {
    manifest = JSON.parse(text) as Manifest;
  } catch (error) {
    return [{ file: MANIFEST_FILE, level: 'error', message: `${MANIFEST_FILE} is not JSON: ${(error as Error).message}` }];
  }
  if (!isRecord(manifest) || manifest.format !== DOC_FORMAT || !isRecord(manifest.tabs)) {
    return [{ file: MANIFEST_FILE, level: 'error', message: `${MANIFEST_FILE} is not a docs manifest (format "${DOC_FORMAT}", tabs).` }];
  }
  const tabs = Object.entries(manifest.tabs);
  if (tabs.length === 0) findings.push({ file: MANIFEST_FILE, level: 'error', message: 'The doc lists no tab; a doc keeps at least one.' });
  for (const [id, tab] of tabs) {
    const file = `${TABS_DIR}/${id}.json`;
    if (!isRecord(tab) || typeof tab.name !== 'string' || typeof tab.order !== 'string' || typeof tab.node !== 'string') {
      findings.push({ file: MANIFEST_FILE, level: 'error', message: `Tab ${id} needs a name, an order and a node.` });
      continue;
    }
    if (tab.subtabOf !== undefined && !manifest.tabs[tab.subtabOf]) findings.push({ file: MANIFEST_FILE, level: 'warning', message: `Tab ${id} sits under ${tab.subtabOf}, which is not a tab.` });
    const body = files.get(file);
    if (body === undefined) {
      findings.push({ file, level: 'error', message: `Tab "${tab.name}" has no content file.` });
      continue;
    }
    let disk: DiskDoc;
    try {
      disk = JSON.parse(body) as DiskDoc;
      if (!Number.isInteger(disk.rev) || !Array.isArray(disk.blocks)) throw new Error('it needs rev and blocks');
    } catch (error) {
      findings.push({ file, level: 'error', message: `Tab "${tab.name}" is not readable: ${(error as Error).message}` });
      continue;
    }
    let blocks;
    try {
      blocks = docFromDisk(disk).blocks;
    } catch (error) {
      findings.push({ file, level: 'error', message: `Tab "${tab.name}" holds a block the doc does not read: ${(error as Error).message}` });
      continue;
    }
    if (blocks.length === 0) findings.push({ file, level: 'error', message: `Tab "${tab.name}" holds no block; the editor needs at least one.` });
    for (const problem of shapeProblems(blocks)) findings.push({ file, level: 'error', message: problem.message });
  }
  return findings;
}

/** What the page publishes: a small record (tab, selection, what is on screen); plain objects only. */
export function validateDocContext(value: unknown): unknown {
  if (!isRecord(value)) return null;
  return JSON.stringify(value).length <= MAX_CONTEXT_BYTES ? value : null;
}
