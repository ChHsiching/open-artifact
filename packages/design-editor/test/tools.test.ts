import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { elementChildren, parseDcDocument, parseTemplate, type HtmlElement } from '@open-artifact/dc';
import { applyOp } from '../src/lib/ops.ts';
import { flipTransform, parseTransform } from '../src/lib/transform.ts';
import { parseScaleInput, pinnedStyle, scaleLengths, scaleStyle } from '../src/lib/scale.ts';
import { looksLikeHtml, sanitizeHtml } from '../src/lib/sanitize.ts';
import { detachMarkup, detachRefusal, instanceProps } from '../src/lib/detach.ts';
import { fontRenders } from '../src/lib/fonts.ts';

const board = (template: string, props = '{}') => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Test</title>
  <script src="./support.js"></script>
</head>
<body>
<x-dc>${template}</x-dc>
<script type="text/x-dc" data-dc-script data-props='${props}'>
class Component extends DCLogic {}
</script>
</body>
</html>
`;

const templateOf = (source: string) => parseDcDocument(source).template!.text;
const first = (html: string): HtmlElement => elementChildren(parseTemplate(html).nodes)[0]!;

describe('flipTransform', () => {
  it('mirrors an untransformed element', () => {
    assert.deepEqual(parseTransform(flipTransform('', 'x')!), { tx: '0', ty: '0', rotate: 0, sx: -1, sy: 1 });
    assert.deepEqual(parseTransform(flipTransform('', 'y')!), { tx: '0', ty: '0', rotate: 0, sx: 1, sy: -1 });
  });

  it('flips back to no transform', () => {
    assert.equal(flipTransform(flipTransform('', 'x')!, 'x'), '');
  });

  it('negates the rotation and keeps the translation', () => {
    const flipped = flipTransform('translate(10px, 20px) rotate(30deg)', 'x')!;
    const parts = parseTransform(flipped)!;
    assert.match(flipped, /translate\(10px, 20px\)/);
    assert.equal(parts.rotate, -30);
    assert.equal(parts.sx, -1);
  });

  it('refuses transforms it cannot rewrite', () => {
    assert.equal(flipTransform('matrix(1, 0, 0, 1, 0, 0)', 'x'), null);
  });
});

describe('scale', () => {
  it('multiplies absolute lengths only', () => {
    assert.equal(scaleLengths('10px 2em 50%', 2), '20px 2em 50%');
    assert.equal(scaleLengths('url(a-10px.png) 4px', 2), 'url(a-10px.png) 8px');
    assert.equal(scaleLengths('{{size}}px', 2), '{{size}}px');
    assert.equal(scaleLengths('50%', 2, true), '100%');
  });

  it('keeps the position of a selected element and gives the originals back at 1', () => {
    const style = { left: '10px', width: '100px', 'font-size': '16px', opacity: '0.5', color: 'red' };
    assert.deepEqual(scaleStyle(style, 2, true), { width: '200px', 'font-size': '32px' });
    assert.deepEqual(scaleStyle(style, 2, false), { left: '20px', width: '200px', 'font-size': '32px' });
    assert.deepEqual(scaleStyle(style, 1, true), { width: '100px', 'font-size': '16px' });
  });

  it('pins computed sizes that inline styles do not set', () => {
    const pinned = pinnedStyle({ padding: '4px' }, { width: '120px', 'padding-top': '4px', 'font-size': '16px', height: 'auto' });
    assert.deepEqual(pinned, { width: '120px', 'font-size': '16px' });
  });

  it('reads percents, factors and target widths', () => {
    assert.equal(parseScaleInput('150%', 100), 1.5);
    assert.equal(parseScaleInput('%50', 100), 0.5);
    assert.equal(parseScaleInput('2x', 100), 2);
    assert.equal(parseScaleInput('200px', 100), 2);
    assert.equal(parseScaleInput('75', 100), 0.75);
    assert.equal(parseScaleInput('abc', 100), null);
    assert.equal(parseScaleInput('0', 100), null);
  });
});

describe('sanitizeHtml', () => {
  it('drops scripts, handlers and unsafe URLs', () => {
    const out = sanitizeHtml('<div onclick="x()"><script>alert(1)</script><a href="javascript:x()">A</a><img src="https://e.com/a.png" onerror="x()"></div>');
    assert.doesNotMatch(out, /script|onclick|onerror|javascript/i);
    assert.match(out, /<a>A<\/a>/);
    assert.match(out, /<img src="https:\/\/e\.com\/a\.png">/);
  });

  it('unwraps documents and breaks template holes', () => {
    const out = sanitizeHtml('<html><body><p>Hi {{name}}</p></body></html>');
    assert.match(out, /^<p>Hi \{​\{name\}​\}<\/p>$|^<p>Hi \{​\{name}}<\/p>$/);
    assert.doesNotMatch(out, /\{\{/);
  });

  it('tells markup from text', () => {
    assert.equal(looksLikeHtml('<p>Hi</p>'), true);
    assert.equal(looksLikeHtml('a < b and c > d'), false);
  });
});

describe('detach', () => {
  const component = board(
    '<helmet><style>.badge { color: red }</style></helmet><span class="badge">{{label}} {{count}}</span>',
    '{"label":{"editor":"text","default":"Badge"}}',
  );

  it('reads instance props', () => {
    const props = instanceProps(first('<dc-import name="Badge" label="Hi" item-count="{{3}}"></dc-import>'));
    assert.deepEqual(props, { ok: true, props: { label: 'Hi', itemCount: 3 } });
    assert.equal(instanceProps(first('<dc-import name="Badge" label="{{user.name}}"></dc-import>')).ok, false);
  });

  it('refuses instances inside loops', () => {
    const loop = first('<sc-for each="{{items}}" as="item"><dc-import name="Badge"></dc-import></sc-for>');
    assert.ok(detachRefusal(elementChildren(loop)[0]!));
    assert.equal(detachRefusal(first('<dc-import name="Badge"></dc-import>')), null);
  });

  it('writes the component with its values in a wrapper', () => {
    const instance = first('<dc-import name="Badge" style="position: absolute; left: 4px; color: blue"></dc-import>');
    const result = detachMarkup(component, instance, { label: 'A & B', count: 2 });
    assert.ok(result.ok);
    assert.match(result.html, /^<div style="position: absolute; left: 4px" data-label="Badge">/);
    assert.match(result.html, /<span class="badge">A &amp; B 2<\/span>/);
    assert.equal(result.helmet, '<style>.badge { color: red }</style>');
  });

  it('refuses values it cannot write', () => {
    const instance = first('<dc-import name="Badge"></dc-import>');
    assert.equal(detachMarkup(component, instance, { label: ['a'] }).ok, false);
  });
});

describe('insert op', () => {
  it('adds carried styles to the helmet with the pasted markup', () => {
    const source = board('<helmet><style>a {}</style></helmet><div></div>');
    const result = applyOp(source, { kind: 'insert', target: { tid: 2, path: [1] }, position: 'last-child', html: '<p class="x">Hi</p>', helmet: '<style>.x {}</style>' });
    assert.ok(result);
    const template = templateOf(result.source);
    assert.match(template, /<div><p class="x">Hi<\/p><\/div>/);
    assert.match(template, /<style>a \{\}<\/style>\s*<style>\.x \{\}<\/style>\s*<\/helmet>/);
  });
});

describe('replace op', () => {
  it('replaces several elements and adds to the helmet in one edit', () => {
    const source = board('<helmet><style>a {}</style></helmet><div><dc-import name="B"></dc-import><dc-import name="B"></dc-import></div>');
    const result = applyOp(source, {
      kind: 'replace',
      edits: [
        { target: { tid: 3, path: [1, 0] }, html: '<p>One</p>' },
        { target: { tid: 4, path: [1, 1] }, html: '<p>Two</p>' },
      ],
      helmet: '<style>b {}</style>',
    });
    assert.ok(result);
    const template = templateOf(result.source);
    assert.match(template, /<div><p>One<\/p><p>Two<\/p><\/div>/);
    assert.match(template, /<style>a \{\}<\/style>\s*<style>b \{\}<\/style>\s*<\/helmet>/);
  });

  it('creates a helmet when there is none', () => {
    const source = board('<div><dc-import name="B"></dc-import></div>');
    const result = applyOp(source, { kind: 'replace', edits: [{ target: { tid: 1, path: [0, 0] }, html: '<p>One</p>' }], helmet: '<style>b {}</style>' });
    assert.ok(result);
    assert.match(templateOf(result.source), /^<helmet>\s*<style>b \{\}<\/style>\s*<\/helmet>/);
    assert.match(templateOf(result.source), /<div><p>One<\/p><\/div>/);
  });
});

describe('fontRenders', () => {
  // A fake measurer: installed families have their own width; others fall back.
  const installed: Record<string, number> = { Inter: 610 };
  const fallback: Record<string, number> = { monospace: 780, serif: 560 };
  const measure = (font: string) => {
    const [, family, generic] = /^100px (?:"([^"]+)", )?(.+)$/.exec(font)!;
    return (family && installed[family]) || fallback[generic!]!;
  };

  it('tells an installed family from a missing one', () => {
    assert.equal(fontRenders('Inter', measure), true);
    assert.equal(fontRenders('Not A Font', measure), false);
  });

  it('always renders generic families and refuses odd names', () => {
    assert.equal(fontRenders('system-ui', measure), true);
    assert.equal(fontRenders('x"; color: red', measure), false);
  });
});
