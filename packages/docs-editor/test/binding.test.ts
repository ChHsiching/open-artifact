import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { history, undo } from 'prosemirror-history';
import { splitBlock } from 'prosemirror-commands';
import { EditorState, type Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import { tableEditing } from 'prosemirror-tables';
import { type BoundView, TabBinding } from '../src/editor/binding.ts';
import { checkBoxes } from '../src/editor/plugins.ts';
import { schema } from '../src/editor/schema.ts';
import { type PageNode, canonical, docToPage } from '../src/sync/page.ts';
import type { DocTransport } from '../src/sync/tab-sync.ts';
import { type DocServer, type Page, startDocServer, texts } from './harness.ts';

interface Editor {
  page: Page;
  view: BoundView & { composing: boolean; dispatches: number };
  binding: TabBinding;
  calls: () => number;
  /** Position just inside the start of top-level block `index`, plus `offset`. */
  at(index: number, offset?: number): number;
  run(edit: (state: EditorState) => Transaction): void;
  stop(): Promise<void>;
}

describe('an editor view kept in step with its tab', () => {
  let doc: DocServer;

  async function openEditor(label: string, options: { writable?: boolean; plugins?: Plugin[] } = {}): Promise<Editor> {
    let calls = 0;
    const editor = {} as Editor;
    const counting = (base: DocTransport): DocTransport => ({
      ...base,
      call: request => {
        calls++;
        return base.call(request);
      },
    });
    const page = await doc.open(label, { transport: counting, onShadow: shadow => editor.binding.showShadow(shadow) });
    const binding = new TabBinding(page.sync, { writable: options.writable ?? true });
    const view = {
      composing: false,
      dispatches: 0,
      state: EditorState.create({ doc: binding.doc, plugins: [history(), tableEditing(), ...(options.plugins ?? [])] }),
      dispatch(tr: Transaction) {
        view.dispatches++;
        assert.ok(view.dispatches < 50, 'the binding and the plugins settle');
        view.state = view.state.apply(tr);
        binding.afterTransaction(tr);
      },
    };
    binding.attach(view as unknown as BoundView);
    Object.assign(editor, {
      page,
      view,
      binding,
      calls: () => calls,
      at: (index: number, offset = 0) => {
        let pos = 0;
        for (let i = 0; i < index; i++) pos += view.state.doc.child(i).nodeSize;
        return pos + 1 + offset;
      },
      run: (edit: (state: EditorState) => Transaction) => view.dispatch(edit(view.state)),
      stop: () => page.stop(),
    });
    return editor;
  }

  const shown = (editor: Editor) => canonical(editor.view.state.doc.toJSON() as PageNode);
  const settle = (...editors: Editor[]) => doc.settle(...editors.map(editor => editor.page));

  before(async () => {
    doc = await startDocServer('# Title\n\nAlpha beta gamma.\n\nSecond paragraph.');
  });

  after(() => doc.stop());

  it('sends typing and Enter, and the other page shows them without writing anything back', async () => {
    const a = await openEditor('a');
    const b = await openEditor('b');
    a.run(state => state.tr.insertText(' delta', a.at(1, 'Alpha beta gamma'.length)));
    a.run(state => state.tr.setSelection(TextSelection.create(state.doc, a.at(1, 'Alpha'.length))));
    splitBlock(a.view.state, a.view.dispatch);
    a.run(state => state.tr.insertText('New '));
    await settle(a, b);
    const held = await doc.serverTexts();
    assert.deepEqual(held, ['Title', 'Alpha', 'New  beta gamma delta.', 'Second paragraph.']);
    assert.deepEqual(shown(a), shown(b));
    assert.deepEqual(texts(a.binding.shadow), held);
    assert.equal(b.calls(), 0, 'a page shown a remote write writes nothing back');
    // Every block of the view carries its id.
    a.view.state.doc.forEach(node => assert.ok(node.attrs.bid, `${node.type} has an id`));
    await Promise.all([a.stop(), b.stop()]);
  });

  it('keeps the cursor after the same character when the other page types before it', async () => {
    const a = await openEditor('a');
    const b = await openEditor('b');
    const cursor = b.at(3, 'Second'.length);
    b.run(state => state.tr.setSelection(TextSelection.create(state.doc, cursor)));
    a.run(state => state.tr.insertText('The ', a.at(3, 0)));
    await settle(a, b);
    assert.equal(b.view.state.selection.head, cursor + 'The '.length);
    b.run(state => state.tr.insertText('!'));
    await settle(a, b);
    assert.equal((await doc.serverTexts())[3], 'The Second! paragraph.');
    assert.deepEqual(shown(a), shown(b));
    await Promise.all([a.stop(), b.stop()]);
  });

  it('holds what an input method composes until it is done, then sends it and shows what came meanwhile', async () => {
    const a = await openEditor('a');
    const b = await openEditor('b');
    b.view.composing = true;
    b.binding.compositionStarted();
    b.run(state => state.tr.insertText('你好', b.at(0, 'Title'.length)));
    a.run(state => state.tr.insertText('Remote ', a.at(3, 0)));
    await settle(a, b);
    assert.equal(b.calls(), 0);
    assert.equal(b.view.state.doc.child(3).textContent, 'The Second! paragraph.', 'not patched while composing');
    b.view.composing = false;
    b.binding.compositionEnded();
    await settle(a, b);
    const held = await doc.serverTexts();
    assert.equal(held[0], 'Title你好');
    assert.equal(held[3], 'Remote The Second! paragraph.');
    assert.deepEqual(shown(a), shown(b));
    await Promise.all([a.stop(), b.stop()]);
  });

  it('undoes the person’s own typing on the server, leaving the other page’s', async () => {
    const a = await openEditor('a');
    const b = await openEditor('b');
    a.run(state => state.tr.insertText(' mine', a.at(2, 'New  beta gamma delta.'.length)));
    await settle(a, b);
    b.run(state => state.tr.insertText('Theirs: ', b.at(2, 0)));
    await settle(a, b);
    undo(a.view.state, a.view.dispatch);
    await settle(a, b);
    assert.equal((await doc.serverTexts())[2], 'Theirs: New  beta gamma delta.');
    assert.deepEqual(shown(a), shown(b));
    await Promise.all([a.stop(), b.stop()]);
  });

  it('writes a table typed into, and the other page shows it', async () => {
    const a = await openEditor('a');
    const b = await openEditor('b');
    const cell = (text: string) => schema.nodes.cell!.create(null, schema.nodes.paragraph!.create(null, text ? schema.text(text) : null));
    const table = schema.nodes.table!.create(null, [schema.nodes.tableRow!.create(null, [cell('A'), cell('B')]), schema.nodes.tableRow!.create(null, [cell('1'), cell('')])]);
    a.run(state => state.tr.insert(state.doc.content.size, table));
    await settle(a, b);
    let pos = -1;
    a.view.state.doc.descendants((node, at) => {
      if (node.type.name === 'cell' && node.textContent === '' && pos < 0) pos = at + 2;
    });
    a.run(state => state.tr.insertText('2', pos));
    await settle(a, b);
    assert.deepEqual(shown(a), shown(b));
    const last = b.view.state.doc.lastChild!;
    assert.equal(last.type.name, 'table');
    assert.equal(last.textContent, 'AB12');
    await Promise.all([a.stop(), b.stop()]);
  });

  it('lets a reader keep a plugin’s fix-up to itself, without writing or looping', async () => {
    const writer = await openEditor('writer');
    const reader = await openEditor('reader', { writable: false, plugins: [checkBoxes()] });
    const page = docToPage(writer.page.sync.shadow);
    const odd: PageNode = {
      type: 'list',
      attrs: { kind: 'bullet' },
      content: [{ type: 'listItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'odd item' }] }] }],
    };
    writer.page.sync.editPage({ ...page, content: [...page.content!, odd] });
    await settle(writer, reader);
    const last = reader.view.state.doc.lastChild!;
    assert.equal(last.type.name, 'list');
    assert.equal(last.firstChild!.attrs.checked, null, 'the reader shows the item as its list kind has it');
    assert.equal(reader.calls(), 0);
    writer.run(state => state.tr.insertText('!', writer.at(0, 'Title'.length)));
    await settle(writer, reader);
    assert.equal(reader.view.state.doc.firstChild!.textContent, writer.view.state.doc.firstChild!.textContent);
    assert.match(reader.view.state.doc.firstChild!.textContent, /^Title!/);
    await Promise.all([writer.stop(), reader.stop()]);
  });
});
