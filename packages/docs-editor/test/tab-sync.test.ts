import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type DiskDoc, type DocState, docToDisk } from '@open-artifact/docs-core';
import type { DocTabResponse } from '@open-artifact/runtime/doc-api';
import { type PageNode, SUGGEST_INS, docToPage } from '../src/sync/page.ts';
import type { ShadowCause, TabSync } from '../src/sync/tab-sync.ts';
import { type DocServer, type Page, type PageOptions, startDocServer, texts } from './harness.ts';

/** Writes `text` into a page paragraph at a character offset, as typing would (the typed text takes the marks there). */
function typeAt(page: PageNode, block: number, offset: number, text: string): void {
  const paragraph = page.content![block]!;
  const runs = paragraph.content ?? (paragraph.content = []);
  let at = 0;
  for (const [index, run] of runs.entries()) {
    const length = [...(run.text ?? '￼')].length;
    if (run.type === 'text' && offset <= at + length && (offset > at || index === 0)) {
      const chars = [...run.text!];
      run.text = chars.slice(0, offset - at).join('') + text + chars.slice(offset - at).join('');
      return;
    }
    at += length;
  }
  runs.push({ type: 'text', text });
}

interface Client {
  sync: TabSync;
  page: PageNode;
  causes: ShadowCause[];
  reconnect(): Promise<void>;
  stop(): Promise<void>;
}

describe('a tab kept in step with the type server', () => {
  let doc: DocServer;
  let tab: string;
  const action = (name: string, args: Record<string, unknown>) => doc.action(name, args);
  const post = <T>(route: string, body: unknown) => doc.post<T>(route, body);
  const serverTexts = () => doc.serverTexts();
  const settle = (...clients: Client[]) => doc.settle(...(clients as unknown as Page[]));

  async function connect(label: string, options: Omit<PageOptions, 'onShadow'> = {}): Promise<Client> {
    const client = {} as Client;
    const page = await doc.open(label, {
      ...options,
      onShadow: shadow => {
        client.page = docToPage(shadow);
      },
    });
    Object.assign(client, { sync: page.sync, causes: page.causes, reconnect: page.reconnect, stop: page.stop });
    client.page = docToPage(page.sync.shadow);
    return client;
  }

  before(async () => {
    doc = await startDocServer('# Notes\n\nThe first line.\n\nThe second line.');
    tab = doc.tab;
  });

  after(() => doc.stop());

  it('lands two pages’ edits made at once, and both pages end on the tab the server holds', async () => {
    const a = await connect('page-a');
    const b = await connect('page-b');
    typeAt(a.page, 1, 'The first line'.length, ' from A');
    a.sync.editPage(a.page);
    typeAt(b.page, 1, 0, 'B says: ');
    b.sync.editPage(b.page);
    typeAt(b.page, 2, 'The second line.'.length, ' More from B.');
    b.sync.editPage(b.page);
    await settle(a, b);

    const held = await serverTexts();
    assert.deepEqual(held, ['Notes', 'B says: The first line from A.', 'The second line. More from B.']);
    assert.deepEqual(texts(a.sync.shadow), held);
    assert.deepEqual(texts(b.sync.shadow), held);
    assert.deepEqual(docToDisk(a.sync.shadow).blocks, docToDisk(b.sync.shadow).blocks);
    assert.ok(a.causes.includes('remote') || b.causes.includes('remote'));
    await Promise.all([a.stop(), b.stop()]);
  });

  it('keeps typing that waits on a call, and lays it on what the other page wrote meanwhile', async () => {
    const a = await connect('page-a');
    const b = await connect('page-b');
    for (const word of [' one', ' two', ' three']) {
      typeAt(a.page, 2, [...texts(a.sync.shadow)[2]!].length, word);
      a.sync.editPage(a.page);
    }
    typeAt(b.page, 1, 0, '> ');
    b.sync.editPage(b.page);
    await settle(a, b);
    const held = await serverTexts();
    assert.equal(held[1], '> B says: The first line from A.');
    assert.equal(held[2], 'The second line. More from B. one two three');
    assert.deepEqual(texts(a.sync.shadow), held);
    assert.deepEqual(texts(b.sync.shadow), held);
    await Promise.all([a.stop(), b.stop()]);
  });

  it('sends a call again with the same opId when the server could not be reached, landing it once', async () => {
    let failures = 1;
    const opIds: string[] = [];
    const a = await connect('page-a', {
      transport: base => ({
        call: async request => {
          opIds.push(request.opId);
          if (failures-- > 0) throw new TypeError('fetch failed');
          return base.call(request);
        },
        read: base.read,
      }),
    });
    const statuses: string[] = [];
    (a.sync as unknown as { events: { status: (status: string) => void } }).events.status = status => statuses.push(status);
    typeAt(a.page, 0, 'Notes'.length, '!');
    a.sync.editPage(a.page);
    await settle(a);
    assert.equal(opIds.length, 2);
    assert.equal(opIds[0], opIds[1]);
    assert.ok(statuses.includes('unsaved'));
    assert.equal(statuses.at(-1), 'saved');
    assert.equal((await serverTexts())[0], 'Notes!');
    await a.stop();
  });

  it('drops an edit the tab no longer takes and shows the tab as the server holds it', async () => {
    const a = await connect('page-a', { frames: false });
    const b = await connect('page-b');
    // B deletes the last paragraph while A, not hearing it, types into it.
    b.page.content!.splice(2, 1);
    b.sync.editPage(b.page);
    await settle(b);
    typeAt(a.page, 2, 0, 'Lost: ');
    a.sync.editPage(a.page);
    await settle(a);
    const held = await serverTexts();
    assert.equal(held.length, 2);
    assert.deepEqual(texts(a.sync.shadow), held);
    assert.ok(a.causes.includes('refused'));
    await Promise.all([a.stop(), b.stop()]);
  });

  it('takes a new session when the stream came back after a gap, losing nothing typed meanwhile', async () => {
    const a = await connect('page-a');
    const b = await connect('page-b');
    typeAt(a.page, 0, [...texts(a.sync.shadow)[0]!].length, ' (draft)');
    a.sync.editPage(a.page);
    await settle(a);
    const before = (a.sync as unknown as { session: { sess: string } }).session.sess;
    const reconnecting = a.reconnect();
    typeAt(a.page, 0, [...texts(a.sync.shadow)[0]!].length, ' v2');
    a.sync.editPage(a.page);
    typeAt(b.page, 1, 0, 'Meanwhile: ');
    b.sync.editPage(b.page);
    await reconnecting;
    typeAt(a.page, 0, [...texts(a.sync.shadow)[0]!].length, '!');
    a.sync.editPage(a.page);
    await settle(a, b);
    const held = await serverTexts();
    assert.equal(held[0], 'Notes! (draft) v2!');
    assert.equal(held[1], 'Meanwhile: > B says: The first line from A.');
    assert.deepEqual(texts(a.sync.shadow), held);
    assert.deepEqual(texts(b.sync.shadow), held);
    assert.notEqual((a.sync as unknown as { session: { sess: string } }).session.sess, before);
    await Promise.all([a.stop(), b.stop()]);
  });

  it('shows the agent’s suggestion, lets words typed inside it join it, and accepts it', async () => {
    const a = await connect('page-a');
    const wrote = await action('update', {
      call: {
        ref: { object: 'node', id: tab },
        payload: { suggest: true, ops: [{ op: 'insert', target: { kind: 'root' }, side: 'end', with: { as: 'markdown', from: { kind: 'inline', content: 'Suggested close.' } } }] },
      },
    });
    assert.equal(wrote.ok, true, JSON.stringify(wrote));
    await settle(a);
    const last = a.page.content!.at(-1)!;
    assert.equal(last.attrs?.suggestOp, 'ins');
    const suggestId = last.attrs?.suggestId as string;
    assert.ok(suggestId);
    assert.equal(a.sync.shadow.suggestions?.[suggestId] !== undefined, true);

    // Typing inside the suggested words carries its mark: the words join the suggestion.
    const run = last.content!.find(item => item.type === 'text')!;
    if (!run.marks?.some(mark => mark.type === SUGGEST_INS)) run.marks = [...(run.marks ?? []), { type: SUGGEST_INS, attrs: { suggestId } }];
    typeAt(a.page, a.page.content!.length - 1, 'Suggested'.length, ' and edited');
    a.sync.editPage(a.page);
    await settle(a);
    const shadowLast = a.sync.shadow.blocks.at(-1)!;
    assert.equal(texts({ blocks: [shadowLast] } as DocState)[0], 'Suggested and edited close.');
    assert.ok(shadowLast.inline!.every(item => !item.suggest || item.suggest.id === suggestId));
    assert.equal((await serverTexts()).at(-1), 'Suggested and edited close.');

    a.sync.write([{ op: 'decide', suggestId, verdict: 'accept' }]);
    await settle(a);
    const accepted = (await post<DocTabResponse>('_api/doc/read', { tab })).doc as unknown as DiskDoc;
    assert.equal(accepted.suggestions, undefined);
    assert.equal(texts(accepted).at(-1), 'Suggested and edited close.');
    assert.equal(a.sync.shadow.suggestions, undefined);
    await a.stop();
  });
});
