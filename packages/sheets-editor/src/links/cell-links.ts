import type { Dynamic } from '../dynamic.ts';
import { isCellShownBlank } from '../format/shown-text.ts';
import { isCheckboxFormat } from '../chips/checkboxes.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { tokenizeFormulaWithReferences, isSignToken, tokenizeFormula, upperCaseAsciiLetters } from '../formulas/tokenizer.ts';
export function tryParseUrl(text?: Dynamic) {
  try {
    return new (URL as Dynamic)(text);
  } catch {
    return null;
  }
}
export function safeLinkUrl(text?: Dynamic) {
  let trimmed = text.trim();
  let isSchemeless = SCHEMELESS_WWW_PATTERN.test(trimmed);
  let withScheme = isSchemeless ? `https://${trimmed}` : trimmed;
  if (withScheme.length > MAX_LINK_URL_LENGTH || !/^https?:\/\/\S+$/i.test(withScheme)) return null;
  let url = tryParseUrl(withScheme);
  if (url === null) return null;
  let { href: href, hostname: hostname, username: username, password: password } = url;
  return href.length > MAX_LINK_URL_LENGTH ||
    username !== '' ||
    password !== '' ||
    hostname.endsWith('.') ||
    hostname.length > MAX_HOSTNAME_LENGTH ||
    (isSchemeless && !WWW_HOSTNAME_PATTERN.test(hostname)) ||
    `.${hostname}`.endsWith('.agentusercontent.com')
    ? null
    : href;
}
export function linkedUrlOfCell(cell?: Dynamic, format?: Dynamic) {
  let url = cell.linksTo === undefined ? null : safeLinkUrl(cell.linksTo);
  if (url === null || shortenUrlMiddle(MAX_SHOWN_LINK_LENGTH, url) !== url) return null;
  return isCellShownBlank(cell) || (isCheckboxFormat(format) && cellValueOf(cell)?.kind === 'boolean') ? null : url;
}
export function readCellLink(cell?: Dynamic, format?: Dynamic) {
  if (cell === null || format.cellControl.kind === 'dropdown') return null;
  let typedText = cell.input.kind === 'text' ? cell.input.value : null;
  let url = typedText === null ? linkedUrlOfCell(cell, format) : safeLinkUrl(typedText);
  if (url === null) return null;
  if (typedText === null)
    return {
      url: url,
      drawnAs: 'words',
    };
  return {
    url: url,
    drawnAs: SCHEMELESS_WWW_PATTERN.test(typedText.trim()) ? 'addressWithoutScheme' : 'address',
  };
}
export function isLinkBuilt(cell?: Dynamic) {
  if (cell?.input.kind !== 'formula') return cell?.linksTo !== undefined;
  let { formula: formula } = cell.input;
  let tokens2 = tokenizeFormulaWithReferences(formula);
  let hasOpenQuote =
    tokens2.some((input?: Dynamic) => isSignToken(input, "'")) ||
    formula.textBetweenReferences.some((input?: Dynamic) => tokenizeFormula(input, 'point').isQuotationLeftOpen);
  let hyperlinkIndexes = tokens2.flatMap(
    (token?: Dynamic, index?: Dynamic) => (token.kind === 'name' && upperCaseAsciiLetters(token.text).includes('HYPERLINK') ? [index] : []),
  );
  return (
    hasOpenQuote || hyperlinkIndexes.length === 0 || !hyperlinkIndexes.every((input?: Dynamic) => isHyperlinkWithTextAddress(tokens2, input))
  );
}
export function shortenUrlMiddle(maxLength?: Dynamic, url?: Dynamic) {
  let { origin: origin } = new (URL as Dynamic)(url);
  let rest = url.slice(origin.length);
  if (rest.length <= maxLength) return url;
  let tailLength = Math.floor(maxLength / 3);
  return `${origin}${rest.slice(0, maxLength - tailLength)}…${rest.slice(-tailLength)}`;
}
export const MAX_LINK_URL_LENGTH = 2048;
export const MAX_HOSTNAME_LENGTH = 253;
export const SCHEMELESS_WWW_PATTERN = /^[Ww]{3}\.[!-~]*$/;
export const WWW_HOSTNAME_PATTERN = /^www(?:\.[a-z\d-]+){2,}$/;
export const encodedLinkUrl = (url?: Dynamic) =>
  url?.replaceAll(/[^\w\-.~:/?#[\]@!$&'()*+,;=%]|%(?![\dA-Fa-f]{2})/g, encodeURIComponent) ?? null;
export const MAX_SHOWN_LINK_LENGTH = 240;
export const isHyperlinkWithTextAddress = (tokens2?: Dynamic, index?: Dynamic) => {
  let [openKind, argumentKind, followingKind] = tokens2.slice(index + 1, index + 4).map(({ kind: kind }: Dynamic) => kind);
  return openKind === 'open' && argumentKind === 'text' && (followingKind === 'betweenArguments' || followingKind === 'close');
};
