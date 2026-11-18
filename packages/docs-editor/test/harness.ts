/** A type server holding one doc, and pages that keep one of its tabs in step with it, for the sync tests. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DiskDoc, DocState } from '@open-artifact/docs-core';
import type { DocCallAnswer, DocFrame, DocSessionResponse, DocTabFrame, DocTabResponse } from '@open-artifact/runtime/doc-api';
import { createTypeServer, type TypeServer } from '@open-artifact/type-server';
import { type DocTransport, type ShadowCause, TabSync } from '../src/sync/tab-sync.ts';

type Json = Record<string, unknown>;

export const texts = (doc: DocState | DiskDoc) =>
  (doc.blocks as Array<{ inline?: Array<{ text?: string; ch?: string }> }>).map(block => (block.inline ?? []).map(run => run.text ?? run.ch ?? '').join(''));

export interface Page {
  name: string;
  sync: TabSync;
  causes: ShadowCause[];
  /** Closes the event stream (the server lets the session go) and opens it again. */
  reconnect(): Promise<void>;
  stop(): Promise<void>;
}

export interface PageOptions {
  /** Hand the page the frames of others' writes (default true). */
  frames?: boolean;
  transport?: (base: DocTransport) => DocTransport;
  onShadow?: (doc: DocState, cause: ShadowCause) => void;
}

export interface DocServer {
  tab: string;
  node: string;
  post<T>(route: string, body: unknown): Promise<T>;
  action(name: string, args: Json): Promise<Json>;
  serverTexts(): Promise<string[]>;
  open(label: string, options?: PageOptions): Promise<Page>;
  /** Lets the frames of writes made so far arrive, then waits for the pages to have read and sent all they have. */
  settle(...pages: Page[]): Promise<void>;
  stop(): Promise<void>;
}

const SECRET = 'test-secret';

export async function startDocServer(markdown: string): Promise<DocServer> {
  const dir = await mkdtemp(join(tmpdir(), 'open-artifact-docs-editor-'));
  const root = join(dir, 'Notes');
  const server: TypeServer = createTypeServer({ assetsDir: join(dir, 'assets'), secret: SECRET, idleMs: 0, downloadsDir: join(dir, 'downloads') });
  await server.listen();
  const opened = await server.open({ root, type: 'docs', title: 'Notes' });
  const base = opened.url;

  const post = async <T>(route: string, body: unknown): Promise<T> => {
    const response = await fetch(new URL(route, base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.ok, true, `${route}: ${response.status}`);
    return (await response.json()) as T;
  };
  const action = async (name: string, args: Json): Promise<Json> => {
    const response = await fetch(new URL(`/__open-artifact/actions/${name}`, base), {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: opened.id, root, args }),
    });
    return (await response.json()) as Json;
  };

  const made = await action('create', { call: { name: 'Notes', doc: { markdown } } });
  assert.equal(made.ok, true, JSON.stringify(made));
  const first = await post<DocSessionResponse>('_api/doc/session', { client: 'setup' });
  const file = first.project.files[0]!;
  const tab = file.id;
  const node = file.content.id;

  async function listen(name: string, onFrame: (frame: DocTabFrame) => void): Promise<{ close(): Promise<void> }> {
    const events = await fetch(new URL(`_api/events?client=${name}`, base));
    const reader = events.body!.getReader();
    const pump = (async () => {
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const chunk = await reader.read().catch(() => null);
        if (!chunk || chunk.done) return;
        buffer += decoder.decode(chunk.value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = /^event: (.*)$/m.exec(frame)?.[1];
          const data = /^data: (.*)$/m.exec(frame)?.[1];
          if (event !== 'doc' || !data) continue;
          const parsed = JSON.parse(data) as DocFrame;
          if (parsed.kind === 'tab') onFrame(parsed);
        }
      }
    })();
    return {
      close: async () => {
        await reader.cancel().catch(() => undefined);
        await pump;
      },
    };
  }

  let pages = 0;
  async function open(label: string, options: PageOptions = {}): Promise<Page> {
    const name = `${label}-${++pages}`;
    const session = await post<DocSessionResponse>('_api/doc/session', { client: name });
    assert.ok(session.sess);
    const shared = { sess: session.sess, next: session.next };
    const plain: DocTransport = {
      call: request => post<DocCallAnswer>('_api/doc/call', { client: name, ...request }),
      read: tabId => post<DocTabResponse>('_api/doc/read', { tab: tabId }),
      renew: async () => {
        const renewed = await post<DocSessionResponse>('_api/doc/session', { client: name });
        if (!renewed.sess) return false;
        shared.sess = renewed.sess;
        shared.next = renewed.next;
        return true;
      },
    };
    const transport = options.transport ? options.transport(plain) : plain;
    const read = await plain.read(tab);
    const page = { name, causes: [] as ShadowCause[] } as Page;
    page.sync = new TabSync(
      {
        tab,
        node,
        session: shared,
        transport,
        retryMs: 20,
        events: {
          shadow: (doc, cause) => {
            page.causes.push(cause);
            options.onShadow?.(doc, cause);
          },
        },
      },
      read,
    );
    const hear = (frame: DocTabFrame) => {
      if (options.frames !== false) page.sync.heard(frame);
    };
    let stream = await listen(name, hear);
    page.reconnect = async () => {
      await stream.close();
      // The server forgets a session once its stream has closed.
      await new Promise(done => setTimeout(done, 60));
      stream = await listen(name, hear);
      page.sync.reconnected();
    };
    page.stop = async () => {
      page.sync.stop();
      await stream.close();
    };
    return page;
  }

  return {
    tab,
    node,
    post,
    action,
    serverTexts: async () => texts((await post<DocTabResponse>('_api/doc/read', { tab })).doc as unknown as DiskDoc),
    open,
    settle: async (...open: Page[]) => {
      for (let round = 0; round < 3; round++) {
        await new Promise(done => setTimeout(done, 60));
        await Promise.all(open.map(page => page.sync.settled()));
      }
    },
    stop: async () => {
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
