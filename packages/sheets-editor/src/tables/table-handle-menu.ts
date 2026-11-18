import type { Dynamic } from '../dynamic.ts';
import { tableHandles } from '../selection/move-cells.ts';
import { tablesToOutline } from './tables-in-view.ts';
import { ROW_HEADER_WIDTH } from '../grid/cell-metrics-values.ts';
import { COLUMN_HEADER_HEIGHT } from '../grid/cell-metrics.ts';
import { menuPlaceNear } from '../ui/menu.ts';
import { keyActOf } from '../keys/key-acts.ts';
import { NAVIGATING_MODE } from '../state/transitions.ts';
import type { PageState } from '../state/initial-state.ts';
export function markDriftFromTableHandle(state: PageState, pointer?: Dynamic) {
  let { dragging: dragging } = state;
  return dragging?.kind === 'movingCells' &&
    dragging.press.onHandleOfTable !== undefined &&
    dragging.hasDriftedFromHandle !== true &&
    Math.hypot(pointer.x - dragging.press.x, pointer.y - dragging.press.y) >= TABLE_HANDLE_DRIFT_PX / state.zoom
    ? {
        ...state,
        dragging: {
          ...dragging,
          hasDriftedFromHandle: true,
        },
      }
    : state;
}
export function openTableHandleMenu(state: PageState, tableKey: Dynamic, { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic) {
  let handle = tableHandles(tablesToOutline(state, reads), state, reads, refusalOfEveryEdit !== null).find(
    ({ table: table }: Dynamic) => table.key === tableKey,
  );
  if (handle === undefined) return state;
  let place = {
    x: ROW_HEADER_WIDTH + (handle.isOverRowNumbers ? 0 : handle.left),
    y: COLUMN_HEADER_HEIGHT + handle.top - TABLE_HANDLE_MENU_INSET,
  };
  return {
    ...state,
    menu: {
      ...menuPlaceNear(state, place, handle.height + 2 * TABLE_HANDLE_MENU_INSET),
      isAskedByKey: false,
      holds: 'all',
      ofHandleOfTable: tableKey,
    },
  };
}
export function keyTargetAtTableMenu(keyEvent?: Dynamic, whatElseIsOpen?: Dynamic) {
  let act = keyActOf(NAVIGATING_MODE, keyEvent, null, 'leaves');
  if (act?.kind === 'startEditing' && act.text !== null && act.text !== ' ') return 'cells';
  return (keyEvent.key === 'ArrowUp' && whatElseIsOpen !== 'other') || (keyEvent.key === 'End' && whatElseIsOpen === 'none') ? 'nobody' : 'menu';
}
export const TABLE_HANDLE_MENU_INSET = 4;
export const TABLE_HANDLE_DRIFT_PX = 5;
export const tableHandleClicked = ({ press: press, landing: landing, hasDriftedFromHandle: hasDriftedFromHandle }: Dynamic) =>
  landing === null && hasDriftedFromHandle !== true ? (press.onHandleOfTable ?? null) : null;
export const doesEventCloseTableHandleMenu = ({ menu: menu }: Dynamic, event?: Dynamic) =>
  menu?.ofHandleOfTable !== undefined &&
  menu.holds === 'all' &&
  (event.kind === 'cutChosen' ||
    event.kind === 'pasteChosen' ||
    event.kind === 'chartPasteChosen' ||
    (event.kind === 'editTextChanged' && event.typingIn === 'cell' && (event.text === ' ' || event.text === '　')) ||
    (event.kind === 'keyPressed' && keyTargetAtTableMenu(event, 'none') !== 'cells'));
