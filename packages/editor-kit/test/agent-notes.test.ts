import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queuedNote, sentNotice } from '../src/collab/comments.ts';

test('a thread waiting for an agent that is not woken while it idles says to message it', () => {
  assert.equal(queuedNote({ name: 'Codex' }), 'Waiting for the agent');
  assert.equal(queuedNote({ name: 'Codex', wakesIdle: true }), 'Waiting for the agent');
  assert.equal(queuedNote({ name: 'Cursor', wakesIdle: false }), 'Cursor gets this on its next turn: send it a message to start one');
});

test('the toast after sending says the same, only for an agent that is not woken', () => {
  assert.deepEqual(sentNotice('Codex', undefined), { title: 'Sent to Codex' });
  const cursor = sentNotice('Cursor', false);
  assert.equal(cursor.title, 'Sent to Cursor');
  assert.match(String(cursor.description), /next turn.*send it a message/);
});
