import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepChangedTweaks, mergeStyleTweaks, previewLook, shownStyleTweaks } from '../src/page/look.ts';

test('a style change keeps only what differs from the stored tweaks', () => {
  const stored = { palette: 'Ocean', corners: 4 };
  assert.deepEqual(keepChangedTweaks({ palette: 'Ocean', font: 'Serif' }, stored), { font: 'Serif' });
  assert.equal(keepChangedTweaks({ font: null }, stored), null);
  assert.deepEqual(keepChangedTweaks({ palette: null, page: null, corners: null, font: null, size: null }, stored), { palette: null, corners: null });
});

test('the page previews the unsaved tweaks over the stored ones', () => {
  const look = { system: { name: 'Ocean' }, tweaks: { palette: 'Ocean', corners: 4 } };
  assert.deepEqual(previewLook(look, { palette: null, size: 'large' }), { system: { name: 'Ocean' }, tweaks: { corners: 4, size: 'large' } });
  assert.equal(previewLook(look, null), look);
  assert.deepEqual(shownStyleTweaks(undefined, { page: 'white' }), { page: 'white' });
  assert.deepEqual(mergeStyleTweaks({ palette: 'Clay' }, { palette: null }), {});
});
