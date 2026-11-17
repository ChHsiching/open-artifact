/**
 * The version history: the store (coalescing, retention, restores, notices,
 * several processes on one folder), the page routes of a project-style type
 * and of a db-backed one, and the CLI.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it, mock } from 'node:test';
import type { HistoryFileDiff, HistoryListing, HistoryRestoreResult } from '@open-artifact/runtime/capabilities';
import { HISTORY_AGENT, HISTORY_SYSTEM, History, undoes } from '../src/history.ts';
import { createTypeServer, main, sha256, type TypeServer } from '../src/index.ts';

const ADA = { kind: 'person' as const, id: 'owner', name: 'Ada' };
const BEN = { kind: 'person' as const, id: 'ben', name: 'Ben' };
const T0 = Date.parse('2026-11-16T10:00:00Z');
const at = (seconds: number): Date => new Date(T0 + seconds * 1000);
const files = (entries: Record<string, string | null>): Map<string, Buffer | null> =>
  new Map(Object.entries(entries).map(([p, v]) => [p, v === null ? null : Buffer.from(v)]));

/** Resolves once `ready()` holds, polling. */
async function until(ready: () => boolean | Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((done) => setTimeout(done, 20));
  }
}

/** One page's server-sent event stream. */
async function openEvents(page: string, client: string) {
  const response = await fetch(new URL(`_api/events?client=${client}`, page));
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const seen: { name: string; data: unknown }[] = [];
  let buffer = '';
  let done = false;
  void (async () => {
    for (;;) {
      const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const name = /^event: (.*)$/m.exec(frame)?.[1];
        const data = /^data: (.*)$/m.exec(frame)?.[1];
        if (name && data) seen.push({ name, data: JSON.parse(data) as unknown });
      }
    }
    done = true;
  })();
  await until(() => seen.some((e) => e.name === 'peers'));
  return {
    seen,
    async wait(predicate: (name: string, data: unknown) => boolean): Promise<unknown> {
      await until(() => seen.some((e) => predicate(e.name, e.data)));
      return seen.find((e) => predicate(e.name, e.data))!.data;
    },
    close: async () => {
      await reader.cancel();
      await until(() => done);
    },
  };
}

/** Runs the CLI, returning its exit code and what it printed. */
async function cli(argv: string[]): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const log = mock.method(console, 'log', (...args: unknown[]) => void lines.push(args.join(' ')));
  const error = mock.method(console, 'error', (...args: unknown[]) => void lines.push(args.join(' ')));
  const write = mock.method(process.stdout, 'write', (chunk: unknown) => (lines.push(String(chunk)), true));
  try {
    const code = await main(argv);
    return { code, out: lines.join('\n') };
  } finally {
    log.mock.restore();
    error.mock.restore();
    write.mock.restore();
  }
}

describe('History store', () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'open-artifact-history-'));
  });
  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('joins an author’s burst of changes into one version, and leaves out no-ops', async () => {
    const history = new History(join(dir, 'a'));
    assert.equal(history.empty, true);
    assert.equal(history.record(files({ 'project/a.txt': 'one' }), HISTORY_SYSTEM, {}, at(0))?.n, 1);
    // The same content again: no version.
    assert.equal(history.record(files({ 'project/a.txt': 'one' }), ADA, {}, at(1)), null);
    const v2 = history.record(files({ 'project/a.txt': 'two' }), ADA, {}, at(2));
    assert.equal(v2?.n, 2);
    // Within 30 s of Ada's last change: the same version.
    assert.equal(history.record(files({ 'project/b.txt': 'b' }), ADA, {}, at(20))?.n, 2);
    assert.equal(history.record(files({ 'project/a.txt': 'three' }), ADA, {}, at(45))?.n, 2);
    // Another author starts a new one; so does Ada after a pause.
    assert.equal(history.record(files({ 'project/c.txt': 'c' }), HISTORY_AGENT, {}, at(50))?.n, 3);
    assert.equal(history.record(files({ 'project/c.txt': 'c2' }), ADA, {}, at(55))?.n, 4);
    assert.equal(history.record(files({ 'project/c.txt': 'c3' }), ADA, {}, at(100))?.n, 5);
    assert.deepEqual(Object.keys(history.version(2)!.changes).sort(), ['project/a.txt', 'project/b.txt']);
    assert.deepEqual(history.fileChanges().get(2), [
      { path: 'project/a.txt', op: 'edited' },
      { path: 'project/b.txt', op: 'added' },
    ]);
  });

  it('ends a version that spans five minutes even without a pause', () => {
    const history = new History(join(dir, 'span'));
    let last = 0;
    for (let s = 0; s <= 320; s += 20) last = history.record(files({ 'project/x': `v${s}` }), ADA, {}, at(s))!.n;
    assert.equal(last, 2);
    assert.ok(Date.parse(history.version(1)!.at) - Date.parse(history.version(1)!.first) < 300_000);
  });

  it('keeps the newest versions, folding the oldest into the base and dropping unused contents', () => {
    const root = join(dir, 'retention');
    const history = new History(root, { maxVersions: 3 });
    for (let i = 1; i <= 6; i++) history.record(files({ 'project/x': `v${i}`, ...(i === 1 ? { 'project/keep': 'k' } : {}) }), ADA, {}, at(i * 100));
    assert.deepEqual(history.versions().map((v) => v.n), [4, 5, 6]);
    // The folded versions still decide what the oldest kept one looked like before it.
    assert.equal(history.read(history.stateBefore(4).get('project/x')!)?.toString(), 'v3');
    assert.equal(history.read(history.stateAt(4)!.get('project/keep')!)?.toString(), 'k');
    const objects = readdirSync(join(root, 'history', 'objects')).sort();
    assert.deepEqual(objects, ['k', 'v3', 'v4', 'v5', 'v6'].map((s) => sha256(s)).sort());
    // Numbers are never reused, also after a reload.
    assert.equal(new History(root, { maxVersions: 3 }).record(files({ 'project/x': 'v7' }), ADA, {}, at(1000))?.n, 7);
  });

  it('restores a whole version or chosen paths, as a version of its own', () => {
    const history = new History(join(dir, 'restore'));
    history.record(files({ 'project/a': 'a1', 'project/b': 'b1' }), HISTORY_SYSTEM, {}, at(0));
    history.record(files({ 'project/a': 'a2', 'project/b': null, 'project/c': 'c2' }), HISTORY_AGENT, {}, at(10));
    const whole = history.restoreTo(1)!;
    assert.deepEqual(
      [...whole].map(([p, b]) => [p, b?.toString() ?? null]).sort(),
      [
        ['project/a', 'a1'],
        ['project/b', 'b1'],
        ['project/c', null],
      ],
    );
    const one = history.restoreTo(1, ['project/b'])!;
    assert.deepEqual([...one.keys()], ['project/b']);
    const v = history.record(one, ADA, { restoredFrom: 1 }, at(11));
    assert.equal(v?.restoredFrom, 1);
    // A restore never joins, and nothing joins it.
    assert.equal(history.record(files({ 'project/a': 'a3' }), ADA, {}, at(12))?.n, 4);
    assert.equal(history.restoreTo(99), null);
  });

  it('notices when someone else undoes part of a person’s recent change', () => {
    const history = new History(join(dir, 'notices'));
    const doc = (value: object): string => `${JSON.stringify(value, null, 2)}\n`;
    history.record(files({ 'db/elements/n1': doc({ text: 'Hi', x: 0 }) }), HISTORY_SYSTEM, {}, at(0));
    history.record(files({ 'db/elements/n1': doc({ text: 'Hello', x: 0 }) }), ADA, {}, at(10));
    // The agent moves the note, keeping Ada's text: nothing lost.
    const kept = history.record(files({ 'db/elements/n1': doc({ text: 'Hello', x: 5 }) }), HISTORY_AGENT, {}, at(20));
    assert.equal(kept?.overwrote, undefined);
    assert.deepEqual(history.noticesFor('owner'), []);
    history.record(files({ 'db/elements/n1': doc({ text: 'Hello again', x: 5 }) }), ADA, {}, at(60));
    // The agent writes from an old read: Ada's text goes back.
    const lost = history.record(files({ 'db/elements/n1': doc({ text: 'Hello', x: 9 }) }), HISTORY_AGENT, {}, at(70));
    assert.equal(lost?.overwrote?.[0]?.path, 'db/elements/n1');
    const [notice] = history.noticesFor('owner');
    assert.equal(notice?.n, lost!.n);
    assert.equal(notice?.lost.n, 4);
    // Bringing it back is restoring that version for that path; the notice goes by itself.
    const back = history.restoreTo(notice!.lost.n, [notice!.path])!;
    history.record(back, ADA, { restoredFrom: notice!.lost.n }, at(80));
    assert.deepEqual(history.noticesFor('owner'), []);
    // Dismissing.
    history.record(files({ 'project/t.txt': 'a\nb\n' }), ADA, {}, at(200));
    history.record(files({ 'project/t.txt': 'a\n' }), BEN, {}, at(210));
    const [ben] = history.noticesFor('owner');
    assert.ok(ben);
    assert.equal(history.dismiss('owner', ben.id), true);
    assert.deepEqual(history.noticesFor('owner'), []);
  });

  it('guesses undone changes for JSON and text', () => {
    const b = (s: string | null): Buffer | null => (s === null ? null : Buffer.from(s));
    assert.equal(undoes(b('{"a":1,"b":1}'), b('{"a":2,"b":1}'), b('{"a":2,"b":3}')), false);
    assert.equal(undoes(b('{"a":1,"b":1}'), b('{"a":2,"b":1}'), b('{"a":1,"b":3}')), true);
    assert.equal(undoes(b('x\ny'), b('x\ny\nz'), b('w\nx\ny\nz')), false);
    assert.equal(undoes(b('x\ny'), b('x\ny\nz'), b('x\ny')), true);
    assert.equal(undoes(b('x\ny'), b('x'), b('x\ny')), true);
    assert.equal(undoes(null, b('new'), null), true);
    assert.equal(undoes(b('old'), null, null), false);
  });

  it('follows another process writing the same index', () => {
    const root = join(dir, 'shared');
    const server = new History(root);
    const cli = new History(root);
    server.record(files({ 'project/a': '1' }), HISTORY_SYSTEM, {}, at(0));
    assert.equal(cli.head().get('project/a'), sha256('1'));
    cli.record(files({ 'project/a': '2' }), HISTORY_AGENT, {}, at(5));
    // The server sees the CLI's version, so the same change from its watcher is no new one.
    assert.equal(server.record(files({ 'project/a': '2' }), HISTORY_AGENT, {}, at(6)), null);
    assert.equal(server.versions().length, 2);
  });
});

describe('History on the type server', () => {
  let dir: string;
  let server: TypeServer;
  const secret = 'test-secret';
  const post = (page: string, path: string, body: unknown): Promise<Response> =>
    fetch(new URL(path, page), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const list = async (page: string): Promise<HistoryListing> => (await (await fetch(new URL('_api/history', page))).json()) as HistoryListing;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'open-artifact-history-server-'));
    const assets = join(dir, 'assets');
    for (const type of ['design', 'whiteboard']) {
      await mkdir(join(assets, 'editors', type), { recursive: true });
      await writeFile(join(assets, 'editors', type, 'index.html'), '<!doctype html>');
    }
    await writeFile(join(assets, 'support.js'), '');
    server = createTypeServer({ assetsDir: assets, secret, idleMs: 0, viewerName: 'Ada', downloadsDir: join(dir, 'downloads') });
    await server.listen();
  });

  after(async () => {
    await server.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('records publishes and agent edits, diffs them, and restores through the write path', async () => {
    const root = join(dir, 'Design');
    const page = (await server.open({ root, type: 'design', title: 'Design' })).url;
    const session = (await (await fetch(new URL('_api/session', page))).json()) as { stores?: { history?: boolean } };
    assert.equal(session.stores?.history, true);

    const events = await openEvents(page, 'p1');
    // The first version is what the folder held when the history began.
    await until(async () => (await list(page)).versions.length === 1);
    const first = (await list(page)).versions[0]!;
    assert.equal(first.author.kind, 'system');
    assert.deepEqual(first.files, [{ path: 'project/canvas.json', op: 'added' }]);

    assert.equal((await post(page, '_api/publish', { client: 'p1', files: { 'project/A.dc.html': { content: 'line 1\nline 2\n' } } })).status, 200);
    await events.wait((name, data) => name === 'history' && (data as { n: number }).n === 2);
    await writeFile(join(root, 'project', 'A.dc.html'), 'line 1\nline two\n');
    await until(async () => (await list(page)).versions.length === 3);

    const listing = await list(page);
    assert.equal(listing.canRestore, true);
    assert.deepEqual(listing.versions.map((v) => [v.n, v.author.kind, v.author.name]), [
      [3, 'agent', 'Agent'],
      [2, 'person', 'Ada'],
      [1, 'system', ''],
    ]);
    assert.equal(listing.versions[0]!.current, true);

    const diff = (await (await fetch(new URL('_api/history/diff?n=3&path=project/A.dc.html', page))).json()) as HistoryFileDiff;
    assert.deepEqual(diff, { path: 'project/A.dc.html', n: 3, op: 'edited', before: 'line 1\nline 2\n', after: 'line 1\nline two\n' });
    const old = await fetch(new URL('_api/history/file?n=2&path=project/A.dc.html', page));
    assert.equal(await old.text(), 'line 1\nline 2\n');
    assert.equal((await fetch(new URL('_api/history/file?n=1&path=project/A.dc.html', page))).status, 404);
    const state = (await (await fetch(new URL('_api/history/files?n=1', page))).json()) as { files: Record<string, unknown> };
    assert.deepEqual(Object.keys(state.files), ['project/canvas.json']);

    // Restore version 2: the file comes back, every page hears of it (the restoring one too), and it is version 4.
    const restored = (await (await post(page, '_api/history/restore', { n: 2, client: 'p1' })).json()) as HistoryRestoreResult;
    assert.deepEqual(restored, { version: 4, changed: ['project/A.dc.html'] });
    assert.equal(await readFile(join(root, 'project', 'A.dc.html'), 'utf8'), 'line 1\nline 2\n');
    await events.wait((name, data) => name === 'files' && (data as { changes: Record<string, string> }).changes['project/A.dc.html'] === sha256('line 1\nline 2\n'));
    // Restore version 1 for one path: the file it did not have is deleted.
    const one = (await (await post(page, '_api/history/restore', { n: 1, paths: ['project/A.dc.html'] })).json()) as HistoryRestoreResult;
    assert.deepEqual(one, { version: 5, changed: ['project/A.dc.html'] });
    assert.equal(existsSync(join(root, 'project', 'A.dc.html')), false);
    // The watcher saw nothing new.
    await new Promise((done) => setTimeout(done, 400));
    const after = await list(page);
    assert.deepEqual(after.versions.slice(0, 2).map((v) => [v.n, v.restoredFrom]), [
      [5, 1],
      [4, 2],
    ]);
    assert.equal((await post(page, '_api/history/restore', { n: 99 })).status, 404);
    assert.equal((await post(page, '_api/history/restore', { n: 1, paths: ['../x'] })).status, 200);
    await events.close();
  });

  it('keeps history out of the page listing and the check', async () => {
    const root = join(dir, 'Design');
    const page = (await server.open({ root, type: 'design' })).url;
    const listing = (await (await fetch(new URL('_api/files', page))).json()) as { files: Record<string, unknown> };
    assert.ok(Object.keys(listing.files).every((p) => p.startsWith('project/')));
    assert.ok(existsSync(join(root, 'history', 'index.json')));
    assert.equal((await fetch(new URL('history/index.json', page))).status, 404);
  });

  it('snapshots db documents of a whiteboard and restores them as db writes', async () => {
    const root = join(dir, 'Board');
    const page = (await server.open({ root, type: 'whiteboard', title: 'Board' })).url;
    const events = await openEvents(page, 'w1');
    await until(async () => (await list(page)).versions.length === 1);
    assert.ok((await list(page)).versions[0]!.files.some((f) => f.path === 'db/board/meta'));

    assert.equal((await post(page, '_api/db/write', { client: 'w1', writes: [{ op: 'set', path: 'elements/n1', data: { type: 'note', text: 'Hi' } }] })).status, 200);
    await until(async () => (await list(page)).versions.length === 2);
    const mine = (await list(page)).versions[0]!;
    assert.deepEqual([mine.author.kind, mine.author.name, mine.files], ['person', 'Ada', [{ path: 'db/elements/n1', op: 'added' }]]);
    const text = await (await fetch(new URL('_api/history/file?n=2&path=db/elements/n1', page))).text();
    assert.deepEqual(JSON.parse(text), { type: 'note', text: 'Hi' });

    // The agent's write on disk is the agent's version.
    await writeFile(join(root, 'db', 'elements', 'n1.json'), JSON.stringify({ type: 'note', text: 'Agent' }));
    await until(async () => (await list(page)).versions.length === 3);
    assert.equal((await list(page)).versions[0]!.author.kind, 'agent');

    const restored = (await (await post(page, '_api/history/restore', { n: 1 })).json()) as HistoryRestoreResult;
    assert.deepEqual(restored.changed, ['db/elements/n1']);
    assert.equal(existsSync(join(root, 'db', 'elements', 'n1.json')), false);
    await events.wait((name, data) => name === 'db' && (data as { changes: Record<string, unknown> }).changes['elements/n1'] === null);
    await events.close();
  });

  it('lists and restores from the CLI', async () => {
    const root = join(dir, 'Cli');
    await mkdir(join(root, 'project'), { recursive: true });
    await writeFile(join(root, 'project', 'canvas.json'), JSON.stringify({ v: 3, title: 'Cli', boards: [] }));
    await writeFile(join(root, 'project', 'A.dc.html'), 'one');
    const listed = await cli(['history', root, '--json']);
    assert.equal(listed.code, 0);
    const first = JSON.parse(listed.out) as { versions: { n: number; author: { kind: string } }[] };
    assert.deepEqual(first.versions.map((v) => [v.n, v.author.kind]), [[1, 'system']]);

    await writeFile(join(root, 'project', 'A.dc.html'), 'two');
    const text = await cli(['history', root]);
    assert.match(text.out, /#2 .*Agent.*edited project\/A\.dc\.html.*current/);
    assert.deepEqual(await cli(['history', root, 'show', '1', 'A.dc.html']), { code: 0, out: 'one' });

    const restored = await cli(['history', root, 'restore', '1', 'A.dc.html']);
    assert.equal(restored.code, 0, restored.out);
    assert.equal(await readFile(join(root, 'project', 'A.dc.html'), 'utf8'), 'one');
    const again = JSON.parse((await cli(['history', root, '--json'])).out) as { versions: { n: number; restoredFrom?: number }[] };
    assert.deepEqual(again.versions.map((v) => [v.n, v.restoredFrom ?? null]), [
      [3, 1],
      [2, null],
      [1, null],
    ]);
    assert.equal((await cli(['history', root, 'restore', '42'])).code, 1);
  });
});
