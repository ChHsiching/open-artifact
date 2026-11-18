import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PASTE_MAX_BYTES, pasteTooLarge, tooLargeWords } from '../src/paste/paste.ts';

describe('a paste over the limit', () => {
  const big = 'x'.repeat(PASTE_MAX_BYTES + 1);
  it('is 1 MB, counting the larger of the HTML and the text', () => {
    assert.equal(PASTE_MAX_BYTES, 1024 * 1024);
    assert.equal(pasteTooLarge('<p>hi</p>', 'hi', false), null);
    assert.deepEqual(pasteTooLarge(big, 'hi', false), { textFits: true });
    assert.deepEqual(pasteTooLarge('', big, false), { textFits: false });
    assert.deepEqual(pasteTooLarge(big, big, false), { textFits: false });
  });
  it('counts only the text of a plain paste, which carries nothing else', () => {
    assert.equal(pasteTooLarge(big, 'hi', true), null);
    assert.deepEqual(pasteTooLarge(big, big, true), { textFits: false });
  });
  it('is worded for it', () => {
    assert.match(tooLargeWords(false), /^What you pasted is larger than a document can take in one go \(over 1 MB\), so nothing was pasted; paste it in parts\.$/);
    assert.match(tooLargeWords(true), /^What you copied is too large to paste \(over 1 MB\), so nothing was pasted\. You can paste just its text \((⇧⌘V|Ctrl\+Shift\+V)\) or paste it in parts\.$/);
  });
});
