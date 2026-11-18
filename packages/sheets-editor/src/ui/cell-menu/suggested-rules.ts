import { ContextMenu } from '../../kit/context-menu.tsx';
import { Menu } from '../../kit/menu.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { CommandRows } from '../menu-with-field.ts';
export function SuggestedRulesWanted({ onAsked: onAsked }: Dynamic) {
  React.useLayoutEffect(onAsked, [onAsked]);
  return null;
}
export function useRuleTryOn(suggestions?: Dynamic) {
  let triedRef = React.useRef(null);
  React.useEffect(() => () => triedRef.current?.tryOnCells(false), []);
  React.useEffect(() => {
    let tried = triedRef.current;
    if (tried === null || suggestions.some(({ id: id, gives: gives }: Dynamic) => id === tried.id && gives === tried.gives)) return;
    triedRef.current = null;
    tried.tryOnCells(false);
  });
  return {
    tryOnCells(command?: Dynamic, isOn?: Dynamic) {
      let suggestion = suggestions.find(({ id: id }: Dynamic) => id === command.id) ?? null;
      if ((triedRef.current?.id === suggestion?.id) === isOn) return;
      triedRef.current = isOn ? suggestion : null;
      suggestion?.tryOnCells(isOn);
    },
    noteTaken() {
      triedRef.current = null;
    },
  };
}
export function SuggestedRuleRows({
  heading: heading,
  suggestions: suggestions,
  openers: openers,
  isPointerCoarse: isPointerCoarse,
  onTaken: onTaken,
}: Dynamic) {
  let ruleTryOn = useRuleTryOn(suggestions);
  if (suggestions.length === 0 && openers.length === 0) return null;
  let suggestionRows = jsx(CommandRows, {
    commands: suggestions,
    isRowUnderEnterLit: true,
    isPointerCoarse: isPointerCoarse,
    describe: ({ id: id }: Dynamic) => suggestions.find((input?: Dynamic) => input.id === id)?.where ?? null,
    onPointedAt: ruleTryOn.tryOnCells,
    onTaken: (input?: Dynamic, options?: Dynamic) => {
      ruleTryOn.noteTaken();
      onTaken(input, options);
    },
  });
  let openerRows = jsx(CommandRows, {
    commands: openers,
    isRowUnderEnterLit: true,
    isPointerCoarse: isPointerCoarse,
    describe: () => null,
    onTaken: onTaken,
  });
  return jsxs(Fragment, {
    children: [
      suggestions.length > 0 &&
        jsxs(ContextMenu.Group, {
          children: [
            heading !== null &&
              jsx(Menu.GroupLabel, {
                children: heading,
              }),
            suggestionRows,
          ],
        }),
      suggestions.length > 0 && openers.length > 0 && jsx(ContextMenu.Separator, {}),
      openerRows,
    ],
  });
}
export const SuggestedRulesSubmenu = ({
  icon: icon,
  label: label,
  headingOfSuggestions: headingOfSuggestions,
  ...rowsProps
}: Dynamic) =>
  jsxs(ContextMenu.Submenu, {
    children: [
      jsx(ContextMenu.SubmenuTrigger, {
        icon: icon,
        children: label,
      }),
      jsx(ContextMenu.SubmenuPopup, {
        children: jsx(SuggestedRuleRows, {
          ...rowsProps,
          heading: rowsProps.suggestions.length > 0 ? headingOfSuggestions : null,
        }),
      }),
    ],
  });
