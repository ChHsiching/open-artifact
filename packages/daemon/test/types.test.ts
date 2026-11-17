import { tempDir } from './helpers.ts';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { frameHostBin, hasInlineDeclaration, readTypeFolder } from '../src/types.ts';

const ROOT = { root: '', scope: 'user', trusted: true } as const;

/** A type folder with the given index.html (and artifact-type.json, when given). */
function typeFolder(id: string, html: string, manifest?: object): string {
  const dir = join(tempDir('open-artifact-types-'), id);
  mkdirSync(dir);
  writeFileSync(join(dir, 'index.html'), html);
  if (manifest) writeFileSync(join(dir, 'artifact-type.json'), JSON.stringify(manifest));
  return dir;
}

const ORIGINAL = '<!doctype html><html><head><script>(() => {\n  // artifact.json\n  var key = "fixture";\n  var capabilities = { db: {} };\n})();</script></head><body></body></html>\n';

test('an index.html with an inline // artifact.json block and no entry runs on frame-host', () => {
  const dir = typeFolder('fixture', ORIGINAL);
  const type = readTypeFolder(dir, { ...ROOT, root: dir });
  assert.ok(type);
  assert.equal(type.runtime, 'frame');
  assert.deepEqual(type.problems, []);
  assert.equal(type.runnable, true);
  const bin = frameHostBin();
  assert.ok(bin);
  assert.deepEqual(type.entry, { kind: 'server', start: { command: 'node', args: [bin], env: {} }, url: null, open: true, share: false, actions: true });
  // From source the daemon starts the source bin.
  assert.match(bin, /server-sdk[/\\]bin[/\\]frame-host\.ts$/);
});

test('OPEN_ARTIFACT_FRAME_HOST names the bin', () => {
  process.env.OPEN_ARTIFACT_FRAME_HOST = '/opt/frame-host.mjs';
  try {
    assert.equal(frameHostBin(), '/opt/frame-host.mjs');
  } finally {
    delete process.env.OPEN_ARTIFACT_FRAME_HOST;
  }
});

test('a plain index.html stays static, and an entry wins over the declaration', () => {
  const plain = typeFolder('plain', '<!doctype html><p>// artifact.json is only text here</p>');
  assert.equal(readTypeFolder(plain, ROOT)?.runtime, 'static');
  const withEntry = typeFolder('declared', ORIGINAL, { entry: 'index.html' });
  const type = readTypeFolder(withEntry, ROOT);
  assert.equal(type?.runtime, 'static');
  assert.deepEqual(type?.entry, { kind: 'static', file: 'index.html' });
});

test('only the first 64 KB of index.html are read', () => {
  const late = typeFolder('late', `<!doctype html><!--${'x'.repeat(70 * 1024)}-->${ORIGINAL}`);
  assert.equal(hasInlineDeclaration(late), false);
  assert.equal(readTypeFolder(late, ROOT)?.runtime, 'static');
  assert.equal(hasInlineDeclaration(typeFolder('early', ORIGINAL)), true);
  assert.equal(hasInlineDeclaration(join(late, 'missing')), false);
});
