import type { Dynamic } from '../dynamic.ts';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
import { shouldArrowsMoveText, cycleReferenceDollars, caretOrEnd } from '../formulas/reference-pointing.ts';
import { doesEntryListTakeKey, isCaretInEntryList } from '../editor/entry-looks.ts';
import { withLineBreakAt } from '../editor/entry-lines.ts';
import { canSwitchSheetWhileEditing } from '../formulas/sheet-pointed-in.ts';
import { altCommandActOf } from './key-press.ts';
import { fontMarkOfShortcut } from '../editor/text-looks.ts';
import { isEntryExpanded } from '../editor/expanded-entry.ts';
import { MODIFIER_KEYS } from '../state/escape.ts';
export function focusMoveOfKey(keyEvent?: Dynamic) {
  if (keyEvent.isAltHeld || keyEvent.isRepeat) return null;
  if (keyEvent.key === 'F6') return keyEvent.isShiftHeld ? 'partBefore' : 'nextPart';
  return keyEvent.key === 'Escape' ? 'cells' : null;
}
export function jumpOfKey({ key: key, isModifierHeld: isModifierHeld, isAltHeld: isAltHeld }: Dynamic) {
  if (isAltHeld) return null;
  if (key === 'Home')
    return {
      kind: isModifierHeld ? 'startOfSheet' : 'startOfRow',
    };
  if (key === 'End')
    return {
      kind: isModifierHeld ? 'endOfSheet' : 'endOfRow',
    };
  let arrowMove = ARROW_KEY_MOVES[key];
  if (isModifierHeld)
    return arrowMove === undefined
      ? null
      : {
          kind: 'edgeOfData',
          ...arrowMove,
        };
  if (key === 'PageDown')
    return {
      kind: 'page',
      by: 1,
    };
  return key === 'PageUp'
    ? {
        kind: 'page',
        by: -1,
      }
    : null;
}
export function listKeyOf({ key: key, isShiftHeld: isShiftHeld }: Dynamic) {
  if (key === 'Tab') return isShiftHeld ? 'shiftTab' : 'tab';
  return key === 'Backspace' && !isShiftHeld ? 'backspace' : null;
}
export function formulaKeyActOf(mode?: Dynamic, keyEvent?: Dynamic, pointedReference?: Dynamic) {
  if (mode.kind !== 'editing' || !isFormulaText(mode.text) || keyEvent.isAltHeld) return null;
  if (mode.isBegunToListFunctions === true) return null;
  if (keyEvent.caretInEntry?.isComposing === true) return null;
  let caret = caretInEntryOf(mode, keyEvent);
  let arrowMove = ARROW_KEY_MOVES[keyEvent.key];
  if (arrowMove !== undefined && shouldArrowsMoveText(mode, caret, pointedReference))
    return {
      kind: 'pointAtCells',
      ...arrowMove,
      isToEdgeOfData: keyEvent.isModifierHeld,
      isStretching: keyEvent.isShiftHeld,
    };
  if (keyEvent.isModifierHeld || keyEvent.isShiftHeld) return null;
  if (keyEvent.key === 'F2')
    return {
      kind: 'switchArrows',
    };
  let referenceWithDollars = keyEvent.key === 'F4' ? cycleReferenceDollars(mode.text, caret) : null;
  return referenceWithDollars === null
    ? null
    : {
        kind: 'writeInEntry',
        ...referenceWithDollars,
        typingIn: mode.typingIn,
      };
}
export function popupForKey(popup: Dynamic, { key: key, isAltHeld: isAltHeld }: Dynamic) {
  if (popup === null || !isFormulaPopupYetToRest(popup)) return popup;
  if (key !== 'Enter' || isAltHeld) return null;
  return popup === 'formulaOfferYetToRest' ? 'formulaOffer' : 'formulaRead';
}
export function keyActOf(
  mode?: Dynamic,
  keyEvent?: Dynamic,
  popupOpen?: Dynamic,
  escapeDoes?: Dynamic,
  {
    sheetsToPointIn: sheetsToPointIn,
    pointedReference: pointedReference,
    viewOnlyBecause: viewOnlyBecause,
    doesEntryTakeLineBreaks: entryTakesLineBreaks,
    hasCellsToFill: hasCellsToFill,
    isSteppedOutOfCells = false,
    doesKeyOpenLinkForm = false,
  }: Dynamic = {
    sheetsToPointIn: ANY_SHEETS_TO_POINT_IN,
    pointedReference: null,
    viewOnlyBecause: null,
    doesEntryTakeLineBreaks: false,
    hasCellsToFill: false,
  },
) {
  let popup = popupForKey(popupOpen, keyEvent);
  let formulaAct = viewOnlyBecause === null ? formulaKeyActOf(mode, keyEvent, pointedReference) : null;
  let isPopupNoteOrNone = popup === null || popup === 'formulaNote';
  let lineBreakActOf = (allowsInList: Dynamic = false) => {
    if (!(mode.kind === 'editing' && entryTakesLineBreaks && doesPopupLetLineBreak(popup, allowsInList) && viewOnlyBecause === null)) return null;
    return doesEntryListTakeKey(mode, 'lineBreak', entryAtCaretOf(mode, keyEvent))
      ? {
          kind: 'actOnLists',
          key: 'lineBreak',
        }
      : {
          kind: 'writeInEntry',
          ...withLineBreakAt(mode.text, caretInEntryOf(mode, keyEvent)),
          typingIn: mode.typingIn,
        };
  };
  if (formulaAct !== null && (isPopupNoteOrNone || formulaAct.kind !== 'pointAtCells')) return formulaAct;
  let isDropdownList = popup === 'list' || popup === 'listOnRowToCard' || popup === 'listOnOption';
  let isPeopleList = popup === 'peopleList';
  let isTimeList = popup === 'timeList';
  let isUpOrDown = keyEvent.key === 'ArrowDown' || keyEvent.key === 'ArrowUp';
  if (keyEvent.isAltHeld && !keyEvent.isShiftHeld && isUpOrDown) {
    let directionOrKey = keyEvent.key === 'ArrowDown' ? 1 : -1;
    let pickedForKey = directionOrKey === 1 ? sheetsToPointIn.after : sheetsToPointIn.before;
    let keyCondition =
      (pickedForKey !== null || keyEvent.isRepeat) && canSwitchSheetWhileEditing(mode, keyEvent.caretInEntry, pickedForKey === 'entrysOwn', true);
    if (keyEvent.isModifierHeld || (mode.kind === 'editing' && !keyCondition)) return null;
    return {
      kind: 'showSheetBeside',
      by: directionOrKey,
    };
  }
  let groupAct = keyEvent.isAltHeld && keyEvent.isShiftHeld && !keyEvent.isModifierHeld ? OUTLINE_GROUP_SHORTCUTS[keyEvent.key] : undefined;
  if (groupAct !== undefined)
    return mode.kind === 'navigating' && popup === null
      ? {
          kind: 'actOnGroups',
          act: groupAct,
        }
      : null;
  let commandOfKey = altCommandActOf(keyEvent);
  if (commandOfKey !== null) return mode.kind === 'navigating' && popup === null ? COMMAND_KEY_ACTS[commandOfKey] : null;
  if (isSumKey(keyEvent))
    return (mode.kind === 'navigating' && popup === null) || keyEvent.isRepeat
      ? {
          kind: 'sumUp',
        }
      : null;
  if (keyEvent.key === 'Tab' && isSteppedOutOfCells) return null;
  if (keyEvent.key === 'F6' && !keyEvent.isAltHeld)
    return mode.kind === 'navigating'
      ? {
          kind: 'goOnOutOfGrid',
          by: keyEvent.isShiftHeld ? -1 : 1,
        }
      : null;
  let jumpTo = mode.kind === 'navigating' && popup === null ? jumpOfKey(keyEvent) : null;
  if (jumpTo !== null)
    return {
      kind: 'jump',
      to: jumpTo,
      isExtending: keyEvent.isShiftHeld,
    };
  if (keyEvent.isModifierHeld) {
    let directionOrKey = keyEvent.key.toLowerCase();
    let pickedForKey = fontMarkOfShortcut(keyEvent);
    if (pickedForKey !== undefined)
      return {
        kind: 'formatCells',
        choice: {
          toggle: pickedForKey,
        },
      };
    let keyCondition = keyEvent.isShiftHeld && !keyEvent.isAltHeld;
    let numberFormatChoice = keyCondition ? NUMBER_FORMAT_SHORTCUTS[keyEvent.key] : undefined;
    if (numberFormatChoice !== undefined)
      return {
        kind: 'formatCells',
        choice: {
          numberFormatChoice: numberFormatChoice,
        },
      };
    let alignmentOrMove = keyCondition ? ALIGNMENT_SHORTCUTS[directionOrKey] : undefined;
    if (alignmentOrMove !== undefined)
      return {
        kind: 'formatCells',
        choice: {
          horizontalAlignment: alignmentOrMove,
        },
      };
    let listKind = listKindOfShortcut(keyEvent);
    if (listKind !== undefined)
      return {
        kind: 'formatCells',
        choice: {
          list: listKind,
        },
      };
    if (mode.kind === 'editing' && keyEvent.key === 'Enter' && keyEvent.isAltHeld && !keyEvent.isShiftHeld)
      return viewOnlyBecause === null
        ? {
            kind: 'pressBoxOfLine',
          }
        : null;
    if (directionOrKey === 'k' && !keyEvent.isShiftHeld && !keyEvent.isAltHeld && doesKeyOpenLinkForm && popup === null)
      return {
        kind: 'askForLinkForm',
      };
    if (keyEvent.key === 'Enter' && keyCondition) {
      if (isEntryExpanded(mode))
        return {
          kind: 'collapseEntry',
        };
      let isFormulaEntry = mode.kind === 'editing' && isFormulaText(mode.text);
      if (popup === null && !isFormulaEntry && viewOnlyBecause === null)
        return {
          kind: 'expandEntry',
        };
    }
    if (mode.kind === 'editing' && keyEvent.key === 'Enter' && !keyEvent.isShiftHeld && !keyEvent.isAltHeld) {
      let stayPut = {
        rowDelta: 0,
        columnDelta: 0,
      };
      if (popup === 'card' || popup === 'cardOfOption')
        return {
          kind: 'takeCardRow',
          ...stayPut,
        };
      if (isDropdownList)
        return {
          kind: 'takeDropdownListRow',
          ...stayPut,
        };
      if (isPeopleList)
        return {
          kind: 'takePeopleListRow',
          ...stayPut,
        };
      if (popup === 'functionList')
        return {
          kind: 'takeFunctionListRow',
        };
      if (popup === 'formulaOffer')
        return {
          kind: 'takeFormulaOfferRow',
        };
      if (popup === 'formulaRead')
        return {
          kind: 'enterFormulaRead',
          ...stayPut,
        };
      if (popup === 'formulaAsked' || popup === 'formulaArriving')
        return {
          kind: 'waitForFormula',
        };
      if (popup === 'formulaProposed')
        return {
          kind: 'commitEdit',
          ...stayPut,
          isKeep: true,
        };
      if (popup === 'formulaToDiscard')
        return {
          kind: 'goBackToWords',
        };
      if (mode.isExpanded === true)
        return {
          kind: 'commitEdit',
          ...stayPut,
        };
      return (
        (hasCellsToFill ? null : lineBreakActOf()) ?? {
          kind: 'commitEditToSelection',
        }
      );
    }
    if (mode.kind !== 'navigating') return null;
    if (isPeopleList && (directionOrKey === 'a' || keyEvent.key === ' '))
      return {
        kind: 'stayInField',
      };
    if (directionOrKey === 'a')
      return {
        kind: 'selectTableOrAll',
      };
    if ((keyEvent.key === '`' || keyEvent.key === '~') && !keyEvent.isAltHeld)
      return {
        kind: 'showOrHideFormulas',
      };
    if (directionOrKey === 'z' && !keyEvent.isAltHeld)
      return {
        kind: 'undoOrRedo',
        direction: keyEvent.isShiftHeld ? 'redo' : 'undo',
      };
    if (directionOrKey === 'y' && !keyEvent.isAltHeld && !keyEvent.isShiftHeld)
      return {
        kind: 'undoOrRedo',
        direction: 'redo',
      };
    let isNoShiftNoAlt = !keyEvent.isShiftHeld && !keyEvent.isAltHeld;
    if (directionOrKey === 'd' && isNoShiftNoAlt)
      return {
        kind: 'fill',
        toward: 'down',
      };
    if (directionOrKey === 'r' && isNoShiftNoAlt)
      return {
        kind: 'fill',
        toward: 'right',
      };
    if (keyEvent.key === ';' && !keyEvent.isAltHeld)
      return {
        kind: 'enterToday',
      };
    if (keyEvent.key !== ' ') return null;
    return keyEvent.isShiftHeld
      ? {
          kind: 'selectAll',
        }
      : {
          kind: 'selectWhole',
          what: 'columns',
        };
  }
  let stepSign = keyEvent.isShiftHeld ? -1 : 1;
  if (keyEvent.key === 'Enter' && keyEvent.isAltHeld && mode.kind === 'editing') return lineBreakActOf(true);
  let commitMove =
    keyEvent.key === 'Enter'
      ? {
          rowDelta: stepSign,
          columnDelta: 0,
        }
      : keyEvent.key === 'Tab'
        ? {
            rowDelta: 0,
            columnDelta: stepSign,
          }
        : null;
  let isPlainRight = keyEvent.key === 'ArrowRight' && mode.kind === 'navigating' && !keyEvent.isShiftHeld && !keyEvent.isAltHeld;
  let isPlainLeft = keyEvent.key === 'ArrowLeft' && mode.kind === 'navigating' && !keyEvent.isShiftHeld && !keyEvent.isAltHeld;
  if (popup === 'card' || popup === 'cardOfOption') {
    if (isUpOrDown && !keyEvent.isShiftHeld && !keyEvent.isAltHeld)
      return {
        kind: 'moveInCard',
        by: keyEvent.key === 'ArrowDown' ? 1 : -1,
      };
    if (keyEvent.key === 'Enter' && mode.kind === 'navigating')
      return {
        kind: 'takeCardRow',
        rowDelta: 0,
        columnDelta: 0,
      };
    if (commitMove !== null)
      return {
        kind: 'takeCardRow',
        ...commitMove,
      };
    if (keyEvent.key === 'Escape' || isPlainLeft)
      return {
        kind: 'shutCard',
      };
    if (isPlainRight)
      return {
        kind: 'goIntoCard',
      };
    let directionOrKey = mode.kind === 'navigating' && (keyEvent.key === 'Delete' || keyEvent.key === 'Backspace');
    if (popup === 'cardOfOption' && directionOrKey)
      return {
        kind: 'stayInCard',
      };
  }
  if (popup === 'listOnRowToCard' && isPlainRight)
    return {
      kind: 'takeDropdownListRow',
      rowDelta: 0,
      columnDelta: 0,
    };
  if (popup === 'listOnOption' && isPlainRight)
    return {
      kind: 'openCardOfOption',
    };
  if ((popup === 'listOnRowToCard' || popup === 'listOnOption') && isPlainLeft && keyEvent.isRepeat)
    return {
      kind: 'shutCard',
    };
  let isTabFromRowToCard = popup === 'listOnRowToCard' && keyEvent.key === 'Tab';
  if (isDropdownList && !isTabFromRowToCard) {
    if (isUpOrDown && !keyEvent.isShiftHeld && !keyEvent.isAltHeld)
      return {
        kind: 'moveInDropdownList',
        by: keyEvent.key === 'ArrowDown' ? 1 : -1,
      };
    if (commitMove !== null)
      return {
        kind: 'takeDropdownListRow',
        ...commitMove,
      };
    if (keyEvent.key === 'Escape' && mode.kind === 'navigating')
      return {
        kind: 'shutList',
      };
  }
  if (isPeopleList) {
    if (isUpOrDown && !keyEvent.isShiftHeld)
      return {
        kind: 'moveInPeopleList',
        by: keyEvent.key === 'ArrowDown' ? 1 : -1,
      };
    if (commitMove !== null)
      return {
        kind: 'takePeopleListRow',
        ...commitMove,
      };
    if (keyEvent.key === 'Escape' && mode.kind === 'navigating')
      return {
        kind: 'shutList',
      };
    if (keyEvent.key === 'Backspace' && (mode.kind === 'navigating' || mode.text === ''))
      return {
        kind: 'removeFromField',
        atCaret: 'theLast',
      };
    if (mode.kind === 'navigating') {
      if (keyEvent.key === 'Delete')
        return {
          kind: 'removeFromField',
          atCaret: 'everyone',
        };
      let pickedForKey = !keyEvent.isShiftHeld && !keyEvent.isAltHeld ? FIELD_STEP_KEYS[keyEvent.key] : undefined;
      if (pickedForKey !== undefined)
        return {
          kind: 'stepInField',
          step: pickedForKey,
        };
      if (keyEvent.key === ' ')
        return {
          kind: 'stayInField',
        };
    }
  }
  if (mode.kind === 'editing') {
    if (isTimeList && isUpOrDown && !keyEvent.isShiftHeld)
      return {
        kind: 'moveInTimeList',
        by: keyEvent.key === 'ArrowDown' ? 1 : -1,
      };
    if (popup === 'functionList') {
      if (isUpOrDown && !keyEvent.isShiftHeld)
        return {
          kind: 'moveInFunctionList',
          by: keyEvent.key === 'ArrowDown' ? 1 : -1,
        };
      if (commitMove !== null)
        return {
          kind: 'takeFunctionListRow',
        };
      if (keyEvent.key === 'Escape')
        return {
          kind: 'shutFunctionList',
        };
    }
    let directionOrKey = keyEvent.key === 'ArrowDown' ? 1 : -1;
    if (popup === 'formulaOffer' || popup === 'formulaRead') {
      if (isUpOrDown && !keyEvent.isShiftHeld)
        return {
          kind: 'moveInFormulaOffer',
          by: directionOrKey,
        };
      if (keyEvent.key === 'Escape')
        return {
          kind: 'waveFormulaOfferOff',
        };
      if (keyEvent.key === 'Enter' && popup === 'formulaRead' && commitMove !== null)
        return {
          kind: 'enterFormulaRead',
          ...commitMove,
        };
      if (keyEvent.key === 'Enter')
        return {
          kind: 'takeFormulaOfferRow',
        };
      if (keyEvent.key === 'Tab')
        return {
          kind: 'waveFormulaOfferOff',
        };
    }
    if (popup === 'formulaAsked') {
      if (commitMove !== null)
        return {
          kind: 'waitForFormula',
        };
      if (keyEvent.key === 'Escape')
        return {
          kind: 'stopAskingForFormula',
        };
    }
    if (popup === 'formulaArriving' && commitMove !== null)
      return {
        kind: 'waitForFormula',
      };
    let keyCondition = popup === 'formulaArriving' || popup === 'formulaProposed' || popup === 'formulaToDiscard';
    if (keyCondition && isUpOrDown && !keyEvent.isShiftHeld)
      return {
        kind: 'moveInFormulaOffer',
        by: directionOrKey,
      };
    if (popup === 'formulaToDiscard' && commitMove !== null)
      return {
        kind: 'goBackToWords',
      };
    if (keyCondition && keyEvent.key === 'Escape')
      return {
        kind: 'goBackToWords',
      };
    if (popup === 'formulaNote' && keyEvent.key === 'Escape')
      return {
        kind: 'waveFormulaOfferOff',
      };
    let entryAtCaret = entryAtCaretOf(mode, keyEvent);
    let listKey = keyEvent.isAltHeld || viewOnlyBecause !== null ? null : listKeyOf(keyEvent);
    if (listKey !== null && doesEntryListTakeKey(mode, listKey, entryAtCaret))
      return {
        kind: 'actOnLists',
        key: listKey,
      };
    let lineBreakInList =
      keyEvent.key === 'Enter' &&
      keyEvent.isShiftHeld &&
      (isCaretInEntryList(mode, entryAtCaret) || doesEntryListTakeKey(mode, 'lineBreak', entryAtCaret))
        ? lineBreakActOf()
        : null;
    if (lineBreakInList !== null) return lineBreakInList;
    if (commitMove !== null && popup === 'formulaProposed')
      return {
        kind: 'commitEdit',
        ...commitMove,
        isKeep: true,
      };
    let lineBreakInExpanded = keyEvent.key === 'Enter' && mode.isExpanded === true ? lineBreakActOf() : null;
    if (lineBreakInExpanded !== null) return lineBreakInExpanded;
    if (keyEvent.key === 'Escape' && mode.isExpanded === true)
      return {
        kind: 'collapseEntry',
      };
    let isSumForSelection = mode.isSumForSelectedCells === true && isFormulaText(mode.text);
    if (keyEvent.key === 'Enter' && !keyEvent.isShiftHeld && isSumForSelection)
      return {
        kind: 'commitEditToSelection',
      };
    if (commitMove !== null)
      return {
        kind: 'commitEdit',
        ...commitMove,
      };
    if (popup === 'calendar' && keyEvent.key === 'ArrowDown' && !keyEvent.isShiftHeld)
      return {
        kind: 'goIntoCalendar',
      };
    let alignmentOrMove =
      !isFormulaText(mode.text) &&
      !mode.text.includes(`
`) &&
      mode.arrowsActOn === 'cells' &&
      popup === null &&
      !keyEvent.isShiftHeld &&
      !keyEvent.isAltHeld
        ? ARROW_KEY_MOVES[keyEvent.key]
        : undefined;
    if (alignmentOrMove !== undefined)
      return {
        kind: 'commitEdit',
        ...alignmentOrMove,
      };
    return keyEvent.key === 'Escape'
      ? {
          kind: 'cancelEdit',
        }
      : null;
  }
  if (keyEvent.key === 'Enter')
    return {
      kind: 'openCell',
    };
  if (keyEvent.key === 'F2')
    return {
      kind: 'startEditing',
      text: null,
    };
  if (commitMove !== null)
    return {
      kind: 'move',
      ...commitMove,
    };
  let arrowMove = ARROW_KEY_MOVES[keyEvent.key];
  if (arrowMove !== undefined)
    return {
      kind: keyEvent.isShiftHeld ? 'extendSelection' : 'move',
      ...arrowMove,
    };
  if (keyEvent.key === ' ' && keyEvent.isShiftHeld)
    return {
      kind: 'selectWhole',
      what: 'rows',
    };
  if (keyEvent.key === 'F10' && keyEvent.isShiftHeld)
    return {
      kind: 'askForMenu',
    };
  if (keyEvent.key === 'Escape' && escapeDoes === 'leaves') return null;
  if (keyEvent.key === 'Escape')
    return {
      kind: escapeDoes === 'letsGo' ? 'letGo' : 'stepOutOfCells',
    };
  if (keyEvent.key === 'Delete' || keyEvent.key === 'Backspace')
    return {
      kind: 'clearCells',
    };
  return keyEvent.key.length === String.fromCodePoint(keyEvent.key.codePointAt(0) ?? 0).length
    ? {
        kind: 'startEditing',
        text: keyEvent.key,
      }
    : null;
}
export const withDropWhatIsHeld = (state?: Dynamic) => ({
  state: state,
  effects: [
    {
      kind: 'dropWhatIsHeld',
    },
  ],
});
export const ARROW_KEY_MOVES = {
  ArrowUp: {
    rowDelta: -1,
    columnDelta: 0,
  },
  ArrowDown: {
    rowDelta: 1,
    columnDelta: 0,
  },
  ArrowLeft: {
    rowDelta: 0,
    columnDelta: -1,
  },
  ArrowRight: {
    rowDelta: 0,
    columnDelta: 1,
  },
};
export const NUMBER_FORMAT_SHORTCUTS = {
  '1': 'number',
  '2': 'time',
  '3': 'date',
  '4': 'currency',
  '5': 'percent',
  '6': 'scientific',
};
export const ALIGNMENT_SHORTCUTS = {
  l: 'left',
  e: 'center',
};
export const OUTLINE_GROUP_SHORTCUTS = {
  ArrowRight: 'group',
  ArrowLeft: 'ungroup',
  ArrowDown: 'expand',
  ArrowUp: 'collapse',
};
export const COMMAND_KEY_ACTS = {
  insertRowsOrColumns: {
    kind: 'insertOrDeleteLines',
    what: 'insert',
  },
  deleteRowsOrColumns: {
    kind: 'insertOrDeleteLines',
    what: 'delete',
  },
  clearFormatting: {
    kind: 'formatCells',
    choice: {
      clearsFormatting: true,
    },
  },
  addSheet: {
    kind: 'addSheet',
  },
};
export const LINE_EDITS_OF_COMMAND = {
  insert: {
    rows: 'insertRowAbove',
    columns: 'insertColumnLeft',
  },
  delete: {
    rows: 'deleteRows',
    columns: 'deleteColumns',
  },
};
export const isActLeftToCtrlAlt = (key?: Dynamic, act?: Dynamic) =>
  act.kind === 'jump' ||
  act.kind === 'goIntoCalendar' ||
  act.kind === 'pointAtCells' ||
  act.kind === 'switchArrows' ||
  (act.kind === 'writeInEntry' && key !== 'Enter') ||
  (ARROW_KEY_MOVES[key] !== undefined && (act.kind === 'move' || act.kind === 'extendSelection' || act.kind === 'commitEdit'));
export const movesCaretInEntry = ({ key: key, isModifierHeld: isModifierHeld }: Dynamic) =>
  (isModifierHeld && !MODIFIER_KEYS.has(key)) || ARROW_KEY_MOVES[key] !== undefined || /^(?:Home|End|PageUp|PageDown|F2)$/.test(key);
export const isSumKey = ({ key: key, isAltHeld: isAltHeld, isModifierHeld: isModifierHeld }: Dynamic) =>
  isAltHeld && !isModifierHeld && (key === '=' || key === '≠');
export const ANY_SHEETS_TO_POINT_IN = {
  before: 'another',
  after: 'another',
};
export const FIELD_STEP_KEYS = {
  ArrowLeft: 'before',
  ArrowRight: 'after',
  Home: 'first',
  End: 'caret',
};
export const caretInEntryOf = (mode: Dynamic, { caretInEntry: caretInEntry }: Dynamic) =>
  caretOrEnd(mode.kind === 'editing' ? mode.text : '', caretInEntry);
export const entryAtCaretOf = (mode: Dynamic, keyEvent: Dynamic) => ({
  ...caretInEntryOf(mode, keyEvent),
  text: mode.kind === 'editing' ? mode.text : '',
  isComposing: keyEvent.caretInEntry?.isComposing === true,
});
export const LIST_KIND_OF_DIGIT_KEY = {
  '7': 'numbered',
  Digit7: 'numbered',
  '8': 'bullet',
  Digit8: 'bullet',
  '9': 'checkbox',
  Digit9: 'checkbox',
};
export const listKindOfShortcut = ({
  key: key,
  isModifierHeld: isModifierHeld,
  isShiftHeld: isShiftHeld,
  isAltHeld: isAltHeld,
}: Dynamic) => (isModifierHeld && isShiftHeld && !isAltHeld ? LIST_KIND_OF_DIGIT_KEY[key] : undefined);
export const isKeyWritingInEntry = (mode?: Dynamic, keyEvent?: Dynamic) =>
  formulaKeyActOf(mode, keyEvent, null)?.kind === 'writeInEntry';
export const doesPopupLetLineBreak = (popup?: Dynamic, allowsInList?: Dynamic) =>
  popup === null || popup === 'formulaNote' || (allowsInList && (popup === 'functionList' || isFormulaPopupYetToRest(popup)));
export const isFormulaPopupYetToRest = (popup?: Dynamic) => popup === 'formulaOfferYetToRest' || popup === 'formulaReadYetToRest';
