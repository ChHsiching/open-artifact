import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CanvasNote } from '@open-artifact/design-core';
import { bezierPathData, dragNode, editableNodes, notePatchForNodes, readNodes, relativeNodes, removeNode, sampleBezier, splitSegment, toggleSmooth } from '../src/lib/bezier.ts';
import { clampInsets, dragCrop, formatInset, MIN_CROP, parseInset } from '../src/lib/crop.ts';

describe('bezier paths', () => {
  it('samples straight segments as their corners and curves finely', () => {
    assert.deepEqual(sampleBezier([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]), [[0, 0], [10, 0], [10, 10]]);
    assert.deepEqual(sampleBezier([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], true).at(-1), [0, 0]);
    const curve = sampleBezier([{ x: 0, y: 0, out: [0, 50] }, { x: 100, y: 0, in: [0, 50] }]);
    assert.ok(curve.length > 5);
    assert.deepEqual(curve.at(-1), [100, 0]);
    // The curve bows down towards the handles (max y = 37.5 for these handles).
    assert.equal(Math.max(...curve.map(([, y]) => y)), 37.5);
  });

  it('writes SVG path data', () => {
    assert.equal(bezierPathData([{ x: 0, y: 0, out: [1, 1] }, { x: 5, y: 5 }], false), 'M0 0C1 1 5 5 5 5');
    assert.equal(bezierPathData([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], true), 'M0 0L5 0L5 5L0 0Z');
  });

  it('edits lines, arrows and paths, not freehand strokes', () => {
    const line: CanvasNote = { x: 0, y: 0, text: '', kind: 'line', points: [[0, 0], [10, 10]] };
    assert.deepEqual(editableNodes(line), [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    assert.equal(editableNodes({ x: 0, y: 0, text: '', kind: 'pen', points: [[0, 0], [1, 1]] }), null);
    const path: CanvasNote = { x: 0, y: 0, text: '', kind: 'pen', nodes: [{ x: 0, y: 0 }, { x: 4, y: 0, in: [-1, 0] }], points: [] };
    assert.equal(editableNodes(path)?.length, 2);
    assert.equal(readNodes([{ x: 'a', y: 0 }]), null);
  });

  it('drags anchors with their handles and mirrors handles', () => {
    const nodes = [{ x: 0, y: 0, in: [-10, 0] as [number, number], out: [10, 0] as [number, number] }, { x: 50, y: 0 }];
    assert.deepEqual(dragNode(nodes, 0, 'anchor', 5, 5)[0], { x: 5, y: 5, in: [-10, 0], out: [10, 0] });
    const mirrored = dragNode(nodes, 0, 'out', 0, 10)[0]!;
    assert.deepEqual(mirrored.out, [10, 10]);
    assert.ok(Math.abs(mirrored.in![0] + 7.071) < 0.01 && Math.abs(mirrored.in![1] + 7.071) < 0.01);
    assert.deepEqual(dragNode(nodes, 0, 'out', 0, 10, true)[0]!.in, [-10, 0]);
  });

  it('adds, removes and smooths nodes', () => {
    const nodes = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    assert.deepEqual(splitSegment(nodes, 0)[1], { x: 5, y: 0 });
    assert.equal(splitSegment(nodes, 2).length, 3, 'no segment after the last node of an open path');
    assert.equal(splitSegment(nodes, 2, true).length, 4);
    assert.equal(removeNode(nodes, 1).length, 2);
    assert.equal(removeNode(nodes.slice(0, 2), 0).length, 2);
    const smooth = toggleSmooth(nodes, 1)[1]!;
    assert.ok(smooth.in && smooth.out);
    assert.deepEqual(toggleSmooth([nodes[0]!, smooth, nodes[2]!], 1)[1], { x: 10, y: 0 });
  });

  it('patches notes: paths keep nodes and resample, lines write points', () => {
    const nodes = [{ x: 0, y: 0 }, { x: 10.04, y: 3 }];
    assert.deepEqual(notePatchForNodes({ x: 0, y: 0, text: '', kind: 'line' }, nodes), { points: [[0, 0], [10, 3]] });
    const patch = notePatchForNodes({ x: 0, y: 0, text: '', kind: 'pen', closed: false }, nodes);
    assert.deepEqual(patch.nodes, [{ x: 0, y: 0 }, { x: 10, y: 3 }]);
    assert.deepEqual(patch.points, [[0, 0], [10, 3]]);
    assert.deepEqual(relativeNodes([{ x: 100, y: 50 }, { x: 110, y: 40 }]), { origin: { x: 100, y: 50 }, nodes: [{ x: 0, y: 0 }, { x: 10, y: -10 }] });
  });
});

describe('image crop', () => {
  it('reads and writes inset() clip paths', () => {
    assert.deepEqual(parseInset('inset(10px 20px 30px 40px)', 200, 100), { top: 10, right: 20, bottom: 30, left: 40 });
    assert.deepEqual(parseInset('inset(10%)', 200, 100), { top: 10, right: 20, bottom: 10, left: 20 });
    assert.deepEqual(parseInset('inset(5px 6px round 4px)', 200, 100), { top: 5, right: 6, bottom: 5, left: 6 });
    assert.deepEqual(parseInset('circle(50%)', 200, 100), { top: 0, right: 0, bottom: 0, left: 0 });
    assert.equal(formatInset({ top: 0.2, right: 0, bottom: 0, left: 0 }), null);
    assert.equal(formatInset({ top: 1.6, right: 2, bottom: 3, left: 4 }), 'inset(2px 2px 3px 4px)');
  });

  it('drags edges and corners within the element', () => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    assert.deepEqual(dragCrop(none, 'n', 0, 20, 200, 100), { top: 20, right: 0, bottom: 0, left: 0 });
    assert.deepEqual(dragCrop(none, 'se', -50, -30, 200, 100), { top: 0, right: 50, bottom: 30, left: 0 });
    // Never past the opposite side: a frame of MIN_CROP stays.
    assert.equal(dragCrop(none, 'w', 500, 0, 200, 100).left, 200 - MIN_CROP);
    assert.deepEqual(dragCrop(none, 'n', 0, -20, 200, 100), none);
  });

  it('moves the frame without resizing it, and keeps the aspect with Shift', () => {
    const start = { top: 10, right: 50, bottom: 10, left: 50 };
    assert.deepEqual(dragCrop(start, 'move', 30, 100, 200, 100), { top: 20, right: 20, bottom: 0, left: 80 });
    const kept = dragCrop({ top: 0, right: 0, bottom: 0, left: 0 }, 'se', -100, -10, 200, 100, true);
    assert.equal((200 - kept.left - kept.right) / (100 - kept.top - kept.bottom), 2);
    assert.deepEqual(clampInsets({ top: -5, right: 0, bottom: 0, left: 0 }, 10, 10), { top: 0, right: 0, bottom: 0, left: 0 });
  });
});
