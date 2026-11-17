import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blockUnicodeRange, cssUrls, fontFaceBlocks, parseUnicodeRange, rangeCovers } from '../src/fonts.ts';

describe('font stylesheets', () => {
  it('reads unicode ranges', () => {
    assert.deepEqual(parseUnicodeRange('U+0000-00FF, U+0131, U+4??'), [
      [0, 0xff],
      [0x131, 0x131],
      [0x400, 0x4ff],
    ]);
    assert.equal(parseUnicodeRange(undefined), null);
    assert.deepEqual(parseUnicodeRange('U+zz'), []);
    assert.ok(rangeCovers(null, new Set([1])));
    assert.ok(rangeCovers([[0x4e00, 0x9fff]], new Set([0x41, 0x4f60])));
    assert.ok(!rangeCovers([[0x4e00, 0x9fff]], new Set([0x41])));
  });

  it('splits stylesheets into faces', () => {
    const css = '/* latin */\n@font-face { font-family: "A"; src: url(a.woff2); unicode-range: U+0000-00FF; }\n@font-face{font-family:"A";src:url(b.woff2)}';
    const blocks = fontFaceBlocks(css);
    assert.equal(blocks.length, 2);
    assert.equal(blockUnicodeRange(blocks[0]!), 'U+0000-00FF');
    assert.equal(blockUnicodeRange(blocks[1]!), undefined);
  });

  it('finds url() references', () => {
    assert.deepEqual(cssUrls(`src: url("a.woff2") format("woff2"), url(b.ttf), url('c d.otf')`), [
      { match: 'url("a.woff2")', url: 'a.woff2' },
      { match: 'url(b.ttf)', url: 'b.ttf' },
      { match: "url('c d.otf')", url: 'c d.otf' },
    ]);
  });
});
