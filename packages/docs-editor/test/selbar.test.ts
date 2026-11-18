import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { schema } from '../src/editor/schema.ts';
import { formatChord } from '../src/selbar/chords.ts';
import { docHeadings, findPlace, headingHref, matchTargets, parseDocHref, tabHref } from '../src/selbar/fragments.ts';
import { normalizeHref, shortLink, webLinkParts } from '../src/selbar/link-url.ts';
import { placeBeside } from '../src/selbar/placement.ts';

const { nodes } = schema;
const heading = (level: number, text: string, bid: string) => nodes.paragraph!.create({ heading: level, bid }, text ? schema.text(text) : null);
const para = (text: string, bid: string) => nodes.paragraph!.create({ bid }, schema.text(text));

describe('chords', () => {
  it('shows chords for the platform', () => {
    assert.equal(formatChord('Mod-Alt-m', true), '⌘⌥M');
    assert.equal(formatChord('Mod-Alt-m', false), 'Ctrl+Alt+M');
    assert.equal(formatChord('Mod-Shift-8', false), 'Ctrl+Shift+8');
    assert.equal(formatChord('Mod-]', true), '⌘]');
    assert.equal(formatChord('Mod-Alt-Enter', true), '⌘⌥↵');
  });
});

describe('placement', () => {
  const bounds = { left: 0, top: 0, right: 1000, bottom: 800 };
  const size = { width: 200, height: 40 };
  it('goes above the range, centred', () => {
    assert.deepEqual(placeBeside({ left: 400, right: 600, top: 300, bottom: 320 }, size, bounds), { left: 400, top: 252, below: false });
  });
  it('flips below when there is no room above', () => {
    assert.deepEqual(placeBeside({ left: 400, right: 600, top: 20, bottom: 40 }, size, bounds), { left: 400, top: 48, below: true });
  });
  it('stays inside the bounds sideways', () => {
    assert.equal(placeBeside({ left: 0, right: 20, top: 300, bottom: 320 }, size, bounds)?.left, 0);
    assert.equal(placeBeside({ left: 980, right: 1000, top: 300, bottom: 320 }, size, bounds)?.left, 800);
  });
  it('is gone while the range is out of sight', () => {
    assert.equal(placeBeside({ left: 0, right: 20, top: 900, bottom: 920 }, size, bounds), null);
  });
  it('stays at the top when the range fills the view', () => {
    assert.deepEqual(placeBeside({ left: 0, right: 1000, top: -100, bottom: 900 }, size, bounds), { left: 400, top: 0, below: false });
  });
});

describe('typed links', () => {
  it('takes addresses as they are', () => {
    assert.equal(normalizeHref('https://example.com/a?b=1'), 'https://example.com/a?b=1');
    assert.equal(normalizeHref('  http://example.com  '), 'http://example.com');
    assert.equal(normalizeHref('mailto:a@b.co'), 'mailto:a@b.co');
  });
  it('completes bare domains and emails', () => {
    assert.equal(normalizeHref('example.com/path'), 'https://example.com/path');
    assert.equal(normalizeHref('someone@example.com'), 'mailto:someone@example.com');
    assert.equal(normalizeHref('tel: +1 555 0100'), 'tel:+15550100');
  });
  it('keeps places in the doc and paths', () => {
    assert.equal(normalizeHref('#ab12.3~intro'), '#ab12.3~intro');
    assert.equal(normalizeHref('/docs/a b'), '/docs/a%20b');
  });
  it('finds the one address in a pasted sentence', () => {
    assert.equal(normalizeHref('see https://example.com/x.'), 'https://example.com/x');
    assert.equal(normalizeHref('https://a.com and https://b.com'), null);
  });
  it('refuses what is not a link', () => {
    for (const bad of ['', 'hello', 'hello world', 'javascript:alert(1)', '//evil.com', 'https://user:pw@example.com', '# a', 'localhost']) assert.equal(normalizeHref(bad), null, bad);
  });
  it('shortens web links for the card', () => {
    assert.equal(webLinkParts('ftp://x.com'), null);
    assert.equal(shortLink('https://example.com/'), 'example.com');
    assert.equal(shortLink('https://example.com/a/very/long/path/that/goes/on/and/on'), 'example.com/a/very/long/pat…n/and/on');
  });
});

describe('places in the doc', () => {
  const doc = nodes.doc!.create(null, [heading(1, 'Getting Started!', 'aa.1'), para('words', 'aa.2'), heading(2, 'Café menu', 'aa.3'), heading(2, '', 'aa.4')]);
  it('lists the headings with their slugs', () => {
    const headings = docHeadings(doc);
    assert.deepEqual(
      headings.map(item => [item.bid, item.level, item.text, item.slug]),
      [
        ['aa.1', 1, 'Getting Started!', 'getting-started'],
        ['aa.3', 2, 'Café menu', 'café-menu'],
      ],
    );
  });
  it('links a heading by id and slug, or by id when the slug is not plain', () => {
    assert.equal(headingHref('aa.1', 'Getting Started!'), '#aa.1~getting-started');
    assert.equal(headingHref('aa.3', 'Café menu'), '#aa.3');
    assert.equal(tabHref('0123abcd-4567'), '#0123abcd-4567');
  });
  it('reads in-doc links', () => {
    assert.deepEqual(parseDocHref('#aa.1~getting-started'), { block: 'aa.1', slug: 'getting-started' });
    assert.deepEqual(parseDocHref('#aa.1'), { block: 'aa.1' });
    assert.deepEqual(parseDocHref('#0123abcd-4567'), { tab: '0123abcd-4567' });
    assert.deepEqual(parseDocHref('#0123abcd-4567.aa.1~x'), { tab: '0123abcd-4567', block: 'aa.1', slug: 'x' });
    assert.deepEqual(parseDocHref('#Getting-Started'), { slug: 'getting-started' });
    assert.equal(parseDocHref('https://example.com'), null);
  });
  it('finds a block by id, else a heading by its slug', () => {
    assert.equal(findPlace(doc, { block: 'aa.2' }), doc.child(0).nodeSize);
    assert.equal(findPlace(doc, { block: 'gone.9', slug: 'getting-started' }), 0);
    assert.equal(findPlace(doc, { slug: 'nothing' }), null);
  });
  it('matches what is typed after # or /', () => {
    const headings = docHeadings(doc);
    const tabs = [{ id: '0123abcd-4567', name: 'Menu ideas' }];
    assert.equal(matchTargets('#', headings, tabs).headings.length, 2);
    assert.deepEqual(matchTargets('/get', headings, tabs).headings.map(item => item.bid), ['aa.1']);
    assert.deepEqual(matchTargets('#menu', headings, tabs), { headings: [headings[1]], tabs });
  });
});
