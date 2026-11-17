import { tempDir } from './helpers.ts';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { antigravityHub, nudgeSession, nudgeText, type NudgeRun } from '../src/nudge.ts';

/** A home folder with Antigravity's hub files. */
function home(hubs: Record<string, object | string>): string {
  const dir = tempDir('open-artifact-nudge-');
  const daemon = join(dir, '.gemini', 'antigravity', 'daemon');
  mkdirSync(daemon, { recursive: true });
  for (const [name, hub] of Object.entries(hubs)) writeFileSync(join(daemon, name), typeof hub === 'string' ? hub : JSON.stringify(hub));
  return dir;
}

test('antigravityHub: the live hub, skipping dead and unreadable ones', () => {
  const dir = home({
    'hub_1.json': { pid: 11, httpPort: 1, csrfToken: 'dead' },
    'hub_2.json': '{ not json',
    'hub_3.json': { pid: 33, httpPort: 3, csrfToken: 'live' },
    'other.json': { pid: 33, httpPort: 9, csrfToken: 'no' },
  });
  assert.deepEqual(antigravityHub(dir, (pid) => pid === 33), { address: '127.0.0.1:3', csrf: 'live' });
  assert.equal(antigravityHub(dir, () => false), null);
  assert.equal(antigravityHub(tempDir('open-artifact-nudge-none-')), null);
});

test('nudgeSession: sends the message to the conversation through agentapi', async () => {
  const dir = home({ 'hub_7.json': { pid: 77, httpPort: 7, csrfToken: 'tok' } });
  const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
  const run: NudgeRun = async (command, args, env) => {
    calls.push({ command, args, env });
    return null;
  };
  process.env.OPEN_ARTIFACT_ANTIGRAVITY_AGENTAPI = '/bin/agentapi-test';
  try {
    const url = 'open-artifact://artifact/art_1';
    assert.equal(await nudgeSession({ harness: 'antigravity', session: 'conv-1', workspace: null }, url, { home: dir, alive: () => true, run }), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, '/bin/agentapi-test');
    assert.deepEqual(calls[0].args, ['send-message', 'conv-1', nudgeText(url)]);
    assert.equal(calls[0].env.ANTIGRAVITY_LS_ADDRESS, '127.0.0.1:7');
    assert.equal(calls[0].env.ANTIGRAVITY_CSRF_TOKEN, 'tok');

    // Other harnesses, no session, the app not running, a failing command: no nudge.
    assert.equal(await nudgeSession({ harness: 'claude-code', session: 's', workspace: null }, url, { home: dir, alive: () => true, run }), false);
    assert.equal(await nudgeSession({ harness: 'antigravity', session: null, workspace: '/w' }, url, { home: dir, alive: () => true, run }), false);
    assert.equal(await nudgeSession({ harness: 'antigravity', session: 'conv-1', workspace: null }, url, { home: dir, alive: () => false, run }), false);
    assert.equal(calls.length, 1);
    const failing: NudgeRun = async () => new Error('exit 1');
    assert.equal(await nudgeSession({ harness: 'antigravity', session: 'conv-1', workspace: null }, url, { home: dir, alive: () => true, run: failing }), false);
  } finally {
    delete process.env.OPEN_ARTIFACT_ANTIGRAVITY_AGENTAPI;
  }
});

test('nudgeSession: queues the message for a Codex thread', async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const run: NudgeRun = async (command, args) => {
    calls.push({ command, args });
    return null;
  };
  process.env.OPEN_ARTIFACT_CODEX_BIN = '/bin/codex-test';
  try {
    const url = 'open-artifact://artifact/art_2';
    assert.equal(await nudgeSession({ harness: 'codex', session: 'thread-1', workspace: '/w' }, url, { run }), true);
    assert.deepEqual(calls, [{ command: '/bin/codex-test', args: ['queue', '--thread', 'thread-1', '--message', nudgeText(url)] }]);
    assert.equal(await nudgeSession({ harness: 'codex', session: null, workspace: '/w' }, url, { run }), false);
    assert.equal(await nudgeSession({ harness: 'codex', session: 'thread-1', workspace: null }, url, { run: async () => new Error('exit 2') }), false);
    assert.equal(calls.length, 1);
  } finally {
    delete process.env.OPEN_ARTIFACT_CODEX_BIN;
  }
});
