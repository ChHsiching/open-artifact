import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { measuredArrowGeometry } from '../src/geometry.ts';
import {
  arrowEndNextOffer,
  arrowFreeEnd,
  boxesNearlyTouch,
  isArrowEndOfferCurrent,
  isCenteredInside,
  placeBoxAtAnchor,
  placeNextItemBeside,
} from '../src/next-item.ts';
import type { ArrowElement, BoardElement, ShapeElement } from '../src/schema.ts';

function shape(id: string, x: number, y: number, w = 100, h = 60): ShapeElement {
  return { type: 'shape', id, kind: 'rect', color: 'white', text: '', x, y, w, h };
}

function arrow(from: ArrowElement['from'], to: ArrowElement['to'], extra: Partial<ArrowElement> = {}): ArrowElement {
  return { type: 'arrow', id: 'a', from, to, head: 'end', dash: false, color: 'ink', ...extra };
}

const template = shape('next', 0, 0, 120, 80);

describe('next item beside', () => {
  it('tells boxes that come within the clearance', () => {
    assert.equal(boxesNearlyTouch({ x: 0, y: 0, w: 10, h: 10 }, { x: 21, y: 0, w: 10, h: 10 }), true);
    assert.equal(boxesNearlyTouch({ x: 0, y: 0, w: 10, h: 10 }, { x: 23, y: 0, w: 10, h: 10 }), false);
  });

  it('tells a frame from an obstacle', () => {
    assert.equal(isCenteredInside({ x: 10, y: 10, w: 10, h: 10 }, { x: 0, y: 0, w: 40, h: 40 }), true);
    assert.equal(isCenteredInside({ x: 0, y: 0, w: 40, h: 40 }, { x: 10, y: 10, w: 10, h: 10 }), false);
  });

  it('steps past items in the way', () => {
    const from = shape('s', 0, 0);
    const blocker = shape('b', 150, 0);
    const placed = placeNextItemBeside(from, shape('n', 0, 0), [from, blocker]);
    assert.equal(placed.x, 150 + 100 + 48);
    assert.equal(placed.y, 0);
  });

  it('places on any side, stepping away from the item', () => {
    const from = shape('s', 0, 0);
    const blocker = shape('b', 0, -150);
    const above = placeNextItemBeside(from, shape('n', 0, 0), [from, blocker], undefined, 'top');
    assert.deepEqual([above.x, above.y], [0, -150 - 60 - 48]);
    const left = placeNextItemBeside(from, shape('n', 0, 0), [from, blocker], undefined, 'left');
    assert.deepEqual([left.x, left.y], [-100 - 48, 0]);
  });
});

describe('next-item offer', () => {
  it('finds the free end', () => {
    assert.equal(arrowFreeEnd(arrow('s', [300, 30])), 'to');
    assert.equal(arrowFreeEnd(arrow([0, 0], 's')), 'from');
    assert.equal(arrowFreeEnd(arrow('s', 't')), undefined);
    assert.equal(arrowFreeEnd(arrow([0, 0], [10, 10])), undefined);
  });

  it('anchors a box by the middle of a side', () => {
    const size = { w: 100, h: 40 };
    assert.deepEqual(placeBoxAtAnchor(size, 'left', 200, 50), { x: 200, y: 30 });
    assert.deepEqual(placeBoxAtAnchor(size, 'right', 200, 50), { x: 100, y: 30 });
    assert.deepEqual(placeBoxAtAnchor(size, 'top', 200, 50), { x: 150, y: 50 });
    assert.deepEqual(placeBoxAtAnchor(size, 'bottom', 200, 50), { x: 150, y: 10 });
  });

  it('offers an item whose facing side meets the arrow tip', () => {
    const source = shape('s', 0, 0);
    const drawn = arrow('s', [400, 30], { fromSide: 'right' });
    const elements: BoardElement[] = [source, drawn];
    const offer = arrowEndNextOffer(drawn, template, elements);
    assert.ok(offer);
    assert.equal(offer.end, 'to');
    assert.equal(offer.side, 'left');
    // Joined, the arrow ends where it ends now.
    const joined = { ...drawn, to: offer.next.id, toSide: offer.side } satisfies ArrowElement;
    const line = measuredArrowGeometry(joined, new Map<string, BoardElement>([...elements, offer.next].map((element) => [element.id, element])));
    assert.ok(line);
    assert.ok(Math.abs(line.x2 - 400) < 0.5);
    assert.ok(Math.abs(line.y2 - 30) < 0.5);
    // Centered vertically on the tip.
    assert.equal(offer.next.y, 30 - 40);
  });

  it('offers on the side facing back along an arrow drawn upwards', () => {
    const source = shape('s', 0, 300);
    const drawn = arrow('s', [50, 40], { fromSide: 'top' });
    const offer = arrowEndNextOffer(drawn, template, [source, drawn]);
    assert.equal(offer?.side, 'bottom');
  });

  it('offers nothing near another item, or without a free end', () => {
    const source = shape('s', 0, 0);
    const drawn = arrow('s', [400, 30], { fromSide: 'right' });
    const neighbour = shape('n', 470, 0);
    assert.equal(arrowEndNextOffer(drawn, template, [source, drawn, neighbour]), undefined);
    const other = shape('t', 400, 0);
    const linked = arrow('s', 't');
    assert.equal(arrowEndNextOffer(linked, template, [source, other, linked]), undefined);
  });

  it('stays current until the board changes under it', () => {
    const source = shape('s', 0, 0);
    const drawn = arrow('s', [400, 30], { fromSide: 'right' });
    const elements: BoardElement[] = [source, drawn];
    const offer = arrowEndNextOffer(drawn, template, elements);
    assert.ok(offer);
    assert.equal(isArrowEndOfferCurrent(offer, elements), true);
    const moved = { ...drawn, to: [420, 30] as const };
    assert.equal(isArrowEndOfferCurrent(offer, [source, moved]), false);
    assert.equal(isArrowEndOfferCurrent(offer, [source]), false);
    assert.equal(isArrowEndOfferCurrent(offer, [...elements, shape('n', 470, 0)]), false);
  });
});
