/**
 * With Sources open, the page's source marks (numbers, charts, tables) show
 * where they come from: a click on one opens its source in the panel with
 * the cell it shows; Esc clears that focus. Controls (filters, links,
 * buttons) keep working.
 */

import { announce } from '@open-artifact/editor-kit';
import { resolveTableAddress, type SourceAddress } from '@open-artifact/data-core';
import { currentPage, markOf } from '../page/runtime.ts';
import { getMarkedSourceIds } from '../page/sources.ts';
import { getShownInputs } from '../state/shown.ts';
import { pickSource, setHoveredMark, useSourcesUi, type SourcePick } from '../state/sources-ui.ts';
import { maybeDataEngine } from '../data/engine.ts';
import { SOURCE_STOP_ATTRIBUTE } from '../edit/source-rules.ts';
import { showingSourceMessage } from './words.ts';

const CONTROLS = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable=""], [contenteditable="true"]';

/** The source pick a page element makes (its mark's source and cell, if it names one), or `null`. */
export function pickOf(target: EventTarget | null): SourcePick | null {
  if (!(target instanceof Element)) return null;
  const mark = markOf(target);
  if (mark === null) return null;
  if (mark.focus === null) {
    const page = currentPage();
    const id = page === null ? undefined : getMarkedSourceIds(mark.element).find(page.isKnownSource);
    return id === undefined ? null : { id };
  }
  const { address, shown, scaled } = mark.focus;
  const { source, field } = address;
  const row = address.row ?? rowOfWhere(address);
  return {
    id: source,
    ...(row === undefined ? {} : { row }),
    ...(field === undefined ? {} : { field }),
    ...(address.where === undefined ? {} : { where: address.where.map((part) => part.value) }),
    ...(shown === '' ? {} : { shown }),
    ...(scaled === true ? { scaled } : {}),
  };
}

/** The one row a `data-where` address names in its source's loaded table. */
function rowOfWhere(address: SourceAddress): number | undefined {
  if (address.where === undefined || address.where.length === 0) return undefined;
  const table = maybeDataEngine()?.getTable(address.source) ?? null;
  if (table === null) return undefined;
  const resolution = resolveTableAddress(address, table);
  return resolution.status === 'ok' && resolution.rowIndexes.length === 1 ? resolution.rowIndexes[0] : undefined;
}

const samePick = (left: SourcePick | null, right: SourcePick): boolean =>
  left !== null && left.id === right.id && left.row === right.row && left.field === right.field;

let pickedElement: Element | null = null;

/** Picks the source a page element shows, opening Sources on it; false when it shows none. */
export function pickSourceOf(target: Element): boolean {
  const pick = pickOf(target);
  if (pick === null) return false;
  pickedElement = markOf(target)?.element ?? null;
  pickSource(pick);
  const name = maybeDataEngine()?.getDataset(pick.id)?.title || pick.id;
  announce(showingSourceMessage(name));
  return true;
}

/** The page element that shows `pick`: the one picked when it still does, else the first that does. */
export function findPickedMark(root: Element, pick: SourcePick): Element | null {
  if (pickedElement?.isConnected === true && root.contains(pickedElement) && samePick(pickOf(pickedElement), pick)) return pickedElement;
  for (const element of root.querySelectorAll('[data-source]')) if (samePick(pickOf(element), pick)) return element;
  if (pick.row === undefined && pick.field === undefined) return null;
  for (const element of root.querySelectorAll('[data-source]')) if (pickOf(element)?.id === pick.id) return element;
  return null;
}

/** What selected text shows from its sources: opens that source, or `null` when it shows none. */
export function rangeData(range: Range): (() => void) | null {
  const common = range.commonAncestorContainer;
  const element = common instanceof Element ? common : common.parentElement;
  if (element === null) return null;
  const candidates = [element, ...[...element.querySelectorAll('[data-source]')].filter((inner) => range.intersectsNode(inner))];
  const target = candidates.find((candidate) => pickOf(candidate) !== null);
  return target === undefined ? null : () => void pickSourceOf(target);
}

const picking = (): boolean => {
  const inputs = getShownInputs();
  return useSourcesUi.getState().open && !inputs.commenting && !inputs.editing;
};

/** Starts picking sources from the page while Sources is open. Returns a stop function. */
export function startSourcePicking(): () => void {
  const click = (event: MouseEvent): void => {
    if (event.button !== 0 || event.defaultPrevented || !picking()) return;
    if (!(event.target instanceof Element) || !pickSourceOf(event.target)) return;
    if (event.target.closest(CONTROLS) === null) event.preventDefault();
  };
  let frame = 0;
  const move = (event: PointerEvent): void => {
    if (!picking()) return;
    const { target } = event;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const next = pickOf(target);
      const now = useSourcesUi.getState().hovered;
      if (next?.id !== now?.id || next?.row !== now?.row || next?.field !== now?.field) setHoveredMark(next);
    });
  };
  const key = (event: KeyboardEvent): void => {
    if ((event.key === 'Enter' || event.key === ' ') && picking() && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const { target } = event;
      if (target instanceof Element && target.hasAttribute(SOURCE_STOP_ATTRIBUTE) && pickSourceOf(target)) event.preventDefault();
      return;
    }
    if (event.key !== 'Escape' || event.defaultPrevented || !useSourcesUi.getState().open) return;
    if (useSourcesUi.getState().pick === null || document.querySelector('[role="dialog"]') !== null) return;
    event.preventDefault();
    useSourcesUi.setState({ pick: null });
  };
  window.addEventListener('click', click);
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('keydown', key);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('click', click);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('keydown', key);
  };
}
