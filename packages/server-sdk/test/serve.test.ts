import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { ReadyLine } from '@open-artifact/protocol';
import { STATE_FILE, STREAM_PROTOCOL, TypeApi, TypeServer, acceptKey, type Site, type SiteContext } from '../src/index.ts';

const SECRET = 'test-secret';

/** A site that echoes the path it got, and streams one event over WebSocket. */
function fakeSite(root: string, context: SiteContext): Site {
  const token = randomBytes(8).toString('hex');
  return {
    page: `/fake/${token}/`,
    handle(req, res) {
      if (req.url?.startsWith('/events')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ id: context.id, root })}\n\n`);
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`hello ${req.url}`);
    },
    close() {},
  };
}

describe('TypeServer', () => {
  let dir: string;
  let root: string;
  let server: TypeServer;
  let base: string;

  const openArtifact = (path: string, init: RequestInit = {}, secret: string | null = SECRET): Promise<Response> =>
    fetch(new URL(path, base), {
      ...init,
      headers: { ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    });

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'open-artifact-server-sdk-'));
    root = join(dir, 'artifact');
    await mkdir(root);
    server = new TypeServer({
      mountSite: fakeSite,
      type: 'fake',
      version: '1.2.3',
      port: 0,
      secret: SECRET,
      idleMs: 0,
      daemon: new TypeApi({ url: null, token: null }),
      log: () => undefined,
      actions: { ping: { title: 'Ping', run: (artifact, args) => ({ pong: args.n, id: artifact.id }) }, 'open-artifact.secret': { hidden: true, run: () => ({}) } },
    });
    await server.listen();
    base = `${server.origin}/`;
  });

  after(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('answers health', async () => {
    const res = await openArtifact('/__open-artifact/health');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { openArtifact: 1, type: 'fake', version: '1.2.3', open: 0 });
  });

  it('rejects /__open-artifact/* without the secret, with a wrong one, or from a page', async () => {
    assert.equal((await openArtifact('/__open-artifact/health', {}, null)).status, 401);
    assert.equal((await openArtifact('/__open-artifact/health', {}, 'wrong')).status, 401);
    assert.equal((await openArtifact('/__open-artifact/health', { headers: { origin: 'http://evil.example' } })).status, 401);
    const body = (await (await openArtifact('/__open-artifact/health', {}, null)).json()) as { code: string };
    assert.equal(body.code, 'unauthorized');
  });

  it('refuses unknown Host headers', async () => {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(base, { headers: { host: 'evil.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 421);
  });

  it('opens an artifact, serves its site and is idempotent', async () => {
    const res = await openArtifact('/__open-artifact/open', { method: 'POST', body: JSON.stringify({ id: 'art_0123456789ab', root, title: 'Fake' }) });
    assert.equal(res.status, 200);
    const opened = (await res.json()) as { url: string; page_url: string };
    assert.match(opened.url, /^http:\/\/127\.0\.0\.1:\d+\/fake\/[0-9a-f]{16}\/$/);
    assert.equal(opened.page_url, opened.url);
    assert.equal(await (await fetch(new URL('sub/path?x=1', opened.url))).text(), 'hello /sub/path?x=1');
    assert.ok(existsSync(join(root, STATE_FILE)));

    const again = (await (await openArtifact('/__open-artifact/open', { method: 'POST', body: JSON.stringify({ id: 'art_0123456789ab', root }) })).json()) as { url: string };
    assert.equal(again.url, opened.url);
    assert.equal(server.openCount, 1);
  });

  it('validates open', async () => {
    const res = await openArtifact('/__open-artifact/open', { method: 'POST', body: JSON.stringify({ id: 'art_0123456789ab', root: 'relative/path' }) });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { code: string }).code, 'invalid_argument');
  });

  it('lists and runs actions', async () => {
    const list = (await (await openArtifact('/__open-artifact/actions?id=art_0123456789ab')).json()) as { actions: { name: string }[] };
    assert.deepEqual(
      list.actions.map((a) => a.name),
      ['ping'],
    );
    const ran = await openArtifact('/__open-artifact/actions/ping', { method: 'POST', body: JSON.stringify({ id: 'art_0123456789ab', args: { n: 7 } }) });
    assert.deepEqual(await ran.json(), { pong: 7, id: 'art_0123456789ab' });
    const unknown = await openArtifact('/__open-artifact/actions/nope', { method: 'POST', body: JSON.stringify({ id: 'art_0123456789ab' }) });
    assert.equal(unknown.status, 404);
    assert.equal(((await unknown.json()) as { code: string }).code, 'unknown_action');
  });

  it('carries a site event stream over a WebSocket', async () => {
    const opened = (await (await openArtifact('/__open-artifact/open', { method: 'POST', body: JSON.stringify({ id: 'art_0123456789ab', root }) })).json()) as { url: string };
    const url = new URL('events', opened.url.replace(/^http/, 'ws'));
    const ws = new WebSocket(url, [STREAM_PROTOCOL]);
    const text = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (event) => resolve(String(event.data));
      ws.onerror = () => reject(new Error('WebSocket failed'));
      setTimeout(() => reject(new Error('timed out')), 4000).unref();
    });
    assert.equal(ws.protocol, STREAM_PROTOCOL);
    assert.deepEqual(JSON.parse(text.replace(/^data: /, '')), { id: 'art_0123456789ab', root });
    ws.close();
  });

  it('closes an artifact', async () => {
    const res = await openArtifact('/__open-artifact/close', { method: 'POST', body: JSON.stringify({ id: 'art_0123456789ab' }) });
    assert.deepEqual(await res.json(), { closed: true });
    assert.equal(existsSync(join(root, STATE_FILE)), false);
  });

  it('computes the RFC 6455 accept key', () => {
    assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });
});

describe('serve()', () => {
  it('prints the ready line and answers health with OPEN_ARTIFACT_SECRET', async () => {
    const sdk = pathToFileURL(join(import.meta.dirname, '../src/index.ts')).href;
    const code = `
      import { serve } from ${JSON.stringify(sdk)};
      await serve({ mountSite: () => ({ page: '/x/y/', handle: (_q, s) => s.end(), close() {} }), log: () => {} });
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, OPEN_ARTIFACT_PORT: '0', OPEN_ARTIFACT_TYPE: 'fake', OPEN_ARTIFACT_SECRET: 'child-secret', OPEN_ARTIFACT_DAEMON_URL: '', OPEN_ARTIFACT_TYPE_TOKEN: '' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    try {
      const line = await new Promise<string>((resolve, reject) => {
        const lines = createInterface({ input: child.stdout });
        lines.once('line', resolve);
        child.once('exit', (exitCode) => reject(new Error(`exited with ${exitCode}`)));
        setTimeout(() => reject(new Error('no ready line')), 10_000).unref();
      });
      const ready = JSON.parse(line) as ReadyLine & { type: string };
      assert.equal(ready.openArtifact, 'ready');
      assert.match(ready.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
      assert.equal(ready.type, 'fake');
      const health = await fetch(new URL('__open-artifact/health', ready.url), { headers: { authorization: 'Bearer child-secret' } });
      assert.equal(health.status, 200);
      assert.equal(((await health.json()) as { type: string }).type, 'fake');
    } finally {
      child.kill('SIGTERM');
    }
  });
});
