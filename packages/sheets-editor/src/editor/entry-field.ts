import { Spinner } from '../kit/spinner.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import * as ProsemirrorHistory from 'prosemirror-history';
import * as ReactDOM from 'react-dom';
import {
  withEntryHistoryCleared,
  dispatchEntryLooks,
  setEntryValue,
  WRITTEN_INTO_VALUE_META,
  applyLooksToEntry,
  NO_LIST_NUMBERS,
  createEntryEditorView,
  textOfEntryDoc,
  dressEntryAsTextArea,
  selectionHeldKey,
  selectionHeldDecorations,
  listNumbersKey,
  referenceHuesKey,
  referenceHueDecorations,
  docPosOfTextOffset,
  MATCHING_BRACKETS_CLASS,
  trOfTypedMarkAtCaret,
} from './entry-editor-view.ts';
import { plainLooks, hasLists } from './text-looks.ts';
import { jsx } from 'react/jsx-runtime';
import { ENTRY_EDITOR_ATTRIBUTE } from '../dom/entry-editor.ts';
import { afterNextFrameOrTimeout } from '../utils/next-frame.ts';
import { CHECKBOX_LIST_SELECTOR, isPressOnListCheckbox } from '../ui/cell-list-attributes.ts';
import { preventMouseDownDefault } from '../ui/dom-events.ts';
import { agentTurnUndoOffer, describeUndoOffer } from '../i18n/change-labels.ts';
import { DONE_CARD_WAIT_MS } from '../agent/turn-of-agent.ts';
export function showPlainLooksInEntry(view?: Dynamic, text?: Dynamic, marksOfCell?: Dynamic) {
  if (marksOfCell.length > 0) view.updateState(withEntryHistoryCleared(view.state));
  dispatchEntryLooks(view, plainLooks(text, marksOfCell), false);
}
export function putEntryValueWithLooks(editor?: Dynamic, text?: Dynamic, looks?: Dynamic, marksOfCell?: Dynamic) {
  let { view: view, element: element } = editor;
  if (editor.looksShown === undefined) showPlainLooksInEntry(view, element.value, marksOfCell);
  let valueTr = setEntryValue(view.state, text)?.setMeta(WRITTEN_INTO_VALUE_META, true);
  if (valueTr === undefined) return;
  view.dispatch(ProsemirrorHistory.closeHistory(valueTr));
  let looksTr = applyLooksToEntry(view.state, looks)?.setMeta(WRITTEN_INTO_VALUE_META, true);
  if (looksTr !== undefined) view.dispatch(looksTr.setMeta('appendedTransaction', valueTr));
  view.dispatch(ProsemirrorHistory.closeHistory(view.state.tr));
  editor.looksShown = looks;
  editor.valueShown = text;
  editor.hasShownLooks = true;
}
export function syncEntryLooksShown(input?: Dynamic, items?: Dynamic, context?: Dynamic, value?: Dynamic) {
  let { view: value2, looksShown: value3, valueShown: value4 } = input;
  input.looksShown = context;
  input.valueShown = items;
  if (context === value3 && items === value4) return;
  if (context === undefined) {
    if (input.hasShownLooks) dispatchEntryLooks(value2, plainLooks(items, NO_MARKS_OF_CELL), false);
    return;
  }
  input.hasShownLooks = true;
  let value5 = applyLooksToEntry(value2.state, context) === null;
  if (value3 === undefined && !value5) showPlainLooksInEntry(value2, items, value);
  dispatchEntryLooks(value2, context, items === value4);
}
export function RichEntryEditor({
  ref: ref,
  value: value,
  onChange: onChange,
  onInput: onInput,
  onCompositionEnd: onCompositionEnd,
  isGoing = false,
  references: references,
  brackets = null,
  looks: looks,
  areLooksSeen = true,
  marksOfCell = NO_MARKS_OF_CELL,
  areSignsRead = false,
  textHeldAsEntryOpened = '',
  areSignsLeftAsTyped = false,
  numbersOfLines = NO_LIST_NUMBERS,
  caretToPut = null,
  onMarkAsked: onMarkAsked,
  selectionHeld: selectionHeld,
  onBoxPressed: onBoxPressed,
  role = 'textbox',
  ...rest
}: Dynamic) {
  let mountRef = React.useRef(null);
  let editorRef = React.useRef(null);
  let initialValueRef = React.useRef(value);
  let initialCaretRef = React.useRef(caretToPut);
  let onMarkAskedRef = React.useRef(onMarkAsked);
  let marksOfCellRef = React.useRef(marksOfCell);
  let onBoxPressedRef = React.useRef(onBoxPressed);
  React.useLayoutEffect(() => {
    onMarkAskedRef.current = onMarkAsked;
    marksOfCellRef.current = marksOfCell;
    onBoxPressedRef.current = onBoxPressed;
  });
  let [, rerender] = React.useReducer((input?: Dynamic) => input + 1, 0);
  React.useLayoutEffect(() => {
    let current = mountRef.current;
    if (current === null) return;
    let value2 = createEntryEditorView(
      current,
      initialValueRef.current,
      (input?: Dynamic) => onMarkAskedRef.current?.(input),
      () => {
        let editor = editorRef.current;
        if (editor === null || editor.hasShownLooks) return;
        editor.hasShownLooks = true;
        showPlainLooksInEntry(value2.view, textOfEntryDoc(value2.view.state.doc), marksOfCellRef.current);
      },
      (input?: Dynamic) => onBoxPressedRef.current?.(input),
    );
    editorRef.current = {
      ...value2,
      element: dressEntryAsTextArea(current, value2),
      referencesShown: null,
      heldShown: undefined,
      looksShown: undefined,
      hasShownLooks: false,
      valueShown: null,
      numbersShown: NO_LIST_NUMBERS,
      caretPut: initialCaretRef.current,
    };
    return () => {
      editorRef.current = null;
      value2.end();
    };
  }, []);
  React.useImperativeHandle(ref, () => {
    if (editorRef.current === null) throw Error('the entry’s editor was handed on before it was made');
    return editorRef.current.element;
  }, []);
  React.useLayoutEffect(() => {
    let current = editorRef.current;
    if (isGoing) current?.end();
    if (current === null || current.view.isDestroyed || current.view.composing) return;
    let isCaretToPut = caretToPut !== null && caretToPut !== current.caretPut && caretToPut.text === value;
    if (isCaretToPut && looks !== undefined) putEntryValueWithLooks(current, value, looks, marksOfCell);
    current.element.value = value;
    syncEntryLooksShown(current, value, looks, marksOfCell);
    if (current.heldShown !== selectionHeld) {
      current.heldShown = selectionHeld;
      let { doc: doc, tr: tr } = current.view.state;
      current.view.dispatch(tr.setMeta(selectionHeldKey, selectionHeldDecorations(doc, selectionHeld)));
    }
    if (current.numbersShown.join() !== numbersOfLines.join()) {
      current.numbersShown = numbersOfLines;
      current.view.dispatch(current.view.state.tr.setMeta(listNumbersKey, numbersOfLines));
    }
    if (isCaretToPut) current.element.setSelectionRange(caretToPut.at, caretToPut.at);
    current.caretPut = caretToPut;
    if (current.referencesShown === references) return;
    current.referencesShown = references;
    let { doc: state, tr: state2 } = current.view.state;
    current.view.dispatch(state2.setMeta(referenceHuesKey, referenceHueDecorations(state, references)));
  });
  React.useLayoutEffect(() => {
    let view = editorRef.current?.view;
    let win = mountRef.current?.ownerDocument.defaultView ?? null;
    if (brackets === null || win === null || !('highlights' in win.CSS)) return;
    if (win.matchMedia('(forced-colors:active)').matches) return;
    if (view === undefined || view.isDestroyed || view.composing) return;
    let { doc: doc } = view.state;
    let ranges = [brackets.opensAt, brackets.closesAt].map((offset?: Dynamic) => {
      let domPos = view.domAtPos(docPosOfTextOffset(doc, offset), 1);
      if (domPos.offset >= (domPos.node.nodeValue?.length ?? 0)) return null;
      let range = win.document.createRange();
      range.setStart(domPos.node, domPos.offset);
      range.setEnd(domPos.node, domPos.offset + 1);
      return range;
    });
    let highlight = new win.Highlight(...ranges.filter((input?: Dynamic) => input !== null));
    win.CSS.highlights.set(MATCHING_BRACKETS_CLASS, highlight);
    return () => void win.CSS.highlights.delete(MATCHING_BRACKETS_CLASS);
  });
  let handleInput = (event?: Dynamic) => {
    let value2 = () => {
      onInput?.(event);
      onChange?.({
        target: event.currentTarget,
        nativeEvent: event.nativeEvent,
      });
      rerender();
    };
    if (event.nativeEvent.inputType === 'deleteByDrag') ReactDOM.flushSync(value2);
    else value2();
    let { inputType: inputType, isTrusted: isTrusted, isComposing: isComposing } = event.nativeEvent;
    if (areSignsRead && inputType === 'insertText' && isTrusted && !isComposing)
      editorRef.current?.readSigns((state?: Dynamic) => trOfTypedMarkAtCaret(state, textHeldAsEntryOpened, areSignsLeftAsTyped), 'typed');
  };
  let handleCompositionEnd = (input?: Dynamic) => {
    onCompositionEnd?.(input);
    rerender();
  };
  return jsx('div', {
    ref: mountRef,
    role: role,
    tabIndex: 0,
    'aria-multiline': role === 'textbox' || undefined,
    ...{
      [ENTRY_EDITOR_ATTRIBUTE]: true,
    },
    'data-keeps-looks-unseen': (looks !== undefined && !areLooksSeen) || undefined,
    'data-shows-list': (looks !== undefined && areLooksSeen && hasLists(looks)) || undefined,
    ...rest,
    onInput: handleInput,
    onCompositionEnd: handleCompositionEnd,
  });
}
export function EntryInput(input?: Dynamic) {
  if (input.as === 'textArea') {
    let { as: value3, ...value4 } = input;
    return jsx('textarea', {
      ...value4,
    });
  }
  let { as: value, ...value2 } = input;
  return jsx(RichEntryEditor, {
    ...value2,
  });
}
export function lingeringEntryProps(input?: Dynamic) {
  let { ref: value, className: value2, style: value3, ...value4 } = input;
  let value5 = Object.fromEntries(Object.entries(value4).filter(([input2]: Dynamic) => !input2.startsWith('on')));
  let state = {
    tabIndex: -1,
    style: {
      ...value3,
      position: 'absolute',
      opacity: 0,
      pointerEvents: 'none',
    },
  };
  if (input.as === 'textArea')
    return {
      ...value5,
      as: 'textArea',
      readOnly: true,
      ...state,
    };
  let { value: value6, references: value7 } = input;
  return {
    ...value5,
    as: 'editor',
    value: value6,
    references: value7,
    isGoing: true,
    ...state,
  };
}
export function LingeringEntryInput({ drawn: drawn, ofCell = null }: Dynamic) {
  let [value, value2] = React.useState({
    drawn: drawn,
    ofCell: ofCell,
    isGoing: false,
    nth: 0,
  });
  if (drawn !== null && drawn !== value.drawn) {
    let isNewInput = value.isGoing || (value.drawn !== null && ofCell !== value.ofCell);
    value2({
      drawn: drawn,
      ofCell: ofCell,
      isGoing: false,
      nth: isNewInput ? value.nth + 1 : value.nth,
    });
  }
  if (drawn === null && value.drawn !== null && !value.isGoing)
    value2({
      ...value,
      isGoing: true,
    });
  let ref = React.useRef(null);
  let callback = React.useCallback((input?: Dynamic) => void (ref.current = input), []);
  let { isGoing: value3, nth: value4 } = value;
  React.useEffect(() => {
    let value5 = ref.current?.ownerDocument.defaultView ?? null;
    if (!value3 || value5 === null) return;
    afterNextFrameOrTimeout(
      value5,
      () =>
        value2(
          (input?: Dynamic) =>
            input.isGoing && input.nth === value4
              ? {
                  ...input,
                  drawn: null,
                  isGoing: false,
                  nth: value4 + 1,
                }
              : input,
        ),
    );
  }, [value3, value4]);
  if (drawn !== null)
    return jsx(
      EntryInput,
      {
        ...drawn,
      },
      value4,
    );
  if (value.drawn === null) return null;
  return jsx(
    EntryInput,
    {
      ...lingeringEntryProps(value.drawn),
      ref: callback,
      'data-is-going': true,
    },
    value4,
  );
}
export function boxOfLineAtPoint(target?: Dynamic, event?: Dynamic) {
  let line = target instanceof Element ? target.closest(`.sheet-line-in-cell${CHECKBOX_LIST_SELECTOR}`) : null;
  return line !== null && isPressOnListCheckbox(line, event) ? line : null;
}
export function createLineBoxPresses(onPressed?: Dynamic) {
  let press: Dynamic = null;
  return {
    pressed(event?: Dynamic, isTaken?: Dynamic) {
      let line =
        event.button === 0 && !(event.shiftKey || event.ctrlKey || event.metaKey) && !isTaken ? boxOfLineAtPoint(event.target, event) : null;
      press =
        line === null
          ? null
          : {
              line: line.getAttribute('data-line') ?? '',
              pointerId: event.pointerId,
            };
      return press !== null;
    },
    letGo(event?: Dynamic, isTaken?: Dynamic) {
      let pressed = press;
      press = null;
      if (pressed?.pointerId !== event.pointerId || isTaken || event.button !== 0) return;
      let { clientX: clientX, clientY: clientY, currentTarget: currentTarget } = event;
      let line = boxOfLineAtPoint(currentTarget.ownerDocument.elementFromPoint(clientX, clientY), event);
      let isActive = (line?.closest('[data-is-active]') ?? null) !== null;
      if (line === null || !isActive || line.getAttribute('data-line') !== pressed.line) return;
      onPressed(Number(pressed.line));
    },
  };
}
export function CalculatingSpinner({ isTurning: isTurning }: Dynamic) {
  return jsx('span', {
    'aria-hidden': true,
    className: 'grid size-4 flex-none place-content-center text-secondary',
    onMouseDown: preventMouseDownDefault,
    children:
      isTurning &&
      jsx(Spinner, {
        size: 'sm',
        inheritColor: true,
      }),
  });
}
export function undoOfferToShow({ undoOffer: undoOffer, undoOfTurnOffered: undoOfTurnOffered }: Dynamic) {
  if (undoOfTurnOffered !== null)
    return {
      key: undoOfTurnOffered.edits.at(-1)?.last ?? '',
      ...agentTurnUndoOffer(undoOfTurnOffered),
      taken: 'undoOfTurnTaken',
      wait: undoOfTurnOffered.wait,
    };
  if (undoOffer?.kind !== 'moveReplacedCells') return null;
  return {
    key: `move ${undoOffer.cells} ${undoOffer.count}`,
    ...describeUndoOffer(undoOffer),
    taken: 'undoOfferTaken',
    wait: UNDO_OFFER_WAIT,
  };
}
export const NO_MARKS_OF_CELL: Dynamic = [];
export const UNDO_OFFER_WAIT = {
  ms: DONE_CARD_WAIT_MS,
};
