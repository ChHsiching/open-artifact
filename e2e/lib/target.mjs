// What the end-to-end tests run against, and the throwaway folders they work in.
//
// E2E_DIR       the folder holding the built types: artifact-types/ (default), or a copy of it (run.mjs --dir)
// E2E_BROWSER=0 skip the Chrome checks
// E2E_KEEP=1    keep the temporary folders (their paths are printed)
//
// Every type is copied out of the tree into a temporary folder before it runs, as someone who installs the skill
// would have it: outside this repository, so nothing resolves from its node_modules. Each test file gets a server
// state folder of its own (OPEN_ARTIFACT_TYPE_SERVER_HOME) and a HOME of its own, so it never meets the server you use, nor
// another test file's, and downloads land in a folder the test reads.
//
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alive } from './http.mjs';

export const e2eRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const repoRoot = path.dirname(e2eRoot);
export const fixtures = path.join(e2eRoot, 'fixtures');
export const target = path.resolve(process.env.E2E_DIR || path.join(repoRoot, 'artifact-types'));
export const browserOff = process.env.E2E_BROWSER === '0';
export const keep = process.env.E2E_KEEP === '1';

export const typePath = type => path.join(target, type);

/** false when the type can be tested, else why not (a `describe` skip reason). */
export function skipFor(type) {
  const dir = typePath(type);
  if (!fs.existsSync(path.join(dir, 'SKILL.md'))) return `${type} is not in ${target}`;
  const built = ['scripts/cli.mjs', 'scripts/support.js', 'scripts/editors/design/index.html', 'scripts/editors/design-system/index.html'];
  const missing = built.filter(f => !fs.existsSync(path.join(dir, f)));
  if (missing.length) return `${type} is not built (npm run build): no ${missing.join(', ')}`;
  return false;
}

const made = [];

/** A new empty folder under the system's temp folder (its real path: macOS's /var is /private/var). */
export function tmpDir(label) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `open-artifact-e2e-${label}-`)));
  made.push(dir);
  return dir;
}

/**
 * End every process started from or for these folders. `open` starts the server detached, so nothing else ends it: one
 * a test did not get as far as recording would outlive its folders. It runs the installed copy's cli.mjs, so its
 * command line names the folder.
 */
function stopServers(dirs) {
  let listing;
  try {
    listing = execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return;
  }
  const pids = [];
  for (const line of listing.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (m && Number(m[1]) !== process.pid && dirs.some(dir => m[2].includes(dir))) pids.push(Number(m[1]));
  }
  const signal = (pid, name) => {
    try {
      process.kill(pid, name);
    } catch {}
  };
  for (const pid of pids) signal(pid, 'SIGTERM');
  // Synchronous, since this also runs while the process exits: the folders must not go while a server still writes to them.
  const end = Date.now() + 2000;
  while (pids.some(alive) && Date.now() < end) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  for (const pid of pids.filter(alive)) signal(pid, 'SIGKILL');
}

/** Stop what still runs from the folders tmpDir made, and remove them (or print them with E2E_KEEP=1). */
export function removeTmp() {
  const dirs = made.splice(0);
  if (dirs.length) stopServers(dirs);
  for (const dir of dirs) {
    if (keep) console.log(`# kept ${dir}`);
    else fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}

// A test file that is signalled (Ctrl-C, `timeout`, node --test cancelling it) runs no `after` hook. SIGKILL can't be
// caught: after one, `pgrep -fl open-artifact-e2e` finds what is left.
process.on('exit', removeTmp);
// `on`, not `once`: node --test passes a signal on, and a second one must not end the process halfway through the clean-up.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(128 + os.constants.signals[signal]));

/** Copy a type folder out of the tree: returns {work, dir}, the copy at <work>/<name>. */
export function install(from, label = path.basename(from)) {
  const work = tmpDir(label);
  const dir = path.join(work, path.basename(from));
  fs.cpSync(from, dir, { recursive: true });
  return { work, dir };
}

/** Copy e2e/fixtures/<name> to `dest`. */
export function copyFixture(name, dest) {
  fs.cpSync(path.join(fixtures, name), dest, { recursive: true });
}
