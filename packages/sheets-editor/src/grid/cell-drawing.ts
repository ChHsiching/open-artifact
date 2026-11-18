import { Avatar } from '../kit/avatar.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { fontPointsToPixels, firstLineHeight, firstLineLeading, nextLineHeight } from './cell-metrics-values.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { githubLinkFace } from '../links/cell-links-view.ts';
import { urlForDisplay } from '../links/url-display.ts';
import { countNamesThatFit } from '../presence/name-flags.ts';
import { morePeopleCountText } from '../i18n/chip-labels.ts';
import { MENU_CARETS } from '../ui/menu-trigger.ts';
import { chipBeyondLine, cellMarkSpacing } from './cell-metrics.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import { IS_IOS_BROWSER } from './cell-drawing-values.ts';
import { IS_APPLE_PLATFORM } from '../ui/dom-events.ts';
export function preloadMonoFont(element?: Dynamic) {
  let ownerDocument = element.ownerDocument;
  let monoFont = ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue(MONO_FONT_VAR);
  if (monoFont !== undefined && monoFont !== '') ownerDocument.fonts.load(`1em ${monoFont}`).catch(() => {});
}
export function createTextWidthMeasurer(ownerDocument?: Dynamic) {
  let canvasContext = ownerDocument.createElement('canvas').getContext('2d');
  let bodyStyle = ownerDocument.defaultView?.getComputedStyle(ownerDocument.body);
  if (canvasContext === null || bodyStyle === undefined) return null;
  let fontFamily = bodyStyle.fontFamily;
  let displayFontFamily = bodyStyle.getPropertyValue(DISPLAY_FONT_VAR);
  let widths = new (Map as Dynamic)();
  return (text?: Dynamic, font?: Dynamic) => {
    let family = usesDisplayFont(font.size) ? displayFontFamily : fontFamily;
    let fontShorthand = `${font.italic ? 'italic ' : ''}${font.bold ? '700 ' : ''}${String(fontPointsToPixels(font.size))}px ${family}`;
    let cacheKey = `${fontShorthand}
${text}`;
    let cached = widths.get(cacheKey);
    if (cached !== undefined) return cached;
    canvasContext.font = fontShorthand;
    let { width: width } = canvasContext.measureText(text);
    if (widths.size >= TEXT_WIDTH_CACHE_LIMIT) widths.clear();
    widths.set(cacheKey, width);
    return width;
  };
}
export function TextWidthProvider({ within: within, children: children }: Dynamic) {
  let [measureText, setMeasureText] = React.useState(() => estimateCellTextWidth);
  React.useEffect(() => {
    let ownerDocument = within.current?.ownerDocument;
    let view = ownerDocument?.defaultView ?? null;
    if (ownerDocument === undefined || view === null) return;
    let updateMeasurer = () => setMeasureText(() => createTextWidthMeasurer(ownerDocument) ?? estimateCellTextWidth);
    updateMeasurer();
    ownerDocument.fonts.addEventListener('loadingdone', updateMeasurer);
    let fontObserver = new (view.MutationObserver as Dynamic)(updateMeasurer);
    fontObserver.observe(ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ['data-font'],
    });
    return () => {
      ownerDocument.fonts.removeEventListener('loadingdone', updateMeasurer);
      fontObserver.disconnect();
    };
  }, [within]);
  return jsx(TextWidthContext, {
    value: measureText,
    children: children,
  });
}
export function cellFontStyle({ bold: bold, italic: italic, underline: underline, strikethrough: strikethrough, size: size }: Dynamic) {
  let decorations = [underline !== 'none' && 'underline', strikethrough && 'line-through'].filter(
    (input?: Dynamic) => input !== false,
  );
  return {
    fontFamily: displayFontFamilyFor(size),
    fontSize: fontPointsToPixels(size),
    lineHeight: `${firstLineHeight(size)}px`,
    fontWeight: bold ? 700 : undefined,
    fontStyle: italic ? 'italic' : undefined,
    textDecorationLine: decorations.length === 0 ? undefined : decorations.join(' '),
    textDecorationStyle: underline === 'double' ? 'double' : undefined,
  };
}
export function textMarksStyle(marks?: Dynamic) {
  let decorations = [marks.includes('underline') && 'underline', marks.includes('strikethrough') && 'line-through'].filter(
    (input?: Dynamic) => input !== false,
  );
  return {
    fontWeight: marks.includes('bold') ? 700 : undefined,
    fontStyle: marks.includes('italic') ? 'italic' : undefined,
    textDecorationLine: decorations.length === 0 ? undefined : decorations.join(' '),
  };
}
export function wrappedTextLineStyle(size?: Dynamic) {
  let marginBlock = firstLineLeading(size);
  return marginBlock === 0
    ? undefined
    : {
        lineHeight: `${nextLineHeight(size)}px`,
        marginBlock: marginBlock,
      };
}
export function CellChip({
  optionPaints: optionPaints,
  hasBox = true,
  fillsCell = false,
  isBlank = false,
  showsPeople = false,
  inCell: inCell,
  startsCell = false,
  isBold = false,
  before: before,
  after: after,
  textProps: textProps,
  children: children,
}: Dynamic) {
  return jsxs('span', {
    className: optionPaints !== null && !isBold ? 'sheet-chip font-medium' : 'sheet-chip',
    'data-has-box': hasBox || undefined,
    'data-fills-cell': fillsCell || undefined,
    'data-is-blank': isBlank || undefined,
    'data-shows-people': showsPeople || undefined,
    'data-in-cell': inCell,
    'data-starts-cell': startsCell || undefined,
    'data-ends-in-mark': ((inCell === 'last' || startsCell) && ChipMark(after) !== null) || undefined,
    'data-is-option': optionPaints !== null || undefined,
    ...(optionPaints === null ? {} : paintDataAttributes(optionPaints)),
    style:
      optionPaints === null
        ? undefined
        : {
            ...fillPaintStyle(optionPaints.fill),
            ...textPaintStyle(optionPaints.text),
          },
    children: [
      ChipMark(before),
      children !== false &&
        jsx('span', {
          className: 'sheet-chip-text',
          ...textProps,
          children: children,
        }),
      ChipMark(after),
    ],
  });
}
export function LinkAddressOrGithubChip(props?: Dynamic) {
  let { url: url, isTypedWithWww: isTypedWithWww } = props;
  let githubFace = githubLinkFace(url);
  return githubFace === null
    ? jsx('span', {
        className: 'sheet-link-words sheet-link-address',
        children: urlForDisplay(url, isTypedWithWww),
      })
    : jsx(CellChip, {
        optionPaints: null,
        inCell: 'last',
        startsCell: true,
        before: jsx(Icon, {
          name: githubFace.icon,
          size: 'xs',
          alt: githubFace.iconInWords,
        }),
        children: githubFace.words,
      });
}
export function PeopleChips({
  first: first,
  firstName: firstName,
  textDecorationLine: textDecorationLine,
  others: others,
  cellWidth: cellWidth,
  font: font,
  opensList: opensList,
}: Dynamic) {
  let textWidth = useTextWidth();
  let shownCount =
    others.length === 0
      ? 1
      : countNamesThatFit({
          cellWidth: cellWidth,
          nameWidths: [first, ...others].map(({ name: name }: Dynamic) => textWidth(name, font)),
          widthOfCount: (count?: Dynamic) =>
            textWidth(morePeopleCountText(count), {
              ...font,
              bold: true,
            }),
          fontSizeInPoints: font.size,
          opensList: opensList,
        });
  let foldedCount = others.length + 1 - shownCount;
  return jsxs(Fragment, {
    children: [
      jsx(CellChip, {
        optionPaints: null,
        showsPeople: true,
        ...lastChipProps(others.length === 0),
        startsCell: true,
        before: jsx(PersonAvatar, {
          ...first,
        }),
        after: opensList && MENU_CARETS.chipInCell,
        children: firstName,
      }),
      others.slice(0, shownCount - 1).map(
        ({ userId: userId, ...person }: Dynamic, index?: Dynamic) =>
          jsx(
            CellChip,
            {
              optionPaints: null,
              showsPeople: true,
              ...lastChipProps(foldedCount === 0 && index === shownCount - 2),
              before: jsx(PersonAvatar, {
                ...person,
              }),
              children:
                textDecorationLine === undefined
                  ? person.name
                  : jsx('span', {
                      style: {
                        textDecorationLine: textDecorationLine,
                      },
                      children: person.name,
                    }),
            },
            userId,
          ),
      ),
      foldedCount > 0 &&
        jsx(CellChip, {
          optionPaints: NO_OPTION_PAINTS,
          inCell: 'last',
          isBold: font.bold,
          children: morePeopleCountText(foldedCount),
        }),
    ],
  });
}
export function LinesBesideText(props?: Dynamic) {
  let { from: from, outsideTextBox: outsideTextBox, lines: lines } = props;
  return jsx('span', {
    className: 'sheet-lines-beside-text',
    style: {
      [from === 'left' ? 'marginLeft' : 'marginRight']: outsideTextBox === 0 ? undefined : -outsideTextBox,
    },
    children: lines.map(
      (line?: Dynamic) =>
        jsx(
          'span',
          {
            style: {
              [from]: line,
            },
          },
          line,
        ),
    ),
  });
}
export function textFadeStyle(cell?: Dynamic, textBox?: Dynamic) {
  let { textWidth: textWidth, textCutByViewAt: textCutByViewAt } = cell;
  let drawnWidth = cell.textLeft !== cell.left || textWidth !== cell.width || cell.hasLineAtRight ? textWidth - 1 : textWidth;
  let centerShift = (textBox.left + textWidth - textBox.right + cell.indentToCenter) / 2;
  let widthBeforeTaken = textWidth - (cell.takenAtRight > 0 ? 1 + cell.takenAtRight : textBox.right);
  let [cutFrom, cutTo] = fadesFromRightButton(cell)
    ? [`calc(100% - ${widthBeforeTaken - textBox.left}px - ${INK_PAST_WORDS})`, '100%']
    : cell.takenAtRight > 0 || cell.linkDrawnAs !== null
      ? ['0px', `calc(${widthBeforeTaken - textBox.left}px + ${INK_PAST_WORDS})`]
      : cell.alignment === 'left' || cell.isCutAtEndOnly
        ? ['0px', `calc(${drawnWidth - textBox.left}px + ${INK_PAST_WORDS})`]
        : cell.alignment === 'right'
          ? [`calc(100% - ${textWidth - textBox.right}px - ${INK_PAST_WORDS})`, '100%']
          : [`calc(50% - ${centerShift}px)`, `calc(50% + ${drawnWidth - centerShift}px)`];
  if (textCutByViewAt === null)
    return {
      '--sheet-text-cut-from': cutFrom,
      '--sheet-text-cut-to': cutTo,
    };
  let cutByView =
    cell.alignment === 'center' && cell.linkDrawnAs === null
      ? `calc(50% + ${textCutByViewAt - centerShift}px)`
      : `calc(${textCutByViewAt - textBox.left}px + ${INK_PAST_WORDS})`;
  return {
    '--sheet-text-cut-from': cutFrom,
    '--sheet-text-cut-to': `min(${cutTo}, ${cutByView})`,
  };
}
export function TextThatRunsOn(props?: Dynamic) {
  let { textWidth: textWidth, alignment: alignment, indentToCenter: indentToCenter, linesInTextBox: linesInTextBox } = props.cell;
  let lastPixel = textWidth - 1;
  let isLineAtLeft = (line?: Dynamic) =>
    alignment === 'right' || (alignment === 'center' && line < (lastPixel + indentToCenter) / 2);
  let outsideAtLeft = Math.max(0, -indentToCenter);
  let outsideAtRight = Math.max(0, indentToCenter);
  return jsxs('div', {
    className: 'sheet-text-that-runs-on',
    'data-has-text-paint': props.hasTextPaint || undefined,
    style: {
      left: props.left,
      width: textWidth,
      ...props.style,
    },
    children: [
      alignment !== 'left' &&
        jsx(LinesBesideText, {
          from: 'left',
          outsideTextBox: outsideAtLeft,
          lines: linesInTextBox.filter(isLineAtLeft).map((line?: Dynamic) => line + outsideAtLeft),
        }),
      props.children,
      alignment !== 'right' &&
        jsx(LinesBesideText, {
          from: 'right',
          outsideTextBox: outsideAtRight,
          lines: linesInTextBox
            .filter((line?: Dynamic) => !isLineAtLeft(line))
            .map((line?: Dynamic) => lastPixel + outsideAtRight - (line + 1)),
        }),
    ],
  });
}
export const FALLBACK_CHAR_WIDTH_EM = 0.55;
export const estimateCellTextWidth = (text?: Dynamic, font?: Dynamic) =>
  text.length * FALLBACK_CHAR_WIDTH_EM * fontPointsToPixels(font.size);
export const DISPLAY_FONT_VAR = '--ui-font-sans-display';
export const DISPLAY_FONT_MIN_PX = 16;
export const usesDisplayFont = (size?: Dynamic) => fontPointsToPixels(size) > DISPLAY_FONT_MIN_PX;
export const MONO_FONT_VAR = '--ui-font-mono';
export const MONO_FONT_FAMILY = `var(${MONO_FONT_VAR})`;
export const displayFontFamilyFor = (size?: Dynamic) => (usesDisplayFont(size) ? `var(${DISPLAY_FONT_VAR})` : undefined);
export const TEXT_WIDTH_CACHE_LIMIT = 2000;
export const TextWidthContext = React.createContext(estimateCellTextWidth);
export const useTextWidth = () => React.useContext(TextWidthContext);
export const SELECTION_SUMMARY_ID = 'selection-summary';
export const whiteOwedStyle = ({ atLeft: atLeft, atRight: atRight }: Dynamic) => ({
  ...(atLeft > 0 && {
    '--sheet-white-owed-at-left': `${atLeft}px`,
  }),
  ...(atRight > 0 && {
    '--sheet-white-owed-at-right': `${atRight}px`,
  }),
});
export const textClearanceStyle = ({ over: over, under: under, left: left, right: right }: Dynamic, chipMark: Dynamic = null) => ({
  '--sheet-clear-over-text': `${over}px`,
  '--sheet-clear-under-text': `${under}px`,
  '--sheet-clear-left-of-text': `${left}px`,
  '--sheet-clear-right-of-text': `${right}px`,
  ...(chipMark !== null && {
    '--sheet-chip-beyond-line': `${chipBeyondLine({
      over: over,
    })}px`,
    '--sheet-after-mark': `${cellMarkSpacing(chipMark).after}px`,
    '--sheet-mark-into-words': `${cellMarkSpacing(chipMark).intoWords}px`,
  }),
});
export const entryFontStyle = (font?: Dynamic, isMono?: Dynamic) => ({
  ...cellFontStyle(font),
  ...(isMono && {
    fontFamily: MONO_FONT_FAMILY,
  }),
  lineHeight: `${nextLineHeight(font.size)}px`,
});
export const DEFAULT_CELL_FONT_STYLE = {
  fontSize: fontPointsToPixels(DEFAULT_CELL_FORMAT.font.size),
  lineHeight: `${firstLineHeight(DEFAULT_CELL_FORMAT.font.size)}px`,
};
export const TEXT_TINT_COLORS = {
  black: 'var(--ui-text-primary)',
  blue: 'var(--ui-text-tint-blue)',
  cyan: 'var(--ui-text-tint-aqua)',
  gray: 'var(--ui-text-secondary)',
  green: 'var(--ui-text-tint-green)',
  magenta: 'var(--ui-text-tint-magenta)',
  orange: 'var(--ui-text-tint-orange)',
  red: 'var(--ui-text-tint-red)',
  violet: 'var(--ui-text-tint-violet)',
  white: 'var(--ui-surface-2)',
  yellow: 'var(--ui-text-tint-yellow)',
};
export const referenceTintStyle = (tint?: Dynamic) => ({
  '--sheet-reference-fill': `var(--sheet-reference-tint-${tint})`,
  '--sheet-reference-badge': `var(--ui-bg-tint-${tint})`,
  '--sheet-reference-text': `var(--ui-text-tint-${tint})`,
});
export const fillPaintStyle = (fill?: Dynamic) =>
  fill === null
    ? {}
    : {
        '--sheet-fill-on-light': fill.onLight,
        '--sheet-fill-on-dark': fill.onDark,
      };
export const cutByViewStyle = (cutAt?: Dynamic) => ({
  '--sheet-cut-by-view-at': `${cutAt}px`,
});
export const importMarkDelayStyle = (turnMs?: Dynamic) => ({
  '--sheet-turn-of-mark': `${turnMs}ms`,
});
export const textPaintStyle = (textPaint?: Dynamic) =>
  textPaint === null
    ? {}
    : {
        '--sheet-text-on-light': textPaint.onLight,
        '--sheet-text-on-dark': textPaint.onDark,
      };
export const paintDataAttributes = (paints?: Dynamic) => ({
  'data-has-fill': paints.fill !== null || undefined,
  'data-has-text-paint': paints.text !== null || undefined,
});
export const ChipMark = (mark?: Dynamic) =>
  mark === undefined || mark === null || mark === false
    ? null
    : jsx('span', {
        className: 'sheet-chip-mark',
        children: mark,
      });
export const PersonAvatar = ({ name: name, avatarUrl: avatarUrl }: Dynamic) =>
  jsx(Avatar, {
    name: name,
    ...(avatarUrl === null
      ? {}
      : {
          src: avatarUrl,
        }),
    size: 'xs',
    'aria-hidden': true,
  });
export const NO_OPTION_PAINTS = {
  fill: null,
  text: null,
};
export const lastChipProps = (isLast?: Dynamic) =>
  isLast
    ? {
        inCell: 'last',
      }
    : {};
export const JUSTIFY_BY_ALIGNMENT = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};
export const ALIGN_ITEMS_BY_VERTICAL = {
  top: undefined,
  center: 'center',
  bottom: 'flex-end',
};
export const INK_PAST_WORDS = 'var(--sheet-ink-past-words)';
export const fadesFromRightButton = (cell?: Dynamic) =>
  cell.takenAtRight > 0 && cell.alignment === 'right' && !cell.isCutAtEndOnly && cell.linkDrawnAs === null;
export const ariaIndex = (index?: Dynamic) => index + 1;
export const ariaRowIndexText = (rowNumber?: Dynamic) => ({
  'aria-rowindextext': String(rowNumber),
});
export const ariaColIndexText = (columnText?: Dynamic) => ({
  'aria-colindextext': columnText,
});
export const AnnounceActiveCellContext = React.createContext(false);
export const ACTIVE_CELL_ADDRESS_ID = 'address-of-active-cell';
export const BlankCellWordsContext = React.createContext('none');
export const BLANK_CELL_WORDS_BY_PLATFORM = IS_IOS_BROWSER
  ? 'all'
  : !IS_APPLE_PLATFORM || typeof CSS > 'u' || CSS.supports('-moz-appearance', 'none')
    ? 'none'
    : CSS.supports('font', '-apple-system-body')
      ? 'whereAPressActs'
      : 'whereAPressActsByCss';
export const WordsForScreenReader = ({ words: words }: Dynamic) =>
  jsx('span', {
    role: 'text',
    'aria-label': words,
    className: 'absolute inset-0',
  });
export { IS_IOS_BROWSER } from './cell-drawing-values.ts';
