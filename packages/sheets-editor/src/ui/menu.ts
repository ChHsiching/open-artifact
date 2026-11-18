import type { Dynamic } from '../dynamic.ts';
import { scrollToShowSelection } from '../selection/model.ts';
import { cellEndCornerOnScreen, hitTestGrid } from '../grid/geometry.ts';
import { layoutOfView } from '../grid/layout.ts';
import { withNoEffects } from '../state/transitions.ts';
import { endEntryOnPointerPress } from '../editor/commit-entry.ts';
import { selectionAtPointer, pressOnGrid } from '../selection/pointer.ts';
import { isPointerTargetSelected, withoutOtherRanges } from '../selection/several-ranges.ts';
import { sortColumnsPointedAtOf } from './sort-menu.ts';
import { dropdownSelectionSummary } from '../chips/dropdown-editor.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function openContextBarMenu(state: PageState, workbook: ReadsWithTextMeasurer, point: Dynamic, { height: height, isByKey: isByKey }: Dynamic) {
  if (state.mode.kind === 'editing') return state;
  let activeCellPosition = workbook.positionOfCell(state.activeCell);
  let shownState = activeCellPosition === null ? state : scrollToShowSelection(state, workbook);
  let pointAbove = {
    x: point.x,
    y: point.y - MENU_POINTER_GAP,
  };
  let place =
    activeCellPosition === null
      ? menuPlaceNear(state, pointAbove, height + 2 * MENU_POINTER_GAP)
      : {
          at: cellEndCornerOnScreen(activeCellPosition, shownState, layoutOfView(shownState, workbook), shownState),
          side: null,
        };
  return {
    ...shownState,
    contextBarMenu: null,
    menu: {
      ...place,
      isAskedByKey: isByKey,
      holds: 'all',
      isOfContextBar: true,
    },
  };
}
export function openMenuAtActiveCell(state: PageState, workbook: ReadsWithTextMeasurer, menu?: Dynamic) {
  let activeCellPosition = workbook.positionOfCell(state.activeCell);
  if (activeCellPosition === null) return state;
  let shownState = scrollToShowSelection(state, workbook);
  let cornerOnScreen = cellEndCornerOnScreen(activeCellPosition, shownState, layoutOfView(shownState, workbook), shownState);
  return {
    ...shownState,
    contextBarMenu: null,
    menu: {
      at: cornerOnScreen,
      side: null,
      isAskedByKey: false,
      isOfContextBar: true,
      ...menu,
    },
  };
}
export function openContextMenu(state: PageState, point: Dynamic, workbook: ReadsWithTextMeasurer, isToSearch: Dynamic = false) {
  let isEditing = state.mode.kind === 'editing';
  let stateWithoutDragging = {
    ...state,
    dragging: null,
  };
  if (point === null) {
    let value = workbook.positionOfCell(state.activeCell);
    if (value === null || isEditing) return withNoEffects(state);
    let shownState = scrollToShowSelection(stateWithoutDragging, workbook);
    return withNoEffects({
      ...shownState,
      menu: {
        at: cellEndCornerOnScreen(value, shownState, layoutOfView(shownState, workbook), shownState),
        side: null,
        isAskedByKey: !isToSearch,
        holds: 'all',
        ...(isToSearch && {
          isToSearch: isToSearch,
        }),
      },
    });
  }
  let pointedAt = hitTestGrid(point, state, layoutOfView(state, workbook));
  if (pointedAt === null) return withNoEffects(state);
  if (isEditing) return endEntryOnPointerPress(state, workbook, selectionAtPointer(state, workbook, point));
  let menu = {
    at: point,
    side: null,
    isAskedByKey: false,
    holds: 'all',
  };
  if (isPointerTargetSelected(state, pointedAt, workbook)) {
    let value = sortColumnsPointedAtOf(state, workbook, pointedAt);
    return withNoEffects({
      ...stateWithoutDragging,
      menu: {
        ...menu,
        sortColumnsPointedAt: value,
      },
    });
  }
  let { state: pressedState, effects: effects } = pressOnGrid(
    withoutOtherRanges(state),
    {
      ...point,
      isShiftHeld: false,
    },
    workbook,
  );
  return {
    state: {
      ...pressedState,
      dragging: null,
      menu: menu,
    },
    effects: effects,
  };
}
export const menuPlaceNear = ({ gridHeight: gridHeight }: Dynamic, point?: Dynamic, height?: Dynamic) =>
  point.y > gridHeight / 2
    ? {
        at: point,
        side: 'top',
      }
    : {
        at: {
          x: point.x,
          y: point.y + height,
        },
        side: 'bottom',
      };
export const withSetMeetsInMenu = (state: PageState, workbook: ReadsWithTextMeasurer) =>
  state.menu?.holds !== 'all' || state.menu.setMeets !== undefined
    ? state
    : {
        ...state,
        menu: {
          ...state.menu,
          setMeets: dropdownSelectionSummary(state, workbook),
        },
      };
export const MENU_POINTER_GAP = 6;
export const openMenuWith = (state: PageState, workbook: ReadsWithTextMeasurer, menu?: Dynamic, menuChange?: Dynamic) =>
  menu === null
    ? openMenuAtActiveCell(state, workbook, menuChange)
    : {
        ...state,
        menu: {
          ...menu,
          ...menuChange,
        },
      };
