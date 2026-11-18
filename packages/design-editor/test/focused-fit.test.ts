import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { focusedFit, storedFit, storeFit } from '../src/lib/focused-fit.ts';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

describe('Fill / Fit in the focused view', () => {
  it('opens as the artboard’s expand says until a choice is made', () => {
    assert.equal(focusedFit(null, undefined), true);
    assert.equal(focusedFit(null, 'fill'), false);
  });

  it('opens every artboard in the kept choice', () => {
    assert.equal(focusedFit(false, undefined), false);
    assert.equal(focusedFit(true, 'fill'), true);
  });

  it('keeps the choice for later visits', () => {
    const storage = memoryStorage();
    assert.equal(storedFit(() => storage), null);
    storeFit(false, () => storage);
    assert.equal(storedFit(() => storage), false);
    storeFit(true, () => storage);
    assert.equal(storedFit(() => storage), true);
  });

  it('falls back to expand when storage is missing, throws or holds something else', () => {
    assert.equal(storedFit(() => undefined), null);
    const throwing = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    } as unknown as Storage;
    assert.equal(storedFit(() => throwing), null);
    assert.doesNotThrow(() => storeFit(true, () => throwing));
    const storage = memoryStorage();
    storage.setItem('mc-focused/fit', 'yes');
    assert.equal(storedFit(() => storage), null);
  });
});
