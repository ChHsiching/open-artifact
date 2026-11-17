import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTemplate, type TemplateModel } from '@open-artifact/dc';
import { emptyCanvas, type Canvas } from '@open-artifact/design-core';
import { findMatches, firstMatchFrom, ownText } from '../src/lib/find.ts';

const canvas = (): Canvas => {
  const c = emptyCanvas();
  c.pages = [
    { id: 'p1', name: 'One' },
    { id: 'p2', name: 'Two' },
  ];
  c.boards = { 'A.dc.html': { x: 0, y: 0, w: 100, h: 100 }, 'B.dc.html': { x: 200, y: 0, w: 100, h: 100, page: 'p2' } } as Canvas['boards'];
  c.order = ['A.dc.html', 'B.dc.html'];
  c.notes = {
    n2: { x: 0, y: 500, text: 'Price later' },
    n1: { x: 0, y: 200, text: 'price, PRICE' },
  };
  return c;
};

const templates: Record<string, TemplateModel> = {
  'A.dc.html': parseTemplate('<section><h1>Price list</h1><p>The price is <b>low price</b></p><style>.price{}</style></section>'),
  'B.dc.html': parseTemplate('<div><p>Price</p></div>'),
};

describe('find', () => {
  it('reads only an element’s own text', () => {
    const model = parseTemplate('<p>One <b>two</b>  three</p>');
    assert.equal(ownText(model.elements[0]!), 'One three');
  });

  it('matches elements and notes page by page, skipping code', () => {
    const matches = findMatches(canvas(), (path) => templates[path] ?? null, 'price');
    assert.deepEqual(
      matches.map((m) => (m.kind === 'element' ? `${m.page}:${m.board}:${m.tid}:${m.occurrence}` : `${m.page}:${m.note}:${m.occurrence}`)),
      // Page 1: h1 "Price list", p "The price is", b "low price"; notes top to bottom; then page 2.
      ['p1:A.dc.html:1:0', 'p1:A.dc.html:2:0', 'p1:A.dc.html:3:0', 'p1:n1:0', 'p1:n1:1', 'p1:n2:0', 'p2:B.dc.html:1:0'],
    );
    const first = matches[0]!;
    assert.equal(first.kind, 'element');
    if (first.kind === 'element') assert.deepEqual(first.path, [0, 0]);
  });

  it('finds nothing for a blank query', () => {
    assert.deepEqual(findMatches(canvas(), (path) => templates[path] ?? null, '   '), []);
  });

  it('starts at the current page', () => {
    const matches = findMatches(canvas(), (path) => templates[path] ?? null, 'price');
    assert.equal(firstMatchFrom(matches, ['p1', 'p2'], 'p2'), 6);
    assert.equal(firstMatchFrom(matches, ['p1', 'p2'], 'p1'), 0);
    assert.equal(firstMatchFrom([], ['p1'], 'p1'), -1);
  });
});
