import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inlineView, pageAddress } from '../src/shell/model.ts';

describe('inline deck view', () => {
  const boot = { id: 'deck', page: 'http://localhost:8000/', type: 'slides' };
  const address = 'http://localhost:8100/a/deck';

  it('is the inline view only for a deck framed by another page', () => {
    assert.equal(inlineView(boot, address + '#view-inline', true), true);
    assert.equal(inlineView(boot, address + '#view-inline', false), false);
    assert.equal(inlineView({ type: 'design' }, address + '#view-inline', true), false);
    assert.equal(inlineView(boot, address + '#slide-~7', true), false);
  });

  it('hands the inline fragment to the page only when the Shell is framed', () => {
    assert.equal(new URL(pageAddress(boot, address + '#view-inline', true)!).hash, '#view-inline');
    assert.equal(new URL(pageAddress(boot, address + '#view-inline')!).hash, '');
    assert.equal(new URL(pageAddress({ ...boot, type: 'design' }, address + '#view-inline', true)!).hash, '');
    assert.equal(new URL(pageAddress(boot, address + '#slide-~7', true)!).hash, '#slide-~7');
  });
});
