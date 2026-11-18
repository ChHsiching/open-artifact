import type { Dynamic } from '../dynamic.ts';
import { isModalOpen } from '../ui/find.ts';
export function shortcutKeysFor(act?: Dynamic) {
  let keys = KEY_SHORTCUT_ROWS.find((row?: Dynamic) => row.does === act)?.keys[0];
  if (keys === undefined) throw Error(`KEYS_LISTED has no key for ${act}.`);
  return keys;
}
export const KEYS_LISTED = [
  {
    group: 'general',
    rows: [
      {
        does: 'listKeys',
        keys: ['cmd+/'],
        isForViewersToo: true,
      },
      {
        does: 'find',
        keys: ['cmd+f'],
        isForViewersToo: true,
      },
      {
        does: 'findNext',
        keys: ['cmd+g', 'f3'],
        isForViewersToo: true,
      },
      {
        does: 'findPrevious',
        keys: ['shift+cmd+g', 'shift+f3'],
        isForViewersToo: true,
      },
      {
        does: 'findAndReplace',
        keys: ['cmd+h'],
        keysOnAMac: ['shift+cmd+h'],
      },
      {
        does: 'undo',
        keys: ['cmd+z'],
      },
      {
        does: 'redo',
        keys: ['shift+cmd+z', 'cmd+y'],
      },
      {
        does: 'showFormulas',
        keys: ['ctrl+`'],
        isForViewersToo: true,
      },
      {
        does: 'copyLinkToSheet',
        keys: ['alt+cmd+l'],
        isForViewersToo: true,
      },
      {
        does: 'comment',
        keys: ['alt+cmd+m'],
        isForViewersToo: true,
        isOnlyWithComments: true,
      },
      {
        does: 'openLink',
        keys: ['alt+enter'],
        isForViewersToo: true,
      },
      {
        does: 'openMenu',
        keys: ['shift+f10'],
        isForViewersToo: true,
      },
      {
        does: 'searchMenu',
        keys: ['alt+/'],
        isNotForAFinger: true,
      },
      {
        does: 'goToNextPart',
        keys: ['f6'],
        isForViewersToo: true,
      },
      {
        does: 'goToPartBefore',
        keys: ['shift+f6'],
        isForViewersToo: true,
      },
      {
        does: 'closeWhatIsOpen',
        keys: ['esc'],
        isForViewersToo: true,
      },
      {
        does: 'leaveCells',
        keys: ['esc tab', 'esc shift+tab'],
        isForViewersToo: true,
      },
      {
        does: 'leaveSheet',
        keys: ['esc esc'],
        isForViewersToo: true,
      },
    ],
  },
  {
    group: 'navigation',
    rows: [
      {
        does: 'moveByOneCell',
        keys: ['up+down+left+right'],
        isForViewersToo: true,
      },
      {
        does: 'moveToNextCell',
        keys: ['tab'],
        isForViewersToo: true,
      },
      {
        does: 'moveToCellBefore',
        keys: ['shift+tab'],
        isForViewersToo: true,
      },
      {
        does: 'moveToEdgeOfData',
        keys: ['cmd+up+down+left+right'],
        isForViewersToo: true,
      },
      {
        does: 'moveToStartOfRow',
        keys: ['home'],
        isForViewersToo: true,
      },
      {
        does: 'moveToEndOfRow',
        keys: ['end'],
        isForViewersToo: true,
      },
      {
        does: 'moveToStartOfSheet',
        keys: ['cmd+home'],
        isForViewersToo: true,
      },
      {
        does: 'moveToEndOfSheet',
        keys: ['cmd+end'],
        isForViewersToo: true,
      },
      {
        does: 'moveUpAScreen',
        keys: ['pageup'],
        isForViewersToo: true,
      },
      {
        does: 'moveDownAScreen',
        keys: ['pagedown'],
        isForViewersToo: true,
      },
      {
        does: 'showNextSheet',
        keys: ['alt+down'],
        isForViewersToo: true,
      },
      {
        does: 'showSheetBefore',
        keys: ['alt+up'],
        isForViewersToo: true,
      },
      {
        does: 'openOwnFilterList',
        keys: ['alt+down'],
        isForViewersToo: true,
      },
    ],
  },
  {
    group: 'selection',
    rows: [
      {
        does: 'selectMore',
        keys: ['shift+up+down+left+right'],
        isForViewersToo: true,
      },
      {
        does: 'selectToEdgeOfData',
        keys: ['shift+cmd+up+down+left+right'],
        isForViewersToo: true,
      },
      {
        does: 'selectRow',
        keys: ['shift+space'],
        isForViewersToo: true,
      },
      {
        does: 'selectColumn',
        keys: ['ctrl+space'],
        isForViewersToo: true,
      },
      {
        does: 'selectAll',
        keys: ['cmd+a'],
        isForViewersToo: true,
      },
    ],
  },
  {
    group: 'rowsColumnsAndSheets',
    rows: [
      {
        does: 'insertRowsOrColumns',
        keys: ['alt+cmd+='],
      },
      {
        does: 'deleteRowsOrColumns',
        keys: ['alt+cmd+-'],
      },
      {
        does: 'addSheet',
        keys: ['shift+f11'],
      },
    ],
  },
  {
    group: 'groups',
    rows: [
      {
        does: 'group',
        keys: ['alt+shift+right'],
      },
      {
        does: 'ungroup',
        keys: ['alt+shift+left'],
      },
      {
        does: 'expandGroup',
        keys: ['alt+shift+down'],
        isForViewersToo: true,
      },
      {
        does: 'collapseGroup',
        keys: ['alt+shift+up'],
        isForViewersToo: true,
      },
    ],
  },
  {
    group: 'editing',
    rows: [
      {
        does: 'editCell',
        keys: ['enter', 'f2'],
      },
      {
        does: 'expandCell',
        keys: ['shift+cmd+enter'],
      },
      {
        does: 'startFormula',
        keys: ['='],
      },
      {
        does: 'insertByAt',
        keys: ['@'],
      },
      {
        does: 'addLink',
        keys: ['cmd+k'],
      },
      {
        does: 'clearCells',
        keys: ['backspace', 'del'],
      },
      {
        does: 'cut',
        keys: ['cmd+x'],
      },
      {
        does: 'copy',
        keys: ['cmd+c'],
        isForViewersToo: true,
      },
      {
        does: 'paste',
        keys: ['cmd+v'],
      },
      {
        does: 'pasteValuesOnly',
        keys: ['shift+cmd+v'],
        keysOnAMac: ['shift+cmd+v', 'alt+shift+cmd+v'],
      },
      {
        does: 'fillDown',
        keys: ['cmd+d'],
      },
      {
        does: 'fillRight',
        keys: ['cmd+r'],
      },
      {
        does: 'enterToday',
        keys: ['cmd+;'],
      },
      {
        does: 'sumUp',
        keys: ['alt+='],
      },
      {
        does: 'tickCheckbox',
        keys: ['space', 'enter'],
      },
    ],
  },
  {
    group: 'typing',
    rows: [
      {
        does: 'finishAndMoveDown',
        keys: ['enter'],
      },
      {
        does: 'finishAndMoveUp',
        keys: ['shift+enter'],
      },
      {
        does: 'finishAndMoveRight',
        keys: ['tab'],
      },
      {
        does: 'finishAndMoveLeft',
        keys: ['shift+tab'],
      },
      {
        does: 'finishInAllSelected',
        keys: ['cmd+enter'],
      },
      {
        does: 'breakLine',
        keys: ['alt+enter', 'cmd+enter'],
      },
      {
        does: 'finishExpandedCell',
        keys: ['cmd+enter'],
      },
      {
        does: 'startNextListItem',
        keys: ['shift+enter'],
      },
      {
        does: 'checkBoxOfLine',
        keys: ['alt+cmd+enter'],
      },
      {
        does: 'moveCaretByArrows',
        keys: ['f2'],
      },
      {
        does: 'cancelEntry',
        keys: ['esc'],
      },
    ],
  },
  {
    group: 'typingAFormula',
    rows: [
      {
        does: 'pickCell',
        keys: ['up+down+left+right'],
      },
      {
        does: 'pickMoreCells',
        keys: ['shift+up+down+left+right'],
      },
      {
        does: 'pickCellInNextSheet',
        keys: ['alt+down'],
      },
      {
        does: 'pickCellInSheetBefore',
        keys: ['alt+up'],
      },
      {
        does: 'switchArrows',
        keys: ['f2'],
      },
      {
        does: 'turnDollars',
        keys: ['f4'],
      },
    ],
  },
  {
    group: 'formatting',
    rows: [
      {
        does: 'bold',
        keys: ['cmd+b'],
      },
      {
        does: 'italic',
        keys: ['cmd+i'],
      },
      {
        does: 'underline',
        keys: ['cmd+u'],
      },
      {
        does: 'strikethrough',
        keys: ['shift+cmd+x'],
      },
      {
        does: 'alignLeft',
        keys: ['shift+cmd+l'],
      },
      {
        does: 'alignCenter',
        keys: ['shift+cmd+e'],
      },
      {
        does: 'numberedList',
        keys: ['shift+cmd+7'],
      },
      {
        does: 'bulletedList',
        keys: ['shift+cmd+8'],
      },
      {
        does: 'checklist',
        keys: ['shift+cmd+9'],
      },
      {
        does: 'clearFormatting',
        keys: ['cmd+\\'],
      },
    ],
  },
  {
    group: 'numberFormats',
    rows: [
      {
        does: 'formatAsNumber',
        keys: ['ctrl+shift+1'],
      },
      {
        does: 'formatAsTime',
        keys: ['ctrl+shift+2'],
      },
      {
        does: 'formatAsDate',
        keys: ['ctrl+shift+3'],
      },
      {
        does: 'formatAsCurrency',
        keys: ['ctrl+shift+4'],
      },
      {
        does: 'formatAsPercent',
        keys: ['ctrl+shift+5'],
      },
      {
        does: 'formatAsScientific',
        keys: ['ctrl+shift+6'],
      },
    ],
  },
];
export const KEY_SHORTCUT_ROWS = KEYS_LISTED.flatMap(({ rows: rows }: Dynamic) => rows);
export const openListOfKeys = (view?: Dynamic) =>
  isModalOpen(view) || view.dragging !== null
    ? view
    : {
        ...view,
        menu: null,
        isListOfKeysOpen: true,
      };
