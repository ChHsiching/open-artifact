/**
 * The artifact's files as an original page sees them: everything in the
 * artifact folder except what the host keeps for itself, listed as
 * `_files.json` `{ver, files: {path: {sha256, size, contentType}}}`. `ver`
 * names one state of that list. `publish` writes a batch of files with
 * optional per-file preconditions (`ifMatch`: the sha256 the page last saw, or
 * null for "must not exist") and answers `conflict` when one does not hold.
 * Blobs (the assets capability) are content-addressed files under `_blobs/`.
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, existsSync, type Stats } from 'node:fs';
import { basename, dirname, extname, join, sep } from 'node:path';

export const PUBLISH_MAX_PATHS = 256;
export const FILE_MAX_BYTES = 16 * 1024 * 1024;
export const BLOB_MAX_BYTES = 20 * 1024 * 1024;
export const BLOB_SVG_MAX_BYTES = 2 * 1024 * 1024;
export const BLOB_CODE_MAX_BYTES = 16 * 1024 * 1024;
export const BLOBS_MAX_FILES = 2000;
export const BLOBS_MAX_BYTES = 1024 * 1024 * 1024;
const WALK_MAX_FILES = 20_000;
const SHA = /^[0-9a-f]{64}$/;
const BLOB_ID = /^[0-9a-f]{32}$/;


export const BLOB_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'font/woff2',
  'font/woff',
  'font/ttf',
  'font/otf',
  'text/csv',
  'text/markdown',
  'application/json',
  'text/plain',
  'text/css',
  'text/javascript',
]);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml',
};

export const contentTypeOf = (file: string): string => TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';


export class FrameError extends Error {
  readonly code: string;
  readonly status: number;
  readonly extra: Record<string, unknown>;
  constructor(code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

/** Paths of the type (never the artifact's): neither listed nor writable by a page. */
export function typePath(rel: string): boolean {
  return rel === 'index.html' || rel === 'SKILL.md' || rel === 'artifact-type' || rel.startsWith('artifact-type/');
}

/** Paths the host keeps for itself. */
export function reservedPath(rel: string): boolean {
  const segs = rel.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..' || s.startsWith('.'))) return true;
  if (segs[0]!.startsWith('_')) return true;
  if (segs[0] === 'db' || segs[0] === 'history' || segs[0] === 'node_modules') return true;
  if (rel === 'comments.json' || rel.endsWith('.lock')) return true;
  return false;
}

/** A page-relative path, normalized, or null when it is not one. */
export function cleanPath(p: unknown): string | null {
  if (typeof p !== 'string' || !p || p.length > 1024 || p.includes('\\') || p.includes('\0')) return null;
  const rel = p.replace(/^\/+/, '');
  if (!rel || rel.split('/').some((s) => s === '' || s === '.' || s === '..')) return null;
  return rel;
}

export interface FileEntry {
  sha256: string;
  size: number;
  contentType: string;
}

export interface FileManifest {
  ver: string;
  files: Record<string, FileEntry>;
}

/** One write of a publish: content, or a delete; `ifMatch` is the sha256 expected now (null: must not exist). */
export type FileWrite = { data: Buffer; contentType?: string; ifMatch?: string | null; delete?: false } | { delete: true; ifMatch?: string | null };

export interface PublishResult {
  version: string;
  changed: { path: string; sha256: string | null }[];
  shas: Record<string, string>;
  unchanged?: true;
}

function writeAtomic(file: string, data: Buffer | string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = join(dirname(file), `.${basename(file)}.${randomBytes(4).toString('hex')}.tmp`);
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

export class FileStore {
  readonly root: string;
  /** rel → the hash of the file at that mtime and size. */
  private readonly cache = new Map<string, { mtimeMs: number; size: number; sha256: string }>();
  current: FileManifest | null = null;

  constructor(root: string) {
    this.root = root;
  }

  private sha(rel: string, st: Stats): string {
    const have = this.cache.get(rel);
    if (have && have.mtimeMs === st.mtimeMs && have.size === st.size) return have.sha256;
    const sha256 = createHash('sha256').update(readFileSync(join(this.root, rel))).digest('hex');
    this.cache.set(rel, { mtimeMs: st.mtimeMs, size: st.size, sha256 });
    return sha256;
  }

  /** The current listing. */
  manifest(): FileManifest {
    const files: Record<string, FileEntry> = {};
    let count = 0;
    const walk = (dir: string, prefix: string): void => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (reservedPath(rel) || typePath(rel)) continue;
        if (e.isDirectory()) walk(join(dir, e.name), rel);
        else if (e.isFile() && ++count <= WALK_MAX_FILES) {
          try {
            const st = statSync(join(dir, e.name));
            files[rel] = { sha256: this.sha(rel, st), size: st.size, contentType: contentTypeOf(rel) };
          } catch {
            // gone between readdir and stat
          }
        }
      }
    };
    walk(this.root, '');
    const sorted = Object.fromEntries(
      Object.keys(files)
        .sort()
        .map((k) => [k, files[k]!]),
    );
    const ver = createHash('sha256')
      .update(
        Object.entries(sorted)
          .map(([k, v]) => `${k}\0${v.sha256}`)
          .join('\n'),
      )
      .digest('hex')
      .slice(0, 12);
    this.current = { ver, files: sorted };
    return this.current;
  }

  /** The artifact file a page asks for: an absolute path, or null. */
  resolve(rel: string): string | null {
    const clean = cleanPath(rel);
    if (!clean || reservedPath(clean) || typePath(clean)) return null;
    const file = join(this.root, clean);
    if (!file.startsWith(this.root + sep)) return null;
    try {
      const real = realpathSync(file);
      const realRoot = realpathSync(this.root);
      if (!real.startsWith(realRoot + sep)) return null;
      return statSync(real).isFile() ? real : null;
    } catch {
      return null;
    }
  }

  /** Writes a batch. Throws {@link FrameError} `conflict` (with `live`, `paths`) when a precondition fails. */
  publish(files: Record<string, FileWrite>): PublishResult {
    const entries = Object.entries(files ?? {});
    if (entries.length === 0) {
      const m = this.manifest();
      return { version: m.ver, changed: [], shas: {}, unchanged: true };
    }
    if (entries.length > PUBLISH_MAX_PATHS) throw new FrameError('too_large', `At most ${PUBLISH_MAX_PATHS} paths in one publish.`, 413);
    const plan: (FileWrite & { rel: string })[] = [];
    for (const [p, spec] of entries) {
      const rel = cleanPath(p);
      if (!rel) throw new FrameError('invalid_content', `${JSON.stringify(p)} is not a file path.`);
      if (typePath(rel)) throw new FrameError('read_only_path', `${rel} belongs to the type and cannot be written.`, 403);
      if (reservedPath(rel)) throw new FrameError(rel.startsWith('_') ? 'invalid_content' : 'read_only_path', `${rel} is reserved for the host.`, 403);
      if (spec.ifMatch !== undefined && spec.ifMatch !== null && !SHA.test(spec.ifMatch)) throw new FrameError('invalid_content', `${rel}: ifMatch is a lowercase sha256 or null.`);
      if (!spec.delete) {
        if (!Buffer.isBuffer(spec.data)) throw new FrameError('invalid_content', `${rel}: no content.`);
        if (spec.data.length > FILE_MAX_BYTES) throw new FrameError('too_large', `${rel} is over ${FILE_MAX_BYTES} bytes.`, 413);
      }
      plan.push({ rel, ...spec });
    }
    const before = this.manifest();
    const conflicts: { path: string; expected: string | null; actual: string | null }[] = [];
    for (const w of plan) {
      if (w.ifMatch === undefined) continue;
      const actual = before.files[w.rel]?.sha256 ?? null;
      if (actual !== w.ifMatch) conflicts.push({ path: w.rel, expected: w.ifMatch, actual });
    }
    if (conflicts.length) {
      throw new FrameError('conflict', 'The files changed since this page read them.', 409, {
        live: before.ver,
        paths: conflicts,
        changed: conflicts.map((c) => c.path),
      });
    }
    const changed: PublishResult['changed'] = [];
    const shas: Record<string, string> = {};
    for (const w of plan) {
      const file = join(this.root, w.rel);
      if (w.delete) {
        if (before.files[w.rel]) {
          rmSync(file, { force: true });
          this.cache.delete(w.rel);
          changed.push({ path: w.rel, sha256: null });
        }
        continue;
      }
      const sha256 = createHash('sha256').update(w.data).digest('hex');
      shas[w.rel] = sha256;
      if (before.files[w.rel]?.sha256 === sha256) continue;
      writeAtomic(file, w.data);
      changed.push({ path: w.rel, sha256 });
    }
    const after = this.manifest();
    return { version: after.ver, changed, shas, ...(changed.length === 0 ? { unchanged: true as const } : {}) };
  }
}

export interface BlobMeta {
  id: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BlobInfo extends BlobMeta {
  url: string;
}

export interface BlobList {
  assets: BlobInfo[];
  usage: { files: number; bytes: number; maxFiles: number; maxBytes: number };
}

/** The most bytes an asset of `type` may have. */
export function blobLimit(type: string): number {
  if (type === 'image/svg+xml') return BLOB_SVG_MAX_BYTES;
  if (type === 'text/css' || type === 'text/javascript') return BLOB_CODE_MAX_BYTES;
  return BLOB_MAX_BYTES;
}

export class BlobStore {
  readonly root: string;
  readonly dir: string;

  constructor(root: string) {
    this.root = root;
    this.dir = join(root, '_blobs');
  }

  meta(id: string): BlobMeta | null {
    if (!BLOB_ID.test(id)) return null;
    try {
      const m = JSON.parse(readFileSync(join(this.dir, `${id}.json`), 'utf8')) as Omit<BlobMeta, 'id'>;
      return existsSync(join(this.dir, id)) ? { id, ...m } : null;
    } catch {
      return null;
    }
  }

  fileOf(id: string): string | null {
    return this.meta(id) ? join(this.dir, id) : null;
  }

  list(): BlobList {
    let names: string[] = [];
    try {
      names = readdirSync(this.dir);
    } catch {
      // none yet
    }
    const assets: BlobInfo[] = [];
    for (const n of names) {
      if (!BLOB_ID.test(n)) continue;
      const m = this.meta(n);
      if (m) assets.push({ id: n, url: `/_blob/${n}`, contentType: m.contentType, sizeBytes: m.sizeBytes, createdAt: m.createdAt });
    }
    assets.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const bytes = assets.reduce((s, a) => s + (a.sizeBytes ?? 0), 0);
    return { assets, usage: { files: assets.length, bytes, maxFiles: BLOBS_MAX_FILES, maxBytes: BLOBS_MAX_BYTES } };
  }

  upload(data: Buffer, contentType: unknown): BlobInfo {
    const raw = typeof contentType === 'string' ? contentType.split(';')[0]!.trim().toLowerCase() : '';
    if (!raw) throw new FrameError('invalid_request', 'upload() needs a content type.');
    if (!BLOB_TYPES.has(raw)) throw new FrameError('unsupported_type', `Assets of type ${raw} are not supported.`);
    if (!data.length) throw new FrameError('invalid_request', 'An empty file.');
    const max = blobLimit(raw);
    if (data.length > max) throw new FrameError('too_large', `An asset of type ${raw} is at most ${max} bytes.`, 413);
    const id = createHash('sha256').update(data).digest('hex').slice(0, 32);
    if (!this.meta(id)) {
      const { usage } = this.list();
      if (usage.files + 1 > BLOBS_MAX_FILES || usage.bytes + data.length > BLOBS_MAX_BYTES) {
        throw new FrameError('quota_or_state', 'The artifact holds as many assets as it can.', 413);
      }
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(join(this.dir, id), data);
      writeFileSync(join(this.dir, `${id}.json`), `${JSON.stringify({ contentType: raw, sizeBytes: data.length, createdAt: new Date().toISOString() })}\n`);
    }
    const m = this.meta(id)!;
    return { id, url: `/_blob/${id}`, sizeBytes: m.sizeBytes, contentType: m.contentType, createdAt: m.createdAt };
  }

  /** Deletes by id or `/_blob/<id>` url. */
  delete(ref: unknown): { deleted: boolean } {
    const match = /^(?:\/?_blob\/)?([0-9a-f]{32})$/.exec(String(ref ?? '').replace(/^https?:\/\/[^/]+/, ''));
    if (!match) throw new FrameError('invalid_request', 'delete() takes an asset id or its /_blob/ url.');
    const id = match[1]!;
    if (!this.meta(id)) return { deleted: false };
    rmSync(join(this.dir, id), { force: true });
    rmSync(join(this.dir, `${id}.json`), { force: true });
    return { deleted: true };
  }
}

export { writeAtomic };
