import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  blockKind,
  cursorAt,
  outlinesAt,
  pickSteps,
  planBuild,
  revealKeyframes,
  shiftPlan,
  type BlockLook,
  type BuildBlockInfo,
} from '../src/build-show.ts';

const frame = { w: 1000, h: 800 };
const look = (over: Partial<BlockLook> = {}): BlockLook => ({ tag: 'DIV', fill: false, border: false, shadow: false, text: false, ...over });

describe('blockKind', () => {
  it('tells how each kind of element appears', () => {
    assert.equal(blockKind(look({ tag: 'img' }), { x: 0, y: 0, w: 10, h: 10 }, frame), 'media');
    assert.equal(blockKind(look({ fill: true }), { x: 0, y: 0, w: 1000, h: 800 }, frame), 'frame');
    assert.equal(blockKind(look({ border: true }), { x: 0, y: 100, w: 600, h: 1 }, frame), 'line');
    assert.equal(blockKind(look({ shadow: true, text: true }), { x: 10, y: 10, w: 120, h: 40 }, frame), 'box');
    assert.equal(blockKind(look({ text: true }), { x: 10, y: 10, w: 120, h: 20 }, frame), 'text');
    assert.equal(blockKind(look(), { x: 10, y: 10, w: 120, h: 20 }, frame), null, 'a plain wrapper is not a block');
  });
});

const block = (x: number, y: number, w: number, h: number, kind: BuildBlockInfo['kind'], parent = -1): BuildBlockInfo => ({ rect: { x, y, w, h }, kind, parent });

describe('pickSteps', () => {
  it('keeps the largest blocks in document order and hides the rest with a drawn ancestor or the block before', () => {
    const blocks = [
      block(0, 0, 1000, 800, 'frame'), // 0
      block(10, 10, 400, 300, 'box', 0), // 1
      block(20, 20, 4, 4, 'box', 1), // 2: tiny, inside 1
      block(500, 10, 3, 3, 'media'), // 3: tiny, no ancestor
      block(500, 400, 300, 200, 'box'), // 4
    ];
    const { kept, with: attached } = pickSteps(blocks, 3);
    assert.deepEqual(kept, [0, 1, 4]);
    assert.deepEqual([...attached.entries()], [[1, [3]]]);
  });
});

describe('planBuild', () => {
  const blocks = [block(0, 0, 1000, 800, 'frame'), block(100, 100, 300, 200, 'box', 0), block(100, 340, 500, 30, 'text', 0), block(100, 400, 600, 2, 'line', 0)];

  it('draws every block in order, one after another, within the budget', () => {
    const plan = planBuild(blocks, frame, { budget: 1500 });
    assert.deepEqual(plan.steps.map((s) => s.block), [0, 1, 2, 3]);
    assert.ok(plan.end <= 1500 + 1e-6);
    for (let i = 1; i < plan.steps.length; i++) assert.ok(plan.steps[i]!.leave >= plan.steps[i - 1]!.at + plan.steps[i - 1]!.dur - 1e-6);
    const box = plan.steps[1]!;
    assert.deepEqual(box.from, { x: 100, y: 100 });
    assert.deepEqual(box.to, { x: 400, y: 300 });
    const line = plan.steps[3]!;
    assert.equal(line.from.y, line.to.y, 'a line is swept along');
  });

  it('starts where it is told and never stretches past its natural pace', () => {
    const plan = planBuild(blocks, frame, { start: { x: 5, y: 6 }, budget: 1e9 });
    assert.deepEqual(plan.start, { x: 5, y: 6 });
    assert.ok(plan.end < 5000);
  });

  it('moves the cursor between blocks and presses while one appears', () => {
    const plan = planBuild(blocks, frame);
    assert.deepEqual(cursorAt(plan, 0), { ...plan.start, pressed: false, step: 0 });
    const s = plan.steps[1]!;
    const pressing = cursorAt(plan, s.at + s.dur / 2);
    assert.equal(pressing.pressed, true);
    assert.equal(pressing.step, 1);
    assert.ok(pressing.x > s.from.x && pressing.x < s.to.x);
    const after = cursorAt(plan, plan.end + 100);
    assert.deepEqual({ x: after.x, y: after.y }, plan.steps[3]!.to);
    assert.equal(after.pressed, false);
  });

  it('outlines a block while it appears, then fades it', () => {
    const plan = planBuild(blocks, frame);
    const s = plan.steps[1]!;
    assert.deepEqual(outlinesAt(plan, s.at - 1).map((o) => o.step).includes(1), false);
    const during = outlinesAt(plan, s.at + s.dur / 2).find((o) => o.step === 1)!;
    assert.equal(during.alpha, 1);
    assert.ok(during.grow > 0 && during.grow < 1);
    const fading = outlinesAt(plan, s.at + s.dur + 100).find((o) => o.step === 1)!;
    assert.ok(fading.alpha < 1 && fading.alpha > 0);
    assert.equal(fading.grow, 1);
  });

  it('shifts into the units of the layer around the frame', () => {
    const plan = shiftPlan(planBuild(blocks, frame), 1000, 2000);
    assert.deepEqual(plan.steps[1]!.from, { x: 1100, y: 2100 });
    assert.equal(plan.steps[1]!.rect.x, 1100);
  });
});

describe('revealKeyframes', () => {
  it('ends at the element its own opacity, and leaves its own clip path alone', () => {
    const frames = revealKeyframes('box', { x: 0, y: 0, w: 10, h: 10 }, 0.5, true);
    assert.equal(frames[frames.length - 1]!.opacity, 0.5);
    assert.ok(frames[0]!.clipPath);
    const own = revealKeyframes('box', { x: 0, y: 0, w: 10, h: 10 }, 1, false);
    assert.ok(own.every((f) => f.clipPath === undefined));
  });
});
