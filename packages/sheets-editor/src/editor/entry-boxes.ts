import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { isEntryUntouched } from '../formulas/reference-pointing.ts';
import { diffTexts } from './text-looks.ts';
import { isEntryEditor, entryEditorOf } from '../dom/entry-editor.ts';
import { createPasteKeyTracker } from '../clipboard/paste-keys.ts';
import { normalizeLineBreaks, trimTrailingNewlines, flattenEnteredText } from '../format/shown-text.ts';
import { isOneLineEditor } from '../state/transitions.ts';
import { textWithMarkSignsRead } from './entry-looks.ts';
import { linkOfAddressPastedOverWords } from '../links/links-in-entry.ts';
export let isPastingIntoEntry: Dynamic;
export function forgetCaretPlacement(box?: Dynamic, mode?: Dynamic) {
  if (isEntryUntouched(mode))
    caretMemory.set(box, {
      text: box.value,
      at: null,
    });
}
export function isCaretWhereLeft(box?: Dynamic, mode?: Dynamic) {
  let { value: text, selectionStart: selectionStart, selectionEnd: selectionEnd } = box;
  let remembered = caretMemory.get(box);
  let defaultCaret = isEntryUntouched(mode) ? [selectionStart, selectionEnd] : [text.length, text.length];
  let caret = remembered?.text === text ? remembered.at : defaultCaret;
  let isUnmoved = selectionStart === caret?.[0] && selectionEnd === caret[1];
  caretMemory.set(box, {
    text: text,
    at: isUnmoved ? caret : null,
  });
  return isUnmoved;
}
export function caretInEntryPatch(mode?: Dynamic, boxes?: Dynamic) {
  let box = typingBoxOf(mode, boxes);
  let { selectionStart = null, selectionEnd = null } = box ?? {};
  if (box === null || selectionStart === null || selectionEnd === null) return {};
  let caret = {
    start: selectionStart,
    end: selectionEnd,
    text: box.value,
    isComposing: composingBoxes.has(box),
  };
  return {
    caretInEntry: isCaretWhereLeft(box, mode)
      ? caret
      : {
          ...caret,
          isPlacedByHand: true,
        },
  };
}
export function giveEntryBoxOfItsOwn(store: Dynamic, { cell: cell }: Dynamic) {
  let { mode: mode } = store.getView();
  let cellBox = cell.current;
  if (mode.kind !== 'editing' || mode.isInBoxOfOneLine !== true || cellBox === null) return;
  if (composingBoxes.has(cellBox) || store.mayAnEntryOpenOrEnd()) return;
  let ownerDocument = cellBox.ownerDocument;
  let isFocused = cellBox === ownerDocument.activeElement;
  if (isFocused && !ownerDocument.hasFocus()) return;
  let { selectionStart: selectionStart, selectionEnd: selectionEnd } = cellBox;
  ReactDOM.flushSync(
    () =>
      store.dispatch({
        kind: 'entryGivenBoxOfItsOwn',
      }),
  );
  if (isFocused && cell.current !== cellBox) cell.current?.setSelectionRange(selectionStart, selectionEnd);
}
export function giveEntryBoxToFormat(store?: Dynamic, boxes?: Dynamic) {
  let { mode: mode } = store.getView();
  let box = typingBoxOf(mode, boxes);
  if (mode.kind !== 'editing' || box === null) return;
  if (doesFormatNeedOwnBox(mode.typingIn, box)) giveEntryBoxOfItsOwn(store, boxes);
}
export function writeIntoBox(box?: Dynamic, text?: Dynamic, caretAt?: Dynamic) {
  let oldText = box.value;
  let { from: from, to: to, written: written } = diffTexts(oldText, text, caretAt);
  if (isEntryEditor(box)) return box.replaceText(from, to, written);
  let scrollFromEnd = box.scrollWidth - box.scrollLeft;
  box.setSelectionRange(from, to);
  box.ownerDocument.execCommand(written === '' ? 'delete' : 'insertText', false, written);
  box.scrollLeft = written.endsWith(`
`)
    ? 0
    : box.scrollWidth - scrollFromEnd;
  if (
    text.endsWith(`
`) &&
    to === oldText.length
  )
    box.scrollTop = box.scrollHeight;
}
export function createWrittenTextLog() {
  let writes = new (Set as Dynamic)();
  return {
    wrote: (before?: Dynamic, after?: Dynamic) => void writes.add(JSON.stringify([before, after])),
    has: (direction?: Dynamic, before?: Dynamic, after?: Dynamic) =>
      writes.has(JSON.stringify(direction === 'undo' ? [after, before] : [before, after])),
    clear: () => writes.clear(),
  };
}
export function useEntryBoxes(store: Dynamic, { cell: cell, formulaBar: formulaBar }: Dynamic) {
  let [writtenLog] = React.useState(createWrittenTextLog);
  React.useEffect(() => {
    let ownerDocument = formulaBar.current?.ownerDocument;
    let lastPointed: Dynamic = null;
    let typingBox: Dynamic = null;
    let unsubscribe = store.subscribe(() => {
      let { pointedReference: pointedReference, mode: mode } = store.getView();
      let box = typingBoxOf(mode, {
        cell: cell,
        formulaBar: formulaBar,
      });
      if (box !== typingBox) writtenLog.clear();
      if (box !== typingBox && typingBox !== null) caretMemory.delete(typingBox);
      if (box === null) {
        for (let { current: boxElement } of [cell, formulaBar] as Dynamic) if (boxElement !== null) caretMemory.delete(boxElement);
      }
      typingBox = box;
      if (pointedReference === lastPointed) return;
      lastPointed = pointedReference;
      if (pointedReference === null || box === null || box !== box.ownerDocument.activeElement) return;
      if (box.value !== pointedReference.text) {
        writtenLog.wrote(box.value, pointedReference.text);
        writeIntoBox(box, pointedReference.text);
      }
      box.setSelectionRange(pointedReference.end, pointedReference.end);
      rememberCaretAtEnd(box);
    });
    let textBeforeInput: Dynamic = '';
    let onBeforeInput = (event?: Dynamic) => {
      let { target: target } = event;
      if (target === typingBox && typingBox !== null) textBeforeInput = typingBox.value;
      if (
        event instanceof InputEvent &&
        (event.inputType === 'insertLineBreak' ||
          event.inputType === 'insertParagraph' ||
          (event.inputType === 'insertText' && event.data === '\r')) &&
        (target === cell.current || target === formulaBar.current)
      )
        event.preventDefault();
    };
    let pasteAddressOverWords = (box?: Dynamic, link?: Dynamic) => {
      let { value: value, selectionEnd: selectionEnd } = box;
      store.dispatch({
        kind: 'addressPastedOverWords',
        ...link,
        text: value,
        caretAt: selectionEnd,
      });
      box.setSelectionRange(selectionEnd, selectionEnd);
    };
    let defaultView = ownerDocument?.defaultView ?? null;
    let pasteKeys = defaultView === null ? null : createPasteKeyTracker(defaultView);
    let replaceAndReadSigns = (editor?: Dynamic, text?: Dynamic) => {
      let { selectionStart: selectionStart } = editor;
      editor.replaceText(selectionStart, editor.selectionEnd, text);
      if (store.getView().grid.doesEntryReadSigns)
        editor.readSigns(selectionStart, selectionStart + text.length, pasteKeys?.isWithoutFormatting() !== true);
    };
    let listeners = [
      ['beforeinput', onBeforeInput],
      [
        'paste',
        (event?: Dynamic) => {
          let box = entryEditorOf(event.target);
          if (box === null || (box !== cell.current && box !== formulaBar.current)) return;
          if (store.getView().mode.kind !== 'editing' && box === cell.current) return;
          let pastedText = event instanceof ClipboardEvent ? event.clipboardData?.getData('text') : '';
          let text = normalizeLineBreaks(pastedText ?? '');
          let cellBox = cell.current;
          let isCaretAtEnd = box instanceof HTMLTextAreaElement && box.selectionEnd === box.value.length;
          if (
            trimTrailingNewlines(text).includes(`
`) &&
            !composingBoxes.has(box)
          )
            giveEntryBoxOfItsOwn(store, {
              cell: cell,
            });
          let { mode: mode } = store.getView();
          let flatText = mode.kind === 'editing' && isOneLineEditor(mode) ? flattenEnteredText(text) : trimTrailingNewlines(text);
          let barReadingSigns =
            pasteKeys?.isWithoutFormatting() === true && box === formulaBar.current && store.getView().grid.doesEntryReadSigns
              ? formulaBar.current
              : null;
          let textToWrite =
            barReadingSigns === null
              ? flatText
              : textWithMarkSignsRead(
                  barReadingSigns.value.slice(0, barReadingSigns.selectionStart ?? 0),
                  flatText,
                  barReadingSigns.value.slice(barReadingSigns.selectionEnd ?? 0),
                );
          let activeElement = ownerDocument?.activeElement;
          let isBarActive = activeElement instanceof HTMLTextAreaElement && activeElement === formulaBar.current;
          let activeBox = isEntryEditor(activeElement) || isBarActive ? activeElement : null;
          let linkOverWords =
            activeBox !== null &&
            store.getView().doesKeyOpenLinkForm &&
            mode.kind === 'editing' &&
            mode.isInBoxOfOneLine !== true &&
            mode.text === activeBox.value &&
            !store.mayAnEntryOpenOrEnd()
              ? linkOfAddressPastedOverWords(
                  mode.text,
                  {
                    start: activeBox.selectionStart,
                    end: activeBox.selectionEnd,
                  },
                  textToWrite,
                )
              : null;
          if (
            linkOverWords === null &&
            isPasteLeftToBrowser(text, textToWrite, isCaretAtEnd) &&
            cell.current === cellBox &&
            !isEntryEditor(activeElement)
          )
            return;
          event.preventDefault();
          isPastingIntoEntry = true;
          try {
            if (linkOverWords !== null && activeBox !== null) pasteAddressOverWords(activeBox, linkOverWords);
            else if (!isEntryEditor(activeElement)) ownerDocument?.execCommand('insertText', false, textToWrite);
            else if (textToWrite !== '') replaceAndReadSigns(activeElement, textToWrite);
          } finally {
            isPastingIntoEntry = false;
          }
        },
      ],
      [
        'input',
        (event?: Dynamic) => {
          let inputType = event instanceof InputEvent ? event.inputType : null;
          for (let { current: boxElement } of [cell, formulaBar] as Dynamic)
            if (boxElement !== null && boxElement === event.target) rememberCaretAtEnd(boxElement);
          if (event.target !== typingBox || typingBox === null) return;
          if (inputType !== 'historyUndo' && inputType !== 'historyRedo') return;
          let direction = inputType === 'historyUndo' ? 'undo' : 'redo';
          if (writtenLog.has(direction, textBeforeInput, typingBox.value))
            typingBox.setSelectionRange(typingBox.selectionEnd, typingBox.selectionEnd);
        },
      ],
      [
        'selectionchange',
        () => {
          if (typingBox !== null && typingBox === ownerDocument?.activeElement) isCaretWhereLeft(typingBox, store.getView().mode);
        },
      ],
      [
        'contextmenu',
        ({ target: target }: Dynamic) => {
          if (entryEditorOf(target) === typingBox && typingBox !== null && isEntryUntouched(store.getView().mode)) caretMemory.delete(typingBox);
        },
      ],
      ['compositionstart', ({ target: target }: Dynamic) => void (target !== null && composingBoxes.add(entryEditorOf(target) ?? target))],
      ['compositionend', ({ target: target }: Dynamic) => void (target !== null && composingBoxes.delete(entryEditorOf(target) ?? target))],
    ];
    for (let [type, listener] of listeners as Dynamic) ownerDocument?.addEventListener(type, listener, true);
    return () => {
      unsubscribe();
      pasteKeys?.stop();
      for (let [type, listener] of listeners as Dynamic) ownerDocument?.removeEventListener(type, listener, true);
    };
  }, [store, cell, formulaBar, writtenLog]);
  return React.useCallback(
    ({ text: text, caretAt: caretAt, typingIn: typingIn }: Dynamic) => {
      let box = (
        {
          cell: cell,
          formulaBar: formulaBar,
        } as Dynamic
      )[typingIn].current;
      if (box === null || box !== box.ownerDocument.activeElement || box.value === text) return;
      writtenLog.wrote(box.value, text);
      writeIntoBox(box, text, caretAt);
      box.setSelectionRange(caretAt, caretAt);
      rememberCaretAtEnd(box);
    },
    [cell, formulaBar, writtenLog],
  );
}
export const typingBoxOf = (mode?: Dynamic, boxes?: Dynamic) => (mode.kind === 'editing' ? boxes[mode.typingIn].current : null);
export const composingBoxes = new (WeakSet as Dynamic)();
isPastingIntoEntry = false;
export const isPastingIntoEntryNow = () => isPastingIntoEntry;
export const caretMemory = new (WeakMap as Dynamic)();
export const rememberCaretAtEnd = (box?: Dynamic) =>
  void caretMemory.set(box, {
    text: box.value,
    at: [box.selectionEnd, box.selectionEnd],
  });
export const giveEntryBoxOfItsOwnAlias = giveEntryBoxOfItsOwn;
export const doesFormatNeedOwnBox = (typingIn: Dynamic, { selectionStart: selectionStart, selectionEnd: selectionEnd }: Dynamic) =>
  typingIn === 'formulaBar' || selectionStart !== selectionEnd;
export const PASTE_LINES_LEFT_TO_BROWSER = 50;
export const isPasteLeftToBrowser = (pasted?: Dynamic, text?: Dynamic, isCaretAtEnd?: Dynamic) =>
  text === pasted ||
  (isCaretAtEnd &&
    text.split(`
`).length >= PASTE_LINES_LEFT_TO_BROWSER);
