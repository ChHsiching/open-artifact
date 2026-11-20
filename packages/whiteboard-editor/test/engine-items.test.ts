/**
 * The canvas engine's view of a board (`engine/items.ts`, `engine/sprites.ts`):
 * item ids and owners, body items per element type, sprite places and
 * shows, sprite keys and raster buckets.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { containerTitleScaleForZoom, normalizeElement, type BoardElement, type ElementsById } from '@open-artifact/whiteboard-core';
import { elementBodyItems, elementSpriteItem, isAlwaysLive, itemOwner, sectionTitleSpot, spritePlace, type ItemScope } from '../src/engine/items.ts';
import { engineRequested } from '../src/engine/mode.ts';
import { parseSpriteKey, SPRITE_SCALE_RANGE, spriteBucket, spriteHash, spriteKey } from '../src/engine/sprite-keys.ts';

/** An element as the board would hold it (defaults filled in). */
function element(raw: Record<string, unknown>): BoardElement {
  const made = normalizeElement(raw);
  assert.ok(made, `a valid element: ${JSON.stringify(raw)}`);
  return made;
}
const note = (id: string, x: number, y: number, text: string): BoardElement => element({ type: 'note', id, x, y, w: 160, h: 160, color: 'yellow', text, tilt: 0 });
const shape = (id: string, x: number, y: number, text = ''): BoardElement => element({ type: 'shape', id, kind: 'rounded', x, y, w: 200, h: 100, color: 'blue', text });

function scopeOf(elements: readonly BoardElement[], editable = true): ItemScope {
  const byId: ElementsById = new Map(elements.map((element) => [element.id, element]));
  return { byId, measures: new Map(), scheme: 'light', editable, zoom: 1 };
}

describe('engine items', () => {
  it('maps companion item ids back to their element', () => {
    assert.equal(itemOwner('e1'), 'e1');
    assert.equal(itemOwner('e1#t'), 'e1');
    assert.equal(itemOwner('e12#k'), 'e12');
  });

  it('draws a note as a movable, resizable rect with its colour', () => {
    const block = note('n1', 10, 20, 'Hello');
    const [body, ...rest] = elementBodyItems(block, 3, scopeOf([block]), false);
    assert.equal(rest.length, 0);
    assert.equal(body?.kind, 'rect');
    assert.equal(body?.id, 'n1');
    assert.deepEqual([body?.x, body?.y, body?.w], [10, 20, 160]);
    assert.equal(body?.movable, true);
    assert.equal(body?.resizable, false);
    assert.equal(body?.layer, 1);
    assert.equal(body?.z, 12);
  });

  it('draws a shape as a path, and nothing moves on a read-only board', () => {
    const block = shape('s1', 0, 0, 'Box');
    const [body] = elementBodyItems(block, 0, scopeOf([block], false), false);
    assert.equal(body?.kind, 'path');
    assert.equal(body?.movable, false);
    assert.equal(body?.resizable, false);
  });

  it('draws sections on the bottom layer', () => {
    const section = element({ type: 'container', id: 'c1', x: 0, y: 0, w: 400, h: 300, text: 'Now' });
    const [body] = elementBodyItems(section, 5, scopeOf([section]), false);
    assert.equal(body?.layer, 0);
  });

  it('draws an arrow between its ends, never as something the canvas picks or moves', () => {
    const a = shape('a', 0, 0);
    const b = shape('b', 400, 0);
    const arrow = element({ type: 'arrow', id: 'r1', from: 'a', to: 'b', fromSide: 'right', toSide: 'left' });
    const items = elementBodyItems(arrow, 2, scopeOf([a, b, arrow]), false);
    const line = items.find((item) => item.id === 'r1');
    assert.equal(line?.kind, 'path');
    assert.equal(line?.hittable, false);
    assert.equal(line?.selectable, false);
    assert.ok(line && line.x <= 200 && line.x + line.w >= 400, 'the line spans the gap between the shapes');
  });

  it('draws ink as a stroke-only path that hits on its line', () => {
    const stroke = element({ type: 'stroke', id: 'k1', x: 0, y: 0, points: [0, 0, 50, 20, 100, 0], color: 'ink', width: 4 });
    const [body] = elementBodyItems(stroke, 0, scopeOf([stroke]), false);
    assert.equal(body?.kind, 'path');
    assert.equal(body && 'hitStrokeOnly' in body ? body.hitStrokeOnly : undefined, true);
    assert.equal(spritePlace(stroke, scopeOf([stroke])), undefined, 'ink has no sprite');
  });

  it('keeps live elements interactive without punching through the artwork below', () => {
    const block = note('n1', 0, 0, 'Typing');
    const [body] = elementBodyItems(block, 0, scopeOf([block]), true);
    assert.equal(body?.kind, 'rect');
    assert.equal(body.fill, 'transparent');
    assert.equal(isAlwaysLive(element({ type: 'html', id: 'h1', x: 0, y: 0, w: 100, h: 100, html: '<p>Hi</p>' })), true);
    assert.equal(isAlwaysLive(block), false);
  });

  it('places a text sprite only where there is text, as a hole or a texture', () => {
    const empty = shape('s1', 0, 0);
    const worded = shape('s2', 0, 0, 'Words');
    assert.equal(spritePlace(empty, scopeOf([empty])), undefined);
    const place = spritePlace(worded, scopeOf([worded]));
    assert.ok(place);
    assert.equal(elementSpriteItem(worded, 1, place, { mode: 'dom' }).kind, 'hole');
    const sprite = elementSpriteItem(worded, 1, place, { mode: 'texture', key: 'k' });
    assert.equal(sprite.kind, 'image');
    assert.equal(sprite.id, 's2#t');
    assert.equal(sprite.z, 6);
    assert.equal(sprite.hittable, false);
  });

  it('places a section title as the DOM draws it: a readable screen size at any zoom', () => {
    const section = element({ type: 'container', id: 'c1', x: 0, y: 0, w: 600, h: 300, text: 'Now' });
    assert.ok(section.type === 'container');
    const near = containerTitleScaleForZoom(2);
    assert.ok(near < 1, 'zoomed in, the title shrinks in board units');
    assert.deepEqual(sectionTitleSpot(section, new Map(), 2), { scale: near, gap: 6 * near, inset: 4 * near });
    const far = sectionTitleSpot(section, new Map(), 0.5);
    assert.ok(far && far.scale > 1, 'zoomed out, the title grows in board units');
    assert.equal(sectionTitleSpot(section, new Map(), 0.05), undefined, 'too narrow on screen for a title');
    assert.equal(sectionTitleSpot({ ...section, text: ' ' }, new Map(), 1), undefined);
    const place = spritePlace(section, scopeOf([section]));
    assert.ok(place && place.box.y + place.box.h === 0 && place.box.w > 20 && place.box.w < 600, 'the title sprite sits just above the section, as wide as its title');
  });

  it('leaves card resizing to the board so the canvas and DOM receive the same geometry', () => {
    const card = shape('s1', 0, 0, 'Status');
    const [body] = elementBodyItems(card, 0, scopeOf([card]), false);
    assert.equal(body?.resizable, false);
  });
});

describe('engine sprites', () => {
  it('rasterizes at the power of two at or above zoom × pixel ratio, within range', () => {
    assert.equal(spriteBucket(1, 2), 2);
    assert.equal(spriteBucket(0.3, 2), 1);
    assert.equal(spriteBucket(0.26, 1), 0.5);
    assert.equal(spriteBucket(0.001, 1), SPRITE_SCALE_RANGE.min);
    assert.equal(spriteBucket(8, 2), SPRITE_SCALE_RANGE.max);
  });

  it('keys a sprite by element, look and bucket', () => {
    const key = spriteKey('e1', 'abc', 0.5);
    assert.deepEqual(parseSpriteKey(key), { id: 'e1', hash: 'abc', bucket: 0.5 });
    assert.equal(parseSpriteKey('img|x'), undefined);
  });

  it('hashes what the sprite looks like, not where a block stands', () => {
    const deps = { scheme: 'light' as const, backdrop: undefined };
    const a = note('n1', 0, 0, 'Hello');
    const place = spritePlace(a, scopeOf([a]))!;
    const moved = { ...a, x: 500, y: 300 } as BoardElement;
    const placeMoved = spritePlace(moved, scopeOf([moved]))!;
    assert.equal(spriteHash(moved, placeMoved, deps), spriteHash(a, place, deps));
    const edited = { ...a, text: 'Hello there' } as BoardElement;
    assert.notEqual(spriteHash(edited, spritePlace(edited, scopeOf([edited]))!, deps), spriteHash(a, place, deps));
    assert.notEqual(spriteHash(a, place, { ...deps, scheme: 'dark' }), spriteHash(a, place, deps));
  });
});

describe('engine mode', () => {
  it('runs unless the page asks for the DOM board, and never outside a browser', () => {
    assert.equal(engineRequested(''), true);
    assert.equal(engineRequested('?open_artifact_engine=off'), false);
    assert.equal(engineRequested('?open_artifact_engine=on'), true);
    assert.equal(engineRequested(undefined), false);
  });
});
