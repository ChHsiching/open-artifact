import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { docInputRules } from '../src/editor/input-rules.ts';
import { schema } from '../src/editor/schema.ts';

/** Types `text` one key at a time into an empty paragraph, as the editor would, and answers the doc. */
function typed(text: string): Node {
  const plugin = docInputRules();
  let state = EditorState.create({ schema, plugins: [plugin] });
  state = state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)));
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch(tr: EditorState['tr']) {
      state = state.apply(tr);
    },
  } as unknown as EditorView;
  for (const key of text) {
    const { from, to } = state.selection;
    const handled = plugin.props.handleTextInput?.call(plugin, view, from, to, key, () => state.tr);
    if (!handled) view.dispatch(state.tr.insertText(key, from, to));
  }
  return state.doc;
}

const first = (doc: Node) => doc.firstChild!;
const marksOf = (doc: Node) => {
  const out: string[] = [];
  doc.descendants(node => {
    if (node.isText) out.push(`${node.text}:${node.marks.map(mark => mark.type.name).join('+')}`);
  });
  return out;
};

describe('input rules', () => {
  it('# to ###### start headings', () => {
    for (let level = 1; level <= 6; level++) {
      const node = first(typed(`${'#'.repeat(level)} Title`));
      assert.equal(node.type.name, 'paragraph');
      assert.equal(node.attrs.heading, level);
      assert.equal(node.textContent, 'Title');
    }
  });

  it('- + * 1. [] [x] > start lists, checks and quotes', () => {
    for (const sign of ['-', '+', '*']) assert.equal(first(typed(`${sign} a`)).attrs.kind, 'bullet');
    assert.equal(first(typed('1. a')).attrs.kind, 'ordered');
    assert.equal(first(typed('3. a')).attrs.start, 3);
    for (const [sign, checked] of [['[] a', false], ['[ ] a', false], ['[x] a', true]] as const) {
      const list = first(typed(sign));
      assert.equal(list.attrs.kind, 'check');
      assert.equal(list.firstChild!.attrs.checked, checked);
      assert.equal(list.textContent, 'a');
    }
    assert.equal(first(typed('> a')).type.name, 'blockquote');
  });

  it('--- ___ *** draw a divider, ```lang starts a code block', () => {
    for (const rule of ['---', '___', '***']) {
      assert.equal(first(typed(rule)).type.name, 'horizontalRule');
    }
    const code = first(typed('```ts '));
    assert.equal(code.type.name, 'codeBlock');
    assert.equal(code.attrs.language, 'ts');
  });

  it('**b** *i* _i_ ~~s~~ `c` mark their words', () => {
    assert.deepEqual(marksOf(typed('x **b**')), ['x :', 'b:bold']);
    assert.deepEqual(marksOf(typed('x *i*')), ['x :', 'i:italic']);
    assert.deepEqual(marksOf(typed('x _i_')), ['x :', 'i:italic']);
    assert.deepEqual(marksOf(typed('x ~~s~~')), ['x :', 's:strike']);
    assert.deepEqual(marksOf(typed('x `c`')), ['x :', 'c:code']);
  });

  it('arrows and :emoji: names become their signs', () => {
    assert.equal(typed('a --> b').textContent, 'a → b');
    assert.equal(typed('a <-- b').textContent, 'a ← b');
    assert.equal(typed('a <-> b').textContent, 'a ↔ b');
    assert.equal(typed('hi :smile:').textContent, 'hi 😄');
  });
});
