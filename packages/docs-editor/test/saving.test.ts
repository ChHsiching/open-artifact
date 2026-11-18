import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BANNER_WORDS, bannerFor } from '../src/saving/words.ts';

describe('save banner', () => {
  it('shows only when saving is in trouble', () => {
    assert.equal(bannerFor(undefined), null);
    assert.equal(bannerFor('saved'), null);
    assert.equal(bannerFor('saving'), null);
    assert.equal(bannerFor('syncing'), null);
    assert.equal(bannerFor('reconnecting'), 'offline');
    assert.equal(bannerFor('unsaved'), 'unsaved');
    assert.equal(bannerFor('stopped'), 'stopped');
  });
  it('words a stopped page', () => {
    assert.match(BANNER_WORDS.stopped, /^Saving has stopped\. .*Copy what you need, then reload\.$/);
  });
});
