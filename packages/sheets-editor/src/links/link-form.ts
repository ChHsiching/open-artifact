import type { Dynamic } from '../dynamic.ts';
import { safeLinkUrl, readCellLink, encodedLinkUrl, shortenUrlMiddle, MAX_SHOWN_LINK_LENGTH } from './cell-links.ts';
import { formulaArgumentSeparator, withDecimalSign } from '../format/number-signs.ts';
import { stripTextPrefixQuote, booleanText, addTextPrefixQuote, sanitizeCellText } from '../model/cell-text.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { acceptedLinkUrl, textHasLinks } from './text-links.ts';
import { textToEditAt } from '../editor/start-entry.ts';
import { shownCellText } from '../format/shown-text.ts';
import {
  activeAnchorCell,
  selectedArea,
  selectionKindOf,
  moveActiveCellTo,
  mergedAreaOrCellOf,
  isSameCell,
  scrollToShowActiveCell,
} from '../selection/model.ts';
import { isEntryAmongPeople } from '../chips/people-list.ts';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
import { isModalOpen } from '../ui/find.ts';
import { layoutOfView } from '../grid/layout.ts';
import { doesCommentModePick } from '../comments/comment-state.ts';
import { cellExplained, cellKeyText } from '../state/explained-under-cell.ts';
import { withNoEffects } from '../state/transitions.ts';
import { enterTextEdit, queueEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { isRangeInSight } from '../grid/geometry.ts';
import { isEntryUnchanged, cancelEntryIfEditing } from '../editor/commit-entry.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function hyperlinkFormula(text?: Dynamic, address?: Dynamic, decimalSign?: Dynamic, valueText: Dynamic = null) {
  let trimmed = text.trim();
  if ((trimmed === '' || safeLinkUrl(trimmed) === address) && valueText === null) return address;
  return `=HYPERLINK(${quoteFormulaString(address)}${formulaArgumentSeparator(decimalSign)}${valueText ?? quoteFormulaString(trimmed)})`;
}
export function readLinkOfEntry(entry?: Dynamic, decimalSign?: Dynamic) {
  let [, quotedAddress, quotedText] = HYPERLINK_FORMULA_PATTERNS[formulaArgumentSeparator(decimalSign)].exec(entry) ?? [];
  let address = quotedAddress === undefined ? null : safeLinkUrl(unquoteFormulaString(quotedAddress));
  if (address !== null)
    return {
      text: unquoteFormulaString(quotedText ?? quotedAddress ?? ''),
      address: address,
      hasLink: true,
    };
  if (entry.startsWith('=')) return null;
  let trimmed = entry.trim();
  let typedAddress = safeLinkUrl(trimmed);
  if (typedAddress === null)
    return {
      text: stripTextPrefixQuote(entry),
      address: '',
      hasLink: false,
    };
  return linkAddressProblem(typedAddress, false) === null
    ? {
        text: trimmed,
        address: typedAddress,
        hasLink: true,
      }
    : null;
}
export function keptValueTextOf(workbook: WorkbookReads, cellId?: Dynamic) {
  let value = cellValueOf(workbook.cellOf(cellId));
  if (value?.kind === 'boolean') return booleanText(value.value);
  return value?.kind === 'number' ? withDecimalSign(String(value.value), workbook.decimalSign) : null;
}
export function hasRichTextLink(workbook: WorkbookReads, cellId?: Dynamic) {
  let input = workbook.cellOf(cellId)?.input;
  return (
    input?.kind === 'richText' &&
    input.paragraphs.some(
      ({ runs: runs }: Dynamic) => runs.some(({ link: link }: Dynamic) => link !== null && acceptedLinkUrl(link) !== null),
    )
  );
}
export function richTextLinkAddresses(workbook: WorkbookReads, cellId?: Dynamic, addresses?: Dynamic) {
  let input = workbook.cellOf(cellId)?.input;
  if (input?.kind !== 'richText') return NO_RICH_TEXT_LINK_ADDRESSES;
  let cached = RICH_TEXT_LINK_ADDRESSES_CACHE.get(addresses);
  if (cached !== undefined) return cached;
  let linkUrls = new (Set as Dynamic)(
    input.paragraphs.flatMap(
      ({ runs: runs }: Dynamic) => runs.map(({ link: link }: Dynamic) => (link === null ? null : safeLinkUrl(link))),
    ),
  );
  let found = addresses.filter((address: Dynamic) => linkUrls.has(address));
  return (RICH_TEXT_LINK_ADDRESSES_CACHE.set(addresses, found), found);
}
export function isCellUnlinkable(workbook: WorkbookReads, cellId?: Dynamic) {
  let inputKind = workbook.cellOf(cellId)?.input.kind;
  return inputKind === 'dropdownOption' || inputKind === 'user' || inputKind === 'users' || workbook.formatOf(cellId).cellControl.kind !== 'none';
}
export function linkFormOfCell(state: Dynamic, workbook: WorkbookReads, cellId?: Dynamic) {
  if (isCellWithoutLinkForm(workbook, cellId)) return null;
  let entry = textToEditAt(state, workbook, cellId);
  let link = readLinkOfEntry(entry, workbook.decimalSign);
  if (link === null) return null;
  let cell = workbook.cellOf(cellId);
  if (entry.startsWith('=') && readCellLink(cell, workbook.formatOf(cellId)) === null) return null;
  let valueKept = keptValueTextOf(workbook, cellId);
  if (valueKept === null)
    return {
      ...link,
      valueKept: valueKept,
    };
  return {
    ...link,
    text: shownCellText(cell, 1 / 0, workbook.decimalSign).text,
    valueKept: valueKept,
  };
}
export function linkActionAtActiveCell(state: PageState, workbook: WorkbookReads) {
  let cellId = activeAnchorCell(state, workbook);
  if (isCellUnlinkable(workbook, cellId)) return null;
  if (workbook.cellOf(cellId)?.input.kind === 'richText') return hasRichTextLink(workbook, cellId) ? 'edit' : 'insert';
  let form = linkFormOfCell(state, workbook, cellId);
  if (form !== null) return form.hasLink ? 'edit' : 'insert';
  return readCellLink(workbook.cellOf(cellId), workbook.formatOf(cellId)) === null ? 'notOnFormula' : null;
}
export function canEditLinkAtActiveCell(state: PageState, workbook: ReadsWithTextMeasurer) {
  if (state.mode.kind === 'editing') {
    let { text: text, holdsOneLine: holdsOneLine, isInBoxOfOneLine: isInBoxOfOneLine } = state.mode;
    let isUnlinkable = isCellUnlinkable(workbook, activeAnchorCell(state, workbook)) || isEntryAmongPeople(state, workbook);
    let isOneLineBox = holdsOneLine === true && isInBoxOfOneLine === true;
    if (isFormulaText(text) || isUnlinkable || isOneLineBox) return false;
    return state.linkForm === null && !isModalOpen(state);
  }
  let area = selectedArea(state, workbook);
  if (!(area === null || selectionKindOf(area, layoutOfView(state, workbook)) === 'cells')) return false;
  if (doesCommentModePick(state) || isModalOpen(state)) return false;
  let action = linkActionAtActiveCell(state, workbook);
  return (action === 'insert' || action === 'edit') && textToEditAt(state, workbook, activeAnchorCell(state, workbook)) !== '';
}
export function openLinkFormFromCellCard(state: PageState, workbook: ReadsWithTextMeasurer) {
  let card = cellExplained(state, workbook);
  if (card === null || card.link !== null) return null;
  if (linkFormOfCell(state, workbook, card.cellId)?.hasLink !== true) return null;
  let moved = moveActiveCellTo(state, workbook, card.cellId, 'pointer');
  return openLinkForm(moved, workbook, activeAnchorCell(moved, workbook));
}
export function linkAddressOfTyped(typed?: Dynamic) {
  let safeUrl = safeLinkUrl(typed);
  let [, host] = safeUrl === null ? (BARE_HOST_PATTERN.exec(typed.trim()) ?? []) : [];
  if (host === undefined || !host.includes('.')) return safeUrl;
  let withScheme = safeLinkUrl(`https://${typed.trim()}`);
  let [hostOfUrl] = withScheme?.slice(8).split(/[:/]/, 1) ?? [];
  return /^[\d.]+$/.test(hostOfUrl ?? '') && hostOfUrl !== host ? null : withScheme;
}
export function linkAddressProblem(address?: Dynamic, isInEntry?: Dynamic) {
  if (address.trim() === '') return null;
  let typedUrl = linkAddressOfTyped(address);
  let url = isInEntry ? encodedLinkUrl(typedUrl) : typedUrl;
  if (url === null) return 'notALink';
  return shortenUrlMiddle(MAX_SHOWN_LINK_LENGTH, url) === url ? null : 'tooLong';
}
export function canRemoveLink(form?: Dynamic, text?: Dynamic) {
  if (form.inEntry !== undefined) return form.hasLink;
  if (!form.hasLink || !form.entry.startsWith('=')) return false;
  if (valueKeptForText(form, text) !== null) return true;
  let cleanText = cleanLinkText(text);
  return cleanText !== '' && safeLinkUrl(cleanText) === null && !textHasLinks(cleanText);
}
export function canRemoveLinkFromCellCard(state: PageState, workbook: ReadsWithTextMeasurer) {
  let form = openLinkFormFromCellCard(state, workbook)?.linkForm ?? null;
  return form !== null && canRemoveLink(form, form.text);
}
export function entryOfLinkForm({ text: text, address: address, valueKept: valueKept }: Dynamic, decimalSign?: Dynamic) {
  let [url, cleanText] = [linkAddressOfTyped(address), cleanLinkText(text)];
  if (url !== null) return hyperlinkFormula(cleanText, url, decimalSign, valueKept);
  return valueKept ?? (cleanText === '' ? '' : addTextPrefixQuote(cleanText));
}
export function isTextTheOldAddress(text?: Dynamic, oldAddress?: Dynamic, newAddress?: Dynamic) {
  let textAddress = withoutHttpScheme(linkAddressOfTyped(text));
  if (textAddress === null || textAddress !== withoutHttpScheme(oldAddress)) return false;
  return !(safeLinkUrl(text) === null && /^[^/]+\/$/.test(textAddress) && withoutHttpScheme(newAddress)?.startsWith(textAddress) === true);
}
export function submitLinkForm(state: PageState, workbook: WorkbookReads, text?: Dynamic, address?: Dynamic) {
  let { linkForm: form } = state;
  if (form === null || linkAddressProblem(address, false) !== null) return withNoEffects(state);
  if (address.trim() === '' && !canRemoveLink(form, text)) return withNoEffects(state);
  let shutState = {
    ...state,
    linkForm: null,
  };
  let valueKept = valueKeptForText(form, text);
  let url = linkAddressOfTyped(address);
  let newText =
    text === form.text && url !== null && url !== form.address && isTextTheOldAddress(cleanLinkText(text), form.address, url) ? '' : text;
  let entry = entryOfLinkForm(
    {
      text: newText,
      address: address,
      valueKept: valueKept,
    },
    workbook.decimalSign,
  );
  if (entry === entryOfLinkForm(form, workbook.decimalSign)) return withNoEffects(shutState);
  let edit = entry === valueKept ? typedTextIntoCellEdit(form.cellId, entry, workbook) : enterTextEdit(form.cellId, entry);
  return queueEdit(shutState, edit, {
    ...IF_QUEUED_DEFAULTS,
    select: state,
    done: null,
    thenEvent: {
      kind: 'linkFormShut',
    },
  });
}
export function removeLinkFromCellCard(state: PageState, workbook: ReadsWithTextMeasurer, cellKey?: Dynamic) {
  let card = cellExplained(state, workbook);
  let opened = card !== null && cellKeyText(card.cellId) === cellKey ? openLinkFormFromCellCard(state, workbook) : null;
  let form = opened?.linkForm ?? null;
  return opened === null || form === null || !canRemoveLink(form, form.text) ? withNoEffects(state) : submitLinkForm(opened, workbook, form.text, '');
}
export function dropStaleLinkForm(state: PageState, workbook: ReadsWithTextMeasurer) {
  let { linkForm: form } = state;
  if (form === null) return state;
  let area = mergedAreaOrCellOf(workbook, form.cellId);
  let isInSight =
    state.menu === null && !isModalOpen(state) && area !== null && isRangeInSight(area, state, layoutOfView(state, workbook), state);
  let isFormStill =
    form.inEntry === undefined
      ? state.mode.kind === 'navigating' &&
        isSameCell(activeAnchorCell(state, workbook), form.cellId) &&
        !isCellWithoutLinkForm(workbook, form.cellId) &&
        textToEditAt(state, workbook, form.cellId) === form.entry
      : state.mode.kind === 'editing' && state.mode.text === form.entry && (form.opensEntry !== true || isEntryUnchanged(state, workbook));
  return isInSight && isFormStill ? state : shutLinkForm(state, workbook);
}
export const quoteFormulaString = (text?: Dynamic) => `"${text.replaceAll('"', '""')}"`;
export const unquoteFormulaString = (text?: Dynamic) => text.replaceAll('""', '"');
export const HYPERLINK_SPACE_SOURCE = '[ \\t\\n\\r]*';
export const FORMULA_STRING_PATTERN = '"((?:[^"]|"")*)"';
export const hyperlinkFormulaPattern = (separator?: Dynamic) =>
  new (RegExp as Dynamic)(
    `^=${HYPERLINK_SPACE_SOURCE}HYPERLINK\\(${HYPERLINK_SPACE_SOURCE}${FORMULA_STRING_PATTERN}${HYPERLINK_SPACE_SOURCE}(?:${separator}${HYPERLINK_SPACE_SOURCE}(?:${FORMULA_STRING_PATTERN}|${`-?\\d+(?:\\${separator === ',' ? '.' : ','}\\d*)?(?:e[-+]?\\d+)?|TRUE|FALSE`})${HYPERLINK_SPACE_SOURCE})?\\)${HYPERLINK_SPACE_SOURCE}$`,
    'i',
  );
export const HYPERLINK_FORMULA_PATTERNS = {
  ',': hyperlinkFormulaPattern(','),
  ';': hyperlinkFormulaPattern(';'),
};
export const isCellWithoutLinkForm = (workbook: WorkbookReads, cellId?: Dynamic) =>
  isCellUnlinkable(workbook, cellId) || workbook.cellOf(cellId)?.input.kind === 'richText';
export const NO_RICH_TEXT_LINK_ADDRESSES: Dynamic = [];
export const RICH_TEXT_LINK_ADDRESSES_CACHE = new (WeakMap as Dynamic)();
export const openLinkForm = (state: Dynamic, workbook: WorkbookReads, cellId?: Dynamic) => {
  let entry = textToEditAt(state, workbook, cellId);
  let form = linkFormOfCell(state, workbook, cellId);
  return form === null
    ? null
    : {
        ...state,
        menu: null,
        linkForm: {
          cellId: cellId,
          entry: entry,
          ...form,
        },
      };
};
export const openLinkFormAtActiveCell = (state: PageState, workbook: ReadsWithTextMeasurer) =>
  openLinkForm(scrollToShowActiveCell(state, workbook, 'cellAlone'), workbook, activeAnchorCell(state, workbook));
export const BARE_HOST_PATTERN = /^([\p{L}\p{N}\p{M}._-]+)(?::\d{1,5})?(?=[/?#]|$)/u;
export const valueKeptForText = (form?: Dynamic, text?: Dynamic) => (text === form.text ? form.valueKept : null);
export const cleanLinkText = (text?: Dynamic) => sanitizeCellText(text.replaceAll(/\p{Cs}/gu, '')).trim();
export const typedTextIntoCellEdit = (cellId: Dynamic, text: Dynamic, workbook: WorkbookReads) => ({
  kind: 'pasteTexts',
  sheetId: cellId.sheetId,
  cells: [
    {
      r: cellId.rowId,
      c: cellId.columnId,
      text: text,
    },
  ],
  pastedTextIs: 'asTyped',
  localeOfTexts: workbook.locale,
});
export const withoutHttpScheme = (url?: Dynamic) => url?.replace(/^https?:\/\//, '') ?? null;
export const shutLinkForm = (state: PageState, workbook: WorkbookReads) =>
  state.linkForm?.opensEntry === true
    ? {
        ...cancelEntryIfEditing(state, workbook),
        linkForm: null,
      }
    : {
        ...state,
        linkForm: null,
      };
