import type { Dynamic } from '../dynamic.ts';
import { create } from 'zustand';
import { MODIFIER_KEYS } from '../state/escape.ts';
import { isBrowserReservedKey } from '../keys/key-press.ts';
export let keptOffCount: Dynamic;
export function createKeysOffCellsGuard(
  cellsElement?: Dynamic,
  page?: Dynamic,
  setTimer: Dynamic = (run?: Dynamic, delayMs?: Dynamic) => setTimeout(run, delayMs),
) {
  let areKeysOff: Dynamic = false;
  let isNoticeHeld: Dynamic = false;
  let isForAMove: Dynamic = false;
  let letsMovesThrough: Dynamic = false;
  let generation: Dynamic = 0;
  let leftByBlur: Dynamic = false;
  let setKeysOff = (areOff?: Dynamic, byBlur: Dynamic = false) => {
    if (areOff === areKeysOff) return;
    areKeysOff = areOff;
    page.cellsTakeNoText(areOff, byBlur);
  };
  let letKeysBackOn = () => setKeysOff(false);
  let keepOff = (event?: Dynamic, isShortcut: Dynamic = false, mayNotice: Dynamic = true) => {
    if (!areKeysOff || page.isField(event.target)) return;
    event.stopImmediatePropagation();
    if (!isShortcut) event.preventDefault();
    let shouldNotice = mayNotice && !isShortcut && !isForAMove;
    page.somethingWasKeptOff(!shouldNotice ? 'never' : isNoticeHeld ? 'later' : 'now');
  };
  cellsElement.addEventListener(
    'keydown',
    (event?: Dynamic) => {
      if (LEAVE_KEYS_PATTERN.test(event.key)) {
        if (event.key === 'Escape' && page.isOfCells(event.target)) keepOff(event, false, false);
        letKeysBackOn();
      } else if (letsMovesThrough && MOVE_KEYS_PATTERN.test(event.key)) letKeysBackOn();
      else if (!MODIFIER_KEYS.has(event.key)) keepOff(event, isBrowserReservedKey(event));
    },
    true,
  );
  cellsElement.addEventListener(
    'keyup',
    (event?: Dynamic) => {
      if (areKeysOff && event.key === ' ' && !page.isField(event.target)) event.preventDefault();
    },
    true,
  );
  for (let eventType of ['beforeinput', 'paste', 'cut'] as Dynamic)
    cellsElement.addEventListener(eventType, (event?: Dynamic) => keepOff(event), true);
  for (let eventType of ['pointerdown', 'mousedown', 'click'] as Dynamic)
    cellsElement.addEventListener(
      eventType,
      () => {
        leftByBlur = false;
        letKeysBackOn();
      },
      true,
    );
  cellsElement.addEventListener(
    'blur',
    (event?: Dynamic) => {
      if (event.target !== cellsElement) return;
      leftByBlur = true;
      setKeysOff(false, true);
    },
    true,
  );
  cellsElement.addEventListener(
    'focus',
    (event?: Dynamic) => {
      if (event.target === cellsElement) leftByBlur = false;
    },
    true,
  );
  return (isForAMove2: Dynamic = false, letsMovesThrough2: Dynamic = false) => {
    letKeysBackOn();
    if (leftByBlur && !page.hasKeyboard()) return () => false;
    isForAMove = isForAMove2;
    letsMovesThrough = letsMovesThrough2;
    setKeysOff(true);
    generation += 1;
    let generationNow = generation;
    let releaseIfCurrent = () => {
      if (generationNow === generation) letKeysBackOn();
    };
    isNoticeHeld = !isForAMove2;
    if (isForAMove2) setTimer(releaseIfCurrent, KEYS_OFF_CELLS_MS);
    else
      setTimer(() => {
        if (generationNow !== generation) return;
        isNoticeHeld = false;
        if (areKeysOff) page.noticeNeedNotWait();
      }, KEPT_OFF_NOTICE_DELAY_MS);
    return (isDone: Dynamic = false) => {
      let wasKeptOff = generationNow === generation && areKeysOff;
      if (isForAMove2 || isDone || !page.isBoxInSight()) releaseIfCurrent();
      return wasKeptOff;
    };
  };
}
export function closestTextField(element?: Dynamic) {
  let field = element.closest(
    'input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image],[type=hidden],[readonly]), textarea:not([readonly]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
  );
  if (field !== null) return field;
  let labelOrInput = element.closest('[data-ui="TextInput"], label');
  let control = labelOrInput?.control ?? null;
  return control?.matches(
    'input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image],[type=hidden],[readonly]), textarea:not([readonly]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
  ) === true
    ? control
    : (labelOrInput?.querySelector(
        'input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image],[type=hidden],[readonly]), textarea:not([readonly]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
      ) ?? null);
}
export function keepSheetFieldTapsInside(cellsElement?: Dynamic) {
  cellsElement.addEventListener(
    'pointerdown',
    (event?: Dynamic) => {
      let { target: target } = event;
      if (!(target instanceof Element) || !isSheetPresentationField(target)) return;
      let stopOwnPointerdown = (sameEvent?: Dynamic) => {
        if (sameEvent === event) sameEvent.stopPropagation();
      };
      target.addEventListener('pointerdown', stopOwnPointerdown, {
        once: true,
      });
    },
    {
      capture: true,
    },
  );
}
export function noteSomethingKeptOff(when?: Dynamic) {
  keptOffCount += 1;
  if (when === 'now' && !getKeysOffCellsState().wasSomethingKeptOff)
    setKeysOffCellsState({
      ...getKeysOffCellsState(),
      wasSomethingKeptOff: true,
    });
  if (when === 'later' && !getKeysOffCellsState().isNoticeOwed)
    setKeysOffCellsState({
      ...getKeysOffCellsState(),
      isNoticeOwed: true,
    });
}
export function releaseOwedKeptOffNotice() {
  if (getKeysOffCellsState().isNoticeOwed)
    setKeysOffCellsState({
      ...getKeysOffCellsState(),
      isNoticeOwed: false,
      wasSomethingKeptOff: true,
    });
}
export function onceKeysBackOnCells(then?: Dynamic) {
  let stopListening = subscribeKeysOffCells(() => {
    if (getKeysOffCellsState().doCellsTakeNoText) return;
    stopListening();
    then(getKeysOffCellsState().hasKeyboardLeft);
  });
  return stopListening;
}
export const KEYS_OFF_CELLS_MS = 2500;
export const KEPT_OFF_NOTICE_DELAY_MS = 1000;
export const LEAVE_KEYS_PATTERN = /^(?:Escape|Tab|F6)$/;
export const MOVE_KEYS_PATTERN = /^(?:Arrow(?:Up|Down|Left|Right)|Page(?:Up|Down)|Home|End)$/;
export const isSheetPresentationField = (element?: Dynamic) =>
  element.closest('[data-presentation="sheet"]') !== null && closestTextField(element) !== null;
export interface KeysOffCellsState {
  /** Typing goes elsewhere for now, so keys pressed on the cells are kept off them. */
  doCellsTakeNoText: boolean;
  wasSomethingKeptOff: boolean;
  isNoticeOwed: boolean;
  hasKeyboardLeft: boolean;
}
export const KEYS_OFF_CELLS_IDLE: KeysOffCellsState = {
  doCellsTakeNoText: false,
  wasSomethingKeptOff: false,
  isNoticeOwed: false,
  hasKeyboardLeft: false,
};
export const useKeysOffCellsStore = create<KeysOffCellsState>()(() => KEYS_OFF_CELLS_IDLE);
export const setKeysOffCellsState = (next: KeysOffCellsState): void => useKeysOffCellsStore.setState(next, true);
keptOffCount = 0;
export const getKeptOffCount = () => keptOffCount;
export const setCellsTakeNoText = (doCellsTakeNoText2?: Dynamic, hasKeyboardLeft?: Dynamic) =>
  setKeysOffCellsState({
    ...KEYS_OFF_CELLS_IDLE,
    doCellsTakeNoText: doCellsTakeNoText2,
    hasKeyboardLeft: hasKeyboardLeft,
  });
export const getKeysOffCellsState = (): KeysOffCellsState => useKeysOffCellsStore.getState();
export const doCellsTakeNoText = () => getKeysOffCellsState().doCellsTakeNoText;
export const subscribeKeysOffCells = (listener: () => void): (() => void) => useKeysOffCellsStore.subscribe(() => listener());
export const makeKeepKeysOffCells =
  (keepOff?: Dynamic) =>
  (onBack?: Dynamic) => {
    let release = keepOff();
    let stopWaiting = onceKeysBackOnCells((doCellsTakeNoText2?: Dynamic) => {
      if (!doCellsTakeNoText2) onBack();
    });
    return () => {
      stopWaiting();
      release();
    };
  };
export const useKeysOffCells = (): KeysOffCellsState => useKeysOffCellsStore();
