/**
 * The skill's launcher (skills/open-artifact/scripts/open-artifact.mjs): who it says is calling. It runs here with a
 * stand-in vendored daemon that prints the variables the launcher hands it.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';

const launcher = resolve(import.meta.dirname, '..', '..', '..', 'skills', 'open-artifact', 'scripts', 'open-artifact.mjs');
/** A stand-in vendored daemon: prints what the launcher handed it. */
const STUB =
  'process.stdout.write(JSON.stringify({ harness: process.env.OPEN_ARTIFACT_HARNESS ?? null, session: process.env.OPEN_ARTIFACT_SESSION ?? null, plugin: process.env.OPEN_ARTIFACT_PLUGIN_DIR ?? null }));\n';
const skill = mkdtempSync(join(tmpdir(), 'oa-launcher-'));
mkdirSync(join(skill, 'scripts'));
mkdirSync(join(skill, 'vendor'));
copyFileSync(launcher, join(skill, 'scripts', 'open-artifact.mjs'));
writeFileSync(
  join(skill, 'vendor', 'open-artifact.mjs'),
  STUB,
);
// The same launcher where a plugin carries it: `<plugin>/skills/open-artifact`.
const plugin = realpathSync(mkdtempSync(join(tmpdir(), 'oa-plugin-')));
const pluginSkill = join(plugin, 'skills', 'open-artifact');
mkdirSync(join(pluginSkill, 'scripts'), { recursive: true });
mkdirSync(join(pluginSkill, 'vendor'));
copyFileSync(launcher, join(pluginSkill, 'scripts', 'open-artifact.mjs'));
writeFileSync(join(pluginSkill, 'vendor', 'open-artifact.mjs'), STUB);
writeFileSync(join(plugin, 'plugin.json'), '{}');
after(() => {
  rmSync(skill, { recursive: true, force: true });
  rmSync(plugin, { recursive: true, force: true });
});

/** The launcher's caller for `args`, with only `vars` (and PATH) in its environment. */
function caller(args: string[], vars: Record<string, string>): { harness: string | null; session: string | null } {
  const { harness, session } = run(skill, args, vars);
  return { harness, session };
}

/** What the launcher in `dir` hands the daemon. */
function run(dir: string, args: string[], vars: Record<string, string> = {}): { harness: string | null; session: string | null; plugin: string | null } {
  const out = execFileSync(process.execPath, [join(dir, 'scripts', 'open-artifact.mjs'), ...args], {
    env: { PATH: process.env.PATH ?? '', ...vars },
    encoding: 'utf8',
  });
  return JSON.parse(out) as { harness: string | null; session: string | null; plugin: string | null };
}

const claudeCode = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'claude-session' };
const codex = { CODEX_THREAD_ID: 'codex-thread' };

test('launcher: a plugin naming its harness never takes another agent app’s session', () => {
  // An app started from inside a Claude Code or Codex session holds that session's variables.
  for (const harness of ['antigravity', 'cursor', 'copilot', 'chatgpt']) {
    for (const leaked of [claudeCode, codex, { ...claudeCode, ...codex }]) {
      assert.deepEqual(caller(['mcp', '--harness', harness], leaked), { harness, session: null }, `${harness} with ${Object.keys(leaked)}`);
      assert.deepEqual(caller(['hook', 'Stop', '--harness', harness], leaked), { harness, session: null });
    }
  }
  assert.deepEqual(caller(['mcp', '--harness', 'codex'], claudeCode), { harness: 'codex', session: null });
  assert.deepEqual(caller(['mcp', '--harness', 'codex'], { ...claudeCode, ...codex }), { harness: 'codex', session: 'codex-thread' });
  assert.deepEqual(caller(['mcp', '--harness', 'claude-code'], codex), { harness: 'claude-code', session: null });
  assert.deepEqual(caller(['mcp', '--harness', 'claude-code'], { ...claudeCode, ...codex }), { harness: 'claude-code', session: 'claude-session' });
});

test('launcher: without --harness it goes by the variables', () => {
  assert.deepEqual(caller(['artifact', '{}'], claudeCode), { harness: 'claude-code', session: 'claude-session' });
  assert.deepEqual(caller(['artifact', '{}'], codex), { harness: 'codex', session: 'codex-thread' });
  assert.deepEqual(caller(['artifact', '{}'], {}), { harness: null, session: null });
  // Variables the person set win over both.
  assert.deepEqual(caller(['mcp', '--harness', 'cursor'], { ...claudeCode, OPEN_ARTIFACT_HARNESS: 'x', OPEN_ARTIFACT_SESSION: 's' }), {
    harness: 'x',
    session: 's',
  });
});

test('launcher: names the plugin it came in, whose folder is never the workspace', () => {
  assert.equal(run(pluginSkill, ['mcp', '--harness', 'codex']).plugin, plugin);
  assert.equal(run(skill, ['mcp', '--harness', 'codex']).plugin, null, 'a skill folder on its own is no plugin');
});
