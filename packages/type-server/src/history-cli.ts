/**
 * `history`: the CLI's way into an artifact's version history
 * (`history-host.ts`). It works on the folder directly; a running server's
 * watcher tells open pages about a restore like any change on disk.
 *
 * ```
 * history <dir> [--all] [--json]       versions, newest first (30 unless --all)
 * history <dir> show <n> <path>        a file (or document) as version n left it
 * history <dir> restore <n> [path…]    bring version n back (every path, or these)
 * ```
 *
 * Listing first records whatever changed on disk since the last version, so
 * the agent's own latest edits are in the list.
 */

import { resolve } from 'node:path';
import { catchUpHistory, restoreOnDisk } from './history-host.ts';
import { History, textOf, type StoredVersion } from './history.ts';
import { detectType } from './server.ts';
import { TYPES, historyTracksOf } from './types.ts';

/** Versions printed without `--all`. */
const SHOWN = 30;

function fail(message: string): number {
  console.error(message);
  return 1;
}

/** `2026-11-16 14:03` in local time. */
function when(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function who(version: StoredVersion): string {
  if (version.author.kind === 'system') return 'Original';
  if (version.author.kind === 'agent') return 'Agent';
  return version.author.name || 'Someone';
}

/** A path as typed (`canvas.json`, `elements/n1`) → its history path, using what version `n` holds. */
function historyPath(path: string, state: ReadonlyMap<string, string>, known: Iterable<string>): string {
  if (path.startsWith('project/') || path.startsWith('db/')) return path;
  const all = new Set([...state.keys(), ...known]);
  if (all.has(`project/${path}`)) return `project/${path}`;
  if (all.has(`db/${path}`)) return `db/${path}`;
  return `project/${path}`;
}

/** `history <dir> …` (positional: everything after `history`). */
export async function cmdHistory(positional: string[], flags: { json?: boolean; all?: boolean }): Promise<number> {
  const dir = positional[0];
  if (!dir) return fail('Pass the artifact folder.');
  const root = resolve(dir);
  const type = await detectType(root);
  if (!type) return fail(`${root} is not an artifact folder.`);
  const documents = TYPES[type].store === 'db';
  const history = new History(root);
  const tracks = historyTracksOf(type);
  await catchUpHistory(history, root, documents, undefined, tracks);
  const action = positional[1];

  if (action === 'restore' || action === 'show') {
    const n = Number(positional[2]);
    const version = Number.isInteger(n) ? history.version(n) : undefined;
    if (!version) return fail(`There is no version ${positional[2] ?? ''}. Run \`history ${dir}\` to list them.`);
    const state = history.stateAt(n)!;
    const paths = positional.slice(3).map((p) => historyPath(p, state, history.head().keys()));
    if (action === 'show') {
      if (paths.length !== 1) return fail('Pass one path: history <dir> show <n> <path>.');
      const sha = state.get(paths[0]!);
      if (!sha) return fail(`${paths[0]} did not exist after version ${n}.`);
      const bytes = history.read(sha);
      const text = bytes ? textOf(bytes) : undefined;
      if (typeof text !== 'string') return fail(`${paths[0]} is not text (or no longer kept).`);
      process.stdout.write(text);
      return 0;
    }
    try {
      const result = await restoreOnDisk(history, root, n, paths.length ? paths : undefined, undefined, tracks);
      if (flags.json) console.log(JSON.stringify({ restored: n, version: result.version?.n ?? null, changed: result.changed }, null, 2));
      else if (!result.version) console.log(`Nothing to change: ${paths.length ? 'those paths already match' : 'the files already match'} version ${n}.`);
      else console.log(`Brought back version ${n} as version ${result.version.n}:\n${result.changed.map((p) => `  ${p}`).join('\n')}`);
      return 0;
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }
  if (action !== undefined) return fail(`Unknown history action "${action}": list (no action), show <n> <path> or restore <n> [path…].`);

  const versions = [...history.versions()].reverse();
  const changes = history.fileChanges();
  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          type,
          versions: versions.map((v, i) => ({
            n: v.n,
            first: v.first,
            at: v.at,
            author: v.author,
            files: changes.get(v.n) ?? [],
            ...(v.restoredFrom !== undefined ? { restoredFrom: v.restoredFrom } : {}),
            ...(i === 0 ? { current: true } : {}),
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (!versions.length) {
    console.log('No versions yet.');
    return 0;
  }
  const shown = flags.all ? versions : versions.slice(0, SHOWN);
  console.log(`${versions.length} version(s), newest first:`);
  for (const [i, v] of shown.entries()) {
    const files = changes.get(v.n) ?? [];
    const list = files.slice(0, 4).map((f) => `${f.op} ${f.path}`).join(', ') + (files.length > 4 ? `, +${files.length - 4} more` : '');
    const notes = [v.restoredFrom !== undefined ? `restored #${v.restoredFrom}` : '', i === 0 ? 'current' : ''].filter(Boolean).join(', ');
    console.log(`  #${String(v.n).padEnd(4)} ${when(v.at)}  ${who(v).padEnd(10)}  ${list}${notes ? `  (${notes})` : ''}`);
  }
  if (shown.length < versions.length) console.log(`  … ${versions.length - shown.length} older (--all lists them)`);
  return 0;
}
