/**
 * The server side of the version history ({@link History}): what it tracks
 * of an artifact folder, how changes reach it, and the page routes
 * (`_api/history*`, `@open-artifact/runtime/http-api`).
 *
 * Tracked paths: every file under `project/` (`project/canvas.json`) and,
 * for a db-backed type, every document (`db/elements/n1`, kept as two-space
 * JSON) but those the type leaves out ({@link DocFilter}: live state such as
 * the whiteboard's agent claims, shared timer and per-person ideas, which
 * would only add noise and must never be brought back). The server records:
 *
 * - a page's publish or db write, as the viewer's ({@link recordFiles} /
 *   {@link recordDocs}, right after the write);
 * - a change seen on disk (the watcher), as the agent's;
 * - anything that changed while nobody watched ({@link catchUp}: when a page
 *   connects, before a listing, and from the CLI), as the agent's, or as the
 *   system's first version when the history is empty.
 *
 * A restore writes through the server's own write path (`apply`), so open
 * pages hear of it as of any change, and then records it as a version of its
 * own. The CLI restores without a server ({@link restoreOnDisk}): it records
 * first and then writes, so a running server's watcher finds nothing new.
 */

import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  canEdit,
  type DbWrite,
  type FileListing,
  type HistoryAuthor,
  type HistoryChangeEvent,
  type HistoryNotice,
  type HistoryVersion,
  type JsonRecord,
  type PublishBatch,
  type Viewer,
} from '@open-artifact/runtime/capabilities';
import {
  API,
  SHA_HEADER,
  type HistoryDiffResponse,
  type HistoryDismissRequest,
  type HistoryFilesResponse,
  type HistoryResponse,
  type HistoryRestoreRequest,
  type HistoryRestoreResponse,
} from '@open-artifact/runtime/http-api';
import { DB_DIR, DbStore } from '@open-artifact/server-sdk/db';
import { HttpError, mimeOf, readJson, send, sendJson } from './http.ts';
import { HISTORY_AGENT, HISTORY_SYSTEM, History, MAX_DIFF_BYTES, textOf, type HistoryOptions, type StoredVersion } from './history.ts';
import { ArtifactStore, PROJECT_DIR, pagePathProblem, writeAtomic } from './store.ts';

/** Prefix of a db document's history path. */
const DOC_PREFIX = `${DB_DIR}/`;

/** Whether the history tracks a document (path without `db/`); absent: every document. */
export type DocFilter = (path: string) => boolean;

/** Whether a history path is tracked: every page file, and the documents `tracks` keeps. */
export function isTrackedPath(path: string, tracks?: DocFilter): boolean {
  return !tracks || !path.startsWith(DOC_PREFIX) || tracks(path.slice(DOC_PREFIX.length));
}

/** `changes` without the paths the history does not track. */
function trackedOnly<T>(changes: Map<string, T>, tracks?: DocFilter): Map<string, T> {
  if (!tracks) return changes;
  for (const path of [...changes.keys()]) if (!isTrackedPath(path, tracks)) changes.delete(path);
  return changes;
}

/** A document as the history keeps it: two-space JSON with a newline. */
export function docBytes(data: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(data, null, 2)}\n`);
}

/** The history path of a document path (`elements/n1` → `db/elements/n1`). */
export const docHistoryPath = (path: string): string => `${DOC_PREFIX}${path}`;

/** A person on the page, as the history names them. */
export function personOf(viewer: Viewer, name?: string): HistoryAuthor {
  return { kind: 'person', id: viewer.id, name: name || viewer.name };
}

/** Whether a history path is one the server may write back. */
function writablePath(path: string): boolean {
  if (path.startsWith(`${PROJECT_DIR}/`)) return pagePathProblem(path) === null;
  if (!path.startsWith(DOC_PREFIX)) return false;
  const segments = path.slice(DOC_PREFIX.length).split('/');
  return segments.length >= 2 && segments.length % 2 === 0 && segments.every((s) => /^[A-Za-z0-9_.~:@+-]+$/.test(s) && s !== '.' && s !== '..');
}

/** What the tracked paths hold on disk now (path → bytes). */
export async function currentContents(root: string, documents: boolean, store = new ArtifactStore(root), tracks?: DocFilter): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  for (const path of Object.keys(await store.list())) {
    try {
      out.set(path, await readFile(store.resolve(path)));
    } catch {
      // Gone meanwhile.
    }
  }
  if (documents) {
    const db = new DbStore(root);
    for (const { path } of db.listAll()) {
      if (tracks && !tracks(path)) continue;
      const data = readDoc(db, path);
      if (data) out.set(docHistoryPath(path), docBytes(data));
    }
  }
  return out;
}

function readDoc(db: DbStore, path: string): JsonRecord | null {
  try {
    return db.readDoc(path) as JsonRecord | null;
  } catch {
    return null;
  }
}

/**
 * Records whatever differs between the disk and the history's head: as the
 * system's first version when the history is empty, else as the agent's.
 */
export async function catchUpHistory(history: History, root: string, documents: boolean, store?: ArtifactStore, tracks?: DocFilter): Promise<StoredVersion | null> {
  const now = await currentContents(root, documents, store, tracks);
  const changes = new Map<string, Buffer | null>();
  for (const [path, bytes] of now) changes.set(path, bytes);
  // A path the type no longer tracks (an older history may hold one) is left as it was, not deleted.
  for (const path of history.head().keys()) if (!now.has(path) && isTrackedPath(path, tracks)) changes.set(path, null);
  return history.record(changes, history.empty ? HISTORY_SYSTEM : HISTORY_AGENT);
}

/**
 * Brings version `n` back on disk, without a server (the CLI): records the
 * restore first, then writes, so a server's watcher finds the head current.
 */
export async function restoreOnDisk(
  history: History,
  root: string,
  n: number,
  paths: string[] | undefined,
  who: HistoryAuthor = HISTORY_AGENT,
  tracks?: DocFilter,
): Promise<{ version: StoredVersion | null; changed: string[] }> {
  const restored = history.restoreTo(n, paths);
  if (!restored) throw new HttpError(404, 'not_found', `Version ${n} is not kept (or a file it holds is missing from the history).`);
  const changes = trackedOnly(restored, tracks);
  for (const path of changes.keys()) if (!writablePath(path)) throw new HttpError(400, 'invalid', `${path} cannot be restored.`);
  const version = history.record(changes, who, { restoredFrom: n });
  const db = new DbStore(root);
  for (const [path, bytes] of changes) {
    if (path.startsWith(DOC_PREFIX)) {
      const doc = path.slice(DOC_PREFIX.length);
      if (bytes === null) db.delete(doc);
      else db.set(doc, JSON.parse(bytes.toString('utf8')));
    } else if (bytes === null) {
      await rm(join(root, ...path.split('/')), { force: true });
    } else {
      await writeAtomic(join(root, ...path.split('/')), bytes);
    }
  }
  return { version, changed: [...changes.keys()] };
}

/** A stored version as pages see it. */
function versionView(version: StoredVersion, files: HistoryVersion['files'], current: boolean): HistoryVersion {
  return {
    n: version.n,
    first: version.first,
    at: version.at,
    author: { ...version.author },
    files,
    ...(version.restoredFrom !== undefined ? { restoredFrom: version.restoredFrom } : {}),
    ...(current ? { current: true as const } : {}),
    ...(version.overwrote?.length ? { overwrote: version.overwrote.map((o) => ({ path: o.path, n: o.n, author: { ...o.author } })) } : {}),
  };
}

/** Options of {@link HistoryHost}. */
export interface HistoryHostOptions extends HistoryOptions {
  root: string;
  /** The type keeps db documents (they are tracked too). */
  documents: boolean;
  /** Which documents are tracked (default: all). */
  tracksDoc?: DocFilter;
  /** The artifact's file store (its hash cache is shared). */
  store: ArtifactStore;
  /**
   * Writes a restore the way the server writes everything (pages hear of
   * it): files as a publish batch, documents as db writes. Runs inside the
   * artifact's serialized queue.
   */
  apply(files: PublishBatch, docs: DbWrite[], who: HistoryAuthor): Promise<void>;
  /** Serializes with the artifact's other writes and scans. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tells the open pages a version was recorded. */
  notify(event: HistoryChangeEvent): void;
  log?(message: string): void;
}

/** The history of one open artifact, and its page routes. */
export class HistoryHost {
  readonly history: History;
  private readonly options: HistoryHostOptions;

  constructor(options: HistoryHostOptions) {
    this.options = options;
    this.history = new History(options.root, options);
  }

  private recorded(version: StoredVersion | null): void {
    if (version) this.options.notify({ n: version.n });
  }

  /** Records page files (`project/…`) as they are on disk now. */
  async recordFiles(paths: Iterable<string>, who: HistoryAuthor): Promise<void> {
    const changes = new Map<string, Buffer | null>();
    for (const path of paths) {
      if (!path.startsWith(`${PROJECT_DIR}/`)) continue;
      try {
        changes.set(path, await readFile(this.options.store.resolve(path)));
      } catch {
        changes.set(path, null);
      }
    }
    if (changes.size) this.safely(() => this.recorded(this.history.record(changes, who)));
  }

  /** Records db documents (paths without `db/`) as they are on disk now. */
  recordDocs(paths: Iterable<string>, who: HistoryAuthor): void {
    if (!this.options.documents) return;
    const db = new DbStore(this.options.root);
    const changes = new Map<string, Buffer | null>();
    for (const path of paths) {
      if (!path || !path.includes('/')) continue; // comments.json
      if (this.options.tracksDoc && !this.options.tracksDoc(path)) continue;
      const data = readDoc(db, path);
      changes.set(docHistoryPath(path), data ? docBytes(data) : null);
    }
    if (changes.size) this.safely(() => this.recorded(this.history.record(changes, who)));
  }

  /** Records what changed while nobody watched. */
  async catchUp(): Promise<void> {
    try {
      this.recorded(await catchUpHistory(this.history, this.options.root, this.options.documents, this.options.store, this.options.tracksDoc));
    } catch (error) {
      this.options.log?.(`history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** History is bookkeeping: a failure to record never fails the write that caused it. */
  private safely(task: () => void): void {
    try {
      task();
    } catch (error) {
      this.options.log?.(`history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Brings version `n` back (all paths, or `paths`) through the server's write path, as `who`'s new version. */
  restore(n: number, paths: string[] | undefined, who: HistoryAuthor): Promise<HistoryRestoreResponse> {
    return this.options.run(async () => {
      if (!this.history.version(n)) throw new HttpError(404, 'not_found', `There is no version ${n} (it may be too old to keep).`);
      const restored = this.history.restoreTo(n, paths);
      if (!restored) throw new HttpError(409, 'unavailable', `Version ${n} can't be brought back: a file it holds is missing from the history.`);
      const changes = trackedOnly(restored, this.options.tracksDoc);
      const files: PublishBatch = {};
      const docs: DbWrite[] = [];
      for (const [path, bytes] of changes) {
        if (!writablePath(path)) throw new HttpError(400, 'invalid', `${path} cannot be restored.`);
        if (path.startsWith(DOC_PREFIX)) {
          const doc = path.slice(DOC_PREFIX.length);
          docs.push(bytes === null ? { op: 'delete', path: doc } : { op: 'set', path: doc, data: JSON.parse(bytes.toString('utf8')) as JsonRecord });
        } else {
          files[path] = bytes === null ? null : { content: bytes.toString('base64'), encoding: 'base64' };
        }
      }
      if (changes.size) await this.options.apply(files, docs, who);
      const version = this.history.record(changes, who, { restoredFrom: n });
      this.recorded(version);
      this.options.log?.(`history: ${who.name || who.kind} brought back version ${n}${paths ? ` (${paths.join(', ')})` : ''}${version ? ` as version ${version.n}` : ' (nothing to change)'}`);
      return { version: version?.n ?? null, changed: [...changes.keys()] };
    });
  }

  /** The listing a page shows: versions newest first and the viewer's notices. */
  listing(viewer: Viewer): HistoryResponse {
    const versions = this.history.versions();
    const changes = this.history.fileChanges();
    const newest = versions.at(-1);
    const notices: HistoryNotice[] = this.history.noticesFor(viewer.id).map((n) => ({
      id: n.id,
      at: n.at,
      path: n.path,
      n: n.n,
      author: { ...n.author },
      lost: { n: n.lost.n, author: { ...n.lost.author }, ...(n.lost.sha === null ? { deleted: true as const } : {}) },
    }));
    return {
      versions: [...versions].reverse().map((v) => versionView(v, changes.get(v.n) ?? [], v === newest)),
      notices,
      canRestore: canEdit(viewer.role),
    };
  }

  private versionOf(url: URL): StoredVersion {
    const n = Number(url.searchParams.get('n'));
    const version = Number.isInteger(n) ? this.history.version(n) : undefined;
    if (!version) throw new HttpError(404, 'not_found', `There is no version ${url.searchParams.get('n') ?? ''} (it may be too old to keep).`);
    return version;
  }

  /** Answers a `_api/history*` route; `false` for any other route. */
  async handle(route: string, req: IncomingMessage, res: ServerResponse, url: URL, viewer: Viewer, name?: string): Promise<boolean> {
    const method = req.method ?? 'GET';
    const postOnly = (): void => {
      if (method !== 'POST') throw new HttpError(405, 'invalid', 'POST only.');
    };
    switch (route) {
      case API.history: {
        await this.options.run(() => this.catchUp());
        sendJson(res, 200, this.listing(viewer));
        return true;
      }
      case API.historyFiles: {
        const n = this.versionOf(url).n;
        const files: FileListing = {};
        for (const [path, sha] of this.history.stateAt(n) ?? []) files[path] = { sha256: sha, size: this.history.size(sha) ?? 0 };
        sendJson(res, 200, { files } satisfies HistoryFilesResponse);
        return true;
      }
      case API.historyFile: {
        const n = this.versionOf(url).n;
        const path = url.searchParams.get('path') ?? '';
        const sha = this.history.stateAt(n)?.get(path);
        const bytes = sha ? this.history.read(sha) : null;
        if (!sha || !bytes) throw new HttpError(404, 'not_found', `${path} did not exist after version ${n}.`);
        send(res, 200, bytes, path.startsWith(DOC_PREFIX) ? 'application/json; charset=utf-8' : mimeOf(path), { [SHA_HEADER]: sha, 'cache-control': 'no-store' });
        return true;
      }
      case API.historyDiff: {
        const version = this.versionOf(url);
        const path = url.searchParams.get('path') ?? '';
        if (!(path in version.changes)) throw new HttpError(404, 'not_found', `Version ${version.n} did not change ${path}.`);
        const beforeSha = this.history.stateBefore(version.n).get(path) ?? null;
        const afterSha = version.changes[path] ?? null;
        const before = beforeSha === null ? null : this.history.read(beforeSha);
        const after = afterSha === null ? null : this.history.read(afterSha);
        const op = afterSha === null ? 'deleted' : beforeSha === null ? 'added' : 'edited';
        const body: HistoryDiffResponse = { path, n: version.n, op, before: null, after: null };
        if ((before?.length ?? 0) > MAX_DIFF_BYTES || (after?.length ?? 0) > MAX_DIFF_BYTES) body.tooLarge = true;
        else {
          const a = textOf(before);
          const b = textOf(after);
          if (a === undefined || b === undefined) body.binary = true;
          else Object.assign(body, { before: a, after: b });
        }
        sendJson(res, 200, body);
        return true;
      }
      case API.historyRestore: {
        postOnly();
        if (!canEdit(viewer.role)) throw new HttpError(403, 'not_writer', 'Only the owner and editors can bring a version back.');
        const body = await readJson<Partial<HistoryRestoreRequest>>(req, 256 * 1024);
        if (typeof body.n !== 'number' || !Number.isInteger(body.n)) throw new HttpError(400, 'invalid', 'n (a version number) is required.');
        if (body.paths !== undefined && (!Array.isArray(body.paths) || body.paths.some((p) => typeof p !== 'string'))) throw new HttpError(400, 'invalid', 'paths is a list of paths.');
        sendJson(res, 200, await this.restore(body.n, body.paths, personOf(viewer, name)));
        return true;
      }
      case API.historyDismiss: {
        postOnly();
        const body = await readJson<Partial<HistoryDismissRequest>>(req, 4096);
        if (typeof body.id !== 'string') throw new HttpError(400, 'invalid', 'id is required.');
        this.history.dismiss(viewer.id, body.id);
        this.options.notify({ n: this.history.versions().at(-1)?.n ?? null });
        sendJson(res, 200, { ok: true });
        return true;
      }
      default:
        return false;
    }
  }
}

export { History, HISTORY_AGENT, HISTORY_SYSTEM };
