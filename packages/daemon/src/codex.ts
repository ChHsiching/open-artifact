/**
 * The folder a Codex thread works in. Codex starts a plugin's MCP server in the plugin's own folder and names only
 * the thread (`_meta.threadId`) on each call, and its hooks, which carry `cwd`, run only once the person trusts them in
 * `/hooks`. The thread's rollout file says where it runs: its first line is the `session_meta`, with `cwd`.
 */

import { closeSync, existsSync, openSync, readdirSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Day folders (`sessions/YYYY/MM/DD`) looked through, newest first. */
const MAX_DAYS = 90;
/** Most bytes read for the first line. */
const MAX_LINE = 1 << 20;

const found = new Map<string, string>();

/** `$CODEX_HOME`, else `~/.codex`. */
export function codexHome(): string {
  return process.env.CODEX_HOME || join(homedir(), '.codex');
}

/** Names in `dir`, newest (largest) first; none when it cannot be read. */
function newestFirst(dir: string): string[] {
  try {
    return readdirSync(dir).sort().reverse();
  } catch {
    return [];
  }
}

/** The first line of `file`, up to {@link MAX_LINE} bytes. */
function firstLine(file: string): string {
  const fd = openSync(file, 'r');
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    while (size < MAX_LINE) {
      const chunk = Buffer.alloc(64 * 1024);
      const n = readSync(fd, chunk, 0, chunk.length, size);
      if (!n) break;
      const end = chunk.subarray(0, n).indexOf(10);
      chunks.push(chunk.subarray(0, end < 0 ? n : end));
      size += n;
      if (end >= 0) break;
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** The `cwd` of Codex thread `thread`, from its rollout file; `null` when there is none. */
export function codexThreadWorkspace(thread: string | null | undefined, home = codexHome()): string | null {
  if (!thread || !/^[\w-]+$/.test(thread)) return null;
  const known = found.get(thread);
  if (known) return known;
  const sessions = join(home, 'sessions');
  if (!existsSync(sessions)) return null;
  const suffix = `-${thread}.jsonl`;
  let days = 0;
  for (const year of newestFirst(sessions)) {
    for (const month of newestFirst(join(sessions, year))) {
      for (const day of newestFirst(join(sessions, year, month))) {
        if (++days > MAX_DAYS) return null;
        const dir = join(sessions, year, month, day);
        const name = newestFirst(dir).find((file) => file.endsWith(suffix));
        if (!name) continue;
        try {
          const meta = JSON.parse(firstLine(join(dir, name))) as { type?: string; payload?: { cwd?: unknown } };
          const cwd = meta.type === 'session_meta' && typeof meta.payload?.cwd === 'string' ? meta.payload.cwd : null;
          if (cwd) found.set(thread, cwd);
          return cwd;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
