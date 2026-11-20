import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_LINK_LENGTH, canOpenLink, isWebLink, normalizeTypedLink, placeLinkCard, shownLink } from '../src/lib/link-card.ts';

describe('link card addresses', () => {
  it('adds https to a typed host and lowers the scheme', () => {
    assert.equal(normalizeTypedLink('  example.com/docs '), 'https://example.com/docs');
    assert.equal(normalizeTypedLink('HTTPS://Example.com/A'), 'https://Example.com/A');
    assert.equal(normalizeTypedLink('//cdn.example.com/x'), 'https://cdn.example.com/x');
    assert.equal(normalizeTypedLink('localhost:5173/page'), 'https://localhost:5173/page');
    assert.equal(normalizeTypedLink('MAILTO:team@example.com'), 'mailto:team@example.com');
  });

  it('keeps project paths relative and encodes what would break the Markdown', () => {
    assert.equal(normalizeTypedLink('components/Button/README.md'), 'components/Button/README.md');
    assert.equal(normalizeTypedLink('README.md'), 'README.md');
    assert.equal(normalizeTypedLink('guides/Brand voice.md'), 'guides/Brand%20voice.md');
    assert.equal(normalizeTypedLink('https://example.com/a_(b)'), 'https://example.com/a_%28b%29');
    assert.equal(normalizeTypedLink('https://example.com/[x]'), 'https://example.com/%5Bx%5D');
  });

  it('refuses empty, unsafe, spaced or overlong web addresses', () => {
    assert.equal(normalizeTypedLink('   '), null);
    assert.equal(normalizeTypedLink('javascript:alert(1)'), null);
    assert.equal(normalizeTypedLink('data:text/html,hi'), null);
    assert.equal(normalizeTypedLink('https://exa mple.com'), null);
    assert.equal(normalizeTypedLink('https:nohost'), null);
    assert.equal(normalizeTypedLink('https://example.com/' + 'a'.repeat(MAX_LINK_LENGTH)), null);
  });

  it('shows the site first and opens only web and mail addresses', () => {
    assert.deepEqual(shownLink('https://www.example.com/docs?q=1'), { site: 'example.com', rest: '/docs?q=1' });
    assert.deepEqual(shownLink('https://example.com/'), { site: 'example.com', rest: '' });
    assert.deepEqual(shownLink('mailto:a%40b@example.com'), { site: 'a@b@example.com', rest: '' });
    assert.deepEqual(shownLink('components/Button/README.md'), { site: 'components/Button/README.md', rest: '' });
    assert.ok(isWebLink('HTTPS://x.y') && !isWebLink('README.md'));
    assert.ok(canOpenLink('http://127.0.0.1:4000/project/README.md'));
    assert.ok(canOpenLink('mailto:a@example.com'));
    assert.ok(!canOpenLink('javascript:alert(1)'));
    assert.ok(!canOpenLink('README.md'));
  });

  it('places the card below the link, or above when the window ends', () => {
    const card = { width: 200, height: 40 };
    assert.deepEqual(placeLinkCard({ top: 100, bottom: 120, left: 50 }, card, { width: 800, height: 600 }), { top: 126, left: 50 });
    assert.deepEqual(placeLinkCard({ top: 560, bottom: 580, left: 700 }, card, { width: 800, height: 600 }), { top: 514, left: 594 });
    assert.deepEqual(placeLinkCard({ top: 10, bottom: 30, left: 0 }, card, { width: 800, height: 60 }), { top: 36, left: 6 });
  });
});
