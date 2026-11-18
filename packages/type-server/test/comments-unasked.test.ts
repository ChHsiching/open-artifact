/**
 * A reply sent to the agent without asking it (the Docs page's comment judge): the thread keeps its status, the agent
 * is told it was not addressed, and its next answer there is marked `joined` for the page.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { AGENT_AUTHOR, CommentStore, agentView, type Thread } from '@open-artifact/server-sdk/comments';
import { DbHost, type SendHow, pageThread, threadRequestText } from '../src/db-host.ts';

const ana = { kind: 'user' as const, name: 'Ana' };

describe('a reply sent to the agent unasked', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oa-unasked-'));
  after(() => rm(dir, { recursive: true, force: true }));

  /** A thread Ana asked the agent on, that it answered. */
  const answered = (store: CommentStore): Thread => {
    const thread = store.create({ anchor: '{}', label: 'Intro', text: '@Agent tighten this', to: ['agent'], author: ana });
    store.markSent(thread.id);
    store.addMessage(thread.id, { ...AGENT_AUTHOR }, 'Done: cut it to two sentences. Want a title too?');
    return store.addMessage(thread.id, ana, 'Make it punchier').thread;
  };

  it('keeps the status of a thread the agent answered, and marks its next reply joined', () => {
    const store = new CommentStore(dir);
    const thread = answered(store);
    const sent = store.markSent(thread.id, { unasked: true });
    assert.equal(sent.agent?.status, 'replied');
    assert.ok(sent.agent?.unaskedAt);

    const { message, thread: after } = store.addMessage(thread.id, { ...AGENT_AUTHOR }, 'Punchier now.');
    assert.equal(message.joined, true);
    assert.equal(after.agent?.status, 'replied');
    assert.equal(after.agent?.unaskedAt, undefined);
    assert.equal(pageThread(after).messages.at(-1)?.joined, true);
    assert.equal((agentView(after).messages as Array<Record<string, unknown>>).at(-1)?.joined, true);
    // Earlier answers, asked for, are not.
    assert.equal(pageThread(after).messages[1]?.joined, undefined);
  });

  it('is a plain reply again once the agent is asked', () => {
    const store = new CommentStore(dir);
    const thread = answered(store);
    store.markSent(thread.id, { unasked: true });
    store.addMessage(thread.id, ana, '@Agent and the title');
    assert.equal(store.markSent(thread.id).agent?.unaskedAt, undefined);
    assert.equal(store.addMessage(thread.id, { ...AGENT_AUTHOR }, 'Added one.').message.joined, undefined);
  });

  it('does not mark an answer joined while the agent still works on an ask', () => {
    const store = new CommentStore(dir);
    const thread = store.create({ anchor: '{}', label: 'Intro', text: '@Agent tighten this', to: ['agent'], author: ana });
    store.markSent(thread.id);
    store.markDelivered(thread.id, 'hook');
    store.addMessage(thread.id, ana, 'Keep the first sentence');
    const sent = store.markSent(thread.id, { unasked: true });
    assert.equal(sent.agent?.status, 'delivered');
    assert.equal(sent.agent?.unaskedAt, undefined);
    assert.equal(store.addMessage(thread.id, { ...AGENT_AUTHOR }, 'Done.').message.joined, undefined);
  });

  it('refuses a thread the agent took no part in', () => {
    const store = new CommentStore(dir);
    const thread = store.create({ anchor: '{}', label: 'Intro', text: 'Note to self', author: ana });
    assert.throws(() => store.markSent(thread.id, { unasked: true }), /took part/);
  });

  it('tells the agent the reply was not addressed to it, and that it may leave it', () => {
    const thread = answered(new CommentStore(dir));
    assert.match(threadRequestText(thread), /was sent to you\. Read it/);
    const text = threadRequestText(thread, { unasked: true });
    assert.match(text, /without being addressed to you/);
    assert.match(text, /answer briefly/);
    assert.match(text, /leave it/);
  });

  it('hands it over from the page route without marking it delivered', async () => {
    const calls: Array<{ thread: Thread; how: SendHow | undefined }> = [];
    const host = new DbHost({
      root: dir,
      documents: false,
      viewerName: 'Ana',
      emit: () => undefined,
      sendThread: async (thread, how) => {
        calls.push({ thread, how });
        return 'delivered';
      },
    });
    const thread = answered(host.comments);
    const unasked = await host.sendThread(thread.id, { unasked: true });
    assert.deepEqual(calls.at(-1)?.how, { unasked: true });
    assert.equal(unasked.agent?.status, 'replied');

    const asked = await host.sendThread(thread.id);
    assert.deepEqual(calls.at(-1)?.how, {});
    assert.equal(asked.agent?.status, 'delivered');
  });
});
