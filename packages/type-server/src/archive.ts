/**
 * The whole artifact folder as one .zip (`archive <dir> [--out file.zip]`),
 * to back it up, move it to another computer or send it to someone:
 * unzipped anywhere, it opens again with `open <folder>`. Node built-ins only.
 *
 * The zip holds one folder, named as the artifact folder is, with what makes
 * the artifact: `project/` (or `db/`), `_blobs/`, `comments.json`, `history/`
 * and `.artifact.json`. Left out is what belongs to this computer or to
 * nobody: the agent channel (`_agent/`: inbox, waiting, view context), dot
 * files (a server's state and log, share links, temp files of atomic
 * writes), `node_modules`, `.git` and the OS's `.DS_Store` / `Thumbs.db`.
 * Symbolic links are not followed.
 *
 * Plain zip (no Zip64): at most 65 535 files and 4 GiB, checked before the
 * first byte goes out. Names are UTF-8 (flag bit 11), Unix permissions ride
 * in the external attributes, and each file is deflated unless it is a
 * format that is compressed already or deflate would not shrink it.
 */

import { existsSync, statSync, type Dirent } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { deflateRaw as deflateRawCallback } from 'node:zlib';

/** Dot files kept at the folder's top: the artifact's own, not this machine's. */
const KEPT_DOT_FILES = new Set(['.artifact.json', '.gitignore']);
/** Never in the zip, at any depth. */
const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.git', 'node_modules']);
/** Never in the zip, at the folder's top. */
const LOCAL_DIRS = new Set(['_agent']);
/** An atomic write's temp file. */
const isTemp = (name: string): boolean => name.endsWith('.tmp') || name.startsWith('.tmp-');

/** Formats that are compressed already: stored as they are. */
const STORED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.heic', '.mp4', '.m4v', '.mov', '.webm', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.woff', '.woff2', '.zip', '.gz', '.br', '.zst', '.7z']);

const MAX_ENTRIES = 0xffff;
const MAX_BYTES = 0xffffffff;

/** One file of the zip. */
export interface ArchiveEntry {
  /** The path inside the zip: `<folder>/<path under root>`, with forward slashes. */
  name: string;
  file: string;
  size: number;
  mode: number;
  mtime: Date;
}

/** A folder over plain zip's limits. */
export class ArchiveTooLarge extends Error {
  readonly code = 'TOO_LARGE';
}

/** The files to zip, sorted by path. `skip`: absolute paths to leave out too (the zip itself, written inside the folder). */
export async function archiveEntries(root: string, skip: string[] = []): Promise<ArchiveEntry[]> {
  const top = resolve(root);
  const folder = basename(top) || 'artifact';
  const skipped = new Set(skip.map((file) => resolve(file)));
  const entries: ArchiveEntry[] = [];
  const walk = async (dir: string, rel: string): Promise<void> => {
    let names: Dirent[];
    try {
      names = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (rel && (error as NodeJS.ErrnoException).code === 'ENOENT') return; // removed meanwhile
      throw error;
    }
    for (const dirent of names.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const name = dirent.name;
      if (JUNK.has(name) || isTemp(name)) continue;
      if (name.startsWith('.') && !(rel === '' && KEPT_DOT_FILES.has(name))) continue;
      if (rel === '' && LOCAL_DIRS.has(name)) continue;
      const file = join(dir, name);
      if (skipped.has(file)) continue;
      const inner = rel ? `${rel}/${name}` : name;
      if (dirent.isDirectory()) await walk(file, inner);
      else if (dirent.isFile()) {
        const info = await stat(file).catch(() => null);
        if (info?.isFile()) entries.push({ name: `${folder}/${inner}`, file, size: info.size, mode: info.mode & 0o777, mtime: info.mtime });
      }
    }
  };
  await walk(top, '');
  if (entries.length > MAX_ENTRIES) throw new ArchiveTooLarge(`The folder holds ${entries.length} files, more than a zip holds (${MAX_ENTRIES}); copy the folder itself instead.`);
  const bound = entries.reduce((sum, entry) => sum + entry.size + 2 * (46 + Buffer.byteLength(entry.name)), 22);
  if (bound > MAX_BYTES) throw new ArchiveTooLarge(`The folder holds ${(bound / 2 ** 30).toFixed(1)} GiB, more than a zip holds (4 GiB); copy the folder itself instead.`);
  return entries;
}

/* -------------------------------------------------------------------------- */
/* The zip format                                                             */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of bytes. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date, local time; the format starts in 1980 and ends in 2107. */
function dosTime(date: Date): { time: number; date: number } {
  const year = date.getFullYear();
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 };
  if (year > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 };
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const deflateRaw = promisify(deflateRawCallback);
const UTF8 = 1 << 11;

/**
 * Writes the zip of `entries` through `write`, one file at a time: its local
 * header and data, then the central directory. A file gone since the listing
 * is left out. Resolves with the number of bytes written.
 */
export async function writeZip(entries: ArchiveEntry[], write: (chunk: Buffer) => Promise<void>): Promise<{ bytes: number; files: number }> {
  const central: Buffer[] = [];
  let offset = 0;
  let files = 0;
  const put = async (chunk: Buffer): Promise<void> => {
    await write(chunk);
    offset += chunk.length;
  };
  for (const entry of entries) {
    let data: Buffer;
    try {
      data = await readFile(entry.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const crc = crc32(data);
    let method = 0;
    let body = data;
    if (data.length > 0 && !STORED.has(extname(entry.name).toLowerCase())) {
      const deflated = await deflateRaw(data);
      if (deflated.length < data.length) {
        method = 8;
        body = deflated;
      }
    }
    if (offset + body.length > MAX_BYTES) throw new ArchiveTooLarge('The folder grew past what a zip holds (4 GiB) while it was being zipped.');
    const name = Buffer.from(entry.name, 'utf8');
    const { time, date } = dosTime(entry.mtime);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, 2.0
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(date, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    // extra, comment, disk, internal attributes: 0
    header.writeUInt32LE(((0o100000 | (entry.mode || 0o644) | 0o600) << 16) >>> 0, 38); // a regular file, its permissions
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    await put(Buffer.concat([local, name]));
    await put(body);
    files++;
  }
  const start = offset;
  const directory = Buffer.concat(central);
  await put(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files, 8);
  end.writeUInt16LE(files, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(start, 16);
  await put(end);
  return { bytes: offset, files };
}

/* -------------------------------------------------------------------------- */
/* Where it goes                                                              */
/* -------------------------------------------------------------------------- */

/** `<folder>-<yyyy-mm-dd>.zip`: a day's backup beside the last one, not over it. */
export function archiveFileName(root: string, now = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${basename(resolve(root)) || 'artifact'}-${day}.zip`;
}

/**
 * Writes the folder's zip to `out` (through a temp file beside it, so a
 * failure leaves no half zip). `out` may be inside the folder: it is never
 * zipped into itself.
 */
export async function writeArchive(root: string, out: string): Promise<{ file: string; files: number; bytes: number }> {
  const file = resolve(out);
  const entries = await archiveEntries(root, [file]);
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  const handle = await open(temp, 'w');
  let result: { bytes: number; files: number };
  try {
    result = await writeZip(entries, async (chunk) => {
      await handle.write(chunk);
    });
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temp, { force: true });
    throw error;
  }
  await rename(temp, file);
  return { file, ...result };
}

/** `attachment` with the file's name: plain ASCII in `filename`, the real name in `filename*`. */
export function attachmentHeader(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Answers `GET|HEAD /__open-artifact/archive`: the folder's zip, streamed as
 * it is written (no length: each file is deflated on the way). `HEAD` lists
 * the files only, so a folder over plain zip's limits answers 413 before
 * anything is zipped. A connection that closes stops the zipping.
 */
export async function sendArchive(req: IncomingMessage, res: ServerResponse, root: string): Promise<void> {
  const method = req.method ?? 'GET';
  req.resume();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  let entries: ArchiveEntry[];
  try {
    entries = await archiveEntries(root);
  } catch (error) {
    if (error instanceof ArchiveTooLarge) {
      const body = JSON.stringify({ code: 'too_large', message: error.message });
      res.writeHead(413, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(method === 'HEAD' ? undefined : body);
      return;
    }
    throw error;
  }
  res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': attachmentHeader(archiveFileName(root)), 'cache-control': 'no-store' });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  let closed = false;
  res.on('close', () => (closed = true));
  try {
    await writeZip(entries, (chunk) => {
      if (closed || res.destroyed) return Promise.reject(new Error('The connection closed.'));
      if (res.write(chunk)) return Promise.resolve();
      return new Promise<void>((done, fail) => {
        const onDrain = (): void => {
          res.off('close', onClose);
          done();
        };
        const onClose = (): void => {
          res.off('drain', onDrain);
          fail(new Error('The connection closed.'));
        };
        res.once('drain', onDrain);
        res.once('close', onClose);
      });
    });
    res.end();
  } catch {
    // Headers are out: the only way to say it failed is to cut the download short.
    res.destroy();
  }
}

/**
 * `archive <dir> [--out file.zip | folder]`: by default the zip goes beside
 * the artifact folder (in its parent), named by {@link archiveFileName};
 * `--out` an existing folder puts it there under that name.
 */
export async function archiveCommand(root: string, out: string | undefined): Promise<{ file: string; folder: string; files: number; bytes: number }> {
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`${root} is not a folder.`);
  const where = out ? resolve(out) : dirname(resolve(root));
  const target = existsSync(where) && statSync(where).isDirectory() ? join(where, archiveFileName(root)) : where;
  const { file, files, bytes } = await writeArchive(root, target);
  return { file, folder: basename(resolve(root)), files, bytes };
}
