import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { keyAfterAll, keyAmong, keyBetween, usableKey } from '../src/tabs/order-key.ts';

const SENDABLE = /^[0-9A-Za-z]{0,127}[1-9A-Za-z]$/;

describe('tab sort keys', () => {
  it('starts in the middle and moves toward the ends', () => {
    assert.equal(keyBetween(null, null), 'V');
    assert.equal(keyBetween('V', null), 'k');
    assert.equal(keyBetween(null, 'V'), 'F');
    assert.equal(keyBetween('V', 'k'), 'c');
  });

  it('makes room between neighbours that are one digit apart', () => {
    const key = keyBetween('a', 'b');
    assert.ok(key > 'a' && key < 'b', key);
    assert.ok(SENDABLE.test(key), key);
  });

  it('never ends a key in 0', () => {
    for (const [before, after] of [
      [null, '1'],
      [null, '01'],
      ['0', '1'],
      ['z', null],
      ['zz', null],
      ['V', 'V1'],
    ] as const) {
      const key = keyBetween(before, after);
      assert.ok(SENDABLE.test(key), `${before}..${after} → ${key}`);
      if (before !== null) assert.ok(key > before, `${key} > ${before}`);
      if (after !== null) assert.ok(key < after, `${key} < ${after}`);
    }
  });

  it('keeps finding keys between a key and the one just after it', () => {
    let low = 'V';
    const high = 'W';
    for (let i = 0; i < 200; i++) {
      const key = keyBetween(low, high);
      assert.ok(key > low && key < high && SENDABLE.test(key), key);
      low = key;
    }
    let up = 'W';
    for (let i = 0; i < 200; i++) {
      const key = keyBetween('V', up);
      assert.ok(key > 'V' && key < up && SENDABLE.test(key), key);
      up = key;
    }
  });

  it('refuses neighbours out of order', () => {
    assert.throws(() => keyBetween('k', 'V'));
    assert.throws(() => keyBetween('V', 'V'));
  });

  it('goes after every usable key', () => {
    assert.equal(keyAfterAll([]), 'V');
    assert.equal(keyAfterAll(['V', 'k', 'not a key!', undefined]), 'r');
  });

  it('places among siblings, skipping keys it cannot use', () => {
    assert.equal(keyAmong(['V', 'k'], 0, 1), 'c');
    // A key equal to the one before leaves no room: the next one is used.
    const between = keyAmong(['V', 'V', 'k'], 0, 1);
    assert.ok(between > 'V' && between < 'k', between);
    assert.equal(keyAmong(['V', '??'], 0, 1), 'k');
    assert.equal(keyAmong(['V'], -1, 0), 'F');
    assert.equal(usableKey('V0'), 'V0');
    assert.equal(usableKey(''), null);
  });
});
