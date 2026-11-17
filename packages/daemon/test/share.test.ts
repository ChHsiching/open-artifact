/**
 * The Share panel's daemon routes: `artifact.share` passes the panel's
 * changes (`reset`, `guests`) on to the type server, and `artifact.archive`
 * streams the type server's zip of the folder (and answers `unsupported`
 * for a type without one).
 */

import { tempDir } from './helpers.ts';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { artifactIdOf, type DaemonState, type ShareView, type ToolCallResult } from '@open-artifact/protocol';
import { api, readDaemon } from '../src/client.ts';
import { startDaemon, type Daemon } from '../src/daemon.ts';

let daemon: Daemon;
let state: DaemonState;
let typeServer: Server;
/** What the fake type server was sent on `/__open-artifact/share`. */
const posted: unknown[] = [];
const ZIP = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(64 * 1024, 7)]);

const view = (patch: Partial<ShareView> = {}): ShareView => ({
  lan: true,
  port: 4801,
  addresses: ['192.168.1.5'],
  links: { editor: { on: true, url: 'http://192.168.1.5:4801/s/e' }, viewer: { on: false } },
  guests: [{ id: 'g1', name: 'Kim', role: 'viewer', joined: '2026-01-01T00:00:00Z', online: true, active: true }],
  ...patch,
});

/** A URL type's server: `sharer` shares and zips; `plain` has neither route. */
function fakeServer(): Promise<number> {
  typeServer = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x');
      const send = (status: number, body: unknown): void => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === '/sharer/__open-artifact/share') {
        if (req.method === 'POST') {
          posted.push(JSON.parse(raw));
          return send(200, view({ guests: [] }));
        }
        return send(200, view());
      }
      if (url.pathname === '/sharer/__open-artifact/archive') {
        if (req.headers.authorization) return send(400, { code: 'invalid_argument', message: 'a URL type has no secret' });
        if (url.searchParams.get('id') === null) return send(404, { code: 'not_found', message: 'no id' });
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="Card.zip"; filename*=UTF-8''Card.zip` });
        if (req.method === 'HEAD') return res.end();
        // In two parts, so the daemon has to stream it.
        res.write(ZIP.subarray(0, 1000));
        setTimeout(() => res.end(ZIP.subarray(1000)), 20);
        return;
      }
      return send(404, { code: 'not_found', message: `${url.pathname}: no such route` });
    });
  });
  return new Promise((done) => typeServer.listen(0, '127.0.0.1', () => done((typeServer.address() as { port: number }).port)));
}

function addType(id: string, entry: Record<string, unknown>): void {
  const dir = join(process.env.OPEN_ARTIFACT_USER_TYPES!, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'artifact-type.json'), JSON.stringify({ name: id, description: `The ${id} test type.`, entry }));
}

before(async () => {
  const port = await fakeServer();
  // The page's base is the template's folder: the routes live under /sharer/ and /plain/.
  addType('sharer', { url: `http://127.0.0.1:${port}/sharer/{id}`, share: true });
  addType('plain', { url: `http://127.0.0.1:${port}/plain/{id}` });
  daemon = await startDaemon({ port: 0, quiet: true, shellDir: tempDir('open-artifact-shell-'), homeDir: tempDir('open-artifact-no-home-') });
  state = (await readDaemon())!;
});

after(() => {
  daemon.close();
  typeServer.close();
});

const caller = { harness: 'dsh', session: 'share-1', workspace: tempDir('open-artifact-ws-') };

async function create(type: string, title: string): Promise<string> {
  const made = await api<ToolCallResult>(state, 'tools.call', { name: 'Artifact', arguments: { action: 'publish', type_url: `open-artifact://type/${type}`, title }, caller });
  assert.equal(made.error, undefined, JSON.stringify(made.error));
  return artifactIdOf(String(made.url))!;
}

function library(route: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<Response> {
  const url = new URL(`/api/open-artifact.${route}`, state.url);
  for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${state.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
}

test('share reads the guests, port and tailnet, and passes reset and guests on', async () => {
  const id = await create('sharer', 'Card to share');
  const read = (await (await library('artifact.share', { query: { id } })).json()) as ShareView;
  assert.equal(read.port, 4801);
  assert.equal(read.guests?.[0]?.name, 'Kim');

  const res = await library('artifact.share', {
    method: 'POST',
    body: JSON.stringify({ id, reset: ['editor'], guests: { g1: 'commenter', g2: null }, links: { viewer: true }, lan: true, extra: 'dropped' }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(posted.at(-1), { id, lan: true, links: { viewer: true }, reset: ['editor'], guests: { g1: 'commenter', g2: null } });

  await library('artifact.share', { method: 'POST', body: JSON.stringify({ id, reset: 'editor', guests: ['g1'] }) });
  assert.deepEqual(posted.at(-1), { id }, 'only what has the right shape');
});

test("archive streams the type server's zip, and HEAD passes the headers", async () => {
  const id = await create('sharer', 'Card to zip');
  const head = await library('artifact.archive', { method: 'HEAD', query: { id } });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'application/zip');
  assert.equal(head.headers.get('content-disposition'), `attachment; filename="Card.zip"; filename*=UTF-8''Card.zip`);
  assert.equal(head.headers.get('cache-control'), 'no-store');

  const got = await library('artifact.archive', { query: { id } });
  assert.equal(got.status, 200);
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), ZIP);

  // Another site's page cannot read it: no CORS grant.
  const cross = await fetch(new URL(`/api/open-artifact.artifact.archive?id=${id}`, state.url), { method: 'HEAD', headers: { Origin: 'http://elsewhere.example' } });
  assert.equal(cross.headers.get('access-control-allow-origin'), null);
  assert.equal((await library('artifact.archive', { query: { id: 'art_nope' } })).status, 404);
});

test('archive answers unsupported for a type whose server cannot zip', async () => {
  const id = await create('plain', 'Plain card');
  const res = await library('artifact.archive', { method: 'HEAD', query: { id } });
  assert.equal(res.status, 409);
  const body = await library('artifact.archive', { query: { id } });
  assert.equal(body.status, 409);
  assert.equal(((await body.json()) as { code: string }).code, 'unsupported');
});
