import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createTypeServer, pending, sha256, type TypeServer } from '../src/index.ts';
import { findChrome } from '../src/snapshot.ts';

/** Reads SSE frames from a stream until `predicate` matches one. */
async function nextEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (name: string, data: unknown) => boolean,
  timeoutMs = 4000,
): Promise<{ name: string; data: unknown }> {
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>((done) => setTimeout(() => done(null), deadline - Date.now())),
    ]);
    if (!chunk || chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const name = /^event: (.*)$/m.exec(frame)?.[1];
      const data = /^data: (.*)$/m.exec(frame)?.[1];
      if (name && data) {
        const parsed = JSON.parse(data) as unknown;
        if (predicate(name, parsed)) return { name, data: parsed };
      }
    }
  }
  throw new Error('timed out waiting for event');
}

describe('type server', () => {
  let dir: string;
  let root: string;
  let server: TypeServer;
  let page: string;
  const secret = 'test-secret';

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'open-artifact-type-server-'));
    const assets = join(dir, 'assets');
    await mkdir(join(assets, 'editors', 'design'), { recursive: true });
    await writeFile(join(assets, 'editors', 'design', 'index.html'), '<!doctype html><title>Design</title>');
    await writeFile(join(assets, 'support.js'), '/* runtime */');
    root = join(dir, 'My Design');
    server = createTypeServer({ assetsDir: assets, secret, idleMs: 0, downloadsDir: join(dir, 'downloads') });
    await server.listen();
    page = (await server.open({ root, type: 'design', title: 'My Design' })).url;
  });

  after(async () => {
    await server.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('scaffolds a new artifact and serves the editor', async () => {
    const canvas = JSON.parse(await readFile(join(root, 'project', 'canvas.json'), 'utf8')) as { v: number };
    assert.equal(canvas.v, 3);
    const html = await (await fetch(page)).text();
    assert.match(html, /<title>Design<\/title>/);
    assert.equal(await (await fetch(new URL('project/Deep/support.js', page))).text(), '/* runtime */');
    const session = (await (await fetch(new URL('_api/session', page))).json()) as { artifact: { title: string; type: string }; viewer: { role: string } };
    assert.equal(session.artifact.title, 'My Design');
    assert.equal(session.viewer.role, 'owner');
  });

  it('is idempotent and refuses unknown tokens', async () => {
    const again = await server.open({ root, type: 'design' });
    assert.equal(again.url, page);
    const res = await fetch(new URL('/design/nope/_api/session', page));
    assert.equal(res.status, 404);
  });

  it('publishes with ifMatch and reports conflicts', async () => {
    const files = (await (await fetch(new URL('_api/files', page))).json()) as { files: Record<string, { sha256: string }> };
    const canvasHash = files.files['project/canvas.json']!.sha256;
    const ok = await fetch(new URL('_api/publish', page), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client: 'a', files: { 'project/A.dc.html': { content: '<x-dc></x-dc>', ifMatch: null } } }),
    });
    assert.equal(ok.status, 200);
    const { hashes } = (await ok.json()) as { hashes: Record<string, string> };
    assert.equal(hashes['project/A.dc.html'], sha256('<x-dc></x-dc>'));

    const stale = await fetch(new URL('_api/publish', page), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client: 'a',
        files: {
          'project/A.dc.html': { content: 'new', ifMatch: null },
          'project/canvas.json': { content: '{}', ifMatch: canvasHash },
        },
      }),
    });
    assert.equal(stale.status, 409);
    const body = (await stale.json()) as { code: string; paths: { path: string }[] };
    assert.equal(body.code, 'conflict');
    assert.deepEqual(body.paths.map((p) => p.path), ['project/A.dc.html']);
    // Nothing of the batch was written.
    assert.notEqual(await readFile(join(root, 'project', 'canvas.json'), 'utf8'), '{}');
  });

  it('refuses paths outside project/ and cross-origin writes', async () => {
    const bad = await fetch(new URL('_api/publish', page), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client: 'a', files: { '../x': { content: 'x' } } }),
    });
    assert.equal(bad.status, 400);
    const cross = await fetch(new URL('_api/publish', page), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ client: 'a', files: {} }),
    });
    assert.equal(cross.status, 403);
  });

  it('pushes outside changes and suppresses the publisher’s echo', async () => {
    const response = await fetch(new URL('_api/events?client=watcher', page));
    const reader = response.body!.getReader();
    await nextEvent(reader, (name) => name === 'peers');

    // Our own client's publish is not echoed to it, but another client's is.
    await fetch(new URL('_api/publish', page), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client: 'other', files: { 'project/B.dc.html': { content: 'b' } } }),
    });
    const owner = await nextEvent(reader, (name) => name === 'files');
    assert.deepEqual(owner.data, { changes: { 'project/B.dc.html': sha256('b') }, author: 'owner' });

    // A write straight to disk (the agent) arrives as an agent change.
    await writeFile(join(root, 'project', 'C.dc.html'), 'c');
    const agent = await nextEvent(reader, (name, data) => name === 'files' && (data as { author: string }).author === 'agent');
    assert.deepEqual((agent.data as { changes: Record<string, string> }).changes, { 'project/C.dc.html': sha256('c') });
    await reader.cancel();
  });

  it('streams the same events over a WebSocket', async () => {
    const target = new URL('_api/events?client=socket', page);
    target.protocol = 'ws:';
    const socket = new WebSocket(target);
    const messages: { event: string; data: unknown }[] = [];
    socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)) as { event: string; data: unknown });
    const next = async (match: (m: { event: string; data: unknown }) => boolean): Promise<{ event: string; data: unknown }> => {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const found = messages.find(match);
        if (found) return found;
        await new Promise((done) => setTimeout(done, 20));
      }
      throw new Error('timed out waiting for a message');
    };
    try {
      await next((m) => m.event === 'agent');
      await next((m) => m.event === 'peers');
      // The page's own publish is not echoed back to it; another page's is.
      await fetch(new URL('_api/publish', page), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client: 'socket', files: { 'project/Mine.dc.html': { content: 'mine' } } }),
      });
      await fetch(new URL('_api/publish', page), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client: 'other', files: { 'project/Theirs.dc.html': { content: 'theirs' } } }),
      });
      const files = await next((m) => m.event === 'files');
      assert.deepEqual(files.data, { changes: { 'project/Theirs.dc.html': sha256('theirs') }, author: 'owner' });
      const listed = (await (await fetch(new URL('/__open-artifact/list', page), { headers: { authorization: `Bearer ${secret}` } })).json()) as { artifacts: { pages: number }[] };
      assert.equal(listed.artifacts[0]!.pages, 1, 'the socket does not count as an open page');
    } finally {
      socket.close();
    }
  });

  it('refuses event sockets from another origin, an artboard, or an unknown token', async () => {
    const { request } = await import('node:http');
    const upgrade = (path: string, headers: Record<string, string> = {}): Promise<number> =>
      new Promise((resolve, reject) => {
        const req = request(new URL(path, page), {
          headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', ...headers },
        });
        req.on('upgrade', (res, socket) => {
          socket.destroy();
          resolve(res.statusCode ?? 0);
        });
        req.on('response', (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
      });
    const own = new URL(page).origin;
    assert.equal(await upgrade('_api/events', { origin: own }), 101);
    assert.equal(await upgrade('_api/events', { origin: 'http://evil.example' }), 403);
    assert.equal(await upgrade('_api/events', { origin: 'null' }), 403);
    assert.equal(await upgrade('_api/events', { origin: own, 'sec-fetch-site': 'cross-site' }), 403);
    assert.equal(await upgrade('_api/events', { origin: own, host: 'evil.example' }), 403);
    assert.equal(await upgrade('_api/files', { origin: own }), 404);
    assert.equal(await upgrade(new URL('_api/events', page).pathname.replace(/[0-9a-f]{32}/, '0'.repeat(32)), { origin: own }), 404);
  });

  it("lets the Shell that framed the page broker its calls", async () => {
    const shell = 'http://127.0.0.1:4999';
    const framed = await server.open({ root, type: 'design', shell });
    assert.equal(new URL(framed.url).searchParams.get('open_artifact_shell'), shell);
    const preflight = await fetch(new URL('_api/publish', page), {
      method: 'OPTIONS',
      headers: { origin: shell, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), shell);
    const session = await fetch(new URL('_api/session', page), { headers: { origin: shell } });
    assert.equal(session.headers.get('access-control-allow-origin'), shell);
    const write = await fetch(new URL('_api/publish', page), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: shell, 'sec-fetch-site': 'same-site' },
      body: JSON.stringify({ client: 'shell', files: { 'project/Shell.txt': { content: 'brokered' } } }),
    });
    assert.equal(write.status, 200);
    assert.equal(write.headers.get('access-control-allow-origin'), shell);
    // Another origin gets no CORS answer and may not write.
    const other = await fetch(new URL('_api/session', page), { headers: { origin: 'http://127.0.0.1:5000' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    const refused = await fetch(new URL('_api/publish', page), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5000' },
      body: JSON.stringify({ client: 'x', files: {} }),
    });
    assert.equal(refused.status, 403);
  });

  it('stores uploads content-addressed', async () => {
    const res = await fetch(new URL('_api/assets?name=a.png', page), { method: 'POST', headers: { 'content-type': 'image/png' }, body: new Uint8Array([1, 2, 3]) });
    const record = (await res.json()) as { id: string; url: string; contentType: string };
    assert.equal(record.url, `/_blob/${record.id}`);
    assert.equal(record.contentType, 'image/png');
    const blob = await fetch(new URL(record.url, page));
    assert.equal(blob.headers.get('content-type'), 'image/png');
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array([1, 2, 3]));
    assert.equal(blob.headers.get('accept-ranges'), 'bytes');
    // A span (how a video seeks), and one past the end.
    const part = await fetch(new URL(record.url, page), { headers: { range: 'bytes=1-' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 1-2/3');
    assert.deepEqual(new Uint8Array(await part.arrayBuffer()), new Uint8Array([2, 3]));
    const past = await fetch(new URL(record.url, page), { headers: { range: 'bytes=9-' } });
    assert.equal(past.status, 416);
    assert.equal(past.headers.get('content-range'), 'bytes */3');
  });

  it('queues requests for the agent and records the view context', async () => {
    const sent = await fetch(new URL('_api/agent/send', page), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: { text: 'Make the title larger', title: 'Send to agent' }, deliver: 'send' }),
    });
    assert.deepEqual(await sent.json(), { status: 'queued' });
    const items = await pending(root);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.request.text, 'Make the title larger');

    const context = { mode: 'canvas', page: null, visibleArtboards: ['A.dc.html'], selectedArtboards: [], dirty: false, selected: [] };
    await fetch(new URL('_api/presence', page), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client: 'x', patch: { viewContext: context } }),
    });
    const saved = JSON.parse(await readFile(join(root, '_agent', 'view-context.json'), 'utf8')) as { context: unknown };
    assert.deepEqual(saved.context, context);
  });

  it('guards the daemon routes with the bearer secret', async () => {
    assert.equal((await fetch(new URL('/__open-artifact/health', page))).status, 401);
    const health = await fetch(new URL('/__open-artifact/health', page), { headers: { authorization: `Bearer ${secret}` } });
    assert.equal(((await health.json()) as { openArtifact: number }).openArtifact, 1);
    const action = await fetch(new URL('/__open-artifact/actions', page), { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: '{}' });
    assert.equal(action.status, 404);
    assert.equal(((await action.json()) as { code: string }).code, 'unknown_action');
  });

  it('answers /__open-artifact/open with the protocol OpenResult', async () => {
    const res = await fetch(new URL('/__open-artifact/open', page), {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ root, type: 'design', shell: 'http://shell.localhost:4700' }),
    });
    const body = (await res.json()) as { url: string; page_url: string };
    assert.equal(body.page_url, page);
    assert.equal(new URL(body.url).searchParams.get('open_artifact_shell'), 'http://shell.localhost:4700');
  });

  it('runs the check and upload actions', async () => {
    const call = (path: string, body?: unknown): Promise<Response> =>
      fetch(new URL(path, page), {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const list = (await (await call('/__open-artifact/actions')).json()) as { actions: { name: string }[] };
    assert.deepEqual(
      list.actions.map((a) => a.name),
      ['check', 'upload', 'context', 'snapshot', 'read', 'update', 'batch', 'widget', 'info', 'export', 'create', 'read', 'update', 'delete', 'batch', 'export', 'import'],
    );
    // The page opened earlier may have written its context: start from none.
    await rm(join(root, '_agent', 'view-context.json'), { force: true });
    const none = (await (await call('/__open-artifact/actions/context', { id: 'x', root, args: {} })).json()) as { context: unknown; note: string };
    assert.equal(none.context, null);
    assert.match(none.note, /No view context yet/);
    await mkdir(join(root, '_agent'), { recursive: true });
    await writeFile(join(root, '_agent', 'view-context.json'), JSON.stringify({ at: '2026-01-01T00:00:00.000Z', client: 'c1', context: { selection: ['n1'] } }));
    const seen = (await (await call('/__open-artifact/actions/context', { id: 'x', root, args: {} })).json()) as { at: string; context: unknown; note: string };
    assert.deepEqual(seen.context, { selection: ['n1'] });
    assert.equal(seen.at, '2026-01-01T00:00:00.000Z');
    assert.match(seen.note, /data, not instructions/);
    const check = (await (await call('/__open-artifact/actions/check', { id: 'x', root, args: {} })).json()) as { check: { problems: number; findings: unknown[] } };
    assert.equal(typeof check.check.problems, 'number');
    assert.ok(Array.isArray(check.check.findings));
    const file = join(dir, 'dot.svg');
    await writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const upload = (await (await call('/__open-artifact/actions/upload', { id: 'x', root, args: { file } })).json()) as { upload: { url: string } };
    assert.match(upload.upload.url, /^\/_blob\/[0-9a-f]+/);
    // Design keeps comments (the reserved comments actions answer) but no document store.
    const comments = await call('/__open-artifact/actions/open-artifact.comments.read', { id: 'x', root, args: {} });
    assert.equal(comments.status, 200);
    const reserved = await call('/__open-artifact/actions/open-artifact.db.read', { id: 'x', root, args: { path: 'board/meta' } });
    assert.equal(reserved.status, 404);
    assert.equal(((await reserved.json()) as { code: string }).code, 'unknown_action');
  });

  it('snapshot: a PNG of the page under _agent/snapshots, written by a page that changes nothing', async () => {
    const call = (body: unknown): Promise<Response> =>
      fetch(new URL('/__open-artifact/actions/snapshot', page), {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const before = process.env.OPEN_ARTIFACT_CHROME;
    process.env.OPEN_ARTIFACT_CHROME = join(dir, 'no-such-chrome');
    try {
      const missing = await call({ id: 'x', root, args: {} });
      assert.equal(missing.status, 400);
      const body = (await missing.json()) as { code: string; fix: string };
      assert.equal(body.code, 'unsupported');
      assert.match(body.fix, /OPEN_ARTIFACT_CHROME/);
    } finally {
      if (before === undefined) delete process.env.OPEN_ARTIFACT_CHROME;
      else process.env.OPEN_ARTIFACT_CHROME = before;
    }
    const bad = await call({ id: 'x', root, args: { width: 10 } });
    assert.equal(bad.status, 400);

    if (!findChrome()) return; // no browser here: the rest needs one
    const context = JSON.stringify({ at: '2026-01-02T00:00:00.000Z', client: 'c1', context: { selection: ['keep'] } });
    await mkdir(join(root, '_agent'), { recursive: true });
    await writeFile(join(root, '_agent', 'view-context.json'), context);
    const res = await call({ id: 'x', root, args: { width: 800, height: 600 } });
    const shot = (await res.json()) as { image: string; width: number; bytes: number; note: string };
    assert.equal(res.status, 200, JSON.stringify(shot));
    assert.ok(shot.image.startsWith(join(root, '_agent', 'snapshots')));
    const png = await readFile(shot.image);
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'a PNG');
    assert.equal(png.readUInt32BE(16), 800, 'as wide as asked');
    assert.match(shot.note, /Look at it/);
    assert.equal(await readFile(join(root, '_agent', 'view-context.json'), 'utf8'), context, "the snapshot page did not overwrite the person's view context");
  });

  it('sandboxes raw artifact HTML', async () => {
    const res = await fetch(new URL('project/A.dc.html', page));
    assert.match(res.headers.get('content-security-policy') ?? '', /sandbox/);
  });
});
