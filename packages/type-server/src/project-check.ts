/**
 * A whole check of one artifact folder, as `check` (the CLI) and the
 * server's `check` action run it: the type's own check over the text files,
 * given what the folder holds beyond them (uploads, file sizes, symbolic
 * links), then the stale copy notes of installed design systems.
 */

import { existsSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readDbFiles } from './db-host.ts';
import { staleCopyFindings } from './ds-sync.ts';
import { ArtifactStore } from './store.ts';
import { TYPES, type CheckContext, type CheckFinding, type TypeName } from './types.ts';

/** Every file under `project/` with its size, and the symbolic links met (never followed). */
async function scanProject(root: string): Promise<{ sizes: Map<string, number>; symlinks: string[] }> {
  const sizes = new Map<string, number>();
  const symlinks: string[] = [];
  const walk = async (dir: string, rel: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name.endsWith('.tmp')) continue;
      const inner = rel ? `${rel}/${entry.name}` : entry.name;
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink()) symlinks.push(inner);
      else if (entry.isDirectory()) await walk(file, inner);
      else if (entry.isFile()) sizes.set(inner, (await lstat(file).catch(() => null))?.size ?? 0);
    }
  };
  await walk(join(root, 'project'), '');
  return { sizes, symlinks };
}

/** The uploads of a folder: ids and their total bytes. */
function scanBlobs(root: string): { ids: Set<string>; bytes: number } {
  const ids = new Set<string>();
  let bytes = 0;
  let names: string[] = [];
  try {
    names = readdirSync(join(root, '_blobs'));
  } catch {
    return { ids, bytes };
  }
  for (const name of names) {
    const id = /^([0-9a-f]{32})\./.exec(name)?.[1];
    if (!id) continue;
    ids.add(id);
    try {
      bytes += statSync(join(root, '_blobs', name)).size;
    } catch {
      // removed meanwhile
    }
  }
  return { ids, bytes };
}

/** What the type's check gets to know of the folder. */
export async function checkContextOf(root: string, type: TypeName): Promise<CheckContext> {
  const blobs = scanBlobs(root);
  const context: CheckContext = {
    blobExists: (id) => blobs.ids.has(id),
    fileExists: (path) => !path.split('/').some((part) => part === '..' || part === '') && existsSync(join(root, ...path.split('/'))),
    blobBytes: blobs.bytes,
  };
  if (TYPES[type].store !== 'db') Object.assign(context, await scanProject(root));
  return context;
}

/** Checks one artifact folder: the text files the check read, and the findings. */
export async function runCheck(root: string, type: TypeName): Promise<{ files: Map<string, string>; findings: CheckFinding[] }> {
  // A db-backed type is checked from its documents (paths already start with `db/` in findings).
  const files = TYPES[type].store === 'db' ? readDbFiles(root) : await new ArtifactStore(root).readProject();
  const findings = TYPES[type].check(files, await checkContextOf(root, type));
  try {
    findings.push(...staleCopyFindings(root, type));
  } catch {
    // An index that cannot be read is reported by the type's own check.
  }
  return { files, findings };
}
