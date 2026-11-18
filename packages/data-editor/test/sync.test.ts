import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DELETE_FIELD, AGENT_EDIT_VIA, type UnknownRecord } from '@open-artifact/data-core';
import {
  LIVE_EDIT_DEBOUNCE_MS,
  LIVE_MESSAGES,
  LiveWriteError,
  STUCK_WRITE_TIMEOUT_MS,
  applyJsonMergePatch,
  collectionOfPath,
  documentSha256,
  type LiveCache,
  type SyncChangeEvent,
  type SyncDocument,
  type SyncTimers,
  type SyncTransport,
  type SyncWrite,
} from '@open-artifact/live-store';
import { createDataLiveCodec, dataCollections, refuseDataDocument } from '../src/sync/codec.ts';
import { createDataLiveDocument, createDocumentViewer, READ_ONLY_REASON, type DataLiveDocument } from '../src/sync/live-document.ts';
import { applyStorePatch, isDeleteField, stripDeleteFields } from '../src/sync/patch.ts';
import { createPresenceReporter } from '../src/platform/presence.ts';
import { resolveStoredAssetUrl } from '../src/platform/assets.ts';
import { getChangedMetadataPatch } from '../src/platform/metadata.ts';

/* ------------------------------------------------------------------ fakes */

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

class FakeTimers implements SyncTimers {
  time = 1_000_000;
  private nextId = 1;
  private queue = new Map<number, { at: number; callback: () => void }>();

  setTimeout = (callback: () => void, ms: number): number => {
    const id = this.nextId++;
    this.queue.set(id, { at: this.time + Math.max(0, ms), callback });
    return id;
  };

  clearTimeout = (handle: unknown): void => {
    this.queue.delete(handle as number);
  };

  now = (): number => this.time;

  random = (): number => 0;

  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    await settle();
    for (;;) {
      let soonest: [number, { at: number; callback: () => void }] | undefined;
      for (const item of this.queue) if (item[1].at <= target && (soonest === undefined || item[1].at < soonest[1].at)) soonest = item;
      if (soonest === undefined) break;
      this.queue.delete(soonest[0]);
      this.time = Math.max(this.time, soonest[1].at);
      soonest[1].callback();
      await settle();
    }
    this.time = target;
    await settle();
  }
}

/** An in-memory `db`: RFC 7396 updates, `ifMatch` guards, writes never echoed. */
class FakeDb implements SyncTransport {
  docs = new Map<string, Record<string, unknown>>();
  batches: SyncWrite[][] = [];
  failures: string[] = [];
  /** Writes wait for {@link release} while set. */
  hold = false;
  private held: (() => void)[] = [];
  private listeners = new Set<(event: SyncChangeEvent) => void>();

  constructor(docs: Record<string, Record<string, unknown>> = {}) {
    for (const [path, data] of Object.entries(docs)) this.docs.set(path, structuredClone(data));
  }

  async get(path: string): Promise<Record<string, unknown> | null> {
    return structuredClone(this.docs.get(path) ?? null);
  }

  async list(collection: string): Promise<SyncDocument[]> {
    return [...this.docs].filter(([path]) => collectionOfPath(path) === collection).map(([path, data]) => ({ path, data: structuredClone(data) }));
  }

  async write(writes: SyncWrite[]): Promise<void> {
    this.batches.push(structuredClone(writes));
    if (this.hold) await new Promise<void>((resolve) => this.held.push(resolve));
    const code = this.failures.shift();
    if (code !== undefined) throw Object.assign(new Error(code), { code });
    for (const write of writes) {
      if (write.ifMatch === undefined) continue;
      const current = this.docs.get(write.path);
      const actual = current === undefined ? null : documentSha256(current);
      if (actual !== write.ifMatch) throw Object.assign(new Error('conflict'), { code: 'conflict' });
    }
    for (const write of writes) {
      if (write.op === 'delete') this.docs.delete(write.path);
      else if (write.op === 'set') this.docs.set(write.path, structuredClone(write.data));
      else this.docs.set(write.path, applyJsonMergePatch(this.docs.get(write.path), write.patch));
    }
  }

  release(): void {
    this.hold = false;
    for (const resolve of this.held.splice(0)) resolve();
  }

  onChange(listener: (event: SyncChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  remote(changes: Record<string, Record<string, unknown> | null>): void {
    for (const [path, data] of Object.entries(changes)) {
      if (data === null) this.docs.delete(path);
      else this.docs.set(path, structuredClone(data));
    }
    for (const listener of [...this.listeners]) listener({ changes: structuredClone(changes), author: 'agent' });
  }

  writes(): SyncWrite[] {
    return this.batches.flat();
  }
}

class MemoryCache implements LiveCache {
  saved: SyncDocument[] | undefined;
  read(): SyncDocument[] | undefined {
    return this.saved === undefined ? undefined : structuredClone(this.saved);
  }
  write(documents: SyncDocument[]): void {
    this.saved = structuredClone(documents);
  }
}

const VIEWER = 'u1';

async function open(db: FakeDb, options: { readOnly?: boolean; cache?: LiveCache; onEdit?: () => void } = {}): Promise<{ doc: DataLiveDocument; timers: FakeTimers }> {
  const timers = new FakeTimers();
  const doc = createDataLiveDocument({ transport: db, viewerId: VIEWER, timers, ...options });
  await timers.advance(0);
  return { doc, timers };
}

const DASHBOARD = {
  'dash/meta': { title: 'Sales' },
  'datasets/sales': { title: 'Sales', source: { kind: 'file', url: '/_blob/0123456789abcdef0123456789abcdef', format: 'csv' } },
  'files/index.html': { text: '<h1>Sales</h1>' },
};

/* ------------------------------------------------------------------ tests */

describe('store patches', () => {
  it('merges records, removes DELETE_FIELD and keeps null', () => {
    const base = { a: 1, b: { c: 2, d: 3 }, e: [1, 2] };
    assert.deepEqual(applyStorePatch(base, { b: { c: DELETE_FIELD, x: null }, e: [3], f: null }), { a: 1, b: { d: 3, x: null }, e: [3], f: null });
    assert.deepEqual(base, { a: 1, b: { c: 2, d: 3 }, e: [1, 2] });
    assert.deepEqual(stripDeleteFields({ a: DELETE_FIELD, b: { c: DELETE_FIELD, d: 1 } }), { b: { d: 1 } });
    assert.equal(isDeleteField(DELETE_FIELD), true);
    assert.equal(isDeleteField({ __delete__: true, other: 1 }), false);
  });
});

describe('data live codec', () => {
  it('keeps the dashboard collections and this viewer’s folder', () => {
    assert.deepEqual(dataCollections(VIEWER), ['datasets', 'files', 'dash', 'data/users/u1']);
    const codec = createDataLiveCodec(VIEWER);
    assert.equal(codec.keepsNulls, true);
    const docs = new Map([['dash/meta', { title: 'x' }]]);
    assert.equal(codec.share!(docs, new Map(docs)), docs);
  });

  it('refuses documents the store would refuse', () => {
    assert.equal(refuseDataDocument({ text: 'x' }), undefined);
    assert.match(refuseDataDocument({ text: 'x'.repeat(262_200) }) ?? '', /larger than 256 KB/);
    let deep: UnknownRecord = {};
    for (let i = 0; i < 40; i += 1) deep = { deep };
    assert.match(refuseDataDocument(deep) ?? '', /nests deeper/);
  });
});

describe('live dashboard document', () => {
  it('loads the documents and builds the document view', async () => {
    const db = new FakeDb({ ...DASHBOARD, 'data/users/u1/check': { ok: true }, 'data/users/u2/check': { ok: false }, 'drafts/d1': { x: 1 } });
    const { doc } = await open(db);
    const view = createDocumentViewer(VIEWER, true)(doc.store.getSnapshot());
    assert.equal(view.status, 'ready');
    assert.equal(view.title, 'Sales');
    assert.deepEqual([...view.documents.keys()].sort(), ['dash/meta', 'datasets/sales', 'files/index.html']);
    assert.deepEqual([...view.ownDocuments], [['check', { ok: true }]]);
    assert.equal(view.content.files.length, 1);
    assert.equal(view.content.datasets.length, 1);
    assert.equal(view.canWrite, true);
    assert.equal(view.save, 'saved');
    doc.dispose();
  });

  it('reuses the parsed content while the shared documents are unchanged', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    const view = createDocumentViewer(VIEWER, true);
    const first = view(doc.store.getSnapshot());
    void doc.writeOwnDocument('page', { scroll: 3 });
    const second = view(doc.store.getSnapshot());
    assert.equal(second.content, first.content);
    assert.equal(second.ownDocuments.get('page')?.scroll, 3);
    await timers.advance(2000);
    doc.dispose();
  });

  it('stamps dataset writes, merges with the agent’s stamp and settles when stored', async () => {
    const db = new FakeDb({ ...DASHBOARD, 'datasets/sales': { title: 'Sales', edit: { via: AGENT_EDIT_VIA, at: 5 } } });
    let edits = 0;
    const { doc, timers } = await open(db, { onEdit: () => (edits += 1) });
    let settled = false;
    const written = doc.writeDataset('sales', { title: 'Revenue', description: DELETE_FIELD }).then(() => (settled = true));
    assert.equal(doc.documents().get('datasets/sales')?.title, 'Revenue');
    assert.equal(db.batches.length, 0);
    await timers.advance(LIVE_EDIT_DEBOUNCE_MS + 50);
    await written;
    assert.equal(settled, true);
    assert.deepEqual(db.docs.get('datasets/sales'), { title: 'Revenue', edit: { via: AGENT_EDIT_VIA, at: 5, by: VIEWER, byAt: timers.time - LIVE_EDIT_DEBOUNCE_MS - 50 } });
    assert.equal(edits, 1);
    doc.dispose();
  });

  it('leaves the stamp off a change of certifiedAs alone', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    const written = doc.writeDataset('sales', { certifiedAs: 'q1' });
    await timers.advance(2000);
    await written;
    assert.equal(db.docs.get('datasets/sales')?.edit, undefined);
    assert.equal(db.docs.get('datasets/sales')?.certifiedAs, 'q1');
    doc.dispose();
  });

  it('coalesces quick writes to one document into one write', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    void doc.writeSettings({ updates: 'auto' });
    await timers.advance(100);
    void doc.writeSettings({ theme: 'dark' });
    await timers.advance(2000);
    assert.equal(db.batches.length, 1);
    assert.deepEqual(db.docs.get('dash/settings'), { updates: 'auto', theme: 'dark' });
    doc.dispose();
  });

  it('stores null values the page sets (written whole, since a merge patch’s null removes)', async () => {
    const db = new FakeDb({ ...DASHBOARD, 'dash/params': { region: 'EU', limit: 5 } });
    const { doc, timers } = await open(db);
    const written = doc.mergeDocument('dash/params', { region: null });
    await timers.advance(2000);
    await written;
    assert.deepEqual(db.docs.get('dash/params'), { region: null, limit: 5 });
    assert.equal(db.writes()[0]?.op, 'set');
    const removed = doc.mergeDocument('dash/params', { limit: DELETE_FIELD });
    await timers.advance(2000);
    await removed;
    assert.deepEqual(db.docs.get('dash/params'), { region: null });
    doc.dispose();
  });

  it('creates a document a merge finds absent, and deletes and sets documents', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    const merged = doc.mergeDocument('dash/look', { accent: '#f00', gone: DELETE_FIELD });
    const set = doc.setDocument('datasets/new', { title: 'New' });
    const deleted = doc.deleteDocument('files/index.html');
    await timers.advance(2000);
    await Promise.all([merged, set, deleted]);
    assert.deepEqual(db.docs.get('dash/look'), { accent: '#f00' });
    assert.deepEqual(db.docs.get('datasets/new'), { title: 'New' });
    assert.equal(db.docs.has('files/index.html'), false);
    doc.dispose();
  });

  it('writes and deletes this viewer’s own documents', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    await Promise.all([doc.writeOwnDocument('runs', { datasets: {} }), timers.advance(2000)]);
    assert.deepEqual(db.docs.get('data/users/u1/runs'), { datasets: {} });
    await Promise.all([doc.writeOwnDocument('runs', null), timers.advance(2000)]);
    assert.equal(db.docs.has('data/users/u1/runs'), false);
    doc.dispose();
  });

  it('refuses paths outside the live collections and bad names', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc } = await open(db);
    await assert.rejects(doc.setDocument('drafts/d1', { x: 1 }), (error: unknown) => error instanceof LiveWriteError && error.code === 'invalid');
    await assert.rejects(doc.writeDataset('bad id!', { title: 'x' }), LiveWriteError);
    await assert.rejects(doc.writeFile('../x', 'x'), LiveWriteError);
    doc.dispose();
  });

  it('writes a guarded file once the file’s waiting edits are stored, and rejects a conflict', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    const before = documentSha256(db.docs.get('files/index.html'));
    const guarded = doc.writeFile('index.html', '<h1>Hi</h1>', { ifMatch: before });
    await timers.advance(0);
    await guarded;
    assert.equal(db.docs.get('files/index.html')?.text, '<h1>Hi</h1>');
    assert.equal(doc.documents().get('files/index.html')?.text, '<h1>Hi</h1>');
    assert.equal(db.writes()[0]?.ifMatch, before);
    const stale = doc.writeFile('index.html', '<h1>Stale</h1>', { ifMatch: before });
    await timers.advance(0);
    await assert.rejects(stale, (error: unknown) => error instanceof LiveWriteError && error.code === 'conflict');
    assert.equal(db.docs.get('files/index.html')?.text, '<h1>Hi</h1>');
    assert.equal(doc.store.getSnapshot().readOnly, false);
    doc.dispose();
  });

  it('retries with backoff while the store is unreachable', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    db.failures.push('unavailable', 'unavailable');
    let settled = false;
    const written = doc.writeSettings({ updates: 'manual' }).then(() => (settled = true));
    await timers.advance(LIVE_EDIT_DEBOUNCE_MS + 50);
    assert.equal(doc.store.getSnapshot().status, 'offline');
    assert.equal(createDocumentViewer(VIEWER, true)(doc.store.getSnapshot()).save, 'unsaved');
    await timers.advance(30_000);
    await written;
    assert.equal(settled, true);
    assert.equal(db.batches.length, 3);
    assert.deepEqual(db.docs.get('dash/settings'), { updates: 'manual' });
    doc.dispose();
  });

  it('counts a write that never answers as failed and sends it again', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    db.hold = true;
    void doc.writeSettings({ a: 1 });
    await timers.advance(LIVE_EDIT_DEBOUNCE_MS + 50);
    assert.equal(doc.store.getSnapshot().status, 'saving');
    await timers.advance(STUCK_WRITE_TIMEOUT_MS + 1);
    assert.equal(doc.store.getSnapshot().status, 'offline');
    db.release();
    await timers.advance(30_000);
    assert.equal(db.batches.length >= 2, true);
    assert.deepEqual(db.docs.get('dash/settings'), { a: 1 });
    doc.dispose();
  });

  it('rejects a write the store refuses and stops writing when access ends', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    db.failures.push('not_writer');
    const written = doc.writeSettings({ a: 1 });
    await timers.advance(2000);
    await assert.rejects(written, (error: unknown) => error instanceof LiveWriteError && error.code === 'not_writer');
    const view = createDocumentViewer(VIEWER, true)(doc.store.getSnapshot());
    assert.equal(view.canWrite, false);
    assert.equal(view.readOnlyReason, LIVE_MESSAGES.accessEnded);
    await assert.rejects(doc.writeSettings({ b: 1 }), LiveWriteError);
    doc.dispose();
  });

  it('parks a document too large to store, rejecting its write', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    const written = doc.writeFile('index.html', 'x'.repeat(270_000));
    await timers.advance(2000);
    await assert.rejects(written, (error: unknown) => error instanceof LiveWriteError && error.code === 'refused');
    assert.equal(db.batches.length, 0);
    assert.match(createDocumentViewer(VIEWER, true)(doc.store.getSnapshot()).refusal ?? '', /larger than/);
    doc.dispose();
  });

  it('is read-only for viewers', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc } = await open(db, { readOnly: true });
    const view = createDocumentViewer(VIEWER, false)(doc.store.getSnapshot());
    assert.equal(view.canWrite, false);
    assert.equal(view.readOnlyReason, READ_ONLY_REASON);
    await assert.rejects(doc.writeSettings({ a: 1 }), (error: unknown) => error instanceof LiveWriteError && error.code === 'readonly');
    doc.dispose();
  });

  it('shows remote changes and keeps local edits to other fields', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    void doc.writeDataset('sales', { description: 'Mine' });
    db.remote({ 'datasets/sales': { ...DASHBOARD['datasets/sales'], title: 'Theirs' }, 'files/extra.js': { text: '1' } });
    await timers.advance(2000);
    assert.equal(db.docs.get('datasets/sales')?.title, 'Theirs');
    assert.equal(db.docs.get('datasets/sales')?.description, 'Mine');
    assert.equal(doc.documents().has('files/extra.js'), true);
    doc.dispose();
  });

  it('flushes at once', async () => {
    const db = new FakeDb(DASHBOARD);
    const { doc, timers } = await open(db);
    void doc.writeSettings({ a: 1 });
    const flushed = doc.flush();
    await timers.advance(0);
    await flushed;
    assert.deepEqual(db.docs.get('dash/settings'), { a: 1 });
    doc.dispose();
  });

  it('shows the saved copy while the store is out of reach', async () => {
    const cache = new MemoryCache();
    const first = await open(new FakeDb(DASHBOARD), { cache });
    await first.timers.advance(5000);
    first.doc.dispose();
    assert.equal(cache.saved?.some((document) => document.path === 'dash/meta'), true);
    const unreachable: SyncTransport = {
      get: () => new Promise(() => undefined),
      list: () => new Promise(() => undefined),
      write: () => new Promise(() => undefined),
      onChange: () => () => undefined,
    };
    const timers = new FakeTimers();
    const doc = createDataLiveDocument({ transport: unreachable, viewerId: VIEWER, timers, cache });
    await timers.advance(20_000);
    const view = createDocumentViewer(VIEWER, true)(doc.store.getSnapshot());
    assert.equal(view.status, 'offline');
    assert.equal(view.title, 'Sales');
    doc.dispose();
  });
});

describe('presence reporter', () => {
  it('publishes the view context, skips repeats and clears it on dispose', async () => {
    const published: unknown[] = [];
    const room = { presence: async (patch: Record<string, unknown>) => void published.push(patch.viewContext) };
    let count = 0;
    const listeners = new Set<() => void>();
    const reporter = createPresenceReporter(room, { editCount: { get: () => count, subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)) } });
    reporter.report({ mode: 'page', selected: ['sales'] });
    await settle();
    reporter.report({ mode: 'page', selected: ['sales'] });
    await settle();
    assert.deepEqual(published, [{ mode: 'page', selected: ['sales'] }]);
    count = 2;
    for (const listener of listeners) listener();
    await settle();
    assert.deepEqual(published.at(-1), { mode: 'page', selected: ['sales'], edits: 2 });
    reporter.dispose();
    await settle();
    assert.equal(published.at(-1), null);
  });

  it('does nothing without a room', () => {
    const reporter = createPresenceReporter(null);
    reporter.report({ mode: 'page' });
    reporter.dispose();
  });
});

describe('platform helpers', () => {
  it('resolves stored upload urls', () => {
    const id = '0123456789abcdef0123456789abcdef';
    assert.equal(resolveStoredAssetUrl({ id, url: `/_blob/${id}` }), `/_blob/${id}`);
    assert.equal(resolveStoredAssetUrl({ id, url: `_blob/${id}` }), `/_blob/${id}`);
    assert.equal(resolveStoredAssetUrl({ id, url: 'https://elsewhere/x' }), `/_blob/${id}`);
    assert.equal(resolveStoredAssetUrl({ id: 'x', url: 'https://elsewhere/x' }), null);
  });

  it('keeps only metadata that changes', () => {
    assert.deepEqual(getChangedMetadataPatch({ title: 'A', description: 'new', schedule: 'daily' }, { title: 'A', description: 'old' }), { description: 'new', schedule: 'daily' });
  });
});
