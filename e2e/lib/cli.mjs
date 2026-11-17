// Running an installed type's scripts/cli.mjs the way an agent does: `node cli.mjs <command> …`.
//
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * The environment the CLI sees: none of node:test's own variables, no daemon (OPEN_ARTIFACT_*), no design systems from this
 * machine, and the state folder and HOME the suite gave it.
 */
function childEnv(base, extra = {}) {
  const env = { ...process.env, ...base, ...extra };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  delete env.OPEN_ARTIFACT_DESIGN_SYSTEMS;
  delete env.OPEN_ARTIFACT_ASSETS;
  for (const key of Object.keys(env)) if (key.startsWith('OPEN_ARTIFACT_') && !(key in base) && !(key in extra)) delete env[key];
  return env;
}

/** Run `node <script> …args`; resolves {code, stdout, stderr, json} (json: stdout parsed, or undefined). */
export function run(script, args, { cwd = path.dirname(script), input, timeout = 60000, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${path.basename(script)} ${args.join(' ')}: no answer after ${timeout} ms\n${stderr}`));
    }, timeout);
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      let json;
      try {
        json = JSON.parse(stdout);
      } catch {}
      resolve({ code, stdout, stderr, json });
    });
    child.stdin.end(input ?? '');
  });
}

/**
 * Start `node <script> …args` and leave it running (`serve`, `wait`): resolves {child, line, exited, stdout(),
 * stderr()} once it printed its first line on stdout (`firstLine: false`: at once). Its pipes are still read (a server
 * writing to a closed pipe would die of EPIPE) but no longer hold the test file open, nor does the child: stop it with
 * child.kill() and await `exited` (removeTmp ends it otherwise).
 */
export function start(script, args, { cwd = path.dirname(script), env, timeout = 30000, firstLine = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = new Promise(done => child.once('exit', (code, signal) => done({ code, signal })));
    let stdout = '';
    let stderr = '';
    let settled = false;
    const release = () => {
      clearTimeout(timer);
      child.stdout.unref?.();
      child.stderr.unref?.();
      child.unref();
    };
    const done = line => {
      if (settled) return;
      settled = true;
      release();
      resolve({ child, line, exited, stdout: () => stdout, stderr: () => stderr });
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      release();
      child.kill('SIGKILL');
      reject(new Error(`${path.basename(script)} ${args.join(' ')}: printed nothing in ${timeout} ms\n${stdout}${stderr}`));
    }, timeout);
    child.stderr.on('data', d => (stderr += d));
    child.stdout.on('data', d => {
      stdout += d;
      const end = stdout.indexOf('\n');
      if (firstLine && end >= 0) done(stdout.slice(0, end));
    });
    child.on('error', error => {
      if (settled) return;
      settled = true;
      release();
      reject(error);
    });
    if (!firstLine) child.once('spawn', () => done(null));
    exited.then(({ code, signal }) => {
      if (settled) return;
      settled = true;
      release();
      reject(new Error(`${path.basename(script)} ${args.join(' ')} exited (${code ?? signal}) before it printed a line:\n${stdout}${stderr}`));
    });
  });
}

/** The CLI of an installed type folder, with the suite's own environment (`env`: OPEN_ARTIFACT_TYPE_SERVER_HOME, HOME). */
export function cli(typeDir, base = {}) {
  const script = path.join(typeDir, 'scripts', 'cli.mjs');
  const cwd = path.dirname(typeDir);
  const opts = o => ({ cwd, ...o, env: childEnv(base, o?.env) });
  return {
    script,
    env: extra => childEnv(base, extra),
    run: (args, o) => run(script, args, opts(o)),
    start: (args, o) => start(script, args, opts(o)),
    /** Run a command that must succeed and print JSON; returns the JSON. */
    async json(args, o) {
      const r = await run(script, args, opts(o));
      assert.equal(r.code, 0, `cli.mjs ${args.join(' ')} exited ${r.code}\n${r.stderr || r.stdout}`);
      assert.ok(r.json !== undefined, `cli.mjs ${args.join(' ')} printed no JSON:\n${r.stdout.slice(0, 500)}`);
      return r.json;
    },
  };
}
