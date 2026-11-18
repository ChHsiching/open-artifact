import type { Dynamic } from '../dynamic.ts';
import { cellFontStyle, MONO_FONT_FAMILY } from './cell-drawing.ts';
import { nextLineHeight } from './cell-metrics-values.ts';
import { NO_LIST } from '../editor/text-looks.ts';
import { listAttributesOf } from '../ui/cell-list-attributes.ts';
import { listLineGaps } from './cell-metrics.ts';
export function createDomTextMeasurer(counterElement?: Dynamic, maxCachedLineCounts: Dynamic = MAX_CACHED_LINE_COUNTS) {
  let ownerDocument = counterElement.ownerDocument;
  let lineCounts = new (Map as Dynamic)();
  let typedTextKey: Dynamic;
  let characterWidthsByFont = new (Map as Dynamic)();
  let sampleElement = ownerDocument.createElement('span');
  sampleElement.className = 'sheet-wrapped-text-sample';
  sampleElement.textContent = 'abcdefghijklmnopqrstuvwxyz 0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let measuringBox = ownerDocument.createElement('div');
  counterElement.replaceChildren(sampleElement, measuringBox);
  let isShown = () => counterElement.getClientRects().length > 0;
  let sampleWidth = () => sampleElement.getBoundingClientRect().width;
  let lastSampleWidth: Dynamic = null;
  let wasMeasureSkipped: Dynamic = false;
  function createMeasuredElement(className?: Dynamic, text?: Dynamic, font?: Dynamic) {
    let element = ownerDocument.createElement('div');
    element.className = className;
    let {
      fontFamily: fontFamily,
      fontSize: fontSize,
      fontWeight: fontWeight,
      fontStyle: fontStyle,
    } = cellFontStyle({
      ...font,
      underline: 'none',
      strikethrough: false,
      color: {
        kind: 'none',
      },
    });
    Object.assign(element.style, {
      fontFamily: fontFamily ?? '',
      fontSize: `${fontSize}px`,
      lineHeight: `${nextLineHeight(font.size)}px`,
      fontWeight: fontWeight ?? '',
      fontStyle: fontStyle ?? '',
    });
    element.textContent = text;
    return element;
  }
  function partsFragment(parts?: Dynamic) {
    let fragment = ownerDocument.createDocumentFragment();
    for (let { text: text, bold: bold, italic: italic } of parts as Dynamic) {
      let span = ownerDocument.createElement('span');
      span.textContent = text;
      if (bold) span.style.fontWeight = '700';
      if (italic) span.style.fontStyle = 'italic';
      fragment.append(span);
    }
    return fragment;
  }
  function listLinesFragment(parts?: Dynamic, levelsInLists?: Dynamic) {
    let fragment = ownerDocument.createDocumentFragment();
    let lines = [[]];
    for (let part of parts as Dynamic)
      part.text
        .split(
          `
`,
        )
        .forEach((text?: Dynamic, index?: Dynamic) => {
          if (index > 0) lines.push([]);
          lines.at(-1)?.push({
            ...part,
            text: text,
          });
        });
    lines.forEach((lineParts?: Dynamic, lineIndex?: Dynamic) => {
      let line = ownerDocument.createElement('div');
      line.className = 'sheet-line-in-cell';
      let level = levelsInLists[lineIndex] ?? null;
      let list =
        level === null
          ? NO_LIST
          : {
              kind: 'bullet',
              level: level,
            };
      for (let [name, value] of Object.entries(
        listAttributesOf({
          list: list,
          number: null,
        }),
      ) as Dynamic)
        line.setAttribute(name, value);
      line.replaceChildren(partsFragment(lineParts));
      fragment.append(line);
    });
    return fragment;
  }
  function measureInBox(elements?: Dynamic, readSizes?: Dynamic) {
    if (!isShown()) {
      wasMeasureSkipped = true;
      return;
    }
    let fragment = ownerDocument.createDocumentFragment();
    for (let element of elements as Dynamic) fragment.append(element);
    measuringBox.replaceChildren(fragment);
    lastSampleWidth ??= sampleWidth();
    readSizes();
    measuringBox.replaceChildren();
  }
  function measureLineCounts(texts?: Dynamic) {
    let elements = texts.map((wrappedText?: Dynamic) => {
      let element = createMeasuredElement('sheet-wrapped-text', wrappedText.text, wrappedText.font);
      let parts = wrappedText.parts ?? [
        {
          text: wrappedText.text,
          bold: false,
          italic: false,
        },
      ];
      if (wrappedText.levelsInLists !== undefined) element.replaceChildren(listLinesFragment(parts, wrappedText.levelsInLists));
      else if (wrappedText.parts !== undefined) element.replaceChildren(partsFragment(parts));
      if (wrappedText.isFormulaTyped === true) element.style.fontFamily = MONO_FONT_FAMILY;
      element.style.width = `${wrappedText.widthInPixels}px`;
      return element;
    });
    measureInBox(
      elements,
      () =>
        texts.forEach((wrappedText?: Dynamic, index?: Dynamic) => {
          let height = (elements[index]?.getBoundingClientRect().height ?? 0) - listLineGaps(wrappedText.levelsInLists?.length ?? 1);
          let lineCount = Math.round(height / nextLineHeight(wrappedText.font.size));
          lineCounts.set(wrappedTextMeasureKey(wrappedText), Math.max(1, lineCount));
        }),
    );
  }
  return {
    lineCountsOfWrappedTexts(texts?: Dynamic) {
      let keys = texts.map(wrappedTextMeasureKey);
      let unmeasured = new (Map as Dynamic)();
      texts.forEach((wrappedText?: Dynamic, index?: Dynamic) => {
        let key = keys[index];
        if (key !== undefined && !lineCounts.has(key)) unmeasured.set(key, wrappedText);
      });
      let excess: Dynamic = lineCounts.size + unmeasured.size - maxCachedLineCounts;
      if (unmeasured.size > 0 && excess > 0) {
        let keysInUse = new (Set as Dynamic)(keys);
        for (let cachedKey of lineCounts.keys() as Dynamic) {
          if (excess === 0) break;
          if (keysInUse.has(cachedKey)) continue;
          lineCounts.delete(cachedKey);
          excess -= 1;
        }
      }
      if (unmeasured.size > 0) measureLineCounts([...unmeasured.values()]);
      let lineCountsOut = keys.map((key?: Dynamic) => lineCounts.get(key) ?? 1);
      let typedKey = keys[texts.findIndex(({ isStillTyped: isStillTyped }: Dynamic) => isStillTyped === true)];
      if (typedKey !== undefined && typedKey !== typedTextKey) {
        if (typedTextKey !== undefined) lineCounts.delete(typedTextKey);
        typedTextKey = typedKey;
      }
      return lineCountsOut;
    },
    widthOfCharacters(characters?: Dynamic, font?: Dynamic) {
      let fontKey = wrappedTextMeasureKey({
        text: '',
        font: font,
        widthInPixels: 0,
      });
      let widths = characterWidthsByFont.get(fontKey) ?? new (Map as Dynamic)();
      let sumKnownWidths = () => {
        let total: Dynamic = 0;
        for (let character of characters as Dynamic) {
          let width = widths.get(character);
          if (width === undefined) return null;
          total += width;
        }
        return total;
      };
      let knownWidth = sumKnownWidths();
      if (knownWidth !== null) return knownWidth;
      if (!isShown()) {
        wasMeasureSkipped = true;
        return 0;
      }
      characterWidthsByFont.set(fontKey, widths);
      let unmeasured = [...new (Set as Dynamic)(characters)].filter((character?: Dynamic) => !widths.has(character));
      let elements = unmeasured.map((character?: Dynamic) => createMeasuredElement('sheet-character-measured', character, font));
      measureInBox(
        elements,
        () =>
          unmeasured.forEach(
            (character?: Dynamic, index?: Dynamic) => widths.set(character, elements[index]?.getBoundingClientRect().width ?? 0),
          ),
      );
      return sumKnownWidths() ?? 0;
    },
    onTextMeasuredAnew(onMeasuredAnew?: Dynamic) {
      let measureAnew = () => {
        if (lineCounts.size + characterWidthsByFont.size === 0 && !wasMeasureSkipped) return;
        lineCounts.clear();
        characterWidthsByFont.clear();
        lastSampleWidth = null;
        wasMeasureSkipped = false;
        onMeasuredAnew();
      };
      ownerDocument.fonts.addEventListener('loadingdone', measureAnew);
      let resizeObserver =
        ownerDocument.defaultView === null
          ? null
          : new (ownerDocument.defaultView.ResizeObserver as Dynamic)(() => {
              if (!isShown()) return;
              if (wasMeasureSkipped || sampleWidth() !== lastSampleWidth) measureAnew();
            });
      resizeObserver?.observe(sampleElement);
      return () => {
        ownerDocument.fonts.removeEventListener('loadingdone', measureAnew);
        resizeObserver?.disconnect();
      };
    },
  };
}
export const MAX_CACHED_LINE_COUNTS = 1e5;
export const wrappedTextMeasureKey = ({
  text: text,
  font: { size: size, bold: bold, italic: italic },
  widthInPixels: widthInPixels,
  isFormulaTyped: isFormulaTyped,
  parts = [],
  levelsInLists = [],
}: Dynamic) => {
  let partKeys = parts.map((part?: Dynamic) => `${part.text.length}${part.bold ? 'b' : ''}${part.italic ? 'i' : ''}`);
  return `${size} ${bold} ${italic} ${isFormulaTyped === true} ${widthInPixels} ${partKeys.join()} ${levelsInLists.join()} ${text}`;
};
