/**
 * `read-db` / `write-db`: the CLI's way into a db-backed artifact (the
 * Whiteboard). Both work on the folder directly, in the shapes of the
 * reserved actions `open-artifact.db.read` / `open-artifact.db.write`; a running server's watcher
 * reports the written documents to open pages as the agent's changes.
 *
 * ```
 * read-db <dir>                      every document path
 * read-db <dir> elements             one collection, with data
 * read-db <dir> board/meta           one document
 * write-db <dir> '[{"op":"update","path":"board/meta","data":{"title":"Plan"}}]'
 * write-db <dir> writes.json         a file holding the same array
 * write-db <dir> -                   the array on stdin
 * ```
 *
 * In a write's `data`, `{"$file": "path"}` anywhere stands for that file's
 * text (relative to the working directory): an SVG or an embed's HTML goes
 * in without escaping it into JSON. A refused batch prints
 * `{"error": "CODE", "message": …}` and writes nothing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { IDEA_DOCUMENT_PATTERN, ideaDocumentProblem } from '@open-artifact/whiteboard-core';
import { DbStore, mergePatch, splitPath } from '@open-artifact/server-sdk/db';
import { resetEdits } from './agent.ts';
import { detectType } from './server.ts';
import { TYPES } from './types.ts';

/** Prints an error and returns the exit code. */
function fail(message: string): number {
  console.error(message);
  return 1;
}

/** The artifact folder, when it holds a db-backed type. */
async function dbRoot(dir: string | undefined): Promise<string | string[]> {
  if (!dir) return ['Pass the artifact folder.'];
  const root = resolve(dir);
  const type = await detectType(root);
  if (!type || TYPES[type].store !== 'db') {
    const kinds = Object.values(TYPES).filter((t) => t.store === 'db').map((t) => t.name);
    return [`${root} is not a db-backed artifact (${kinds.join(', ')}).`];
  }
  return root;
}

/** `read-db <dir> [path]`: prints the documents as JSON. */
export async function cmdReadDb(positional: string[]): Promise<number> {
  const root = await dbRoot(positional[0]);
  if (Array.isArray(root)) return fail(root[0]!);
  try {
    console.log(JSON.stringify(new DbStore(root).readDb(positional[1] ?? ''), null, 2));
    // The agent has read the content: people's edits are counted again from here (the view context's `edits`).
    resetEdits(root);
    return 0;
  } catch (error) {
    return fail((error as Error).message);
  }
}

/** Reads the writes argument: inline JSON, a file, or `-` for stdin. */
function readWrites(source: string): unknown {
  const text = source === '-' ? readFileSync(0, 'utf8') : /^\s*[[{]/.test(source) ? source : existsSync(source) ? readFileSync(source, 'utf8') : null;
  if (text === null) throw new Error(`${source}: no such file (pass inline JSON, a file, or - for stdin).`);
  const value = JSON.parse(text) as unknown;
  // Accept a bare array, `{writes: […]}`, or a single write.
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { writes?: unknown }).writes)) return (value as { writes: unknown[] }).writes;
  return [value];
}

/** A refusal: printed as `{"error": CODE, "message": …}`, nothing written. */
class Refusal extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** `{"$file": "path"}` anywhere in `value` becomes that file's text (relative to the working directory). */
export function resolveFileRefs(value: unknown, where: string): unknown {
  if (Array.isArray(value)) return value.map((item, index) => resolveFileRefs(item, `${where}[${index}]`));
  if (!isPlain(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$file') {
    if (typeof value.$file !== 'string' || !value.$file) throw new Refusal('INVALID_FILE_REF', `${where}: {"$file": …} names a file path.`);
    const file = resolve(value.$file);
    try {
      return readFileSync(file, 'utf8');
    } catch {
      throw new Refusal('FILE_NOT_FOUND', `${where}: {"$file": ${JSON.stringify(value.$file)}}: cannot read ${file}. Nothing was written.`);
    }
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = resolveFileRefs(item, `${where}.${key}`);
  return out;
}

/** Refuses a batch that would leave a saved idea the page cannot show (whiteboard). */
function checkIdeas(store: DbStore, writes: unknown[]): void {
  for (const write of writes) {
    if (!isPlain(write) || (write.op !== 'set' && write.op !== 'update')) continue;
    const named = write.path ?? (write.collection != null && write.doc_id != null ? `${String(write.collection)}/${String(write.doc_id)}` : '');
    let path: string;
    try {
      path = splitPath(String(named), 'doc').join('/');
    } catch {
      continue; // the store reports a bad path
    }
    if (!IDEA_DOCUMENT_PATTERN.test(path) || !isPlain(write.data)) continue;
    const data = write.op === 'update' ? mergePatch(store.readDoc(path) ?? {}, write.data) : write.data;
    const problem = ideaDocumentProblem(data, path);
    if (problem) throw new Refusal(problem.code, `${problem.message} Nothing was written.`);
  }
}

/** `write-db <dir> <json|file|->`: applies the writes all-or-nothing and prints the results. */
export async function cmdWriteDb(positional: string[]): Promise<number> {
  const root = await dbRoot(positional[0]);
  if (Array.isArray(root)) return fail(root[0]!);
  const source = positional[1];
  if (!source) return fail('Pass the writes: inline JSON, a file, or - for stdin.');
  try {
    const writes = readWrites(source);
    const store = new DbStore(root);
    if (Array.isArray(writes)) {
      for (const [index, write] of writes.entries()) {
        if (!isPlain(write)) continue;
        // `file_path` must be absolute for the store; resolve relative ones against the working directory.
        if (typeof write.file_path === 'string' && write.file_path && !isAbsolute(write.file_path)) write.file_path = resolve(write.file_path);
        if (write.data !== undefined) write.data = resolveFileRefs(write.data, `writes[${index}].data`);
      }
      checkIdeas(store, writes);
    }
    console.log(JSON.stringify({ writes: store.writeDb(writes) }, null, 2));
    return 0;
  } catch (error) {
    const code = error instanceof Refusal ? error.code : typeof (error as { code?: unknown })?.code === 'string' ? String((error as { code: string }).code).toUpperCase() : 'INVALID';
    console.log(JSON.stringify({ error: code, message: (error as Error).message }));
    console.error((error as Error).message);
    return 1;
  }
}
