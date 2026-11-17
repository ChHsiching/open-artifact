/**
 * Nudges: waking an agent session that is idle, for harnesses whose hooks hand over the inbox only when a turn runs.
 * A wake that went to such a session's inbox starts a turn there with a short message; the harness's hook then gives
 * the agent the waiting messages themselves.
 *
 * - `antigravity`: `agentapi send-message <conversationId> <text>`, the Antigravity app's own command line, pointed at
 *   the running app by its hub file (`~/.gemini/antigravity/daemon/hub_<port>.json`).
 * - `codex`: `codex queue --thread <threadId> --message <text>`, Codex's own queue of messages for a thread
 *   (`~/.codex/queue_1.sqlite`); the desktop app runs a queued message as soon as the thread is idle.
 */

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { SessionRef } from '@open-artifact/protocol';

/** How long a nudge command may run, ms. */
const NUDGE_TIMEOUT_MS = 15_000;

/** Runs a command; resolves with its error, if any. */
export type NudgeRun = (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<Error | null>;

/** Options of {@link nudgeSession}. */
export interface NudgeOptions {
  /** Home folder that holds `.gemini/` (default: the person's). */
  home?: string;
  /** Whether a process is alive (default: `process.kill(pid, 0)`). */
  alive?: (pid: number) => boolean;
  run?: NudgeRun;
  log?: (line: string) => void;
}

const defaultRun: NudgeRun = (command, args, env) =>
  new Promise((done) => {
    execFile(command, args, { env, timeout: NUDGE_TIMEOUT_MS, windowsHide: true }, (error) => done(error));
  });

const defaultAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** The running Antigravity app's language server: its HTTP port and CSRF token, from the newest live hub file. */
export function antigravityHub(home: string, alive: (pid: number) => boolean = defaultAlive): { address: string; csrf: string } | null {
  const dir = join(home, '.gemini', 'antigravity', 'daemon');
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => /^hub_\d+\.json$/.test(name));
  } catch {
    return null;
  }
  for (const name of names) {
    try {
      const hub = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { pid?: number; httpPort?: number; csrfToken?: string };
      if (!hub.httpPort || !hub.csrfToken || (hub.pid && !alive(hub.pid))) continue;
      return { address: `127.0.0.1:${hub.httpPort}`, csrf: hub.csrfToken };
    } catch {
      // a hub file being written: skip it
    }
  }
  return null;
}

/** The `agentapi` command: `$OPEN_ARTIFACT_ANTIGRAVITY_AGENTAPI`, the one the app installs, else the app's own binary. */
function agentapi(home: string): { command: string; args: string[] } | null {
  const named = process.env.OPEN_ARTIFACT_ANTIGRAVITY_AGENTAPI;
  if (named) return { command: named, args: [] };
  const installed = join(home, '.gemini', 'antigravity', 'bin', 'agentapi');
  if (existsSync(installed)) return { command: installed, args: [] };
  const app = '/Applications/Antigravity.app/Contents/Resources/bin/language_server';
  if (process.platform === 'darwin' && existsSync(app)) return { command: app, args: ['agentapi'] };
  return null;
}

/** The `codex` command: `$OPEN_ARTIFACT_CODEX_BIN`, the one the ChatGPT desktop app carries, else `codex` on the PATH. */
function codex(): string | null {
  const named = process.env.OPEN_ARTIFACT_CODEX_BIN;
  if (named) return named;
  const app = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
  if (process.platform === 'darwin' && existsSync(app)) return app;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of process.platform === 'win32' ? ['codex.cmd', 'codex.exe'] : ['codex']) {
      if (dir && existsSync(join(dir, name))) return join(dir, name);
    }
  }
  return null;
}

/** The message a nudge starts the turn with; the hook, or the next tool call, adds the waiting messages themselves. */
export function nudgeText(artifact: string): string {
  return `Open Artifact: the person sent comments or requests from ${artifact}. They come with this message or your next Open Artifact tool call; handle them (ArtifactComments {action: "read", url: "${artifact}"} shows them too).`;
}

/**
 * Wakes `ref`'s session when its harness is one that can be nudged; `false` when it was not (another harness, no
 * session, the app not running, or the command failed).
 */
export async function nudgeSession(ref: SessionRef, artifact: string, options: NudgeOptions = {}): Promise<boolean> {
  if (!ref.session) return false;
  const log = options.log ?? (() => undefined);
  const run = options.run ?? defaultRun;
  if (ref.harness === 'codex') {
    const bin = codex();
    if (!bin) {
      log(`nudge codex:${ref.session}: no codex command`);
      return false;
    }
    const error = await run(bin, ['queue', '--thread', ref.session, '--message', nudgeText(artifact)], process.env);
    log(`nudge codex:${ref.session}: ${error ? `failed: ${error.message}` : 'queued'}`);
    return !error;
  }
  if (ref.harness !== 'antigravity') return false;
  const home = options.home ?? homedir();
  const hub = antigravityHub(home, options.alive);
  const bin = agentapi(home);
  if (!hub || !bin) {
    log(`nudge antigravity:${ref.session}: ${hub ? 'no agentapi command' : 'the Antigravity app is not running'}`);
    return false;
  }
  const env = { ...process.env, ANTIGRAVITY_LS_ADDRESS: hub.address, ANTIGRAVITY_CSRF_TOKEN: hub.csrf };
  const error = await run(bin.command, [...bin.args, 'send-message', ref.session, nudgeText(artifact)], env);
  log(`nudge antigravity:${ref.session}: ${error ? `failed: ${error.message}` : 'sent'}`);
  return !error;
}
