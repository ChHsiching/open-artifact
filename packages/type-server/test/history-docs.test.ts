/**
 * A whiteboard's version history keeps element snapshots, not live state
 * (claims, the timer, per-person ideas), and a page's db write can be
 * conditional (`ifMatch`): a stale hash refuses the whole batch.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { HistoryListing } from '@open-artifact/runtime/capabilities';
import { isTrackedPath } from '../src/history-host.ts';
import { createTypeServer, type TypeServer } from '../src/index.ts';
import { historyTracksOf } from '../src/types.ts';

const hash = (data: unknown): string => createHash('sha256').update(JSON.stringify(data)).digest('hex');

async function until(ready: () => boolean | Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((done) => setTimeout(done, 20));
  }
}

describe('whiteboard history filter', () => {
  it('tracks elements, meta and inks; ignores claims, the timer and data/', () => {
    const tracks = historyTracksOf('whiteboard');
    assert.ok(tracks);
    for (const path of ['db/elements/n1', 'db/board/meta', 'db/board/inks', 'project/notes.md']) assert.equal(isTrackedPath(path, tracks), true, path);
    for (const path of ['db/board/claim-abc', 'db/board/timer', 'db/data/users/u1/idea']) assert.equal(isTrackedPath(path, tracks), false, path);
    assert.equal(historyTracksOf('design'), undefined);
  });
});

describe('whiteboard db writes on the type server', () => {
  let dir: string;
  let server: TypeServer;
  const post = (page: string, path: string, body: unknown): Promise<Response> =>
    fetch(new URL(path, page), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const list = async (page: string): Promise<HistoryListing> => (await (await fetch(new URL('_api/history', page))).json()) as HistoryListing;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'open-artifact-history-docs-'));
    const assets = join(dir, 'assets');
    await mkdir(join(assets, 'editors', 'whiteboard'), { recursive: true });
    await writeFile(join(assets, 'editors', 'whiteboard', 'index.html'), '<!doctype html>');
    await writeFile(join(assets, 'support.js'), '');
    server = createTypeServer({ assetsDir: assets, secret: 'test-secret', idleMs: 0, viewerName: 'Ada', downloadsDir: join(dir, 'downloads') });
    await server.listen();
  });

  after(async () => {
    await server.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('records element changes but not claims, timer ticks or ideas', async () => {
    const root = join(dir, 'Noise');
    const page = (await server.open({ root, type: 'whiteboard', title: 'Noise' })).url;
    await until(async () => (await list(page)).versions.length === 1);
    const noise = [
      { op: 'set', path: 'board/claim-k1', data: { x: 0, y: 0, w: 100, h: 100, by: 'agent' } },
      { op: 'set', path: 'board/timer', data: { durationMs: 60000, startedAt: 1 } },
      { op: 'set', path: 'data/users/owner/idea', data: { about: 'board' } },
    ];
    assert.equal((await post(page, '_api/db/write', { client: 'c1', writes: noise })).status, 200);
    assert.equal((await post(page, '_api/db/write', { client: 'c1', writes: [{ op: 'set', path: 'elements/n1', data: { type: 'note', text: 'Hi' } }] })).status, 200);
    await until(async () => (await list(page)).versions.length === 2);
    // Give a stray version from the noise a moment to show up.
    await new Promise((done) => setTimeout(done, 150));
    const listing = await list(page);
    const paths = listing.versions.flatMap((version) => version.files.map((file) => file.path));
    assert.ok(paths.includes('db/elements/n1'));
    assert.deepEqual(
      paths.filter((path) => path.startsWith('db/board/claim-') || path === 'db/board/timer' || path.startsWith('db/data/')),
      [],
    );
    // A restore never writes untracked documents back: the claim stays.
    assert.equal((await post(page, '_api/history/restore', { n: 1 })).status, 200);
    assert.equal(existsSync(join(root, 'db', 'elements', 'n1.json')), false);
    assert.equal(existsSync(join(root, 'db', 'board', 'claim-k1.json')), true);
  });

  it('refuses a page write whose ifMatch no longer holds, and writes one that does', async () => {
    const root = join(dir, 'Guard');
    const page = (await server.open({ root, type: 'whiteboard', title: 'Guard' })).url;
    const first = { about: 'board', v: 1 };
    const second = { about: 'board', v: 2 };
    const path = 'data/users/owner/idea';
    assert.equal((await post(page, '_api/db/write', { client: 'c1', writes: [{ op: 'set', path, data: first }] })).status, 200);
    // The agent replaced it meanwhile.
    assert.equal((await post(page, '_api/db/write', { client: 'c2', writes: [{ op: 'set', path, data: second, ifMatch: hash(first) }] })).status, 200);

    const stale = await post(page, '_api/db/write', { client: 'c1', writes: [{ op: 'delete', path, ifMatch: hash(first) }] });
    assert.equal(stale.status, 409);
    const body = (await stale.json()) as { code: string; paths?: { path: string; expected: string; actual: string }[] };
    assert.equal(body.code, 'conflict');
    assert.deepEqual(body.paths, [{ path, expected: hash(first), actual: hash(second) }]);
    assert.ok(existsSync(join(root, 'db', 'data', 'users', 'owner', 'idea.json')), 'nothing was deleted');

    // null: only while absent.
    const absent = await post(page, '_api/db/write', { client: 'c1', writes: [{ op: 'set', path, data: first, ifMatch: null }] });
    assert.equal(absent.status, 409);
    const bad = await post(page, '_api/db/write', { client: 'c1', writes: [{ op: 'delete', path, ifMatch: 'nope' }] });
    assert.equal(bad.status, 400);

    assert.equal((await post(page, '_api/db/write', { client: 'c1', writes: [{ op: 'delete', path, ifMatch: hash(second) }] })).status, 200);
    assert.equal(existsSync(join(root, 'db', 'data', 'users', 'owner', 'idea.json')), false);
  });
});
