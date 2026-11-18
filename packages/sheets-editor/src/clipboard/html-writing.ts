import type { Dynamic } from '../dynamic.ts';
import { strongerBorder, borderPaint, borderStyleWidth } from '../grid/borders.ts';
import { PAGE_TEXT_COLORS, PAGE_BACKGROUND_COLORS, CELL_COLOR_PALETTE } from '../format/cell-colors.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
export function cssBorderDeclaration(side?: Dynamic, neighborBorder?: Dynamic, ownBorder?: Dynamic) {
  let border = strongerBorder(neighborBorder, ownBorder);
  if (border === null) return [];
  let { onLight: color } = borderPaint(border) ?? PAGE_TEXT_COLORS;
  return cssColorDeclaration(`border-${side}`, `${borderStyleWidth(border.style)}px ${HTML_BORDER_STYLES[border.style]}`, color);
}
export function formatColorCss(tint?: Dynamic) {
  if (tint === 'black' || tint === 'white') return (tint === 'black' ? PAGE_TEXT_COLORS : PAGE_BACKGROUND_COLORS).onLight;
  return CELL_COLOR_PALETTE[FORMAT_COLOR_PALETTE_FAMILIES[tint]][600];
}
export function htmlCellAttributesOf(cellRows?: Dynamic, mergedAreas?: Dynamic, isInsideTable?: Dynamic) {
  let columnCount = cellRows[0]?.length ?? 0;
  let mergeByIndex = new (Map as Dynamic)();
  for (let mergedArea of mergedAreas as Dynamic) {
    let merge = {
      top: Math.max(mergedArea.topRowIndex, 0),
      left: Math.max(mergedArea.leftColumnIndex, 0),
      bottom: Math.min(mergedArea.topRowIndex + mergedArea.rowCount, cellRows.length) - 1,
      right: Math.min(mergedArea.leftColumnIndex + mergedArea.columnCount, columnCount) - 1,
      of: mergedArea,
    };
    for (let rowIndex: Dynamic = merge.top; rowIndex <= merge.bottom; rowIndex += 1)
      for (let columnIndex: Dynamic = merge.left; columnIndex <= merge.right; columnIndex += 1)
        mergeByIndex.set(rowIndex * columnCount + columnIndex, merge);
  }
  let bordersAt = (rowIndex?: Dynamic, columnIndex?: Dynamic) => cellRows[rowIndex]?.[columnIndex]?.look.format.border;
  let borderSideAt = (rowIndex?: Dynamic, columnIndex?: Dynamic, side?: Dynamic) => {
    let border = bordersAt(rowIndex, columnIndex)?.[side] ?? NO_BORDER_SIDE;
    return border.kind === 'line' && !Object.hasOwn(HTML_BORDER_STYLES, border.style) ? NO_BORDER_SIDE : border;
  };
  return cellRows.map(
    (row?: Dynamic, rowIndex?: Dynamic) =>
      row.map((cell?: Dynamic, columnIndex?: Dynamic) => {
        let merge = mergeByIndex.get(rowIndex * columnCount + columnIndex);
        if (merge !== undefined && (merge.top !== rowIndex || merge.left !== columnIndex)) return null;
        let { bottom = rowIndex, right = columnIndex, of: mergedArea } = merge ?? {};
        let anchorCell = mergedArea === undefined ? cell : mergedArea.first;
        let hasEdge = {
          top: mergedArea === undefined || mergedArea.topRowIndex === rowIndex,
          right: mergedArea === undefined || mergedArea.leftColumnIndex + mergedArea.columnCount - 1 === right,
          bottom: mergedArea === undefined || mergedArea.topRowIndex + mergedArea.rowCount - 1 === bottom,
          left: mergedArea === undefined || mergedArea.leftColumnIndex === columnIndex,
        };
        let { font: font, alignment: alignment } = anchorCell?.look.format ?? DEFAULT_CELL_FORMAT;
        let { text: textPaint = null, fill: fillPaint = null } = anchorCell?.look.paints ?? {};
        let backgroundStyles = fillPaint === null ? [] : cssColorDeclaration('background-color', '', fillPaint.onLight);
        let tint = anchorCell?.look.isTextColorFromRule === true ? null : (anchorCell?.tint ?? null);
        let textColor = fillPaint !== null && backgroundStyles.length === 0 ? undefined : textPaint?.onLight;
        let color = tint === null ? textColor : formatColorCss(tint);
        let isAlignmentKept = anchorCell?.alignment !== 'left' || alignment.horizontal === 'left';
        let decorations = [...(font.underline === 'none' ? [] : ['underline']), ...(font.strikethrough ? ['line-through'] : [])];
        let isDoubleUnderline = font.underline === 'double' && !font.strikethrough;
        let style = [
          ...(isInsideTable ? [] : [HTML_CELL_BORDER_STYLE]),
          ...(hasEdge.top
            ? cssBorderDeclaration('top', borderSideAt(rowIndex - 1, columnIndex, 'bottom'), borderSideAt(rowIndex, columnIndex, 'top'))
            : []),
          ...(hasEdge.right ? cssBorderDeclaration('right', borderSideAt(rowIndex, right, 'right'), borderSideAt(rowIndex, right + 1, 'left')) : []),
          ...(hasEdge.bottom
            ? cssBorderDeclaration('bottom', borderSideAt(bottom, columnIndex, 'bottom'), borderSideAt(bottom + 1, columnIndex, 'top'))
            : []),
          ...(hasEdge.left
            ? cssBorderDeclaration('left', borderSideAt(rowIndex, columnIndex - 1, 'right'), borderSideAt(rowIndex, columnIndex, 'left'))
            : []),
          ...(font.size === DEFAULT_CELL_FORMAT.font.size || !Number.isFinite(font.size) ? [] : [`font-size:${font.size}pt`]),
          ...(font.bold ? ['font-weight:bold'] : []),
          ...(font.italic ? ['font-style:italic'] : []),
          ...(decorations.length === 0 ? [] : [`text-decoration:${decorations.join(' ')}`]),
          ...(isDoubleUnderline ? ['text-decoration-style:double'] : []),
          ...(color === undefined ? [] : cssColorDeclaration('color', '', color)),
          ...backgroundStyles,
          ...(isAlignmentKept && ['left', 'center', 'right'].includes(anchorCell?.alignment ?? '') ? [`text-align:${anchorCell?.alignment}`] : []),
          ...(Object.hasOwn(HTML_VERTICAL_ALIGN, alignment.vertical) ? [`vertical-align:${HTML_VERTICAL_ALIGN[alignment.vertical]}`] : []),
        ].join(';');
        return [
          ...(bottom === rowIndex ? [] : [` rowspan="${bottom - rowIndex + 1}"`]),
          ...(right === columnIndex ? [] : [` colspan="${right - columnIndex + 1}"`]),
          ...(style === '' ? [] : [` style="${style}"`]),
        ].join('');
      }),
  );
}
export const HTML_CELL_BORDER_STYLE = 'border:1px solid #ccc';
export const HTML_BORDERED_STYLE_ATTRIBUTE = ` style="${HTML_CELL_BORDER_STYLE}"`;
export const HTML_BORDER_STYLES = {
  thin: 'solid',
  medium: 'solid',
  thick: 'solid',
  dashed: 'dashed',
  dotted: 'dotted',
  double: 'double',
};
export const NO_BORDER_SIDE = {
  kind: 'none',
};
export const HTML_VERTICAL_ALIGN = {
  center: 'middle',
  bottom: 'bottom',
};
export const cssColorDeclaration = (property?: Dynamic, prefix?: Dynamic, color?: Dynamic) =>
  /^#[0-9a-f]{6}$/i.test(color) ? [`${property}:${prefix === '' ? '' : `${prefix} `}${color}`] : [];
export const FORMAT_COLOR_PALETTE_FAMILIES = {
  blue: 'blue',
  cyan: 'teal',
  gray: 'gray',
  green: 'green',
  magenta: 'magenta',
  orange: 'orange',
  red: 'red',
  violet: 'purple',
  yellow: 'yellow',
};
