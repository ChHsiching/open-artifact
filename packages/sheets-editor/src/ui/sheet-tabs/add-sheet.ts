import { Menu } from '../../kit/menu.tsx';
import { Button } from '../../kit/button.tsx';
import type { Dynamic } from '../../dynamic.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { FILE_UPLOAD_ICON } from '../../import/file-sources.ts';
import { importFileChoices } from '../../import/csv-file.ts';
import { shortcutFor } from '../../keys/key-press.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { ToolbarTooltip } from '../toolbar-tooltip.ts';
import { swallowRestOfPress } from '../press-swallow.ts';
import { blockRepeatedEnterOrSpace } from '../repeated-key-guards.ts';
import { ToolbarMenu } from '../format-toolbar.ts';
export function AddSheetMenuItems({
  onBlankChosen: onBlankChosen,
  onImportChosen: onImportChosen,
}: Dynamic) {
  return jsxs(Fragment, {
    children: [
      importFileChoices.map(
        (input?: Dynamic) =>
          jsx(
            Menu.Item,
            {
              icon: FILE_UPLOAD_ICON,
              onClick: () => onImportChosen([input]),
              children: input.inMenu(),
            },
            input.accept,
          ),
      ),
      jsx(Menu.Item, {
        icon: 'File',
        shortcut: shortcutFor('addSheet'),
        onClick: onBlankChosen,
        children: sheetMessages.blankSheet(),
      }),
    ],
  });
}
export function AddSheetButton({
  button: button,
  isOpen: isOpen,
  onOpenChange: onOpenChange,
  whatHasCaretAfter: whatHasCaretAfter,
  ...menuProps
}: Dynamic) {
  let buttonProps = {
    ref: button,
    variant: 'ghost',
    iconOnly: true,
    icon: 'Add',
    className: 'sheet-add-sheet',
    'aria-label': sheetMessages.addSheet(),
    tooltip: false,
  };
  if (isAddSheetBlankOnly())
    return jsx(ToolbarTooltip, {
      name: sheetMessages.addSheet(),
      shortcut: shortcutFor('addSheet'),
      side: 'top',
      children: jsx(Button, {
        ...buttonProps,
        onClick: (event?: Dynamic) => {
          let currentTarget = event.currentTarget;
          swallowRestOfPress(event, (input?: Dynamic) => !(input instanceof Node && currentTarget.contains(input)));
          menuProps.onBlankChosen();
        },
        onKeyDownCapture: blockRepeatedEnterOrSpace,
      }),
    });
  return jsx(ToolbarMenu, {
    isOpen: isOpen,
    button: jsx(Menu.Trigger, {
      render: jsx(Button, {
        ...buttonProps,
      }),
    }),
    tooltip: sheetMessages.addSheet(),
    onOpenChange: onOpenChange,
    whatHasCaretAfter: whatHasCaretAfter,
    toolbar: button,
    side: 'top',
    placedBy: {
      align: 'start',
    },
    children: jsx(AddSheetMenuItems, {
      ...menuProps,
    }),
  });
}
export const isAddSheetBlankOnly = (imports: readonly unknown[] = importFileChoices): boolean => imports.length === 0;
