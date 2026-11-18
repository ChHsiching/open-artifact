import type { Dynamic } from '../dynamic.ts';
import * as ProsemirrorModel from 'prosemirror-model';
import * as ProsemirrorState from 'prosemirror-state';
import * as ProsemirrorView from 'prosemirror-view';
import * as ProsemirrorHistory from 'prosemirror-history';
import * as ProsemirrorKeymap from 'prosemirror-keymap';
import * as ProsemirrorCommands from 'prosemirror-commands';
import { FONT_MARKS, looksFromLines, NO_LIST, isSameList, listsAfterTyping, diffTexts, lineRangeOf } from './text-looks.ts';
import { typedMarkAtCaret, readTypedMarks } from './entry-looks.ts';
import { levelInList } from '../model/cell-values.ts';
import { listNumberAttributes, CHECKBOX_LIST_SELECTOR, isPressOnListCheckbox, listOfElement, listAttributesOf } from '../ui/cell-list-attributes.ts';
import { isNonNullObject } from '../utils/objects.ts';
import { normalizeLineBreaks } from '../format/shown-text.ts';
import { registerEntryEditor, isEntryEditor } from '../dom/entry-editor.ts';
import { referenceTintStyle } from '../grid/cell-drawing.ts';
import { IS_APPLE_PLATFORM } from '../ui/dom-events.ts';
export let baseBackspace: Dynamic;
export let baseDelete: Dynamic;
export let entryBackspace: Dynamic;
export function lookOfMarks(marks?: Dynamic) {
  let linkAddress = marks.find(({ type: type }: Dynamic) => type.name === 'link')?.attrs.address;
  return {
    marks: FONT_MARKS.filter((input?: Dynamic) => marks.some(({ type: type }: Dynamic) => type.name === input)),
    link: typeof linkAddress === 'string' ? linkAddress : null,
  };
}
export function looksOfEntryDoc(doc?: Dynamic) {
  let looks: Dynamic = [];
  doc.forEach((input?: Dynamic) => {
    let items: Dynamic = [];
    input.forEach(
      ({ nodeSize: nodeSize, marks: marks }: Dynamic) =>
        items.push({
          length: nodeSize,
          ...lookOfMarks(marks),
        }),
    );
    looks.push({
      list: listOfParagraph(input),
      stretches: items,
    });
  });
  return looksFromLines(looks, []);
}
export function setListsOfEntryLines(tr?: Dynamic, lists?: Dynamic) {
  tr.doc.forEach((node?: Dynamic, pos?: Dynamic, index?: Dynamic) => {
    let list = lists[index] ?? NO_LIST;
    if (!isSameList(listOfParagraph(node), list)) tr.setNodeAttribute(pos, 'list', list);
  });
}
export function docPosOfTextOffset(doc?: Dynamic, offset?: Dynamic) {
  let remaining: Dynamic = Math.max(0, offset);
  let pos: Dynamic = 0;
  for (let index: Dynamic = 0; index < doc.childCount; index += 1) {
    let { content: content, nodeSize: nodeSize } = doc.child(index);
    if (remaining <= content.size) return pos + 1 + remaining;
    remaining -= content.size + 1;
    pos += nodeSize;
  }
  return doc.content.size - 1;
}
export function textOffsetOfDocPos(doc?: Dynamic, pos?: Dynamic) {
  let resolved = doc.resolve(Math.min(Math.max(pos, 0), doc.content.size));
  let offset: Dynamic = 0;
  for (let index: Dynamic = 0; index < resolved.index(0); index += 1) offset += doc.child(index).content.size + 1;
  if (resolved.depth === 0) return Math.max(0, offset - 1);
  return offset + resolved.parentOffset;
}
export function replaceEntryText(state?: Dynamic, from?: Dynamic, to?: Dynamic, text?: Dynamic) {
  let { doc: doc } = state;
  let marks = state.storedMarks ?? doc.resolve(docPosOfTextOffset(doc, from)).marks();
  let slice = new (ProsemirrorModel.Slice as Dynamic)(
    ProsemirrorModel.Fragment.from(
      text
        .split(
          `
`,
        )
        .map((input?: Dynamic) => entryParagraphOf(input, marks)),
    ),
    1,
    1,
  );
  let tr = state.tr.replace(docPosOfTextOffset(doc, from), docPosOfTextOffset(doc, to), text === '' ? ProsemirrorModel.Slice.empty : slice);
  setListsOfEntryLines(
    tr,
    listsAfterTyping(looksOfEntryDoc(doc).lists, textOfEntryDoc(doc), {
      from: from,
      to: to,
      written: text,
    }),
  );
  let caret = docPosOfTextOffset(tr.doc, from + text.length);
  return tr.setSelection(ProsemirrorState.TextSelection.create(tr.doc, caret));
}
export function moveEntryText(state?: Dynamic, from?: Dynamic, to?: Dynamic, target?: Dynamic) {
  if (target >= from && target <= to) return null;
  let { doc: doc, tr: tr } = state;
  let [fromPos, toPos] = [docPosOfTextOffset(doc, from), docPosOfTextOffset(doc, to)];
  let slice = doc.slice(fromPos, toPos);
  tr.delete(fromPos, toPos);
  let targetPos = tr.mapping.map(docPosOfTextOffset(doc, target));
  tr.replace(targetPos, targetPos, slice);
  let newFrom = target < from ? target : target - (to - from);
  return tr.setSelection(
    ProsemirrorState.TextSelection.create(tr.doc, docPosOfTextOffset(tr.doc, newFrom), docPosOfTextOffset(tr.doc, newFrom + (to - from))),
  );
}
export function selectLastWordAtLineEnd(state?: Dynamic, clickPos?: Dynamic) {
  let { $from: selectionFrom, $to: selectionTo, empty: selection } = state.selection;
  let { parent: value, parentOffset: value2, pos: value3 } = selection ? selectionTo : state.doc.resolve(clickPos);
  let value4 = value.isTextblock && value2 > 0 && value2 === value.content.size;
  let value5 = selectionFrom.pos === value3 - value2 && (selectionTo.pos === value3 || selectionTo.pos === value3 + 2);
  if (!value4 || !(selection || value5) || typeof Intl.Segmenter !== 'function') return null;
  let items = [
    ...new (Intl.Segmenter as Dynamic)(undefined, {
      granularity: 'word',
    }).segment(value.textContent),
  ];
  let value6 = value3 - (items.at(-1)?.segment.length ?? 0);
  return state.tr.setSelection(ProsemirrorState.TextSelection.create(state.doc, value6, value3));
}
export function setEntryValue(state?: Dynamic, newText?: Dynamic) {
  let oldText = textOfEntryDoc(state.doc);
  if (oldText === newText) return null;
  let { from: value, to: value2, written: value3 } = diffTexts(oldText, newText);
  return replaceEntryText(state, value, value2, value3);
}
export function applyLooksToEntry(state?: Dynamic, looks?: Dynamic) {
  let { doc: doc, tr: tr } = state;
  let index: Dynamic = 0;
  for (let value of looks.stretches as Dynamic) {
    let [items, items2] = [docPosOfTextOffset(doc, index), docPosOfTextOffset(doc, index + value.length)];
    tr.removeMark(items, items2);
    for (let value2 of marksOfLook(value) as Dynamic) tr.addMark(items, items2, value2);
    index += value.length;
  }
  setListsOfEntryLines(tr, looks.lists);
  return tr.doc.eq(doc) && state.storedMarks === null ? null : tr.setStoredMarks(null);
}
export function withTypedMarkApplied(tr: Dynamic, { from: from, wordsFrom: wordsFrom, wordsTo: wordsTo, to: to, mark: mark }: Dynamic) {
  let { doc: doc } = tr;
  let fromPos = docPosOfTextOffset(doc, from);
  return tr
    .delete(docPosOfTextOffset(doc, wordsTo), docPosOfTextOffset(doc, to))
    .delete(fromPos, docPosOfTextOffset(doc, wordsFrom))
    .addMark(fromPos, fromPos + wordsTo - wordsFrom, entrySchema.mark(mark))
    .setStoredMarks(null);
}
export function trOfTypedMarkAt(state?: Dynamic, caret?: Dynamic, textBefore: Dynamic = '') {
  let text = textOfEntryDoc(state.doc);
  let typedMark = typedMarkAtCaret(text, caret);
  if (typedMark === null) return null;
  let { from: from, written: written } = diffTexts(textBefore, text);
  return from <= typedMark.from && typedMark.to <= from + written.length ? withTypedMarkApplied(state.tr, typedMark) : null;
}
export function trOfTypedMarkAtCaret(state?: Dynamic, textBefore?: Dynamic, isExact?: Dynamic) {
  if (!state.selection.empty) return null;
  let caret = textOffsetOfDocPos(state.doc, state.selection.head);
  let tr = trOfTypedMarkAt(state, caret, textBefore);
  return tr !== null || isExact ? tr : trOfTypedMarkAt(state, caret - 1, textBefore);
}
export function entrySliceWithLooks(text?: Dynamic, looks?: Dynamic, from?: Dynamic, to?: Dynamic) {
  let lines = [[]];
  let offset: Dynamic = 0;
  for (let stretch of looks.stretches as Dynamic) {
    let [start, end] = [Math.max(offset, from), Math.min(offset + stretch.length, to)];
    offset += stretch.length;
    if (end <= start) continue;
    for (let [index, line] of text
      .slice(start, end)
      .split(
        `
`,
      )
      .entries() as Dynamic) {
      if (index > 0) lines.push([]);
      if (line !== '') lines.at(-1)?.push(entrySchema.text(line, marksOfLook(stretch)));
    }
  }
  let [firstLine] = lineRangeOf(text, from, to);
  let paragraphs = lines.map(
    (nodes?: Dynamic, index?: Dynamic) =>
      entrySchema.node(
        'paragraph',
        {
          list: looks.lists[firstLine + index] ?? NO_LIST,
        },
        nodes,
      ),
  );
  return new (ProsemirrorModel.Slice as Dynamic)(ProsemirrorModel.Fragment.from(paragraphs), 1, 1);
}
export function trWithMarkSignsRead(state?: Dynamic, from?: Dynamic, to?: Dynamic, isMarked: Dynamic = true) {
  let { doc: doc } = state;
  let [text, looks] = [textOfEntryDoc(doc), looksOfEntryDoc(doc)];
  let read = readTypedMarks(text, looks, from, to, isMarked);
  if (read === null) return null;
  let tr = state.tr.replace(
    docPosOfTextOffset(doc, from),
    docPosOfTextOffset(doc, to),
    entrySliceWithLooks(read.text, read.looks, from, read.to),
  );
  return tr.setSelection(ProsemirrorState.TextSelection.create(tr.doc, docPosOfTextOffset(tr.doc, read.to))).setStoredMarks(null);
}
export function listNumberDecorations(doc?: Dynamic, numbers?: Dynamic) {
  let decorations: Dynamic = [];
  doc.forEach((node?: Dynamic, pos?: Dynamic, index?: Dynamic) => {
    let [number, level] = [numbers[index] ?? null, levelInList(listOfParagraph(node))];
    if (number !== null && level !== null)
      decorations.push(ProsemirrorView.Decoration.node(pos, pos + node.nodeSize, listNumberAttributes(level, number)));
  });
  return decorations;
}
export function dispatchAsInput(view?: Dynamic, tr?: Dynamic, inputType?: Dynamic) {
  view.dispatch(ProsemirrorHistory.closeHistory(tr).setMeta(INPUT_TYPE_META, inputType));
  if (!view.isDestroyed) view.dispatch(ProsemirrorHistory.closeHistory(view.state.tr));
}
export function prosemirrorViewInternal(input?: Dynamic, options?: Dynamic) {
  let entry = Reflect.get(input, options);
  if (!isNonNullObject(entry)) throw Error(`this ProseMirror’s view has no ${options}`);
  return entry;
}
export function callDomObserver(input?: Dynamic, options?: Dynamic) {
  let value = prosemirrorViewInternal(input, 'domObserver');
  let value2 = value[options];
  if (typeof value2 !== 'function') throw Error(`this ProseMirror’s observer has no ${options}()`);
  Reflect.apply(value2, value, []);
}
export function runRestartingObserverOnError(input?: Dynamic, options?: Dynamic) {
  try {
    options();
  } catch (value: Dynamic) {
    throw (callDomObserver(input, 'start'), value);
  }
}
export function scrollCaretIntoEntry(input?: Dynamic) {
  let dom = input.dom;
  let value = input.coordsAtPos(input.state.selection.head);
  let bounds = dom.getBoundingClientRect();
  let value2 = dom.offsetWidth === 0 ? 1 : bounds.width / dom.offsetWidth;
  let [items, items2] = [bounds.left + dom.clientLeft * value2, bounds.top + dom.clientTop * value2];
  let [items3, items4] = [items + dom.clientWidth * value2, items2 + dom.clientHeight * value2];
  let value3 = (input2?: Dynamic, options?: Dynamic) => (input2 < 0 ? input2 : Math.max(0, options)) / value2;
  dom.scrollLeft += value3(value.left - items, value.right - items3);
  dom.scrollTop += value3(value.top - items2, value.bottom - items4);
  return true;
}
export function copyEntryAsPlainText(input?: Dynamic, event?: Dynamic) {
  let { from: selection, to: selection2, empty: selection3 } = input.state.selection;
  if (selection3 || event.clipboardData === null) return false;
  event.preventDefault();
  event.clipboardData.setData(
    'text/plain',
    input.state.doc.textBetween(
      selection,
      selection2,
      `
`,
    ),
  );
  if (event.type === 'cut') dispatchAsInput(input, input.state.tr.deleteSelection().scrollIntoView(), 'deleteByCut');
  return true;
}
export function dropIntoEntry(view?: Dynamic, event?: Dynamic, isMove?: Dynamic) {
  let value = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });
  let value2 = normalizeLineBreaks(event.dataTransfer?.getData('text/plain') ?? '');
  event.preventDefault();
  if (value === null) return true;
  let { doc: state, selection: state2 } = view.state;
  let value3 = textOffsetOfDocPos(state, value.pos);
  let value4 = isMove
    ? moveEntryText(view.state, textOffsetOfDocPos(state, state2.from), textOffsetOfDocPos(state, state2.to), value3)
    : replaceEntryText(view.state, value3, value3, value2);
  if (value4 === null || (!isMove && value2 === '')) return true;
  dispatchAsInput(view, value4, 'insertFromDrop');
  if (!view.isDestroyed) view.focus();
  return true;
}
export function dressEntryAsTextArea(element: Dynamic, { view: view, readSigns: readSigns, signsInLastInput: signsInLastInput }: Dynamic) {
  let value = () => {
    flushEntryDomObserver(view);
    let { doc: state, selection: state2 } = view.state;
    return {
      anchor: textOffsetOfDocPos(state, state2.anchor),
      head: textOffsetOfDocPos(state, state2.head),
    };
  };
  let [items, items2] = [
    () => (Math.min as Dynamic)(...Object.values(value())),
    () => (Math.max as Dynamic)(...Object.values(value())),
  ];
  let value2 = (input?: Dynamic, options?: Dynamic, context?: Dynamic) => {
    if (view.isDestroyed) return;
    flushEntryDomObserver(view);
    let { doc: state, tr: state2 } = view.state;
    let [items3, items4] = [docPosOfTextOffset(state, input), docPosOfTextOffset(state, options)];
    let [value3, value4] = context === 'backward' ? [items4, items3] : [items3, items4];
    view.dispatch(state2.setSelection(ProsemirrorState.TextSelection.create(state, value3, value4)));
  };
  Object.defineProperties(
    element,
    Object.fromEntries(
      Object.entries({
        value: {
          get: () => (flushEntryDomObserver(view), textOfEntryDoc(view.state.doc)),
          set: (input?: Dynamic) => {
            let value3 = view.isDestroyed ? null : setEntryValue(view.state, input);
            if (value3 === null) return;
            view.dispatch(value3.setSelection(ProsemirrorState.TextSelection.atEnd(value3.doc)).setMeta(WRITTEN_INTO_VALUE_META, true));
            view.updateState(withEntryHistoryCleared(view.state));
          },
        },
        looks: {
          get: () => (flushEntryDomObserver(view), looksOfEntryDoc(view.state.doc)),
        },
        selectionStart: {
          get: items,
          set: (input?: Dynamic) => value2(input, Math.max(input, items2())),
        },
        selectionEnd: {
          get: items2,
          set: (input?: Dynamic) => value2(Math.min(items(), input), input),
        },
        selectionDirection: {
          get: () => {
            let { anchor: value3, head: value4 } = value();
            if (value3 === value4) return 'none';
            return value3 < value4 ? 'forward' : 'backward';
          },
        },
        setSelectionRange: {
          value: (input?: Dynamic, options?: Dynamic, context?: Dynamic) => value2(input ?? 0, options ?? 0, context),
        },
        select: {
          value: () => value2(0, Number.POSITIVE_INFINITY),
        },
        replaceText: {
          value: (input?: Dynamic, options?: Dynamic, context?: Dynamic) => {
            if (view.isDestroyed) return;
            flushEntryDomObserver(view);
            dispatchAsInput(view, replaceEntryText(view.state, input, options, context).scrollIntoView(), 'insertText');
          },
        },
        readSigns: {
          value: (from?: Dynamic, to?: Dynamic, isMarked?: Dynamic) =>
            readSigns((state?: Dynamic) => trWithMarkSignsRead(state, from, to, isMarked), 'whole'),
        },
        signsInLastInput: {
          get: signsInLastInput,
        },
        bringCaretIntoSight: {
          value: () => {
            if (!view.isDestroyed) scrollCaretIntoEntry(view);
          },
        },
        offsetAtPoint: {
          value: ({ x: x, y: y }: Dynamic) => {
            let value3 = view.isDestroyed
              ? null
              : view.posAtCoords({
                  left: x,
                  top: y,
                });
            return value3 === null ? null : textOffsetOfDocPos(view.state.doc, value3.pos);
          },
        },
        focus: {
          value: (input?: Dynamic) => {
            if (entryViewsBeingFocused.has(view) || view.isDestroyed)
              return element.ownerDocument.defaultView?.HTMLElement.prototype.focus.call(element, input);
            if (element === element.ownerDocument.activeElement) return;
            entryViewsBeingFocused.add(view);
            try {
              runRestartingObserverOnError(view, () => view.focus());
            } finally {
              entryViewsBeingFocused.delete(view);
            }
            return;
          },
        },
      }).map(
        ([input, input2]: Dynamic) => [
          input,
          {
            configurable: true,
            ...input2,
          },
        ],
      ),
    ),
  );
  registerEntryEditor(element);
  if (!isEntryEditor(element)) throw Error('the entry’s editor was not noted');
  return element;
}
export function dispatchEntryLooks(view?: Dynamic, looks?: Dynamic, addToHistory?: Dynamic) {
  let value = applyLooksToEntry(view.state, looks)?.setMeta(WRITTEN_INTO_VALUE_META, true);
  if (value === undefined) return;
  if (!addToHistory) return view.dispatch(value.setMeta('addToHistory', false));
  view.dispatch(ProsemirrorHistory.closeHistory(value));
  return view.dispatch(ProsemirrorHistory.closeHistory(view.state.tr));
}
export function createEntryEditorView(
  mount?: Dynamic,
  text?: Dynamic,
  onMarkAsked?: Dynamic,
  beforeSignsRead?: Dynamic,
  onBoxOfLinePressed?: Dynamic,
) {
  let lastSigns: Dynamic = null;
  let wereSignsRead: Dynamic = false;
  let signsInLastInput: Dynamic = null;
  let isInputPending: Dynamic = false;
  let doubleClickPos: Dynamic = null;
  let doc = entryDocOfText(text);
  let view = new (ProsemirrorView.EditorView as Dynamic)(
    {
      mount: mount,
    },
    {
      state: ProsemirrorState.EditorState.create({
        doc: doc,
        selection: ProsemirrorState.TextSelection.atEnd(doc),
        plugins: [
          entryHistoryPlugin,
          ProsemirrorKeymap.keymap({
            ...ENTRY_DELETE_KEYMAP,
            ...ENTRY_HISTORY_KEYMAP,
            Backspace: (...args: Dynamic[]) =>
              (lastSigns?.what === 'read' && lastSigns.how === 'typed' && (undoInEntry as Dynamic)(...args)) ||
              (entryBackspace as Dynamic)?.(...args) === true,
          }),
          createDecorationsPlugin(referenceHuesKey),
          listNumbersPlugin,
          createSelectionHeldPlugin(),
        ],
      }),
      dispatchTransaction(input?: Dynamic) {
        if (input.docChanged || !input.selection.eq(view.state.selection)) {
          let readsSigns = input.getMeta(READS_SIGNS_META);
          let inputType = input.getMeta(INPUT_TYPE_META);
          if (readsSigns === 'typed' || readsSigns === 'whole') wereSignsRead = true;
          if (readsSigns === 'typed' || readsSigns === 'whole')
            lastSigns = {
              what: 'read',
              how: readsSigns,
            };
          else if (lastSigns?.what === 'read' && inputType === 'historyUndo')
            lastSigns = {
              what: 'putBack',
              how: lastSigns.how,
            };
          else if (lastSigns?.what === 'putBack' && inputType === 'historyRedo')
            lastSigns = {
              what: 'read',
              how: lastSigns.how,
            };
          else lastSigns = null;
        }
        let isUndoAfterRead = wereSignsRead && input.getMeta(INPUT_TYPE_META) === 'historyUndo';
        if (input.docChanged) signsInLastInput = lastSigns?.what ?? (isUndoAfterRead ? 'putBack' : null);
        view.updateState(view.state.apply(input));
        if (!input.docChanged || input.getMeta(WRITTEN_INTO_VALUE_META) === true) return;
        let value = input.getMeta(INPUT_TYPE_META);
        if (typeof value !== 'string' && isInputPending) return;
        let { InputEvent: value2 } = mount.ownerDocument.defaultView ?? {};
        if (value2 !== undefined)
          mount.dispatchEvent(
            new (value2 as Dynamic)('input', {
              bubbles: true,
              inputType: typeof value === 'string' ? value : '',
            }),
          );
      },
      handleDOMEvents: {
        focus: (input?: Dynamic) => entryViewsBeingFocused.has(input),
        paste: (input?: Dynamic, options?: Dynamic) => options.defaultPrevented,
        copy: copyEntryAsPlainText,
        cut: copyEntryAsPlainText,
        mousedown: (input?: Dynamic, event?: Dynamic) => {
          doubleClickPos = null;
          let paragraph = event.target instanceof Element ? event.target.closest('p') : null;
          if (!(event.button === 0 && paragraph?.matches(CHECKBOX_LIST_SELECTOR) === true && isPressOnListCheckbox(paragraph, event))) return false;
          event.preventDefault();
          onBoxOfLinePressed([...mount.children].indexOf(paragraph));
          return true;
        },
        dblclick: (input: Dynamic, { button: button, shiftKey: shiftKey, clientX: clientX, clientY: clientY }: Dynamic) => {
          flushEntryDomObserver(view);
          let value =
            button === 0 &&
            !shiftKey &&
            view.posAtCoords({
              left: clientX,
              top: clientY,
            })?.pos === doubleClickPos &&
            doubleClickPos !== null
              ? selectLastWordAtLineEnd(view.state, doubleClickPos)
              : null;
          if (value !== null) view.dispatch(value);
          return false;
        },
        beforeinput: (input?: Dynamic, event?: Dynamic) => {
          if (event.inputType.startsWith('format')) event.preventDefault();
          let value = FORMAT_INPUT_MARKS[event.inputType];
          if (value !== undefined) onMarkAsked(value);
          if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
            event.preventDefault();
            (event.inputType === 'historyUndo' ? undoInEntry : redoInEntry)(view.state, view.dispatch, view);
          }
          return true;
        },
      },
      handleKeyPress: (input?: Dynamic, options?: Dynamic) => {
        let value = String.fromCharCode(options.charCode);
        if (isSelectionInOneParagraph(view.state) || !options.isTrusted || /[\r\n]/.test(value)) return false;
        view.dispatch(view.state.tr.insertText(value).scrollIntoView().setMeta(INPUT_TYPE_META, 'insertText'));
        return true;
      },
      handleDoubleClick: (input?: Dynamic, options?: Dynamic) => ((doubleClickPos = options), false),
      handleDrop: (input?: Dynamic, options?: Dynamic, context?: Dynamic, value?: Dynamic) => dropIntoEntry(view, options, value),
      handleScrollToSelection: scrollCaretIntoEntry,
      transformPastedHTML: () => '',
      clipboardTextSerializer: ({ content: content }: Dynamic) =>
        content.textBetween(
          0,
          content.size,
          `
`,
        ),
    },
  );
  guardEntryUpdateState(view);
  let controller = new (AbortController as Dynamic)();
  let listen = (input?: Dynamic, options?: Dynamic, context: Dynamic = false) =>
    mount.addEventListener(input, options, {
      capture: context,
      signal: controller.signal,
    });
  listen('beforeinput', (input?: Dynamic) => {
    isInputPending = !input.defaultPrevented;
  });
  listen('input', () => {
    flushEntryDomObserver(view);
    isInputPending = false;
  });
  for (let value of ['keydown', 'drop'] as Dynamic) listen(value, () => void (isInputPending = false), true);
  listen('dragstart', ({ dataTransfer: dataTransfer }: Dynamic) => dataTransfer?.clearData('text/html'));
  return {
    view: view,
    end: () => {
      controller.abort();
      view.destroy();
    },
    readSigns: (makeTr?: Dynamic, how?: Dynamic) => {
      if (view.isDestroyed || view.composing) return;
      flushEntryDomObserver(view);
      if (makeTr(view.state) === null) return;
      beforeSignsRead();
      let tr = makeTr(view.state);
      if (tr !== null) dispatchAsInput(view, tr.setMeta(READS_SIGNS_META, how).scrollIntoView(), 'insertReplacementText');
    },
    signsInLastInput: () => signsInLastInput,
  };
}
export const LINK_ADDRESS_ATTRIBUTE = 'data-links-to';
export const isListObject = (input?: Dynamic) => typeof input === 'object' && input !== null && 'kind' in input;
export const listOfParagraph = ({ attrs: attrs }: Dynamic) => (isListObject(attrs.list) ? attrs.list : NO_LIST);
export const isListParagraph = (input?: Dynamic) => listOfParagraph(input).kind !== 'none';
export const entrySchema = new (ProsemirrorModel.Schema as Dynamic)({
  nodes: {
    doc: {
      content: 'paragraph+',
    },
    paragraph: {
      content: 'text*',
      attrs: {
        list: {
          default: NO_LIST,
        },
      },
      selectable: false,
      parseDOM: [
        {
          tag: 'p',
          getAttrs: (element?: Dynamic) => ({
            list: listOfElement(element),
          }),
        },
        {
          tag: 'div',
        },
      ],
      toDOM: (node?: Dynamic) => [
        'p',
        listAttributesOf({
          list: listOfParagraph(node),
          number: null,
        }),
        0,
      ],
    },
    text: {
      toDebugString: () => 'text',
    },
  },
  marks: {
    bold: {
      parseDOM: [
        {
          tag: 'strong',
        },
      ],
      toDOM: () => ['strong', 0],
    },
    italic: {
      parseDOM: [
        {
          tag: 'em',
        },
      ],
      toDOM: () => ['em', 0],
    },
    underline: {
      parseDOM: [
        {
          tag: 'u',
        },
      ],
      toDOM: () => ['u', 0],
    },
    strikethrough: {
      parseDOM: [
        {
          tag: 's',
        },
      ],
      toDOM: () => ['s', 0],
    },
    link: {
      attrs: {
        address: {
          validate: 'string',
        },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: `span[${LINK_ADDRESS_ATTRIBUTE}]`,
          getAttrs: (element?: Dynamic) => ({
            address: element.getAttribute(LINK_ADDRESS_ATTRIBUTE),
          }),
        },
      ],
      toDOM: ({ attrs: attrs }: Dynamic) => [
        'span',
        {
          [LINK_ADDRESS_ATTRIBUTE]: String(attrs.address),
        },
        0,
      ],
    },
  },
});
export const marksOfLook = ({ marks: marks, link: link }: Dynamic) => [
  ...marks.map((input?: Dynamic) => entrySchema.mark(input)),
  ...(link === null
    ? []
    : [
        entrySchema.mark('link', {
          address: link,
        }),
      ]),
];
export const entryParagraphOf = (input?: Dynamic, options: Dynamic = []) =>
  entrySchema.node('paragraph', null, input === '' ? [] : [entrySchema.text(input, options)]);
export const entryDocOfText = (input?: Dynamic) =>
  entrySchema.node(
    'doc',
    null,
    input
      .split(
        `
`,
      )
      .map((input2?: Dynamic) => entryParagraphOf(input2)),
  );
export const textOfEntryDoc = (input?: Dynamic) =>
  input.textBetween(
    0,
    input.content.size,
    `
`,
  );
export const entryHistoryPlugin = ProsemirrorHistory.history({
  newGroupDelay: -1,
  depth: 1000,
});
export const withEntryHistoryCleared = (input?: Dynamic) =>
  input
    .reconfigure({
      plugins: input.plugins.filter((input2?: Dynamic) => input2 !== entryHistoryPlugin),
    })
    .reconfigure({
      plugins: input.plugins,
    });
export const selectionHeldDecorations = (input?: Dynamic, span?: Dynamic) =>
  span === undefined
    ? ProsemirrorView.DecorationSet.empty
    : ProsemirrorView.DecorationSet.create(input, [
        ProsemirrorView.Decoration.inline(docPosOfTextOffset(input, span.start), docPosOfTextOffset(input, span.end), {
          class: 'sheet-selection-held',
        }),
      ]);
export const referenceHueDecorations = (input?: Dynamic, options?: Dynamic) =>
  ProsemirrorView.DecorationSet.create(
    input,
    options.flatMap(
      ({ writtenAt: writtenAt, hue: hue }: Dynamic) =>
        writtenAt === undefined
          ? []
          : [
              ProsemirrorView.Decoration.inline(docPosOfTextOffset(input, writtenAt.start), docPosOfTextOffset(input, writtenAt.end), {
                class: 'sheet-reference-in-entry',
                style: Object.entries(referenceTintStyle(hue))
                  .map(([input2, input3]: Dynamic) => `${input2}:${input3}`)
                  .join(';'),
              }),
            ],
    ),
  );
export const INPUT_TYPE_META = 'inputTypeOfEntryEditor';
export const READS_SIGNS_META = 'readsSignsInEntryEditor';
export const WRITTEN_INTO_VALUE_META = 'isWrittenIntoValueOfEntryEditor';
export const withInputTypeMeta =
  (input?: Dynamic, options?: Dynamic) =>
  (input2?: Dynamic, options2?: Dynamic, context?: Dynamic) =>
    options(input2, options2 === undefined ? undefined : (input3?: Dynamic) => options2(input3.setMeta(INPUT_TYPE_META, input)), context);
export const undoInEntry = withInputTypeMeta('historyUndo', ProsemirrorHistory.undo);
export const redoInEntry = withInputTypeMeta('historyRedo', ProsemirrorHistory.redo);
export const asInputCommand =
  (input?: Dynamic, options?: Dynamic) =>
  (input2?: Dynamic, options2?: Dynamic, context?: Dynamic) =>
    options(
      input2,
      options2 === undefined || context === undefined ? undefined : (input3?: Dynamic) => dispatchAsInput(context, input3, input),
      context,
    );
export const isSelectionInOneParagraph = ({ selection: selection }: Dynamic) =>
  selection instanceof ProsemirrorState.TextSelection && selection.$from.sameParent(selection.$to);
export const leaveInParagraphDeletesToBrowser =
  (input?: Dynamic) =>
  (input2?: Dynamic, options?: Dynamic, context?: Dynamic) =>
    (input2.selection.empty || !isSelectionInOneParagraph(input2)) && input(input2, options, context);
({ Backspace: baseBackspace, Delete: baseDelete } = ProsemirrorCommands.baseKeymap);
export const keepsListOnBackspaceAtStart =
  (input?: Dynamic) =>
  (state?: Dynamic, dispatch?: Dynamic, view?: Dynamic) => {
    let { empty: empty, $from: selectionFrom } = state.selection;
    let isAtListStart = empty && selectionFrom.parentOffset === 0 && isListParagraph(selectionFrom.parent);
    let areLooksSeen = view?.dom.hasAttribute('data-keeps-looks-unseen') !== true;
    return !(isAtListStart && areLooksSeen) && input(state, dispatch, view);
  };
export const ENTRY_DELETE_KEYMAP = Object.fromEntries(
  Object.entries(ProsemirrorCommands.baseKeymap).flatMap(([input, input2]: Dynamic) => {
    if (input2 !== baseBackspace && input2 !== baseDelete) return [];
    let command = leaveInParagraphDeletesToBrowser(
      asInputCommand(input2 === baseBackspace ? 'deleteContentBackward' : 'deleteContentForward', input2),
    );
    return [[input, input === 'Backspace' ? keepsListOnBackspaceAtStart(command) : command]];
  }),
);
({ Backspace: entryBackspace } = ENTRY_DELETE_KEYMAP);
export const alwaysHandled =
  (input?: Dynamic) =>
  (...input2: Dynamic[]) => ((input as Dynamic)(...input2), true);
export const ENTRY_HISTORY_KEYMAP = {
  'Mod-z': alwaysHandled(undoInEntry),
  'Shift-Mod-z': alwaysHandled(redoInEntry),
  ...(IS_APPLE_PLATFORM
    ? {}
    : {
        'Mod-y': alwaysHandled(redoInEntry),
      }),
};
export const selectionHeldKey = new (ProsemirrorState.PluginKey as Dynamic)('selectionHeld');
export const createSelectionHeldPlugin = () =>
  new (ProsemirrorState.Plugin as Dynamic)({
    key: selectionHeldKey,
    state: {
      init: () => ProsemirrorView.DecorationSet.empty,
      apply: (input?: Dynamic, options?: Dynamic) => {
        let value = input.getMeta(selectionHeldKey);
        return value instanceof ProsemirrorView.DecorationSet ? value : options.map(input.mapping, input.doc);
      },
    },
    props: {
      decorations: (input?: Dynamic) => selectionHeldKey.getState(input),
    },
  });
export const referenceHuesKey = new (ProsemirrorState.PluginKey as Dynamic)('huesOnReferences');
export const listNumbersKey = new (ProsemirrorState.PluginKey as Dynamic)('numbersOnLines');
export const NO_LIST_NUMBERS: Dynamic = [];
export const isListNumbers = (input?: Dynamic) => Array.isArray(input);
export const listNumbersPlugin = new (ProsemirrorState.Plugin as Dynamic)({
  key: listNumbersKey,
  state: {
    init: () => NO_LIST_NUMBERS,
    apply: (input?: Dynamic, options?: Dynamic) => {
      let value = input.getMeta(listNumbersKey);
      return isListNumbers(value) ? value : options;
    },
  },
  props: {
    decorations: (input?: Dynamic) =>
      ProsemirrorView.DecorationSet.create(input.doc, [...listNumberDecorations(input.doc, listNumbersKey.getState(input) ?? NO_LIST_NUMBERS)]),
  },
});
export const createDecorationsPlugin = (key?: Dynamic) =>
  new (ProsemirrorState.Plugin as Dynamic)({
    key: key,
    state: {
      init: () => ProsemirrorView.DecorationSet.empty,
      apply: (input?: Dynamic, options?: Dynamic) => {
        let value = input.getMeta(key);
        return value instanceof ProsemirrorView.DecorationSet ? value : options.map(input.mapping, input.doc);
      },
    },
    props: {
      decorations: (input?: Dynamic) => key.getState(input),
    },
  });
export const MATCHING_BRACKETS_CLASS = 'sheet-matching-brackets';
export const flushEntryDomObserver = (input?: Dynamic) => callDomObserver(input, 'flush');
export const guardEntryUpdateState = (input?: Dynamic) =>
  void Object.defineProperty(input, 'updateState', {
    value: (input2?: Dynamic) =>
      runRestartingObserverOnError(input, () => ProsemirrorView.EditorView.prototype.updateState.call(input, input2)),
  });
export const entryViewsBeingFocused = new (WeakSet as Dynamic)();
export const FORMAT_INPUT_MARKS = {
  formatBold: 'bold',
  formatItalic: 'italic',
  formatUnderline: 'underline',
  formatStrikeThrough: 'strikethrough',
};
