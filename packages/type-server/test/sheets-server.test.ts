import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isObject, type JsonObject } from '@open-artifact/sheets-core';
import { createTypeServer, type TypeServer } from '../src/index.ts';

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

interface Frame {
  name: string;
  data: JsonObject;
}

/** The frames of a page's event stream, as they arrive. */
function streamOf(url: URL): { next(predicate: (frame: Frame) => boolean, timeoutMs?: number): Promise<Frame>; close(): void } {
  const abort = new AbortController();
  const frames: Frame[] = [];
  const waiting = new Set<() => void>();
  void fetch(url, { signal: abort.signal })
    .then(async (response) => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return;
        buffer += decoder.decode(chunk.value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const text = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const name = /^event: (.*)$/m.exec(text)?.[1];
          const data = /^data: (.*)$/m.exec(text)?.[1];
          if (name && data) frames.push({ name, data: JSON.parse(data) as JsonObject });
        }
        for (const wake of waiting) wake();
      }
    })
    .catch(() => undefined);
  return {
    async next(predicate, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const index = frames.findIndex(predicate);
        if (index >= 0) return frames.splice(index, 1)[0]!;
        if (Date.now() > deadline) throw new Error('timed out waiting for a frame');
        await new Promise<void>((done) => {
          const wake = (): void => {
            waiting.delete(wake);
            done();
          };
          waiting.add(wake);
          setTimeout(wake, 100);
        });
      }
    },
    close: () => abort.abort(),
  };
}

const post = async (url: URL, body: unknown): Promise<JsonObject> => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return (await response.json()) as JsonObject;
};

describe('Sheets on the type server', () => {
  let dir: string;
  let root: string;
  let server: TypeServer;
  let page: URL;
  let id: string;
  let throughRefusal: JsonObject = {};
  const secret = 'sheets-secret';

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'open-artifact-sheets-server-'));
    const assets = join(dir, 'assets');
    await mkdir(join(assets, 'editors', 'sheets'), { recursive: true });
    await writeFile(join(assets, 'editors', 'sheets', 'index.html'), '<!doctype html><title>Sheets</title>');
    root = join(dir, 'Budget');
    server = createTypeServer({ assetsDir: assets, secret, idleMs: 0, types: ['sheets'], log: () => undefined });
    await server.listen();
    const opened = await server.open({ root, type: 'sheets', title: 'Budget' });
    page = new URL(opened.url);
    id = opened.id;
  });

  after(async () => {
    await server.stop();
    await rm(dir, { recursive: true, force: true });
  });

  const action = async (name: string, args: unknown): Promise<{ status: number; body: JsonObject }> => {
    const response = await fetch(new URL(`/__open-artifact/actions/${name}`, page), {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id, root, args }),
    });
    return { status: response.status, body: (await response.json()) as JsonObject };
  };

  it('starts a Sheet and grants the sheet capability', async () => {
    const meta = JSON.parse(await readFile(join(root, 'sheet', 'sheet.json'), 'utf8')) as JsonObject;
    assert.equal(meta.title, 'Budget');
    await assert.rejects(stat(join(root, 'project')));
    const session = await (await fetch(new URL('_api/session', page))).json() as { stores: JsonObject; artifact: JsonObject };
    assert.equal(session.artifact.type, 'sheets');
    assert.equal(session.stores.sheet, true);
    assert.equal(session.stores.comments, true);
    assert.equal(session.stores.history, undefined);
    const listed = await (await fetch(new URL('/__open-artifact/actions', page), { headers: { authorization: `Bearer ${secret}` } })).json() as { actions: { name: string }[] };
    assert.deepEqual(listed.actions.map((a) => a.name).filter((name) => ['read', 'update', 'batch', 'widget', 'info', 'export'].includes(name)), ['read', 'update', 'batch', 'widget', 'info', 'export']);
  });

  it("sends the page a snapshot and the clock, then the agent's edits", async () => {
    const stream = streamOf(new URL('_api/events?client=p1', page));
    try {
      const snapshot = await stream.next((f) => f.name === 'sheet' && f.data.phase === 'snapshot');
      assert.equal(snapshot.data.revision, 0);
      await stream.next((f) => f.name === 'sheet' && f.data.phase === 'clock');

      const update = await action('update', { payload: { base: 0, edits: [{ kind: 'writeCells', sheet: 'Sheet1', topLeft: 'A1', rows: [['Rent', 1200], ['Food', 300], ['Total', '=SUM(B1:B2)']] }] } });
      assert.equal(update.status, 200, JSON.stringify(update.body));
      assert.deepEqual(update.body, { revision: 2 });
      const edit = await stream.next((f) => f.name === 'sheet' && f.data.phase === 'edit' && f.data.revision === 2);
      assert.deepEqual(edit.data.actor && isObject(edit.data.actor) ? edit.data.actor.isAgent : null, true);

      const read = await action('read', { payload: { kind: 'readCells', sheet: 'Sheet1', range: 'B3' } });
      assert.equal(read.status, 200);
      assert.match(JSON.stringify(read.body), /1500/);
    } finally {
      stream.close();
    }
  });

  it("loads the log and saves a page's edit", async () => {
    const load = await post(new URL('_api/sheet/read', page), { kind: 'load' });
    assert.equal(load.kind, 'loadPage');
    assert.equal(load.revision, 2);
    const ops = load.ops as JsonObject[];
    const insert = ops.find((op) => op.kind === 'insertSheet')!;
    const rows = ops.find((op) => op.kind === 'insertRows')!.rows as JsonObject;
    const columns = ops.find((op) => op.kind === 'insertColumns')!.columns as JsonObject;
    const cell = { r: `${rows.base as string}.0`, c: `${columns.base as string}.1`, input: { kind: 'number', value: 1300 } };
    const saved = await post(new URL('_api/sheet/send', page), { opId: 'page-1', v: load.v, base: 2, ops: [{ kind: 'setCells', sheetId: insert.sheetId, cells: [cell] }] });
    assert.deepEqual(saved, { kind: 'saved', revision: 3 });
    const read = await action('read', { payload: { kind: 'readCells', sheet: 'Sheet1', range: 'B3' } });
    assert.match(JSON.stringify(read.body), /1600/);
  });

  it('answers a refusal with its body, and runs the CLI through the server', async () => {
    const refused = await action('update', { payload: { base: 3, edits: [{ kind: 'writeCells', sheet: 'Nowhere', topLeft: 'A1', rows: [['x']] }] } });
    assert.equal(refused.status, 409);
    assert.equal((refused.body.data as JsonObject).refusal, 'unknownSheetName');

    const info = await action('info', {});
    assert.equal(info.body.revision, 3);
    const versions = await post(new URL('_api/sheet/read', page), { kind: 'versions' });
    assert.equal(versions.kind, 'versions');

    const home = join(dir, 'home');
    await mkdir(home, { recursive: true });
    await writeFile(join(home, 'server.json'), JSON.stringify({ pid: process.pid, url: new URL('/', page).href, secret, version: 1 }));
    const env = { ...process.env, OPEN_ARTIFACT_TYPE_SERVER_HOME: home };
    const stream = streamOf(new URL('_api/events?client=p2', page));
    try {
      await stream.next((f) => f.name === 'sheet' && f.data.phase === 'snapshot');
      const through = await execFileAsync(process.execPath, [CLI, 'update', root, JSON.stringify({ base: 3, edits: [{ kind: 'writeCells', sheet: 'Sheet1', topLeft: 'C1', rows: [['Note']] }] })], { env });
      assert.equal((JSON.parse(through.stdout) as JsonObject).revision, 4);
      await stream.next((f) => f.name === 'sheet' && f.data.phase === 'edit' && f.data.revision === 4);
    } finally {
      stream.close();
    }
    const nowhere = JSON.stringify({ base: 4, edits: [{ kind: 'writeCells', sheet: 'Nowhere', topLeft: 'A1', rows: [['x']] }] });
    throughRefusal = await execFileAsync(process.execPath, [CLI, 'update', root, nowhere], { env }).then(
      () => assert.fail('the edit was taken'),
      (error: { code: number; stderr: string }) => {
        assert.equal(error.code, 1);
        return JSON.parse(error.stderr) as JsonObject;
      },
    );
  });

  it('runs the commands on a folder no server holds', async () => {
    const other = join(dir, 'Other');
    const env = { ...process.env, OPEN_ARTIFACT_TYPE_SERVER_HOME: join(dir, 'no-server') };
    const run = (args: string[]) => execFileAsync(process.execPath, [CLI, ...args], { env });
    await run(['update', other, JSON.stringify({ base: 0, edits: [{ kind: 'writeCells', sheet: 'Sheet1', topLeft: 'A1', rows: [['x']] }] })]);
    const info = await run(['info', other, '--json']);
    assert.equal((JSON.parse(info.stdout) as JsonObject).revision, 2);
    await assert.rejects(run(['update', other, JSON.stringify({ base: 2, edits: [{ kind: 'writeCells', sheet: 'Nowhere', topLeft: 'A1', rows: [['x']] }] })]), (error: { code: number; stderr: string }) => {
      assert.equal(error.code, 1);
      assert.deepEqual(JSON.parse(error.stderr), throughRefusal);
      return true;
    });
  });
});
