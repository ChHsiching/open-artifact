import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DocState } from '@open-artifact/docs-core';
import { DELETED_TABS_WORDS, type DeletedTab, asNewTabNote, deletedRows, deletedWhen, hasEmbeds, previewDescription, restoreRefusal, rowLine, stepRow } from '../src/tabs/deleted.ts';

const tab = (id: string, more: Partial<DeletedTab> = {}): DeletedTab => ({ id, name: id.toUpperCase(), known: true, deletedAt: null, returnsTo: 'place', subtabs: [], ...more });

describe('deleted tabs list', () => {
  it('says a row\'s first line, or that there is none or it could not be read', () => {
    assert.deepEqual(rowLine(tab('a', { firstLine: 'Plan for May' })), { line: 'Plan for May', text: true });
    assert.deepEqual(rowLine(tab('a', { firstLine: '' })), { line: 'No text in this tab', text: false });
    assert.deepEqual(rowLine(tab('a', { firstLine: null })), { line: 'Couldn’t load this tab’s text', text: false });
    assert.deepEqual(rowLine(tab('a')), { line: DELETED_TABS_WORDS.noText, text: false });
  });

  it('says when a tab was deleted', () => {
    const now = new Date(2026, 10, 18, 15, 0);
    const at = (date: Date) => date.toISOString();
    assert.match(deletedWhen(at(new Date(2026, 10, 18, 9, 5)), now), /^Deleted today at /);
    assert.match(deletedWhen(at(new Date(2026, 10, 17, 9, 5)), now), /^Deleted yesterday at /);
    assert.match(deletedWhen(at(new Date(2026, 10, 14, 9, 5)), now), /^Deleted \w+day at /);
    assert.match(deletedWhen(at(new Date(2026, 2, 3, 9, 5)), now), /^Deleted Mar 3 at /);
    assert.equal(deletedWhen(null, now), 'Deleted, time unknown');
  });

  it('lists the subtabs deleted with a tab under it, a page of tabs at a time', () => {
    const tabs = [tab('a', { subtabs: [tab('a1', { subtabs: [tab('a2')] })] }), tab('b'), tab('c')];
    assert.deepEqual(deletedRows(tabs, 2).map(row => [row.tab.id, row.depth]), [['a', 0], ['a1', 1], ['a2', 2], ['b', 0]]);
    assert.equal(deletedRows(tabs, 20).length, 5);
  });

  it('moves up and down between rows, stopping at the ends', () => {
    assert.equal(stepRow(0, 3, 'ArrowDown'), 1);
    assert.equal(stepRow(2, 3, 'ArrowDown'), 2);
    assert.equal(stepRow(0, 3, 'ArrowUp'), 0);
    assert.equal(stepRow(1, 3, 'ArrowUp'), 0);
    assert.equal(stepRow(1, 3, 'Enter'), null);
  });

  it('describes the preview: when, then what a restore brings back', () => {
    const now = new Date(2026, 10, 18, 15, 0);
    const deletedAt = new Date(2026, 10, 18, 9, 5).toISOString();
    assert.match(previewDescription(tab('a', { deletedAt }), false, now), /^Deleted today at .+\. Restoring brings this tab back with its comments and version history\.$/);
    assert.match(previewDescription(tab('a', { deletedAt, known: false, name: 'Restored tab' }), false, now), /It will be named “Restored tab” and added as the last tab/);
    assert.match(previewDescription(tab('a', { parent: { id: 'p', name: 'Plan' } }), false, now), /^Restoring brings .+ It comes back under “Plan”\.$/);
    assert.match(previewDescription(tab('a'), true, now), /Restored on its own, it will be added as the last tab/);
  });

  it('knows a tab holding charts or widgets', () => {
    const doc = (blocks: DocState['blocks']): DocState => ({ rev: 1, blocks });
    assert.equal(hasEmbeds(doc([{ id: 'p', type: 'paragraph', inline: [] }])), false);
    assert.equal(hasEmbeds(doc([{ id: 'q', type: 'blockquote', children: [{ id: 'e', type: 'embed' }] }])), true);
  });
});

describe('restoring a deleted tab as a new tab', () => {
  it('offers its content as a new tab when the tab itself can\'t come back', () => {
    assert.deepEqual(restoreRefusal('already_restored'), { outcome: 'gone', message: 'That tab has already been restored.' });
    assert.equal(restoreRefusal('absent').outcome, 'gone');
    assert.deepEqual(restoreRefusal('unreadable'), { outcome: 'copyOnly', message: DELETED_TABS_WORDS.copyOnly });
    assert.match(DELETED_TABS_WORDS.copyOnly, /choose “Restore as new tab”/);
    assert.deepEqual(restoreRefusal('doc_too_large'), { outcome: 'failed', message: DELETED_TABS_WORDS.sizeLimit });
    assert.deepEqual(restoreRefusal('locked'), { outcome: 'failed', message: null });
    // No answer from the server: try again later, nothing else to offer.
    assert.deepEqual(restoreRefusal(null), { outcome: 'failed', message: null });
  });

  it('says what a new tab brings back', () => {
    assert.equal(asNewTabNote('Notes'), 'Restoring adds this as a new tab named “Notes”. The deleted tab’s comments and version history aren’t restored.');
    assert.equal(previewDescription(tab('n', { name: 'Notes' }), false, new Date(), true), asNewTabNote('Notes'));
    assert.match(previewDescription(tab('n'), false), /^Restoring brings this tab back/);
  });
});
