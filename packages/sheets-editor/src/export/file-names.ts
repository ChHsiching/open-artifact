import type { Dynamic } from '../dynamic.ts';
export let MAX_FILE_NAME_CHARACTERS: Dynamic;
export let MAX_FILE_NAME_BYTES: Dynamic;
export function truncatedFileNameStem(title?: Dynamic, suffix?: Dynamic, extension?: Dynamic) {
  let stem: Dynamic = '';
  for (let grapheme of graphemesOf(cleanFileNamePart(title ?? '')) as Dynamic) {
    let candidate = stem + grapheme + suffix;
    if (Array.from<Dynamic>(candidate).length > MAX_FILE_NAME_CHARACTERS) break;
    if (utf8ByteLength(candidate + extension) > MAX_FILE_NAME_BYTES) break;
    stem += grapheme;
  }
  let trimmed = stem.replace(EDGE_SPACES_AND_DOTS_PATTERN, '');
  return trimmed === '' ? null : trimmed;
}
export function fileNameOfSheet(title?: Dynamic) {
  let cleaned = cleanFileNamePart(title);
  return cleaned === '' ? 'Sheet' : cleaned;
}
export function csvFileName(workbookTitle?: Dynamic, sheetName?: Dynamic) {
  let sheetFileName = fileNameOfSheet(sheetName);
  let sheetSuffix = cleanFileNamePart(workbookTitle ?? '').toLowerCase() === sheetFileName.toLowerCase() ? '' : ` - ${sheetFileName}`;
  let stem = truncatedFileNameStem(workbookTitle, sheetSuffix, '.csv');
  return stem === null ? `${sheetFileName}.csv` : `${stem}${sheetSuffix}.csv`;
}
[MAX_FILE_NAME_CHARACTERS, MAX_FILE_NAME_BYTES] = [120, 240];
export const utf8ByteLength = (text?: Dynamic) => new (TextEncoder as Dynamic)().encode(text).length;
export const graphemesOf = (text?: Dynamic) =>
  'Segmenter' in Intl
    ? Array.from<Dynamic, Dynamic>(new (Intl.Segmenter as Dynamic)().segment(text), ({ segment: segment }: Dynamic) => segment)
    : Array.from<Dynamic>(text);
export const EDGE_SPACES_AND_DOTS_PATTERN = /^[\s.]+|[\s.]+$/gu;
export const INVISIBLE_CHARACTERS_PATTERN = /[\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu;
export const UNSAFE_FILE_NAME_CHARACTERS_PATTERN =
  /[\s\p{Cc}\u2800\uFFFC\u{1D159}\u{13441}\u{13442}\u{16910}\u115F\u1160\u3164\uFFA0\\/:*?"<>|%]+/gu;
export const cleanFileNamePart = (text?: Dynamic) =>
  text.replace(INVISIBLE_CHARACTERS_PATTERN, '').replace(UNSAFE_FILE_NAME_CHARACTERS_PATTERN, ' ').replace(EDGE_SPACES_AND_DOTS_PATTERN, '');
export const xlsxFileName = (workbookTitle?: Dynamic, sheetName?: Dynamic) =>
  `${truncatedFileNameStem(workbookTitle, '', '.xlsx') ?? fileNameOfSheet(sheetName)}.xlsx`;
