import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDcDocument, parseTemplate } from '@open-artifact/dc';
import { applyOp, replayOps, type BoardOp } from '../src/lib/ops.ts';
import { useDocument } from '../src/state/document.ts';
import { freeBoardName, frameDocument, newBoardSource } from '../src/lib/frame.ts';

const board = (template: string, props = '{"title":{"editor":"text","default":"Hi"}}') => `<!doctype html>
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

describe('applyOp', () => {
  it('patches inline styles by address', () => {
    const source = board('<div><p style="color: red">One</p><p>Two</p></div>');
    const result = applyOp(source, { kind: 'style', targets: [{ tid: 2, path: [0, 1] }], patch: { color: 'blue' } });
    assert.ok(result);
    assert.match(templateOf(result.source), /<p style="color: blue">Two<\/p>/);
    assert.match(templateOf(result.source), /<p style="color: red">One<\/p>/);
  });

  it('refuses an address whose tid and path disagree', () => {
    const source = board('<div><p>One</p><p>Two</p></div>');
    assert.equal(applyOp(source, { kind: 'text', target: { tid: 1, path: [0, 1] }, text: 'x' }), null);
  });

  it('retypes text and reports duplicated elements as created', () => {
    const source = board('<div><p>One</p></div>');
    const text = applyOp(source, { kind: 'text', target: { tid: 1, path: [0, 0] }, text: 'Hello <world>' })!;
    assert.match(templateOf(text.source), /<p>Hello &lt;world&gt;<\/p>/);
    const copy = applyOp(text.source, { kind: 'duplicate', targets: [{ tid: 1, path: [0, 0] }] })!;
    assert.equal((templateOf(copy.source).match(/<p>/g) ?? []).length, 2);
    assert.deepEqual(copy.created, [{ tid: 2, path: [0, 1] }]);
  });

  it('links the whole text of an element, keeping the element', () => {
    const source = board('<div><p class="x">Read <b>more</b></p><a href="/a">A</a><p></p></div>');
    const linked = applyOp(source, { kind: 'linkText', target: { tid: 1, path: [0, 0] }, href: 'https://example.com/?a="b"' })!;
    assert.match(templateOf(linked.source), /<p class="x"><a href='https:\/\/example.com\/\?a="b"'>Read <b>more<\/b><\/a><\/p>/);
    // A link already, or nothing inside: refused.
    assert.equal(applyOp(source, { kind: 'linkText', target: { tid: 3, path: [0, 1] }, href: '/b' }), null);
    assert.equal(applyOp(source, { kind: 'linkText', target: { tid: 4, path: [0, 2] }, href: '/b' }), null);
  });

  it('writes edited rich text back, sanitized', () => {
    const source = board('<div><p class="x">One</p><h2>Two</h2></div>');
    const rich = applyOp(source, { kind: 'richText', target: { tid: 1, path: [0, 0] }, html: 'Read <b data-dc-tpl="9">more</b> <a href="javascript:x()" onclick="y()">here</a><br>' })!;
    assert.match(templateOf(rich.source), /<p class="x">Read <b>more<\/b> <a>here<\/a><\/p>/);
    // A list turns the paragraph into a div (a <p> cannot hold one); other tags keep their name.
    const list = applyOp(source, { kind: 'richText', target: { tid: 1, path: [0, 0] }, html: '<ul><li>a</li><li>b</li></ul>' })!;
    assert.match(templateOf(list.source), /<div class="x"><ul><li>a<\/li><li>b<\/li><\/ul><\/div>/);
    const heading = applyOp(source, { kind: 'richText', target: { tid: 2, path: [0, 1] }, html: '<i>Two</i>' })!;
    assert.match(templateOf(heading.source), /<h2><i>Two<\/i><\/h2>/);
    // Not text: refused.
    assert.equal(applyOp(source, { kind: 'richText', target: { tid: 0, path: [0] }, html: 'x' }), null);
  });

  it('selects a link just set in rich text', () => {
    const source = board('<div><p>One two</p></div>');
    const rich = applyOp(source, { kind: 'richText', target: { tid: 1, path: [0, 0] }, html: '<a href="/a">One</a> <b>two</b> <a href="/b">x</a>', link: 1 })!;
    assert.deepEqual(rich.created, [{ tid: 4, path: [0, 0, 2] }]);
    assert.deepEqual(applyOp(source, { kind: 'richText', target: { tid: 1, path: [0, 0] }, html: '<b>One</b>' })!.created, []);
  });

  it('wraps loose words in spans', () => {
    const source = board('<div><div class="row">Hello <b>you</b> <img src="a.png"> and   more <p>Block</p></div></div>');
    const inline = applyOp(source, { kind: 'wrapText', target: { tid: 1, path: [0, 0] }, inline: true })!;
    assert.match(templateOf(inline.source), /<div class="row"><span>Hello <b>you<\/b><\/span> <img src="a.png"> <span>and   more<\/span> <p>Block<\/p><\/div>/);
    assert.equal(inline.created.length, 2);
    // Laid out as items: inline formatting is an item of its own.
    const items = applyOp(source, { kind: 'wrapText', target: { tid: 1, path: [0, 0] }, inline: false })!;
    assert.match(templateOf(items.source), /<span>Hello<\/span> <b>you<\/b> <img src="a.png"> <span>and   more<\/span>/);
    // Nothing loose: refused.
    assert.equal(applyOp(board('<div><p>One</p></div>'), { kind: 'wrapText', target: { tid: 0, path: [0] }, inline: true }), null);
  });

  it('retypes the words of a component instance where they are written', () => {
    const source = board('<div><x-import component="Card" from="./card.dc.html" title="Old title" count="{{ 3 }}">Body words</x-import></div>');
    const target = { tid: 1, path: [0, 0] };
    const title = applyOp(source, { kind: 'importText', target, key: '@title', words: 'Old title', text: 'New  title ' })!;
    assert.match(templateOf(title.source), /title="New title"/);
    const body = applyOp(source, { kind: 'importText', target, key: '__text', words: 'Body words', text: 'A < B' })!;
    assert.match(templateOf(body.source), />A &lt; B<\/x-import>/);
    const count = applyOp(source, { kind: 'importText', target, key: '@count', words: '3', text: '7' })!;
    assert.match(templateOf(count.source), /count="\{\{ 7 \}\}"/);
    // Not a number, words changed underneath, or unchanged: refused.
    assert.equal(applyOp(source, { kind: 'importText', target, key: '@count', words: '3', text: 'seven' }), null);
    assert.equal(applyOp(source, { kind: 'importText', target, key: '@title', words: 'Other', text: 'x' }), null);
    assert.equal(applyOp(source, { kind: 'importText', target, key: '@title', words: 'Old title', text: 'Old title' }), null);
  });

  it('retypes a string literal of the script', () => {
    const source = board('<p>{{label}}</p>').replace('class Component extends DCLogic {}', "class Component extends DCLogic {\n  label = 'Old';\n  other = \"Old too\";\n}");
    const doc = parseDcDocument(source);
    const body = doc.script!.body.text;
    const start = body.indexOf("'Old'");
    const op: BoardOp = { kind: 'scriptText', start, end: start + 5, quote: "'", value: 'Old', text: "It's new" };
    const result = applyOp(source, op)!;
    assert.match(parseDcDocument(result.source).script!.body.text, /label = 'It\\'s new';/);
    // Moved by other edits: found by its value when it is the only one.
    const shifted = source.replace('label =', 'label  =');
    assert.match(parseDcDocument(applyOp(shifted, op)!.source).script!.body.text, /label {2}= 'It\\'s new';/);
    // Changed underneath: refused.
    assert.equal(applyOp(source.replace("'Old'", "'Other'"), op), null);
  });

  it('writes tweak values back as data-props defaults', () => {
    const source = board('<h1>{{title}}</h1>');
    const result = applyOp(source, { kind: 'props', values: { title: 'Welcome' } })!;
    assert.equal((parseDcDocument(result.source).props!.title as { default: unknown }).default, 'Welcome');
  });
});

describe('replayOps', () => {
  it('replays pending edits on top of a remote version and drops the ones that no longer apply', () => {
    const ours: BoardOp[] = [
      { kind: 'style', targets: [{ tid: 1, path: [0, 0] }], patch: { color: 'green' } },
      { kind: 'text', target: { tid: 3, path: [0, 2] }, text: 'Gone' },
    ];
    // Theirs: the third paragraph was removed, a heading text changed.
    const theirs = board('<div><p>Changed by agent</p><p>Two</p></div>');
    const result = replayOps(theirs, ours);
    assert.equal(result.dropped, 1);
    assert.equal(result.kept.length, 1);
    assert.match(templateOf(result.source), /<p style="color: green">Changed by agent<\/p>/);
  });
});

describe('textEditOptions', () => {
  it('seeds holes with the template markup, the text props and the script literals', async () => {
    const { textEditOptions } = await import('../src/lib/text-edit.ts');
    const source = board('<h1>{{title}}</h1><p>Plain</p>').replace('class Component extends DCLogic {}', "class Component extends DCLogic { label = 'L'; }");
    const doc = parseDcDocument(source);
    const model = parseTemplate(doc.template!.text);
    const [h1, p] = model.elements;
    assert.deepEqual(textEditOptions(source, model.text, p!, undefined, 'end'), { caret: 'end' });
    const options = textEditOptions(source, model.text, h1!, { title: 'Live' });
    assert.equal(options.seed, '{{title}}');
    assert.deepEqual(options.props, { title: 'Live' });
    assert.deepEqual(options.literals?.map((literal) => literal.value), ['L']);
  });
});

describe('frame helpers', () => {
  it('creates a valid blank artboard', () => {
    const source = newBoardSource({ title: 'Home', width: 1280, height: 800 });
    const doc = parseDcDocument(source);
    assert.ok(doc.hasSupportScript);
    assert.equal(doc.title, 'Home');
    assert.deepEqual(doc.props?.$preview, { width: 1280, height: 800 });
    assert.ok(parseTemplate(doc.template!.text).elements.length > 0);
  });

  it('points the frame at the runtime and the artboard folder', () => {
    const html = frameDocument('screens/Home.dc.html', newBoardSource({ title: 'Home', width: 10, height: 10 }), {
      runtime: 'http://127.0.0.1:1/design/t/support.js',
      project: 'http://127.0.0.1:1/design/t/project/',
    });
    assert.match(html, /<base href="http:\/\/127\.0\.0\.1:1\/design\/t\/project\/screens\/">/);
    assert.match(html, /<script src="http:\/\/127\.0\.0\.1:1\/design\/t\/support\.js"><\/script>/);
  });

  it('clips overflow in canvas frames only', () => {
    const urls = { runtime: 'http://127.0.0.1:1/design/t/support.js', project: 'http://127.0.0.1:1/design/t/project/' };
    const source = newBoardSource({ title: 'Home', width: 10, height: 10 });
    assert.match(frameDocument('Home.dc.html', source, urls, { canvas: true }), /html\[data-dc-canvas\]\{overflow:hidden\}/);
    assert.doesNotMatch(frameDocument('Home.dc.html', source, urls), /data-dc-canvas/);
  });

  it('finds a free artboard name', () => {
    assert.equal(freeBoardName('Artboard', new Set()), 'Artboard.dc.html');
    assert.equal(freeBoardName('Artboard', new Set(['Artboard.dc.html', 'Artboard-2.dc.html'])), 'Artboard-3.dc.html');
  });
});

describe('buildOutline', () => {
  it('names svg shapes', async () => {
    const { buildOutline } = await import('../src/lib/outline.ts');
    const [svg] = buildOutline(parseTemplate('<svg><rect></rect><circle></circle><line></line><path></path><g><polygon></polygon></g></svg>'));
    assert.equal(svg!.name, 'Graphic');
    assert.deepEqual(
      svg!.children.map((node) => [node.name, node.glyph]),
      [['Rectangle', 'shape'], ['Ellipse', 'shape'], ['Line', 'shape'], ['Vector', 'shape'], ['Group', 'frame']],
    );
    assert.equal(svg!.children[4]!.children[0]!.name, 'Polygon');
  });
});

it('applies a theme to multiple artboards as one undo step and replays it over a remote edit', () => {
  const source = board('<helmet><style>p{color:#111}</style></helmet><p style="color: #111; background: {{bg}}">Words</p>');
  const doc = useDocument.getState;
  doc().load({ title: 'Theme', readOnly: false, canvas: { text: '{}', hash: '1' }, boards: { a: {text: source, hash: 'a'}, b: {text: source, hash: 'b'} } });
  const look = { id: 'night', name: 'Night', colors: [{ name: 'ink', value: '#fff', variants: ['#111'] }] };
  assert.equal(doc().editBoards(['a', 'b'], { kind: 'look', look }), 2);
  assert.equal(doc().undo.length, 1);
  assert.match(doc().boards.a!.source!, /p\{color:#fff\}/);
  assert.match(doc().boards.b!.source!, /color: #fff; background: \{\{bg\}\}/);
  doc().undoLast();
  assert.equal(doc().boards.a!.source, source);
  assert.equal(doc().boards.b!.source, source);
  doc().redoLast();
  doc().remoteBoard('a', source.replace('Words', 'New words'), 'new');
  assert.match(doc().boards.a!.source!, /color: #fff; background: \{\{bg\}\}">New words/);
});
