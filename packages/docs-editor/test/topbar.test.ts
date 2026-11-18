import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SHORTCUT_GROUPS, keyLabel } from '../src/topbar/shortcuts.ts';
import { cleanDocName, defaultPaper, notesText } from '../src/topbar/words.ts';

describe('key labels', () => {
  it('writes chords the platform’s way', () => {
    assert.equal(keyLabel('Mod-Alt-1', true), '⌘⌥1');
    assert.equal(keyLabel('Mod-Alt-1', false), 'Ctrl+Alt+1');
    assert.equal(keyLabel('Mod-Shift-z', true), '⌘⇧Z');
    assert.equal(keyLabel('Alt-Enter', false), 'Alt+Enter');
    assert.equal(keyLabel('Mod-]', false), 'Ctrl+]');
    assert.equal(keyLabel('?', true), '?');
  });

  it('lists each shortcut once per group, with keys', () => {
    for (const group of SHORTCUT_GROUPS) {
      assert.ok(group.rows.length > 0, group.title);
      const labels = group.rows.map(row => `${row.label}${row.where ?? ''}`);
      assert.equal(new Set(labels).size, labels.length, group.title);
      for (const row of group.rows) assert.ok(row.keys.length > 0, row.label);
    }
  });
});

describe('export', () => {
  it('picks Letter where it is the usual paper', () => {
    assert.equal(defaultPaper(['en-US']), 'letter');
    assert.equal(defaultPaper(['fr-CA', 'en']), 'letter');
    assert.equal(defaultPaper(['en-GB']), 'a4');
    assert.equal(defaultPaper(['zh-CN']), 'a4');
    assert.equal(defaultPaper([]), 'a4');
  });

  it('says what a file could not carry over, in either note shape', () => {
    assert.equal(notesText([]), undefined);
    assert.equal(notesText([{ code: 'kept_as_text', what: 'image (not available here)', count: 2 }]), 'In the file: 2 × image (not available here) kept as text.');
    assert.equal(notesText([{ code: 'other', message: 'Word comment, left out' }]), 'In the file: Word comment, left out.');
  });
});

describe('renaming', () => {
  it('saves one trimmed line', () => {
    assert.equal(cleanDocName('  Plan\nfor 2027 '), 'Plan for 2027');
    assert.equal(cleanDocName(' \n '), '');
  });
});
