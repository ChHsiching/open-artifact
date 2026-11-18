import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { jsx } from 'react/jsx-runtime';
import { CONTEXT_BAR_PART_ATTRIBUTE } from '../toolbar-tooltip.ts';
export let FIRST_TOOLS_TO_FOLD: Dynamic;
export function toolNeighbours(lines?: Dynamic, afterLast?: Dynamic) {
  let filledLines = lines.filter(({ length: length }: Dynamic) => length > 0);
  return new (Map as Dynamic)(
    filledLines.flatMap(
      (line?: Dynamic, lineIndex?: Dynamic) =>
        line.map((tool?: Dynamic, index?: Dynamic) => {
          let before = index > 0 ? 'tool' : lineIndex > 0 ? 'line' : 'end';
          let isLastLine = lineIndex === filledLines.length - 1;
          let after = index < line.length - 1 ? 'tool' : isLastLine ? afterLast : 'line';
          return [
            tool,
            {
              before: before,
              after: after,
            },
          ];
        }),
    ),
  );
}
export function barWidthWithout(widths: Dynamic, folded: Dynamic, { padding: padding, gap: gap, acrossLine: acrossLine }: Dynamic) {
  let lineWidths = TOOLBAR_LINES.map(
    (line?: Dynamic) => line.flatMap((tool?: Dynamic) => (folded.has(tool) ? [] : (widths.get(tool) ?? []))),
  ).filter((widthsOfLine?: Dynamic) => widthsOfLine.length > 0);
  return (
    2 * padding +
    sumOfWidths(lineWidths.map((widthsOfLine?: Dynamic) => sumOfWidths(widthsOfLine) + gap * (widthsOfLine.length - 1))) +
    acrossLine * Math.max(lineWidths.length - 1, 0)
  );
}
export function toolsToFoldForWidth(widths?: Dynamic, spacing?: Dynamic, room?: Dynamic, foldOrder?: Dynamic) {
  let folded = new (Set as Dynamic)();
  for (let step of foldOrder as Dynamic) {
    if (barWidthWithout(widths, folded, spacing) <= room) break;
    for (let tool of step as Dynamic) if (widths.has(tool)) folded.add(tool);
  }
  return [...folded];
}
export function toolsToFoldKeepingFolded(folded?: Dynamic, widths?: Dynamic, spacing?: Dynamic, room?: Dynamic, foldOrder?: Dynamic) {
  let toFold = toolsToFoldForWidth(widths, spacing, room, foldOrder);
  return folded.some((tool?: Dynamic) => !toFold.includes(tool))
    ? toolsToFoldForWidth(widths, spacing, room - REFOLD_ROOM_MARGIN, foldOrder)
    : toFold;
}
export function barForm(folded?: Dynamic, isHidden?: Dynamic) {
  if (isHidden) return null;
  if (folded.length === 0) return 'bar_whole';
  return folded.every((tool?: Dynamic) => FIRST_TOOLS_TO_FOLD.includes(tool)) ? 'bar_small' : 'bar_fewer';
}
export function barEndKind(isAskShown?: Dynamic, isCommentShown?: Dynamic) {
  if (!isAskShown) return 'bar_end_icon';
  return isCommentShown ? 'bar_end_ask_and_comment' : 'bar_end_ask_agent';
}
export function BarTool({ tool: tool, isDrawn = true, isDrawnWithNoButton = false, children: children }: Dynamic) {
  let { besides: besides, ofBar: ofBar } = React.use(BarToolsContext);
  if (!ofBar.includes(tool)) return isDrawnWithNoButton ? children : null;
  return jsx('span', {
    'data-tool': tool,
    'data-before': besides.get(tool)?.before,
    'data-after': besides.get(tool)?.after,
    hidden: !isDrawn,
    className: 'flex flex-none',
    children: children,
  });
}
export function pixelsOf(text?: Dynamic) {
  let number = Number.parseFloat(text);
  return Number.isNaN(number) ? 0 : number;
}
export function roomForBarTools(toolbar?: Dynamic, footRow?: Dynamic, gap?: Dynamic) {
  let foot = toolbar.closest('.sheet-foot');
  let contextBarHolder = toolbar.closest('.sheet-context-bar')?.parentElement;
  if (foot === null || contextBarHolder === null || contextBarHolder === undefined) return null;
  let { left: footLeft, right: footRight } = getComputedStyle(foot);
  let commentPassWidth = elementWidthOrZero(toolbar.querySelector('[data-comment-pass]'));
  return (
    footRow.clientWidth -
    (pixelsOf(footLeft) + pixelsOf(footRight)) -
    (elementWidthOrZero(contextBarHolder) - elementWidthOrZero(toolbar)) -
    (commentPassWidth > 0 ? commentPassWidth + gap : 0)
  );
}
export function measureFoldedTools(toolbar?: Dynamic, widths?: Dynamic, keptTools?: Dynamic, folded?: Dynamic) {
  let footRow = footRowOf(toolbar);
  let toolsRow = toolbar.querySelector('[data-ui="Toolbar"] > div');
  let lineInBar = toolbar.querySelector('[data-line-in-bar]');
  if (footRow === null || footRow === undefined || toolsRow === null || lineInBar === null) return null;
  for (let tool of TOOLS_OF_BAR as Dynamic) {
    let width = toolbar.querySelector(`[data-tool="${tool}"]`)?.getBoundingClientRect().width;
    if (width !== undefined && width > 0) widths.set(tool, width);
  }
  let gap = pixelsOf(getComputedStyle(toolsRow).columnGap);
  let boldWidth = widths.get('bold');
  if (boldWidth !== undefined) widths.set('section', 4 * boldWidth + 3 * gap);
  let lineStyle = getComputedStyle(lineInBar);
  let toolbarStyle = getComputedStyle(toolbar);
  let acrossLine = 2 * gap + pixelsOf(lineStyle.marginLeft) + pixelsOf(lineStyle.borderLeftWidth) + pixelsOf(lineStyle.marginRight);
  let room = roomForBarTools(toolbar, footRow, gap);
  if (room === null) return null;
  return toolsToFoldKeepingFolded(
    folded,
    widths,
    {
      padding: (pixelsOf(toolbarStyle.paddingLeft) + pixelsOf(toolbarStyle.paddingRight)) / 2,
      gap: gap,
      acrossLine: acrossLine,
    },
    room + 0.5,
    toolFoldOrderKeeping(keptTools),
  );
}
export function useFoldedTools({ scroller: scroller, isBusy: isBusy, isSwipedRow: isSwipedRow }: Dynamic) {
  let [folded, setFolded] = React.useState(NO_FOLDED_TOOLS);
  let widthsRef = React.useRef(new (Map as Dynamic)());
  let lastCaretRef = React.useRef(null);
  let keptToolsRef = React.useRef(NO_FOLDED_TOOLS);
  React.useLayoutEffect(() => {
    let scrollerElement = scroller.current;
    let view = scrollerElement?.ownerDocument.defaultView;
    let footRow = scrollerElement === null ? null : footRowOf(scrollerElement);
    if (scrollerElement === null || view === null || view === undefined) return;
    if (footRow === null || footRow === undefined) return;
    let toolsKeptFor = (element?: Dynamic) => {
      let elementInBar = scrollerElement.contains(element) ? element : null;
      let ownTool = elementInBar?.closest('[data-tool]')?.getAttribute('data-tool');
      return (elementInBar?.closest('.sheet-section-of-bar') ?? null) !== null
        ? SECTION_TOOL_ONLY
        : TOOLS_OF_BAR.filter((tool?: Dynamic) => tool === ownTool);
    };
    let measure = (focused: Dynamic = scrollerElement.ownerDocument.activeElement) => {
      if (isBusy) {
        keptToolsRef.current = toolsKeptFor(scrollerElement.querySelector('[aria-expanded="true"]'));
        return;
      }
      let caretElement = scrollerElement.contains(focused) ? focused : lastCaretRef.current;
      let keepsKeptTools =
        caretElement === null &&
        scrollerElement.ownerDocument.hasFocus() &&
        (focused === null || focused === scrollerElement.ownerDocument.body || focused.closest(`[${CONTEXT_BAR_PART_ATTRIBUTE}]`) !== null);
      if (!keepsKeptTools) keptToolsRef.current = NO_FOLDED_TOOLS;
      let keptTools = keepsKeptTools ? keptToolsRef.current : toolsKeptFor(caretElement);
      let newFolded = isSwipedRow ? NO_FOLDED_TOOLS : measureFoldedTools(scrollerElement, widthsRef.current, keptTools, folded);
      if (newFolded !== null && newFolded.join() !== folded.join()) setFolded(newFolded);
    };
    measure();
    let measureNow = () => ReactDOM.flushSync(() => measure());
    let resizeObserver = new (ResizeObserver as Dynamic)(measureNow);
    resizeObserver.observe(footRow);
    let footChild = scrollerElement.closest('.sheet-foot > *');
    if (footChild !== null) resizeObserver.observe(footChild);
    resizeObserver.observe(scrollerElement);
    let mutationObserver = new (MutationObserver as Dynamic)(measureNow);
    let foot = scrollerElement.closest('.sheet-foot');
    if (foot !== null)
      mutationObserver.observe(foot, {
        attributes: true,
        attributeFilter: ['data-keeps-room-of-pane'],
      });
    let asElement2 = (node?: Dynamic) => (node instanceof view.Element ? node : null);
    let onFocusOut = ({ target: target, relatedTarget: relatedTarget }: Dynamic) => {
      lastCaretRef.current = scrollerElement.contains(asElement2(relatedTarget)) ? asElement2(target) : null;
      if (lastCaretRef.current === null) measure(asElement2(relatedTarget));
    };
    let onFocusIn = ({ target: target }: Dynamic) => {
      lastCaretRef.current = null;
      measure(asElement2(target));
    };
    scrollerElement.addEventListener('focusout', onFocusOut);
    scrollerElement.addEventListener('focusin', onFocusIn);
    let onDocumentFocusIn = () => {
      if (keptToolsRef.current.length > 0) measure();
    };
    scrollerElement.ownerDocument.addEventListener('focusin', onDocumentFocusIn);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      scrollerElement.removeEventListener('focusout', onFocusOut);
      scrollerElement.removeEventListener('focusin', onFocusIn);
      scrollerElement.ownerDocument.removeEventListener('focusin', onDocumentFocusIn);
    };
  });
  return folded;
}
export function BarToolsProvider({ ofBar: ofBar, besides: besides, isHidden: isHidden, children: children }: Dynamic) {
  let value = React.useMemo(
    () => ({
      besides: besides,
      ofBar: ofBar,
    }),
    [besides, ofBar],
  );
  return jsx(BarToolsContext, {
    value: value,
    children: jsx('div', {
      className: isHidden ? 'hidden' : 'contents',
      children: children,
    }),
  });
}
export const TOOLBAR_LINES = [
  ['bold', 'italic', 'underline', 'align'],
  ['textColor', 'fillColor', 'borders', 'conditionalFormatting', 'chart'],
  ['numberFormat', 'section', 'more'],
];
export const NEVER_FOLDED_TOOLS = new (Set as Dynamic)(['bold', 'italic', 'underline', 'numberFormat', 'more']);
export const TOOL_FOLD_ORDER = [
  TOOLBAR_LINES.flat().filter((tool?: Dynamic) => !NEVER_FOLDED_TOOLS.has(tool)),
  ['underline'],
  ['italic'],
  ['bold'],
];
export const toolFoldOrderKeeping = (kept?: Dynamic) =>
  TOOL_FOLD_ORDER.map((step?: Dynamic) => step.filter((tool?: Dynamic) => !kept.includes(tool)));
export const sumOfWidths = (widths?: Dynamic) => widths.reduce((sum?: Dynamic, width?: Dynamic) => sum + width, 0);
export const REFOLD_ROOM_MARGIN = 0.1;
export const BAR_FORM_ATTRIBUTE = 'data-form-of-bar';
export const BAR_END_ATTRIBUTE = 'data-end-of-bar';
export const SMALL_BAR_SELECTOR = `[${BAR_FORM_ATTRIBUTE}=bar_small],[${BAR_FORM_ATTRIBUTE}=bar_fewer]`;
[FIRST_TOOLS_TO_FOLD = []] = toolFoldOrderKeeping([]);
export const NO_FOLDED_TOOLS: Dynamic = [];
export const SECTION_TOOL_ONLY = ['section'];
export const TOOLS_OF_BAR = TOOLBAR_LINES.flat().filter((tool?: Dynamic) => tool !== 'section');
export const BarToolsContext = React.createContext({
  besides: new (Map as Dynamic)(),
  ofBar: TOOLS_OF_BAR,
});
export const footRowOf = (toolbar?: Dynamic) => toolbar.closest('.sheet-foot')?.parentElement;
export const elementWidthOrZero = (element?: Dynamic) => element?.getBoundingClientRect().width ?? 0;
