/**
 * Keeping an installed design system up to date (`ds-sync`, and the stale
 * copy note of `check`). A design or a deck holds a copy of each of its
 * design systems under `project/ds/<folder>/` and a `designSystems` record
 * in its index (`project/canvas.json`, `project/deck.json`) whose `artifact`
 * is where the copy came from. A copy never changes by itself, so when the
 * source system is edited the copy falls behind with no sign of it.
 *
 * Here the source is a folder on this machine: {@link compareSystems} lists
 * the copied files whose bytes differ from the source's, and
 * {@link syncSystems} copies them again and stamps the record's `copiedAt`.
 * Only files the copy already has are compared and copied: what to bring
 * over is the system README's call, made at install time.
 */

import { randomUUID } from 'node:crypto';
import { constants, copyFileSync, lstatSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { CheckFinding, TypeName } from './types.ts';

const FOLDER = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const MAX_FILES = 2000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const SYSTEM_INDEX = 'design-system.json';

/** The index file (under `project/`) that records a type's installed systems. */
export const SYSTEM_RECORD_INDEX: Partial<Record<TypeName, string>> = { design: 'canvas.json', slides: 'deck.json' };

/** One `designSystems` record. */
export interface SystemRecord {
  title: string;
  namespace: string;
  artifact: string;
  copiedAt?: string;
}

/** How one installed copy compares with its source. */
export interface SystemDiff {
  namespace: string;
  title: string;
  /** The source system's folder, when one was found. */
  source?: string;
  /** Why nothing was compared. */
  skipped?: string;
  /** Files whose bytes differ from the source's. */
  changed: string[];
  /** Files the source no longer has: they stay in the copy until someone removes them. */
  removed: string[];
  /** The copy has no folder at all. */
  missing?: boolean;
  /** When the record says it was copied. */
  copiedAt?: string;
}

/** One system after `ds-sync`. */
export interface SyncResult extends SystemDiff {
  copied: string[];
}

/** The index's `designSystems` entries that name a usable folder. */
export function readRecords(project: string, indexFile: string): SystemRecord[] {
  let index: unknown;
  try {
    index = JSON.parse(readFileSync(join(project, indexFile), 'utf8'));
  } catch {
    return [];
  }
  const list = (index as { designSystems?: unknown } | null)?.designSystems;
  const records = Array.isArray(list) ? list : list && typeof list === 'object' ? Object.values(list) : [];
  const out: SystemRecord[] = [];
  for (const raw of records) {
    const r = raw as { namespace?: unknown; title?: unknown; artifact?: unknown; copiedAt?: unknown } | null;
    if (typeof r?.namespace !== 'string' || !FOLDER.test(r.namespace)) continue;
    out.push({
      namespace: r.namespace,
      title: typeof r.title === 'string' ? r.title : r.namespace,
      artifact: typeof r.artifact === 'string' ? r.artifact : '',
      ...(typeof r.copiedAt === 'string' ? { copiedAt: r.copiedAt } : {}),
    });
  }
  return out;
}

/** A real file or folder, not a link: nothing outside the two folders is read or written. */
function plain(path: string, want: 'file' | 'dir'): boolean {
  try {
    const info = lstatSync(path);
    return !info.isSymbolicLink() && (want === 'file' ? info.isFile() : info.isDirectory());
  } catch {
    return false;
  }
}

/** Every file under `dir`, as `/`-separated paths below it. */
function walk(dir: string, prefix = '', out: string[] = []): string[] {
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    if (out.length >= MAX_FILES) break;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(dir, rel, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/** The folder a system keeps its files in (`<its root>/project`). */
const projectOf = (candidate: string): string => (candidate.endsWith('/project') || candidate.endsWith('\\project') ? candidate : join(candidate, 'project'));

/**
 * The source's `project/` folder. `artifact` is the system's folder as the
 * installing agent was given it: absolute, or relative to the folder it
 * worked in, which is not recorded. So the working directory, the artifact
 * folder and its parent are tried, then each folder further up; a guess
 * counts only when it holds a design system. A web address has no folder here.
 */
function sourceProject(artifact: string, root: string, from: string | undefined): { project?: string; reason?: string } {
  const given = from ?? artifact;
  if (!given) return { reason: 'the record names no source folder; pass --from <system folder>' };
  if (!from && /^[a-z][a-z0-9+.-]*:\/\//i.test(given)) return { reason: `its source is ${given}, which is not a folder on this machine; pass --from <system folder>` };
  const candidates = isAbsolute(given) ? [given] : [resolve(given), resolve(root, given), resolve(root, '..', given)];
  for (const candidate of candidates) {
    const project = projectOf(candidate);
    if (plain(join(project, SYSTEM_INDEX), 'file') || (from !== undefined && plain(project, 'dir'))) return { project };
  }
  if (!from && !isAbsolute(given)) {
    let dir = resolve(root, '..');
    for (let up = dirname(dir); up !== dir; up = dirname(dir)) {
      dir = up;
      const project = projectOf(resolve(dir, given));
      if (plain(join(project, SYSTEM_INDEX), 'file')) return { project };
    }
  }
  return { reason: `its source folder ${given} was not found${from ? '' : ` (tried from ${process.cwd()} and the folders above the artifact); pass --from <system folder>`}` };
}

/** One system: which of the copy's files differ from the source's. */
export function compareSystem(project: string, root: string, record: SystemRecord, from?: string): SystemDiff {
  const diff: SystemDiff = { namespace: record.namespace, title: record.title, changed: [], removed: [], ...(record.copiedAt ? { copiedAt: record.copiedAt } : {}) };
  const found = sourceProject(record.artifact, root, from);
  if (!found.project) return { ...diff, skipped: found.reason };
  diff.source = dirname(found.project);
  const copy = join(project, 'ds', record.namespace);
  if (!plain(project, 'dir') || !plain(join(project, 'ds'), 'dir') || !plain(copy, 'dir')) return { ...diff, missing: true };
  for (const rel of walk(copy)) {
    const mine = join(copy, rel);
    const theirs = join(found.project, rel);
    if (!plain(mine, 'file')) continue;
    const parents = rel.split('/').slice(0, -1);
    if (parents.some((_, i) => !plain(join(found.project!, ...parents.slice(0, i + 1)), 'dir')) || !plain(theirs, 'file')) {
      diff.removed.push(rel);
      continue;
    }
    const a = statSync(mine);
    const b = statSync(theirs);
    if (a.size > MAX_FILE_BYTES || b.size > MAX_FILE_BYTES) continue;
    if (a.size !== b.size || !readFileSync(mine).equals(readFileSync(theirs))) diff.changed.push(rel);
  }
  return diff;
}

/** Every record, or the one of `namespace`. */
export function compareSystems(project: string, root: string, indexFile: string, namespace?: string, from?: string): SystemDiff[] {
  const records = readRecords(project, indexFile);
  if (namespace !== undefined) {
    const one = records.filter((r) => r.namespace === namespace);
    if (one.length === 0) {
      const names = records.map((r) => r.namespace);
      throw new Error(`No designSystems record has namespace ${JSON.stringify(namespace)}${names.length ? ` (it has: ${names.join(', ')})` : ' (it has none)'}.`);
    }
    return one.map((r) => compareSystem(project, root, r, from));
  }
  return records.map((r) => compareSystem(project, root, r, from));
}

/**
 * A warning for each installed copy that has fallen behind its source (for
 * `check`). Nothing for a source that cannot be found.
 */
export function staleCopyFindings(root: string, type: TypeName): CheckFinding[] {
  const indexFile = SYSTEM_RECORD_INDEX[type];
  if (!indexFile) return [];
  const findings: CheckFinding[] = [];
  for (const diff of compareSystems(join(root, 'project'), root, indexFile)) {
    if (diff.changed.length === 0 && diff.removed.length === 0) continue;
    const parts: string[] = [];
    if (diff.changed.length) parts.push(`${diff.changed.length} changed (${diff.changed.slice(0, 3).join(', ')}${diff.changed.length > 3 ? ', …' : ''})`);
    if (diff.removed.length) parts.push(`${diff.removed.length} gone from the source`);
    findings.push({
      file: `ds/${diff.namespace}/`,
      level: 'warning',
      message: `Stale copy: ds/${diff.namespace}/ is behind its source system ${diff.source}: ${parts.join(', ')}. A copy never changes by itself: run \`open-artifact-type-server ds-sync <dir> ${diff.namespace}\` to copy the changed files again (add --check to list them).`,
    });
  }
  return findings;
}

/** Sets `copiedAt` of the records in `namespaces`, keeping the index's layout and every other key. */
function stamp(project: string, indexFile: string, namespaces: Set<string>, now: string): void {
  const file = join(project, indexFile);
  const text = readFileSync(file, 'utf8');
  const index = JSON.parse(text) as { designSystems?: unknown };
  const list = index.designSystems;
  const records = Array.isArray(list) ? list : list && typeof list === 'object' ? Object.values(list) : [];
  for (const r of records) {
    const record = r as { namespace?: unknown; copiedAt?: unknown } | null;
    if (record && typeof record.namespace === 'string' && namespaces.has(record.namespace)) record.copiedAt = now;
  }
  const indent = /^\{\n/.test(text) ? (/\n( +|\t)"/.exec(text)?.[1] ?? 2) : undefined;
  const out = JSON.stringify(index, null, indent);
  const temp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temp, text.endsWith('\n') ? `${out}\n` : out);
  renameSync(temp, file);
}

/** Copies every changed file again (bytes as they are), then stamps the records that changed. `check`: only compare. */
export function syncSystems(root: string, type: TypeName, opts: { namespace?: string; from?: string; check?: boolean } = {}): SyncResult[] {
  const indexFile = SYSTEM_RECORD_INDEX[type];
  if (!indexFile) throw new Error(`ds-sync works on designs and decks; this is a ${type}.`);
  const project = join(root, 'project');
  const diffs = compareSystems(project, root, indexFile, opts.namespace, opts.from);
  const results: SyncResult[] = [];
  const synced = new Set<string>();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  for (const diff of diffs) {
    const result: SyncResult = { ...diff, copied: [] };
    if (!opts.check && diff.source && !diff.missing) {
      for (const rel of diff.changed) {
        const target = join(project, 'ds', diff.namespace, ...rel.split('/'));
        const temp = `${target}.${randomUUID()}.tmp`;
        copyFileSync(join(diff.source, 'project', ...rel.split('/')), temp, constants.COPYFILE_EXCL);
        renameSync(temp, target);
        result.copied.push(rel);
      }
      if (diff.changed.length) synced.add(diff.namespace);
    }
    results.push(result);
  }
  if (synced.size) {
    stamp(project, indexFile, synced, now);
    for (const r of results) if (synced.has(r.namespace)) r.copiedAt = now;
  }
  return results;
}
