import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { byteRange } from '../src/http.ts';

describe('byteRange', () => {
  it('reads a single byte span', () => {
    assert.deepEqual(byteRange('bytes=0-99', 1000), { start: 0, end: 99 });
    assert.deepEqual(byteRange('bytes=500-', 1000), { start: 500, end: 999 });
    assert.deepEqual(byteRange('bytes=900-5000', 1000), { start: 900, end: 999 });
    assert.deepEqual(byteRange('bytes=-100', 1000), { start: 900, end: 999 });
    assert.deepEqual(byteRange('bytes=-5000', 1000), { start: 0, end: 999 });
  });

  it('sends the whole body for no, odd or several spans', () => {
    assert.equal(byteRange(undefined, 1000), null);
    assert.equal(byteRange('items=0-1', 1000), null);
    assert.equal(byteRange('bytes=0-1,5-6', 1000), null);
    assert.equal(byteRange('bytes=-', 1000), null);
    assert.equal(byteRange('bytes=9-3', 1000), null);
  });

  it('refuses a span past the end', () => {
    assert.equal(byteRange('bytes=1000-', 1000), 'unsatisfiable');
    assert.equal(byteRange('bytes=-0', 1000), 'unsatisfiable');
    assert.equal(byteRange('bytes=0-', 0), 'unsatisfiable');
  });
});
