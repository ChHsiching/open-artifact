import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CommentMessage, CommentThread } from '@open-artifact/runtime';
import { judgeComment } from '../src/comments/judge.ts';

let next = 0;
const person = (name: string, text: string, to?: string[]): CommentMessage => ({
  id: `m${next++}`,
  author: { kind: 'person', name },
  text,
  at: '2026-01-01T00:00:00Z',
  ...(to ? { to } : {}),
});
const agent = (text: string): CommentMessage => ({ id: `m${next++}`, author: { kind: 'agent', name: 'Agent' }, text, at: '2026-01-01T00:00:00Z' });
const thread = (messages: CommentMessage[], status?: 'pending' | 'delivered' | 'replied'): CommentThread => ({
  id: 'c1',
  anchor: '{}',
  label: 'Intro',
  location: {},
  status: 'open',
  ...(status ? { agent: { status } } : {}),
  messages,
});

/** Ana asked the agent, it answered. */
const talk = () => [person('Ana', '@Agent tighten this', ['agent']), agent('Cut it to two sentences.')];

describe('the comment judge', () => {
  it('sends a message that @mentions the agent, as asked', () => {
    assert.equal(judgeComment({ thread: thread([person('Ana', '@Agent look', ['agent'])]), to: ['agent'] }).choice, 'asked');
    assert.equal(judgeComment({ thread: thread([...talk(), person('Ana', '@Agent again', ['agent'])], 'replied'), to: ['agent'], edited: true }).choice, 'asked');
  });

  it('wakes the agent for a reply going on a talk with it', () => {
    const verdict = judgeComment({ thread: thread([...talk(), person('Ana', 'Make it punchier')], 'replied'), to: [] });
    assert.equal(verdict.choice, 'wake');
    // Handed to it (it has not written yet, but works on it): a follow-up reaches it too.
    assert.equal(judgeComment({ thread: thread([person('Ana', '@Agent tighten', ['agent']), person('Ana', 'and keep the first line')], 'delivered'), to: [] }).choice, 'wake');
    // Its own thread.
    assert.equal(judgeComment({ thread: thread([agent('Should this say Q3?'), person('Ana', 'yes')]), to: [] }).choice, 'wake');
  });

  it('stays quiet for a new thread, and for an edit', () => {
    assert.equal(judgeComment({ thread: thread([person('Ana', 'Fix the intro')]), to: [] }).choice, 'nothing');
    assert.equal(judgeComment({ thread: thread([...talk(), person('Ana', 'Make it punchier')], 'replied'), to: [], edited: true }).choice, 'nothing');
  });

  it('stays quiet where the agent took no part', () => {
    assert.equal(judgeComment({ thread: thread([person('Ana', 'note to self'), person('Ana', 'more notes')]), to: [] }).choice, 'nothing');
    assert.equal(judgeComment({ thread: thread([person('Bo', 'what about this?'), person('Ana', 'I agree')]), to: [] }).choice, 'nothing');
  });

  it('stays quiet for a reply to someone else', () => {
    assert.equal(judgeComment({ thread: thread([...talk(), person('Ana', '@Bo what do you think?', ['Bo'])], 'replied'), to: ['Bo'] }).choice, 'nothing');
    // An @name the page does not know is someone too.
    assert.equal(judgeComment({ thread: thread([...talk(), person('Ana', '@Chris have a look')], 'replied'), to: [] }).choice, 'nothing');
    // Someone else joined the talk since the agent.
    assert.equal(judgeComment({ thread: thread([...talk(), person('Bo', 'I prefer the long one'), person('Ana', 'Fair, keep both')], 'replied'), to: [] }).choice, 'nothing');
    // ...but not before the agent's last word.
    assert.equal(
      judgeComment({ thread: thread([person('Bo', 'too long'), person('Ana', '@Agent shorten', ['agent']), agent('Done.'), person('Ana', 'Now the title')], 'replied'), to: [] }).choice,
      'wake',
    );
  });

  it('stays quiet while the thread waits for the agent, who reads it whole', () => {
    assert.equal(judgeComment({ thread: thread([person('Ana', '@Agent tighten', ['agent']), person('Ana', 'and the title')], 'pending'), to: [] }).choice, 'nothing');
  });

  it('stays quiet for a thanks, unless it answers the agent', () => {
    for (const ack of ['Thanks!', 'thank you', 'ok', 'LGTM', '👍', '谢谢！', '好的']) {
      assert.equal(judgeComment({ thread: thread([...talk(), person('Ana', ack)], 'replied'), to: [] }).choice, 'nothing', ack);
    }
    assert.equal(judgeComment({ thread: thread([...talk(), person('Ana', 'Thanks, now do the title too')], 'replied'), to: [] }).choice, 'wake');
    const asked = [person('Ana', '@Agent tighten this', ['agent']), agent('Done. Want a title too?')];
    assert.equal(judgeComment({ thread: thread([...asked, person('Ana', 'ok')], 'replied'), to: [] }).choice, 'wake');
  });

  it('stays quiet for a message that is not a person’s', () => {
    assert.equal(judgeComment({ thread: thread([...talk(), agent('One more thing')], 'replied'), to: [] }).choice, 'nothing');
  });
});
