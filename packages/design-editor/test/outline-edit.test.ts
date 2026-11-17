import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDcDocument, parseTemplate } from '@open-artifact/dc';
import { applyOp, type BoardOp } from '../src/lib/ops.ts';
import { acceptsChildren, isHiddenLayer, renameOp, reorderOp, visibilityOps } from '../src/lib/outline.ts';

const board = (template: string) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Test</title><script src="./support.js"></script></head>
<body>
<x-dc>${template}</x-dc>
<script type="text/x-dc" data-dc-script data-props='{}'>
class Component extends DCLogic {}
</script>
</body>
</html>
`;
const templateText = (source: string) => parseDcDocument(source).template!.text;
const modelOf = (source: string) => parseTemplate(templateText(source));
const apply = (source: string, ops: BoardOp[]) => ops.reduce((current, op) => applyOp(current, op)!.source, source);

// tids: div 0, h1 1, p 2, ul 3, li 4, img 5
const SOURCE = board('<div><h1>Title</h1><p>Body</p><ul><li>One</li></ul><img src="a.png"></div>');

describe('layers: reorder', () => {
  it('moves an element after another', () => {
    const op = reorderOp(modelOf(SOURCE), [1], 2, 'after');
    assert.ok(op);
    assert.match(templateText(applyOp(SOURCE, op)!.source), /<div><p>Body<\/p><h1>Title<\/h1><ul>/);
  });

  it('moves several elements inside a container, in document order', () => {
    const op = reorderOp(modelOf(SOURCE), [2, 1], 3, 'inside');
    assert.ok(op);
    assert.match(templateText(applyOp(SOURCE, op)!.source), /<ul><li>One<\/li><h1>Title<\/h1>\s*<p>Body<\/p><\/ul>/);
  });

  it('refuses drops into itself, into a void element, and no-ops', () => {
    const model = modelOf(SOURCE);
    assert.equal(reorderOp(model, [3], 4, 'before'), null, 'into its own child');
    assert.equal(reorderOp(model, [0], 1, 'after'), null, 'the root into itself');
    assert.equal(reorderOp(model, [1], 5, 'inside'), null, 'inside an image');
    assert.equal(reorderOp(model, [1], 2, 'before'), null, 'already there');
    assert.equal(reorderOp(model, [2], 1, 'after'), null, 'already there');
    assert.equal(reorderOp(model, [99], 1, 'after'), null, 'unknown element');
    assert.equal(acceptsChildren(model.elements[3]!), true);
    assert.equal(acceptsChildren(model.elements[5]!), false);
  });
});

describe('layers: rename and hide', () => {
  it('names a layer with data-label and clears it with an empty name', () => {
    const named = apply(SOURCE, [renameOp(modelOf(SOURCE), 2, '  Intro   copy ')!]);
    assert.match(templateText(named), /<p data-label="Intro copy">Body<\/p>/);
    assert.equal(renameOp(modelOf(named), 2, 'Intro copy'), null, 'unchanged');
    assert.match(templateText(apply(named, [renameOp(modelOf(named), 2, '')!])), /<p>Body<\/p>/);
  });

  it('hides with display:none and shows again', () => {
    const hidden = apply(SOURCE, visibilityOps(modelOf(SOURCE), 1));
    assert.match(templateText(hidden), /<h1 style="display: none;?">Title<\/h1>/);
    assert.equal(isHiddenLayer(modelOf(hidden).elements[1]!), true);
    const shown = apply(hidden, visibilityOps(modelOf(hidden), 1));
    assert.match(templateText(shown), /<h1>Title<\/h1>/);
  });

  it('keeps an inline display while hidden', () => {
    const source = board('<div style="display: flex; gap: 4px"><p>A</p></div>');
    const hidden = apply(source, visibilityOps(modelOf(source), 0));
    assert.match(templateText(hidden), /display: none/);
    assert.match(templateText(hidden), /data-display="flex"/);
    const shown = apply(hidden, visibilityOps(modelOf(hidden), 0));
    assert.match(templateText(shown), /display: flex/);
    assert.doesNotMatch(templateText(shown), /data-display/);
  });
});

describe('whole-source op', () => {
  it('replaces the source and survives replay', () => {
    const result = applyOp(SOURCE, { kind: 'source', text: board('<p>New</p>') });
    assert.ok(result);
    assert.match(templateText(result.source), /<p>New<\/p>/);
  });
});
