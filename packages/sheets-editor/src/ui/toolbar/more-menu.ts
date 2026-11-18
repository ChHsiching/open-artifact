import { Menu } from '../../kit/menu.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { formatToggleShortcut, FontSizeSubmenu, barSubmenu, AlignMenuItems, TextWrappingSubmenu } from './text-menus.ts';
import { textStyleLabel, sheetMessages } from '../../i18n/sheet-messages.ts';
import { MenuItemWithWhyOff } from '../menu-item-why-off.ts';
import { whyNoDecimalStep } from './decimal-places.ts';
import { swallowRestOfPress } from '../press-swallow.ts';
import { CONDITIONAL_FORMATTING_WORDS } from '../../messages/conditional-format.ts';
import { CHART_MESSAGES } from '../../charts/chart-words.ts';
import { toolUnavailableText } from '../../i18n/chip-labels.ts';
export function splitMoreMenuTools(folded?: Dynamic, menuTools?: Dynamic, isFontSizeUnderAlign?: Dynamic, leftOut: Dynamic = []) {
  return {
    ofSelection: folded.flatMap((tool?: Dynamic) => {
      if (isInsertOrChipTool(tool)) return [];
      return !isFoldableTool(tool) || menuTools.includes(tool) ? [tool] : [];
    }),
    others: menuTools.filter(
      (tool?: Dynamic) =>
        !folded.some((foldedTool?: Dynamic) => foldedTool === tool) &&
        !(tool === 'fontSize' && isFontSizeUnderAlign) &&
        !leftOut.includes(tool),
    ),
  };
}
export function isMoreMenuEmpty({
  folded: folded,
  withButton: withButton,
  isFontSizeUnderAlign: isFontSizeUnderAlign,
  format: { decimalPlaces: decimalPlaces },
  canUnmergeSelection: canUnmergeSelection,
  whyNoMerge: whyNoMerge,
}: Dynamic) {
  let { ofSelection: ofSelection, others: others } = splitMoreMenuTools(
    folded,
    foldedToolsOf(withButton, {
      canMerge: whyNoMerge === null,
      canUnmerge: canUnmergeSelection,
    }),
    isFontSizeUnderAlign,
    toolsLeftOutOfMoreMenu(decimalPlaces, whyNoMerge),
  );
  return hasAllInsertTools(withButton) && ofSelection.length === 0 && others.length === 0;
}
export function renderMoreMenu(
  {
    folded: folded,
    rowWhileFolded: rowWhileFolded,
    withButton: withButton,
    isFontSizeUnderAlign: isFontSizeUnderAlign,
    format: { shared: shared, togglesOn: togglesOn, decimalPlaces: decimalPlaces },
    canUnmergeSelection: canUnmergeSelection,
    whyNoMerge: whyNoMerge,
    onFormatChosen: onFormatChosen,
    onMergeChangeChosen: onMergeChangeChosen,
    onPickerAsked: onPickerAsked,
    inserts: inserts,
    onInsertChosen: onInsertChosen,
    whyNoChart: whyNoChart,
    onSheetMenuAsked: onSheetMenuAsked,
  }: Dynamic,
  leftOut?: Dynamic,
) {
  let toggleItem = (toggle?: Dynamic) =>
    jsx(Menu.Item, {
      checked: togglesOn[toggle],
      shortcut: formatToggleShortcut(toggle),
      onClick: () =>
        onFormatChosen({
          toggle: toggle,
        }),
      children: textStyleLabel(toggle),
    });
  let mergeItem = (change?: Dynamic, whyOff?: Dynamic) =>
    jsx(MenuItemWithWhyOff, {
      disabled: whyOff !== null,
      whyOff: whyOff,
      onClick: () => onMergeChangeChosen(change),
      children: sheetMessages[change](),
    });
  let decimalPlacesItem = (step?: Dynamic) =>
    jsx(MenuItemWithWhyOff, {
      keepOpen: true,
      disabled: decimalPlaces[step] === null,
      whyOff: whyNoDecimalStep(step, decimalPlaces),
      onClick: () =>
        onFormatChosen({
          stepOfDecimalPlaces: step,
        }),
      children: step === 'more' ? sheetMessages.increaseDecimalPlaces() : sheetMessages.decreaseDecimalPlaces(),
    });
  let pickerItem = (tool?: Dynamic, label?: Dynamic, whyOff: Dynamic = null) =>
    jsx(MenuItemWithWhyOff, {
      disabled: whyOff !== null,
      whyOff: whyOff,
      onClick: (event?: Dynamic) => {
        swallowRestOfPress(event);
        onPickerAsked(tool, event.detail === 0);
      },
      children: label,
    });
  let itemOfTool = (tool?: Dynamic) => {
    switch (tool) {
      case 'fontSize':
        return jsx(FontSizeSubmenu, {
          shared: shared,
          onChosen: onFormatChosen,
          hasIcon: false,
        });
      case 'bold':
      case 'italic':
      case 'underline':
      case 'strikethrough':
        return toggleItem(tool);
      case 'align':
        return jsxs(Fragment, {
          children: [
            barSubmenu(
              sheetMessages.align(),
              null,
              jsx(AlignMenuItems, {
                shared: shared,
                onChosen: onFormatChosen,
                hasRowsWithLists: false,
              }),
            ),
            isWrapTextNowhere(folded, withButton) &&
              jsx(TextWrappingSubmenu, {
                shared: shared,
                onChosen: onFormatChosen,
                hasIcon: false,
              }),
          ],
        });
      case 'textColor':
        return pickerItem(tool, sheetMessages.textColor());
      case 'fillColor':
        return pickerItem(tool, sheetMessages.cellColor());
      case 'borders':
        return pickerItem(tool, sheetMessages.borders());
      case 'mergeCells':
        return mergeItem(tool, whyNoMerge);
      case 'unmergeCells':
        return mergeItem(tool, null);
      case 'conditionalFormatting':
        return pickerItem(tool, CONDITIONAL_FORMATTING_WORDS.conditionalFormatting());
      case 'chart':
        return pickerItem(tool, CHART_MESSAGES.insertChart(), whyNoChart);
      case 'fewerDecimalPlaces':
        return decimalPlacesItem('fewer');
      case 'moreDecimalPlaces':
        return decimalPlacesItem('more');
    }
  };
  let { ofSelection: ofSelection, others: others } = splitMoreMenuTools(
    folded,
    foldedToolsOf(withButton, {
      canMerge: whyNoMerge === null,
      canUnmerge: canUnmergeSelection,
    }),
    isFontSizeUnderAlign,
    leftOut,
  );
  return jsxs(Fragment, {
    children: [
      [ofSelection, others].map(
        (tools?: Dynamic, index?: Dynamic) =>
          tools.length > 0 &&
          jsxs(
            React.Fragment,
            {
              children: [
                tools.map(
                  (tool?: Dynamic) =>
                    jsx(
                      React.Fragment,
                      {
                        children: isFoldableTool(tool)
                          ? itemOfTool(tool)
                          : tool === 'wrapText'
                            ? jsx(TextWrappingSubmenu, {
                                shared: shared,
                                onChosen: onFormatChosen,
                                hasIcon: false,
                              })
                            : rowWhileFolded(tool),
                      },
                      tool,
                    ),
                ),
                jsx(Menu.Separator, {}),
              ],
            },
            index === 0 ? 'ofSelection' : 'others',
          ),
      ),
      !hasAllInsertTools(withButton) &&
        jsxs(Fragment, {
          children: [
            barSubmenu(
              sheetMessages.insert(),
              null,
              jsx(Fragment, {
                children: inserts.map(
                  ({ what: what, icon: icon, label: label, fits: fits, whyNotNow: whyNotNow }: Dynamic) =>
                    jsx(
                      MenuItemWithWhyOff,
                      {
                        icon: icon,
                        disabled: !fits || whyNotNow !== undefined,
                        whyOff: fits ? (whyNotNow ?? null) : toolUnavailableText(label),
                        onClick: () => onInsertChosen(what),
                        children: label,
                      },
                      what,
                    ),
                ),
              }),
            ),
            jsx(Menu.Separator, {}),
          ],
        }),
      jsx(Menu.Item, {
        onClick: (event?: Dynamic) => {
          swallowRestOfPress(event);
          onSheetMenuAsked(event.detail === 0);
        },
        children: sheetMessages.moreActions(),
      }),
    ],
  });
}
export function MoreToolsMenu(props?: Dynamic) {
  let [leftOut] = React.useState(() => toolsLeftOutOfMoreMenu(props.format.decimalPlaces, props.whyNoMerge));
  return renderMoreMenu(props, leftOut);
}
export const TOOLS_WITH_PICKERS = ['textColor', 'fillColor', 'borders', 'conditionalFormatting', 'chart'];
export const submenuOrWhyOff = (label?: Dynamic, whyOff?: Dynamic, content?: Dynamic) =>
  whyOff === null
    ? barSubmenu(label, null, content)
    : jsx(MenuItemWithWhyOff, {
        disabled: true,
        whyOff: whyOff,
        children: label,
      });
export const CHIP_FORMAT_TOOLS = {
  asDropdown: true,
  asCheckbox: true,
};
export const INSERT_TOOLS = {
  insertDropdown: true,
  insertPerson: true,
  insertDate: true,
  insertCheckbox: true,
};
export const hasAllInsertTools = (tools?: Dynamic) =>
  Object.keys(INSERT_TOOLS).every((insertTool?: Dynamic) => tools.some((tool?: Dynamic) => tool === insertTool));
export const FOLDABLE_TOOLS = [
  'fontSize',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'align',
  'textColor',
  'fillColor',
  'borders',
  'conditionalFormatting',
  'chart',
  'fewerDecimalPlaces',
  'moreDecimalPlaces',
  'mergeCells',
  'unmergeCells',
];
export const foldedToolsOf = (withButton: Dynamic, { canMerge: canMerge, canUnmerge: canUnmerge }: Dynamic) =>
  FOLDABLE_TOOLS.filter((tool?: Dynamic) => {
    if (tool === 'mergeCells' && canUnmerge) return canMerge;
    if (tool === 'unmergeCells' && !canUnmerge) return false;
    return !withButton.includes(tool === 'strikethrough' ? 'underline' : tool);
  });
export const isFoldableTool = (tool?: Dynamic) => FOLDABLE_TOOLS.some((foldable?: Dynamic) => foldable === tool);
export const isInsertOrChipTool = (tool?: Dynamic) => tool in INSERT_TOOLS || tool in CHIP_FORMAT_TOOLS;
export const toolsLeftOutOfMoreMenu = ({ whyNeither: whyNeither }: Dynamic, whyNoMerge?: Dynamic) => [
  ...(whyNeither === 'noNumbers' || whyNeither === 'dropdownOrCheckbox' ? ['fewerDecimalPlaces', 'moreDecimalPlaces'] : []),
  ...(whyNoMerge === null ? [] : ['mergeCells']),
];
export const isWrapTextNowhere = (folded?: Dynamic, withButton?: Dynamic) =>
  !folded.includes('wrapText') && !withButton.includes('wrapText');
