import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inlineRunsText, linkAttributesFor, needsSpaceBeside, normalizeHttpUrl, normalizeLinkHref, pushInlineRun, type InlineRun } from '../src/edit/runs.ts';

describe('edit links', () => {
  it('keeps http(s) and in-page addresses and refuses other schemes', () => {
    assert.equal(normalizeLinkHref('example.com/a'), 'https://example.com/a');
    assert.equal(normalizeLinkHref('HTTP://Example.com'), 'http://Example.com');
    assert.equal(normalizeLinkHref('#signups'), '#signups');
    assert.equal(normalizeLinkHref('#not ok'), null);
    assert.equal(normalizeLinkHref('javascript:alert(1)'), null);
    assert.equal(normalizeLinkHref('mailto:a@b.c'), null);
    assert.equal(normalizeLinkHref('localhost:3000'), 'https://localhost:3000');
    assert.equal(normalizeHttpUrl('two words'), null);
    assert.equal(normalizeHttpUrl(`x.com/${'a'.repeat(2048)}`), null);
  });

  it('opens outside links in a new tab and in-page ones in place', () => {
    assert.deepEqual(linkAttributesFor('https://a.b'), ['https://a.b', '_blank', 'noopener noreferrer']);
    assert.deepEqual(linkAttributesFor('#top'), ['#top', null, null]);
  });
});

describe('edit runs', () => {
  it('joins neighbouring strings and wrappers of the same kind', () => {
    const runs: InlineRun[] = [];
    pushInlineRun(runs, 'Sign');
    pushInlineRun(runs, 'ups ');
    pushInlineRun(runs, '');
    pushInlineRun(runs, { tag: 'b', runs: ['up'] });
    pushInlineRun(runs, { tag: 'b', runs: [' 12%'] });
    pushInlineRun(runs, { tag: 'a', href: 'https://a.b', runs: ['x'] });
    pushInlineRun(runs, { tag: 'a', href: 'https://c.d', runs: ['y'] });
    assert.deepEqual(runs, ['Signups ', { tag: 'b', runs: ['up 12%'] }, { tag: 'a', href: 'https://a.b', runs: ['x'] }, { tag: 'a', href: 'https://c.d', runs: ['y'] }]);
    assert.equal(inlineRunsText(runs), 'Signups up 12%xy');
  });

  it('spaces a letter typed against a written value unless punctuation sits there', () => {
    assert.equal(needsSpaceBeside('a', '42', 1), true);
    assert.equal(needsSpaceBeside('a', '42', -1), true);
    assert.equal(needsSpaceBeside('a', ',42', -1), false);
    assert.equal(needsSpaceBeside('a', '$', 1), false);
    assert.equal(needsSpaceBeside(' ', '42', 1), false);
  });
});
