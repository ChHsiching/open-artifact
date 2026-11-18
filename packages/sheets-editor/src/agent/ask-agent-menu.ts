import { ContextMenu } from '../kit/context-menu.tsx';
import { AgentMark } from '../kit/agent-mark.tsx';
import type { Dynamic } from '../dynamic.ts';
import { hasUnshownCharacters, cleanAskWords } from './chat-with-agent.ts';
import { errorExplanationWords } from '../messages/formula-errors.ts';
import { fixErrorsLabel } from '../i18n/change-labels.ts';
import { ASK_AGENT_TO_FIX_LABEL } from '../formulas/fix/errors-offer.ts';
import { isMenuHoldingField } from '../state/transitions.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { MenuItemWithWhyOff } from '../ui/menu-item-why-off.ts';
import { oneRangeNeededText } from '../i18n/notice-labels.ts';
import { filterMessages } from '../tables/filter-messages.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
export function errorsToTellAgent(errorsOfSelection?: Dynamic, canEdit?: Dynamic) {
  if (errorsOfSelection === null) return {};
  let errors = errorsOfSelection.errors.map(({ cell: cell, reason: { code: code, tell: tell } }: Dynamic) => {
    let why = tell !== null && hasUnshownCharacters(JSON.stringify(tell)) ? null : tell;
    let explanation = cleanAskWords(
      errorExplanationWords(
        {
          code: code,
          tell: why,
        },
        canEdit,
      ),
    );
    return {
      cell: cell,
      error: code,
      why: why,
      explanation: explanation,
    };
  });
  let bytesOf = (count?: Dynamic) => new (TextEncoder as Dynamic)().encode(JSON.stringify(errors.slice(0, count))).length;
  let keptCount: Dynamic = errors.length;
  while (keptCount > 0 && bytesOf(keptCount) > MAX_ERRORS_BYTES_FOR_AGENT) keptCount -= 1;
  let leftOutCount = errorsOfSelection.leftOut + errors.length - keptCount;
  return {
    errors: errors.slice(0, keptCount),
    ...(leftOutCount === 0
      ? {}
      : {
          errorsLeftOut: leftOutCount,
        }),
  };
}
export function askAgentToFixSelection(chat?: Dynamic, controller?: Dynamic) {
  let { selectionByAddress: selectionByAddress, viewOnlyBecause: viewOnlyBecause } = controller.getView();
  if (selectionByAddress === null) return Promise.resolve(false);
  return chat.openWithWhatWasPressed(
    fixErrorsLabel(controller.errorCountInSelection()),
    selectionByAddress,
    ASK_AGENT_TO_FIX_LABEL,
    errorsToTellAgent(controller.errorsToTellOfSelection(), viewOnlyBecause !== 'readOnly'),
  );
}
export function askAgentAboutSelection(chat?: Dynamic, controller?: Dynamic, mayAskToFix?: Dynamic) {
  let view = controller.getView();
  let selectionByAddress = view.selectionByAddress;
  if (selectionByAddress === null) return Promise.resolve(false);
  return mayAskToFix && view.viewOnlyBecause !== 'readOnly' && doesSelectionShowError(view) && !controller.isEventUnfinished()
    ? askAgentToFixSelection(chat, controller)
    : chat.openAboutCells(selectionByAddress).then(() => false);
}
export function askFixInPlace(controller?: Dynamic, cardOf?: Dynamic) {
  if (controller.getView().noticeOfNoFix !== null)
    controller.dispatch({
      kind: 'noticeOfNoFixPutAway',
    });
  controller.dispatch({
    kind: 'fixInPlaceAsked',
    cardOf: cardOf,
  });
  let { formulaFromWords: formulaFromWords, noticeOfNoFix: noticeOfNoFix } = controller.getView();
  return controller.isEventUnfinished() || formulaFromWords.stage?.kind === 'asked' || noticeOfNoFix !== null;
}
export function askFixFromMenu(controller?: Dynamic, closeMenu?: Dynamic) {
  let { menu: menu } = controller.getView();
  if (menu === null || isMenuHoldingField(menu)) return;
  closeMenu();
  if (!controller.isEventUnfinished()) askFixInPlace(controller, null);
}
export function askFixesOfSelectedCellsFromMenu(controller?: Dynamic, closeMenu?: Dynamic) {
  let { menu: menu } = controller.getView();
  if (menu === null || isMenuHoldingField(menu)) return false;
  closeMenu();
  if (controller.isEventUnfinished()) return false;
  controller.dispatch({
    kind: 'fixesOfSelectedCellsAsked',
  });
  return true;
}
export function fixOfferInMenu(view?: Dynamic, access?: Dynamic) {
  if (!access.canPersonEdit) return null;
  if (view.canActiveCellBeFixedHere) return 'ofActiveCell';
  let fixesOfSelectedCells = view.selectionByAddress === null ? null : view.fixesOfSelectedCells;
  if (fixesOfSelectedCells === 'offered') return 'ofSelectedCells';
  return (view.isFixOfActiveCellYetToBeKnown || fixesOfSelectedCells === 'undecided') && !(view.doesFixWaitForCalculation && access.isChatToBeHad)
    ? 'yetToBeKnown'
    : null;
}
export function AskAgentMenuItems({
  isIn: isIn,
  isMenuOfContextBar: isMenuOfContextBar,
  canAttach: canAttach,
  isOneRangeNeeded: isOneRangeNeeded,
  isCutByOwnFilters: isCutByOwnFilters,
  doCellsShowError: doCellsShowError,
  isPointerCoarse: isPointerCoarse,
  isCommentNext = false,
  isUnderEnter = false,
  onAsked: onAsked,
  onFixAsked = null,
  isFixYetToBeKnown = false,
}: Dynamic) {
  if (!isIn || isMenuOfContextBar) return null;
  let canAsk = !isFixYetToBeKnown && (canAttach || onFixAsked !== null);
  let label = askAgentMenuLabel(doCellsShowError);
  return jsxs(Fragment, {
    children: [
      jsx(MenuItemWithWhyOff, {
        icon: jsx(AgentMark, {
          size: ASK_AGENT_ICON_SIZE,
          ...(!canAsk && {
            color: 'currentColor',
          }),
        }),
        disabled: !canAsk,
        ...(!canAsk &&
          !isOneRangeNeeded && {
            'data-keeps-highlight': '',
          }),
        whyOff: isOneRangeNeeded
          ? oneRangeNeededText('askAgent')
          : isCutByOwnFilters && !isFixYetToBeKnown
            ? filterMessages.filterCutsCellsForAgent()
            : null,
        isPointerCoarse: isPointerCoarse,
        ...(isUnderEnter && {
          className: 'sheet-row-under-enter',
        }),
        onClick: onFixAsked ?? (() => onAsked(doCellsShowError)),
        children: onFixAsked === null && !isFixYetToBeKnown ? label : sheetMessages.fixWithAgent(),
      }),
      !isCommentNext && jsx(ContextMenu.Separator, {}),
    ],
  });
}
export const CLOSED_MENU_ITEM_LATCH = {
  isMenuOpen: false,
  isIn: false,
};
export const latchMenuItemWhileOpen = (latch?: Dynamic, isMenuOpen?: Dynamic, isInNow?: Dynamic, isInBefore?: Dynamic) =>
  isMenuOpen === latch.isMenuOpen
    ? latch
    : {
        isMenuOpen: isMenuOpen,
        isIn: isMenuOpen ? (isInNow ?? isInBefore) : latch.isIn,
      };
export const doesSelectionShowError = ({
  errorOfActiveCell: errorOfActiveCell,
  selectedRange: selectedRange,
  calculating: calculating,
}: Dynamic) =>
  calculating !== 'wrong' && errorOfActiveCell?.code !== '#TIMEOUT!' && (errorOfActiveCell !== null || selectedRange?.summary?.kind === 'errors');
export const MAX_ERRORS_BYTES_FOR_AGENT = 3000;
export const askAgentMenuLabel = (doCellsShowError?: Dynamic) =>
  doCellsShowError ? sheetMessages.askAgentToFix() : sheetMessages.askAgentAboutCells();
export const ASK_AGENT_ICON_SIZE = 16;
