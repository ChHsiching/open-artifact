/** The edits the toolbar, menus and keys make. */
import { chainCommands, exitCode, lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { type Attrs, Fragment, type MarkType, type Node as PMNode, type NodeType, type ResolvedPos } from 'prosemirror-model';
import { liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import { type Command, type EditorState, NodeSelection, Selection, TextSelection, type Transaction } from 'prosemirror-state';
import { CellSelection, selectedRect } from 'prosemirror-tables';
import { schema, type TextColor } from './schema.ts';

const { nodes, marks } = schema;

export type ListKind = 'bullet' | 'ordered' | 'check';

/** What the text block at the cursor is. */
export type BlockStyle = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'code';

export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

export function markAttr(state: EditorState, type: MarkType, attr: string): unknown {
  const { from, to, empty, $from } = state.selection;
  if (empty) return type.isInSet(state.storedMarks ?? $from.marks())?.attrs[attr] ?? null;
  let found: unknown = null;
  state.doc.nodesBetween(from, to, node => {
    if (found !== null) return false;
    const mark = type.isInSet(node.marks);
    if (mark) found = mark.attrs[attr];
    return true;
  });
  return found;
}

export const toggleBold = toggleMark(marks.bold!);
export const toggleItalic = toggleMark(marks.italic!);
export const toggleUnderline = toggleMark(marks.underline!);
export const toggleStrike = toggleMark(marks.strike!);
export const toggleCode = toggleMark(marks.code!);

/** Sets (or, with null, clears) a mark that carries a value over the selection, or for what is typed next. */
function setValueMark(type: MarkType, attrs: Attrs | null): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (!dispatch) return true;
    const tr = state.tr;
    if (empty) {
      const stored = type.removeFromSet(state.storedMarks ?? state.selection.$from.marks());
      tr.setStoredMarks(attrs ? type.create(attrs).addToSet(stored) : stored);
    } else {
      tr.removeMark(from, to, type);
      if (attrs) tr.addMark(from, to, type.create(attrs));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export const setTextColor = (color: TextColor | null) => setValueMark(marks.textColor!, color ? { color } : null);
export const setHighlight = (on: boolean) => setValueMark(marks.highlight!, on ? { color: null } : null);

export function blockStyle(state: EditorState): BlockStyle | null {
  const parent = state.selection.$from.parent;
  if (parent.type === nodes.codeBlock) return 'code';
  if (parent.type !== nodes.paragraph) return null;
  const level = parent.attrs.heading as number | null;
  return level ? (`h${Math.min(level, 6)}` as BlockStyle) : 'paragraph';
}

export function setBlockStyle(style: BlockStyle): Command {
  if (style === 'code') return setBlockType(nodes.codeBlock!);
  const heading = style === 'paragraph' ? null : Number(style.slice(1));
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    let applicable = false;
    state.doc.nodesBetween($from.pos, $to.pos, node => {
      if (applicable) return false;
      if (node.isTextblock && (node.type !== nodes.paragraph || node.attrs.heading !== heading)) applicable = true;
      return !node.isTextblock;
    });
    if (!applicable) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (!node.isTextblock) return true;
      if (node.type === nodes.paragraph) tr.setNodeMarkup(pos, undefined, { ...node.attrs, heading });
      else tr.setBlockType(pos, pos + node.nodeSize, nodes.paragraph!, { heading });
      return false;
    });
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** The list right around the cursor's paragraph, if the cursor's paragraph is an item's first. */
export function listAround($pos: ResolvedPos): { node: PMNode; pos: number; depth: number } | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type === nodes.list) return { node, pos: $pos.before(depth), depth };
    if (node.type === nodes.table || node.type === nodes.blockquote) return null;
  }
  return null;
}

export function listKind(state: EditorState): ListKind | null {
  return (listAround(state.selection.$from)?.node.attrs.kind as ListKind | undefined) ?? null;
}

/** Sets a list's kind, and its items' check boxes to match. */
function setListKind(tr: Transaction, pos: number, kind: ListKind): void {
  const list = tr.doc.nodeAt(pos);
  if (!list) return;
  tr.setNodeMarkup(pos, undefined, { ...list.attrs, kind, start: kind === 'ordered' ? list.attrs.start : null });
  list.forEach((item, offset) => {
    const checked = kind === 'check' ? (item.attrs.checked ?? false) : null;
    if (item.attrs.checked !== checked) tr.setNodeMarkup(pos + 1 + offset, undefined, { ...item.attrs, checked });
  });
}

/** A list of this kind: made, changed to it, or (when the cursor is in one already) taken away. */
export function toggleList(kind: ListKind): Command {
  return (state, dispatch) => {
    const around = listAround(state.selection.$from);
    if (around) {
      if (around.node.attrs.kind === kind) return liftListItem(nodes.listItem!)(state, dispatch);
      if (dispatch) {
        const tr = state.tr;
        setListKind(tr, around.pos, kind);
        dispatch(tr);
      }
      return true;
    }
    return wrapInList(nodes.list!, { kind })(state, tr => {
      if (!dispatch) return;
      if (kind === 'check') {
        tr.doc.nodesBetween(tr.mapping.map(state.selection.from), tr.mapping.map(state.selection.to), (node, pos) => {
          if (node.type === nodes.listItem && node.attrs.checked === null) tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false });
          return true;
        });
      }
      dispatch(tr);
    });
  };
}

/** Ticks or unticks the check box of the cursor's item. */
export const toggleChecked: Command = (state, dispatch) => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type !== nodes.listItem) continue;
    if (node.attrs.checked === null) return false;
    if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, checked: !node.attrs.checked }));
    return true;
  }
  return false;
};

/** A list nested by indenting keeps its parent list's kind. */
export const indent: Command = (state, dispatch) =>
  sinkListItem(nodes.listItem!)(state, tr => {
    if (!dispatch) return;
    tr.doc.descendants((node, pos) => {
      if (node.type !== nodes.list || node.attrs.bid) return true;
      const $pos = tr.doc.resolve(pos);
      const outer = listAround($pos);
      if (outer && outer.node.attrs.kind !== node.attrs.kind) setListKind(tr, pos, outer.node.attrs.kind as ListKind);
      return true;
    });
    dispatch(tr);
  });

export const outdent: Command = liftListItem(nodes.listItem!);

function isTitle(node: PMNode | null | undefined): boolean {
  return !!node && node.type === nodes.paragraph && node.attrs.heading === 1;
}

/** With a placeholder selected, a new empty line below it. */
export const lineBelowPlaceholder: Command = (state, dispatch) => {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || selection.node.type !== nodes.pending) return false;
  const paragraph = nodes.paragraph!.createAndFill();
  if (!paragraph || !selection.$to.parent.canReplaceWith(selection.$to.index(), selection.$to.index(), nodes.paragraph!)) return false;
  if (dispatch) {
    const tr = state.tr.insert(selection.to, paragraph);
    dispatch(tr.setSelection(TextSelection.create(tr.doc, selection.to + 1)).scrollIntoView());
  }
  return true;
};

/** From the title the document opens with, to the start of the block after it (a new line when there is none). */
export const titleToBody: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const title = state.doc.firstChild;
  if (!empty || $from.depth !== 1 || $from.index(0) !== 0 || !isTitle(title)) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  if (state.doc.childCount === 1) tr.insert(title!.nodeSize, nodes.paragraph!.create());
  const after = Selection.findFrom(tr.doc.resolve(title!.nodeSize), 1);
  if (!after) return false;
  dispatch(tr.setSelection(after).scrollIntoView());
  return true;
};

/** From the start of the block after the title, back to the title's end. */
export const bodyToTitle: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const title = state.doc.firstChild;
  if (!empty || !isTitle(title) || $from.parentOffset !== 0) return false;
  if ($from.depth !== 1 || $from.index(0) !== 1 || $from.parent.type !== nodes.paragraph) return false;
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, title!.nodeSize - 1)).scrollIntoView());
  return true;
};

export const toggleQuote: Command = (state, dispatch) => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type === nodes.blockquote) return lift(state, dispatch);
  return wrapIn(nodes.blockquote!)(state, dispatch);
};

export const toggleCodeBlock: Command = (state, dispatch) =>
  state.selection.$from.parent.type === nodes.codeBlock ? setBlockType(nodes.paragraph!)(state, dispatch) : setBlockType(nodes.codeBlock!)(state, dispatch);

/** Leaves a code block for a new paragraph after it. */
export const exitCodeBlock: Command = exitCode;

/** Splits a code block in two at the cursor. */
export const splitCodeBlock: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type !== nodes.codeBlock) return false;
  if (dispatch) dispatch(state.tr.split($from.pos, 1, [{ type: nodes.codeBlock!, attrs: { language: $from.parent.attrs.language } }]).scrollIntoView());
  return true;
};

export const hardBreak: Command = chainCommands(exitCode, (state, dispatch) => {
  if (dispatch) dispatch(state.tr.replaceSelectionWith(nodes.hardBreak!.create()).scrollIntoView());
  return true;
});

/** Puts block nodes in after the cursor's top-level block, and the cursor in the first text block after them. */
export function insertBlocks(content: PMNode | PMNode[], options: { replaceEmpty?: boolean } = {}): Command {
  return (state, dispatch) => {
    const list = Array.isArray(content) ? content : [content];
    if (!dispatch) return true;
    const { $from } = state.selection;
    const tr = state.tr;
    const top = $from.depth >= 1 ? $from.before(1) : 0;
    const topNode = $from.depth >= 1 ? $from.node(1) : null;
    let at: number;
    if (options.replaceEmpty !== false && topNode && topNode.type === nodes.paragraph && topNode.content.size === 0 && !topNode.attrs.heading) {
      tr.replaceWith(top, top + topNode.nodeSize, list);
      at = top;
    } else {
      at = topNode ? top + topNode.nodeSize : state.doc.content.size;
      tr.insert(at, list);
    }
    const end = at + Fragment.from(list).size;
    if (end >= tr.doc.content.size) tr.insert(end, nodes.paragraph!.create());
    const inside = Selection.findFrom(tr.doc.resolve(at), 1, true);
    if (inside) tr.setSelection(inside);
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function emptyTable(rows: number, columns: number, header = true): PMNode {
  const cell = (head: boolean) => nodes.cell!.create({ header: head }, nodes.paragraph!.create());
  const row = (head: boolean) => nodes.tableRow!.create(null, Array.from({ length: columns }, () => cell(head)));
  return nodes.table!.create(null, Array.from({ length: rows }, (_, index) => row(header && index === 0)));
}

export const insertTable = (rows = 3, columns = 3): Command => insertBlocks(emptyTable(rows, columns));
export const insertRule: Command = insertBlocks(nodes.horizontalRule!.create(), { replaceEmpty: false });

/** Puts an inline atom in at the cursor. */
export function insertInline(node: PMNode): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    if (!$from.parent.inlineContent || $from.parent.type === nodes.codeBlock) return false;
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node, true).scrollIntoView());
    return true;
  };
}

/** The link around the cursor or selection: its range and href. */
export function linkAt(state: EditorState): { from: number; to: number; href: string } | null {
  const type = marks.link!;
  const { $from, from, to, empty } = state.selection;
  const at = (pos: number) => {
    const $pos = state.doc.resolve(pos);
    const parent = $pos.parent;
    const start = $pos.start();
    let found: { from: number; to: number; href: string } | null = null;
    let offset = 0;
    let run: { from: number; to: number; href: string } | null = null;
    parent.forEach(child => {
      const mark = type.isInSet(child.marks);
      const childFrom = start + offset;
      const childTo = childFrom + child.nodeSize;
      if (mark && run && run.href === mark.attrs.href && run.to === childFrom) run.to = childTo;
      else run = mark ? { from: childFrom, to: childTo, href: mark.attrs.href as string } : null;
      if (run && run.from <= pos && run.to >= pos && (!empty || run.to > pos || run.from < pos)) found = { ...run };
      offset += child.nodeSize;
    });
    return found as { from: number; to: number; href: string } | null;
  };
  if (!$from.parent.inlineContent) return null;
  const found = at(from);
  if (!found) return null;
  if (!empty && to > found.to) return null;
  return found;
}

/** Sets the link over a range (with its text, when given), or over the selection. */
export function setLink(href: string, text?: string, range?: { from: number; to: number }): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const type = marks.link!;
    const tr = state.tr;
    let { from, to } = range ?? state.selection;
    if (text !== undefined && text !== state.doc.textBetween(from, to, '', '￼')) {
      const kept = state.doc.resolve(from).marksAcross(state.doc.resolve(to)) ?? state.doc.resolve(from).marks();
      tr.replaceWith(from, to, text ? schema.text(text, type.removeFromSet(kept)) : Fragment.empty);
      to = from + text.length;
    }
    if (from === to) {
      if (!text) return false;
    }
    tr.removeMark(from, to, type).addMark(from, to, type.create({ href }));
    tr.setSelection(TextSelection.create(tr.doc, to));
    tr.removeStoredMark(type);
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function removeLink(range?: { from: number; to: number }): Command {
  return (state, dispatch) => {
    const found = range ?? linkAt(state);
    if (!found) return false;
    if (dispatch) dispatch(state.tr.removeMark(found.from, found.to, marks.link!));
    return true;
  };
}

/** The picture the selection is on. */
export function selectedMedia(state: EditorState): { node: PMNode; pos: number } | null {
  const selection = state.selection;
  if (selection instanceof NodeSelection && selection.node.type === nodes.media) return { node: selection.node, pos: selection.from };
  return null;
}

export function setNodeAttrs(pos: number, attrs: Attrs): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node) return false;
    if (dispatch) dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
    return true;
  };
}

export function deleteNodeAt(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node) return false;
    if (dispatch) dispatch(state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
    return true;
  };
}

/** The top-level block holding a position: its node and where it starts. */
export function topBlockAt(doc: PMNode, pos: number): { node: PMNode; pos: number } | null {
  const $pos = doc.resolve(Math.min(Math.max(pos, 0), doc.content.size));
  if ($pos.depth === 0) {
    const node = $pos.nodeAfter;
    return node ? { node, pos } : null;
  }
  return { node: $pos.node(1), pos: $pos.before(1) };
}

/** Copies a node right after itself, without its ids (the diff gives the copy new ones). */
export function duplicateNodeAt(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node) return false;
    if (dispatch) dispatch(state.tr.insert(pos + node.nodeSize, stripIds(node)).scrollIntoView());
    return true;
  };
}

/** A copy of a node without block ids or suggestion attrs. */
export function stripIds(node: PMNode): PMNode {
  if (node.isText) return node;
  const content: PMNode[] = [];
  node.forEach(child => content.push(stripIds(child)));
  const attrs = 'bid' in node.attrs ? { ...node.attrs, bid: null, suggestId: null, suggestOp: null } : node.attrs;
  return node.type.create(attrs, content, node.marks);
}

export const inTable = (state: EditorState) => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type === nodes.table) return true;
  return false;
};

export const cellSelected = (state: EditorState) => state.selection instanceof CellSelection;

export const tableRect = (state: EditorState) => (inTable(state) ? selectedRect(state) : null);

export type { NodeType };
