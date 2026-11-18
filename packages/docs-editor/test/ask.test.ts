import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanAsk, lineAskText } from '../src/ask/request.ts';

describe('ask from a line', () => {
  it('drops a leading @agent', () => {
    assert.equal(cleanAsk('@agent write an intro'), 'write an intro');
    assert.equal(cleanAsk(' summarise this'), 'summarise this');
    assert.equal(cleanAsk('email @agent later'), 'email @agent later');
  });
  it('tells the agent to write in place of the empty line', () => {
    const text = lineAskText({ tab: 't1', block: 'b9', empty: true, ask: '@agent a short intro' });
    assert.match(text, /empty line block b9 in tab t1/);
    assert.match(text, /a short intro/);
    assert.doesNotMatch(text, /@agent/);
  });
});
