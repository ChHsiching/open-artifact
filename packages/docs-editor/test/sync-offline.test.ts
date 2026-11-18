import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type PageNode, docToPage } from '../src/sync/page.ts';
import { Backoff, backoffDelay } from '../src/sync/backoff.ts';
import { type SyncStatus, wordsOfOps } from '../src/sync/tab-sync.ts';
import { TabWal, type WalEntry, WAL_MAX_AGE_MS, claimPlan, memoryWalStore } from '../src/sync/wal.ts';
import { CommentOutbox, type OutboxEntry, isNetworkError, memoryOutboxStore } from '../src/comments/outbox.ts';
import { type DocServer, type Page, startDocServer, texts } from './harness.ts';

const wait = (ms: number) => new Promise(done => setTimeout(done, ms));

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await wait(10);
  }
}

describe('backoff', () => {
  it('doubles from the base up to the cap, somewhere between half and all of it', () => {
    assert.equal(backoffDelay(0, 250, 30_000, () => 1), 250);
    assert.equal(backoffDelay(0, 250, 30_000, () => 0), 125);
    assert.equal(backoffDelay(3, 250, 30_000, () => 1), 2000);
    assert.equal(backoffDelay(7, 250, 30_000, () => 1), 30_000);
    assert.equal(backoffDelay(500, 250, 30_000, () => 1), 30_000);
    for (let n = 0; n < 12; n++) {
      const delay = backoffDelay(n);
      const ceiling = Math.min(250 * 2 ** n, 30_000);
      assert.ok(delay >= ceiling / 2 && delay <= ceiling, `${n}: ${delay}`);
    }
  });

  it('starts over after a success', () => {
    const backoff = new Backoff(100, 1000, () => 1);
    assert.deepEqual([backoff.fail(), backoff.fail(), backoff.fail(), backoff.fail(), backoff.fail()], [100, 200, 400, 800, 1000]);
    backoff.succeed();
    assert.equal(backoff.count, 0);
    assert.equal(backoff.fail(), 100);
  });
});

describe('the write-ahead log', () => {
  const entry = (life: string, seq: number, at: number, extra: Partial<WalEntry> = {}): WalEntry => ({ doc: 'd', tab: 't', life, seq, at, ops: [{ op: 'set', n: `${life}${seq}` }], ...extra });

  it('claims what closed pages left, oldest page first and in order, giving unsent ops a call of their own', () => {
    const now = 1_000_000_000;
    const entries = [
      entry('late', 1, now - 10),
      entry('early', 2, now - 90, { opId: 'early.w2', sent: true }),
      entry('early', 1, now - 100, { opId: 'early.w1', sent: true }),
      entry('early', 3, now - 80),
      entry('early', 4, now - 70),
      entry('open', 1, now - 200),
      entry('mine', 1, now - 300),
      entry('stale', 1, now - WAL_MAX_AGE_MS - 1),
    ];
    const { take, drop } = claimPlan(entries, 'mine', new Set(['open']), now);
    assert.deepEqual(
      take.map(item => [item.ops[0]!.n, item.opId, item.sent ?? false, item.life, item.seq]),
      [
        ['early1', 'early.w1', true, 'mine', -5],
        ['early2', 'early.w2', true, 'mine', -4],
        ['early3', 'early.wal3', false, 'mine', -3],
        ['early4', 'early.wal3', false, 'mine', -2],
        ['late1', 'late.wal1', false, 'mine', -1],
      ],
    );
    // Taken: every entry of a closed page, the too old one too; the open page's and the claimer's own stay.
    assert.deepEqual(drop.map(key => `${key[2]}${key[3]}`).sort(), ['early1', 'early2', 'early3', 'early4', 'late1', 'stale1']);
  });

  it('keeps ops until they land, notes the call that carries them, and hands what is left to the next page', async () => {
    const store = memoryWalStore();
    const first = new TabWal({ store, doc: 'd', tab: 't', life: 'one' });
    const a = first.append([{ op: 'insert', n: 1 }]);
    const b = first.append([{ op: 'insert', n: 2 }]);
    const c = first.append([{ op: 'insert', n: 3 }]);
    first.sent([a, b], 'one.w1');
    first.done([a]);
    await first.flushed(1000);
    assert.deepEqual(
      store.all().map(item => [item.seq, item.opId ?? null, item.sent ?? false]),
      [
        [b, 'one.w1', true],
        [c, null, false],
      ],
    );
    first.close();

    const second = new TabWal({ store, doc: 'd', tab: 't', life: 'two' });
    const claimed = await second.recover();
    assert.deepEqual(
      claimed.map(item => [item.ops[0]!.n, item.opId, item.sent ?? false]),
      [
        [2, 'one.w1', true],
        [3, `one.wal${c}`, false],
      ],
    );
    // Claimed again by a later page (the second closed without landing them): the same calls go out.
    const third = new TabWal({ store, doc: 'd', tab: 't', life: 'three' });
    const again = await third.recover();
    assert.deepEqual(
      again.map(item => item.opId),
      ['one.w1', `one.wal${c}`],
    );
    assert.deepEqual(store.all().map(item => item.life), ['three', 'three']);
    third.done(again.map(item => item.seq));
    await third.flushed(1000);
    assert.deepEqual(store.all(), []);
  });

  it('leaves a page that is still open alone', async () => {
    const store = memoryWalStore();
    const held = new Set<string>();
    const lives = { hold: (life: string) => (held.add(life), () => held.delete(life)), alive: async () => new Set(held) };
    const open = new TabWal({ store, doc: 'd', tab: 't', life: 'open', lives });
    open.append([{ op: 'insert' }]);
    await open.flushed(1000);
    assert.deepEqual(await new TabWal({ store, doc: 'd', tab: 't', life: 'other', lives }).recover(), []);
    open.close();
    assert.equal((await new TabWal({ store, doc: 'd', tab: 't', life: 'later', lives }).recover()).length, 1);
  });
});

describe('words of dropped edits', () => {
  it('reads the text inserts carry, inline and in blocks, cut short', () => {
    const ops = [
      { op: 'insert', with: { as: 'inline', from: { kind: 'inline', content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: ' world', marks: [{ type: 'bold' }] }] } } },
      { op: 'delete', target: {} },
      { op: 'insert', with: { as: 'blocks', from: { kind: 'blocks', content: [{ type: 'list', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] }] } } },
    ];
    assert.equal(wordsOfOps(ops), 'Hello world item');
    assert.equal(wordsOfOps(ops, 8), 'Hello w…');
    assert.equal(wordsOfOps([{ op: 'format', target: {} }]), '');
  });
});

describe('the comment outbox', () => {
  const create = (text: string) => ({ kind: 'create' as const, input: { anchor: '{}', label: 'x', text } });

  it('keeps a comment the connection failed and sends it, in order, once it can', async () => {
    const sent: string[] = [];
    let down = true;
    const outbox = new CommentOutbox({ store: memoryOutboxStore(), backoff: new Backoff(5, 20, () => 1) });
    let waiting = -1;
    await outbox.start({
      scope: () => 'doc|me',
      send: async (entry: OutboxEntry) => {
        if (down) throw new TypeError('fetch failed');
        sent.push(entry.kind === 'create' ? entry.input.text : entry.text);
      },
      waiting: count => {
        waiting = count;
      },
    });
    await outbox.keep(create('first'));
    await outbox.keep({ kind: 'reply', threadId: 't1', text: 'second' });
    assert.equal(waiting, 2);
    await wait(40);
    assert.deepEqual(sent, []);
    down = false;
    await until(() => sent.length === 2);
    assert.deepEqual(sent, ['first', 'second']);
    await until(() => waiting === 0);
  });

  it('lets go of a comment the server refuses, and says so', async () => {
    const refused: string[] = [];
    const store = memoryOutboxStore();
    await store.put({ id: 'a', scope: 'doc|me', at: Date.now(), ...create('nope') });
    await store.put({ id: 'b', scope: 'doc|other', at: Date.now(), ...create('not mine') });
    const outbox = new CommentOutbox({ store });
    await outbox.start({
      scope: () => 'doc|me',
      send: async () => {
        throw Object.assign(new Error('gone'), { code: 'not_found' });
      },
      refused: entry => refused.push(entry.kind === 'create' ? entry.input.text : entry.text),
    });
    assert.deepEqual(refused, ['nope']);
    assert.deepEqual(await store.load('doc|me'), []);
    assert.equal((await store.load('doc|other')).length, 1);
  });

  it('tells a failed connection from a refusal', () => {
    assert.equal(isNetworkError(new TypeError('fetch failed')), true);
    assert.equal(isNetworkError(Object.assign(new Error('x'), { code: 'unavailable' })), true);
    assert.equal(isNetworkError(Object.assign(new Error('x'), { code: 'invalid', retryable: true })), true);
    assert.equal(isNetworkError(Object.assign(new Error('x'), { code: 'not_found' })), false);
  });
});

describe('a tab’s edits outlive a page that could not send them', () => {
  let doc: DocServer;
  before(async () => {
    doc = await startDocServer('# Notes\n\nThe first line.\n\nThe second line.');
  });
  after(() => doc.stop());

  const typeEnd = (page: PageNode, block: number, text: string) => {
    const paragraph = page.content![block]!;
    (paragraph.content ??= []).push({ type: 'text', text });
  };

  it('sends what a closed page left, under the call it went out in, once', async () => {
    const store = memoryWalStore();
    const statuses: SyncStatus[] = [];
    const a = await doc.open('page-a', {
      wal: sess => new TabWal({ store, doc: 'd', tab: doc.tab, life: `${sess}~a` }),
      transport: base => ({ call: async () => Promise.reject(new TypeError('fetch failed')), read: base.read }),
    });
    (a.sync as unknown as { events: { status: (status: SyncStatus) => void } }).events.status = status => statuses.push(status);
    const page = docToPage(a.sync.shadow);
    typeEnd(page, 1, ' Typed offline.');
    a.sync.editPage(page);
    await until(() => store.all().some(item => item.sent));
    assert.ok(statuses.includes('unsaved'));
    const opId = store.all()[0]!.opId!;
    await a.stop();
    assert.equal((await doc.serverTexts())[1], 'The first line.');

    const opIds: string[] = [];
    const b = await doc.open('page-b', {
      wal: sess => new TabWal({ store, doc: 'd', tab: doc.tab, life: `${sess}~b` }),
      transport: base => ({
        call: request => {
          opIds.push(request.opId);
          return base.call(request);
        },
        read: base.read,
        renew: base.renew!,
      }),
    });
    await until(() => store.all().length === 0);
    await doc.settle(b);
    assert.deepEqual(opIds, [opId]);
    const held = await doc.serverTexts();
    assert.equal(held[1], 'The first line. Typed offline.');
    assert.deepEqual(texts(b.sync.shadow), held);
    await b.stop();
  });

  it('does not send again what landed though its answer was lost', async () => {
    const store = memoryWalStore();
    const a = await doc.open('page-a', {
      wal: sess => new TabWal({ store, doc: 'd', tab: doc.tab, life: `${sess}~a` }),
      transport: base => ({
        call: async request => {
          await base.call(request);
          throw new TypeError('connection reset');
        },
        read: base.read,
      }),
    });
    const page = docToPage(a.sync.shadow);
    typeEnd(page, 2, ' Landed once.');
    a.sync.editPage(page);
    await until(() => store.all().some(item => item.sent));
    await wait(30);
    await a.stop();

    const b: Page = await doc.open('page-b', { wal: sess => new TabWal({ store, doc: 'd', tab: doc.tab, life: `${sess}~b` }) });
    await until(() => store.all().length === 0);
    await doc.settle(b);
    const held = await doc.serverTexts();
    assert.equal(held[2], 'The second line. Landed once.');
    assert.deepEqual(texts(b.sync.shadow), held);
    await b.stop();
  });

  it('names the words of an edit the tab no longer takes', async () => {
    const words: string[] = [];
    const a = await doc.open('page-a', { frames: false, onUnsaved: text => words.push(text) });
    const b = await doc.open('page-b');
    const pageB = docToPage(b.sync.shadow);
    pageB.content!.splice(2, 1);
    b.sync.editPage(pageB);
    await doc.settle(b);
    const pageA = docToPage(a.sync.shadow);
    typeEnd(pageA, 2, ' Lost words');
    a.sync.editPage(pageA);
    await doc.settle(a);
    assert.deepEqual(words, ['Lost words']);
    await Promise.all([a.stop(), b.stop()]);
  });
});
