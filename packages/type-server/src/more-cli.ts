/**
 * Folder chores from the CLI, each a thin wrapper over its module:
 *
 * ```
 * archive <dir> [--out file.zip|folder]        the whole artifact as one zip (archive.ts)
 * ds-sync <dir> [namespace] [--check] [--from <system folder>]
 *                                              bring installed design systems up to date (ds-sync.ts)
 * delete-asset <dir> </_blob/id|id>            remove an upload nothing names (artifact-files.ts)
 * ```
 */

import { resolve } from 'node:path';
import { archiveCommand } from './archive.ts';
import { AssetError, deleteAsset } from './artifact-files.ts';
import { syncSystems } from './ds-sync.ts';
import { detectType } from './server.ts';
import type { TypeName } from './types.ts';

type Flags = ReadonlyMap<string, string | true>;

/** Prints an error and returns the exit code. */
function fail(message: string): number {
  console.error(message);
  return 1;
}

const value = (flags: Flags, name: string): string | undefined => {
  const v = flags.get(name);
  return typeof v === 'string' ? v : undefined;
};

async function folderOf(dir: string | undefined): Promise<{ root: string; type: TypeName } | { error: string }> {
  if (!dir) return { error: 'Pass the artifact folder.' };
  const root = resolve(dir);
  const type = await detectType(root);
  return type ? { root, type } : { error: `${root} is not an artifact folder.` };
}

const kb = (bytes: number): string => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** `archive <dir> [--out file.zip|folder] [--json]`. */
export async function cmdArchive(positional: string[], flags: Flags): Promise<number> {
  const found = await folderOf(positional[0]);
  if ('error' in found) return fail(found.error);
  try {
    const result = await archiveCommand(found.root, value(flags, 'out'));
    if (flags.has('json')) console.log(JSON.stringify(result));
    else console.log(`${result.file}\n${result.files} file(s), ${kb(result.bytes)}. Unzip it and run open on the folder to edit it again.`);
    return 0;
  } catch (error) {
    return fail((error as Error).message);
  }
}

/** `ds-sync <dir> [namespace] [--check] [--from <system folder>] [--json]`: exit 1 with --check when a copy is behind. */
export async function cmdDsSync(positional: string[], flags: Flags): Promise<number> {
  const found = await folderOf(positional[0]);
  if ('error' in found) return fail(found.error);
  const check = flags.has('check');
  try {
    const results = syncSystems(found.root, found.type, { namespace: positional[1], from: value(flags, 'from'), check });
    const behind = results.some((r) => r.changed.length > r.copied.length);
    if (flags.has('json')) {
      console.log(JSON.stringify({ check, systems: results }, null, 2));
      return check && behind ? 1 : 0;
    }
    if (!results.length) console.log('No design systems installed (no designSystems records).');
    for (const r of results) {
      const head = `ds/${r.namespace}/ (${r.title})`;
      if (r.skipped) console.log(`skipped  ${head}: ${r.skipped}`);
      else if (r.missing) console.log(`missing  ${head}: the record has no folder; install the system again.`);
      else if (!r.changed.length) console.log(`current  ${head}${r.source ? ` matches ${r.source}` : ''}`);
      else if (check) console.log(`behind   ${head}: ${r.changed.length} file(s) differ from ${r.source}: ${r.changed.join(', ')}`);
      else console.log(`synced   ${head}: copied ${r.copied.join(', ')}${r.copiedAt ? `; copiedAt ${r.copiedAt}` : ''}`);
      if (r.removed.length) console.log(`         gone from the source (kept in the copy): ${r.removed.join(', ')}`);
    }
    if (check && behind) console.log(`\nRun without --check to copy the changed files.`);
    return check && behind ? 1 : 0;
  } catch (error) {
    return fail((error as Error).message);
  }
}

/** `delete-asset <dir> </_blob/id|id>`: refused (exit 1, `{"error": CODE}`) while anything names it. */
export async function cmdDeleteAsset(positional: string[]): Promise<number> {
  const found = await folderOf(positional[0]);
  if ('error' in found) return fail(found.error);
  try {
    console.log(JSON.stringify(await deleteAsset(found.root, positional[1])));
    return 0;
  } catch (error) {
    if (!(error instanceof AssetError)) throw error;
    console.log(JSON.stringify({ error: error.code, message: error.message }));
    console.error(error.message);
    return 1;
  }
}
