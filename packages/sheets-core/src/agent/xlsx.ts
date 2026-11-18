/**
 * A Sheet as an .xlsx file: the engine writes the file's parts (readXlsxFile), given the RGB of the page's standard
 * colors and the charts it can describe; the caller zips the parts. What Excel shows differently comes back as
 * `notCarriedOver`, which excelDifferences puts in the page's words.
 */

import type { DescribedChart } from './chart-descriptions.ts';
import type { EngineMessage } from './engine.ts';

/** The name of the sheet an .xlsx file gets for the options of its dropdowns. */
export const DROPDOWN_OPTIONS_SHEET = 'Dropdown options';

export type StandardHue = 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'magenta';
export type StandardShade = '100' | '200' | '300' | '400' | '600' | '800';

/** The page's standard colors (a dropdown option's, a cell's fill) as RGB, by hue and shade. */
export const STANDARD_COLORS: Readonly<Record<StandardHue, Readonly<Record<StandardShade, string>>>> = {
  gray: { '100': '#e0e0e0', '200': '#c2c2c2', '300': '#a4a4a4', '400': '#878787', '600': '#515151', '800': '#202020' },
  red: { '100': '#fad6d6', '200': '#f4abab', '300': '#ec7e7e', '400': '#e34948', '600': '#8e2626', '800': '#3c0e0e' },
  orange: { '100': '#f7d8cb', '200': '#f4ae94', '300': '#ec835a', '400': '#d95926', '600': '#863311', '800': '#371407' },
  yellow: { '100': '#f9dca4', '200': '#fab219', '300': '#db9300', '400': '#b77700', '600': '#734500', '800': '#311a00' },
  green: { '100': '#caeac7', '200': '#91d68b', '300': '#55bf50', '400': '#0ca30c', '600': '#006300', '800': '#11260f' },
  teal: { '100': '#bfebdb', '200': '#7ad7b4', '300': '#3bbd8c', '400': '#199e70', '600': '#065f49', '800': '#022720' },
  blue: { '100': '#cde2fb', '200': '#9ec5f4', '300': '#6da7ec', '400': '#3987e5', '600': '#184f95', '800': '#032042' },
  purple: { '100': '#dfdbfd', '200': '#bfb9f5', '300': '#a096eb', '400': '#8173e3', '600': '#4a3aa7', '800': '#1d1649' },
  magenta: { '100': '#f9d4e2', '200': '#f3a8c3', '300': '#e87ba4', '400': '#d55181', '600': '#862a4c', '800': '#390f1f' },
};

/** What readXlsxFile is asked, with the charts it is to write. */
export function xlsxRequest(charts: readonly DescribedChart[]): EngineMessage {
  return { kind: 'readXlsxFile', nameOfTheSheetOfOptions: DROPDOWN_OPTIONS_SHEET, rgbOfStandardColors: STANDARD_COLORS, charts };
}

/** One part of an .xlsx file, as readXlsxFile writes it. */
export interface XlsxPart {
  path: string;
  xml: string;
}

/** The parts of readXlsxFile's answer, or null when it is not an xlsxFile. */
export function xlsxPartsOf(answer: EngineMessage): XlsxPart[] | null {
  if (answer.kind !== 'xlsxFile' || !Array.isArray(answer.parts)) return null;
  const parts: XlsxPart[] = [];
  for (const part of answer.parts) {
    if (typeof part !== 'object' || part === null) return null;
    const { path, xml } = part as { path?: unknown; xml?: unknown };
    if (typeof path !== 'string' || typeof xml !== 'string') return null;
    parts.push({ path, xml });
  }
  return parts;
}

/** A file name for the workbook: its title, else its first sheet's name, with what no file name holds taken out. */
export function xlsxFileName(title: string | null, firstSheet: string): string {
  const stem = (title ?? '').trim() || firstSheet.trim() || 'Sheet';
  // eslint-disable-next-line no-control-regex
  const clean = stem.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 120);
  return `${clean || 'Sheet'}.xlsx`;
}

/** What Excel shows differently, in the page's words. */
const EXCEL_DIFFERENCES: Record<string, string> = {
  formulasWrittenAsValues: 'Some formulas are saved as their values.',
  randomNumbersThatStay: 'Random numbers change when the file is opened.',
  users: 'People appear as their names.',
  checkboxes: 'Checkboxes appear as TRUE or FALSE.',
  colorsOfDropdownOptions: 'Dropdown options have no colors.',
  sheetNames: 'Some sheet names are shortened or changed.',
  looksOfSomeBlankCells: 'Some empty cells have no formatting.',
  linksOfPartsOfTexts: 'Links on part of a cell’s text become one link for the whole cell.',
  linksOfSomeCells: 'Some links aren’t included.',
  sizesOfTheLargestRowsAndColumns: 'Very tall rows and wide columns are made smaller.',
  conditionalFormats: 'Conditional formatting isn’t included.',
  placedViews: 'Charts aren’t included.',
  looksOfCharts: 'Included charts look different.',
};

/** readXlsxFile's notCarriedOver in the page's words (a kind the page has no words for is given as it is). */
export function excelDifferences(notCarriedOver: unknown): string[] {
  if (!Array.isArray(notCarriedOver)) return [];
  return notCarriedOver.map((what) =>
    what === 'placedViews' && notCarriedOver.includes('looksOfCharts') ? 'Some charts aren’t included.' : (EXCEL_DIFFERENCES[String(what)] ?? String(what)),
  );
}
