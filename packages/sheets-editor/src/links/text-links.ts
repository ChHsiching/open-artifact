import type { Dynamic } from '../dynamic.ts';
import { safeLinkUrl, MAX_LINK_URL_LENGTH, shortenUrlMiddle, MAX_SHOWN_LINK_LENGTH, encodedLinkUrl } from './cell-links.ts';
import { richTextPlainText } from '../model/cell-values.ts';
import { shownCellText } from '../format/shown-text.ts';
export function trimUrlTrailingPunctuation(text?: Dynamic) {
  let counts = new (Map as Dynamic)();
  for (let character of text as Dynamic) counts.set(character, (counts.get(character) ?? 0) + 1);
  let end: Dynamic = text.length;
  for (; end > 0; end -= 1) {
    let character = text.charAt(end - 1);
    if (URL_TRAILING_PUNCTUATION.includes(character)) continue;
    let [count, openerCount] = [counts.get(character) ?? 0, counts.get(CLOSING_BRACKET_OPENERS[character] ?? '')];
    if (CLOSING_BRACKET_OPENERS[character] === undefined || count <= (openerCount ?? 0)) break;
    counts.set(character, count - 1);
  }
  return text.slice(0, end);
}
export function urlOfTextMatch(text?: Dynamic) {
  if (CONTROL_OR_BACKSLASH_PATTERN.test(text)) return null;
  let url = safeLinkUrl(text);
  if (url === null) return null;
  let withoutScheme = text.replace(/^https?:\/\//i, '');
  if (withoutScheme.split('/', 1)[0]?.includes('@') === true) return null;
  let [host = ''] = withoutScheme.split(/[/?#]/);
  let hostname = host.replace(/:\d*$/, '').replaceAll(/[A-Z]/g, (input?: Dynamic) => input.toLowerCase());
  return PLAIN_HOSTNAME_PATTERN.test(hostname) && hostname === new (URL as Dynamic)(url).hostname ? url : null;
}
export function findLinksInText(text?: Dynamic) {
  let parts: Dynamic = [];
  let addresses = new (Set as Dynamic)();
  let [candidateCount, linkCount, end]: Dynamic = [0, 0, 0];
  for (let { 0: match, index: index } of text.matchAll(URL_IN_TEXT_PATTERN) as Dynamic) {
    if (linkCount === MAX_LINKS_IN_TEXT || candidateCount === MAX_URL_CANDIDATES) break;
    candidateCount += 1;
    if (match.length > 2 * MAX_LINK_URL_LENGTH) continue;
    let before = text.charAt(index - 1);
    if (URL_GLUED_BEFORE_PATTERN.test(before)) continue;
    if (URL_PUNCTUATION_BEFORE_PATTERN.test(before) && /^www\./i.test(match)) continue;
    let trimmed = trimUrlTrailingPunctuation(match);
    let url = urlOfTextMatch(trimmed);
    if (url === null || shortenUrlMiddle(MAX_SHOWN_LINK_LENGTH, url) !== url) continue;
    if (index > end)
      parts.push({
        text: text.slice(end, index),
        startsAt: end,
        url: null,
        ...PLAIN_LINK_PART_LOOK,
      });
    parts.push({
      text: trimmed,
      startsAt: index,
      url: url,
      ...PLAIN_LINK_PART_LOOK,
    });
    addresses.add(url);
    linkCount += 1;
    end = index + trimmed.length;
  }
  if (end < text.length)
    parts.push({
      text: text.slice(end),
      startsAt: end,
      url: null,
      ...PLAIN_LINK_PART_LOOK,
    });
  return linkCount === 0
    ? NO_TEXT_LINKS
    : {
        parts: parts,
        addresses: [...addresses],
      };
}
export function acceptedLinkUrl(text?: Dynamic) {
  let url = safeLinkUrl(text);
  return url !== null && shortenUrlMiddle(MAX_SHOWN_LINK_LENGTH, url) === url ? url : null;
}
export function acceptedEncodedLinkUrl(url?: Dynamic) {
  let encoded = encodedLinkUrl(safeLinkUrl(url));
  return encoded === null ? null : acceptedLinkUrl(encoded);
}
export function runsWithoutAddressLinks(text?: Dynamic, runs?: Dynamic) {
  if (runs.every(({ link: link }: Dynamic) => link === null) || !MAY_HOLD_URL_PATTERN.test(text)) return runs;
  let partsByStart = new (Map as Dynamic)(findLinksInText(text).parts.map((part: Dynamic) => [part.startsAt, part]));
  let kept: Dynamic = [];
  let [first, end, startsAt, endsAt]: Dynamic = [0, 0, 0, 0];
  for (; first < runs.length; [first, startsAt] = [end, endsAt]) {
    let link = runs[first]?.link ?? null;
    for (; end < runs.length && runs[end]?.link === link; end += 1) endsAt += runs[end]?.text.length ?? 0;
    let { text: partText = '', url: partUrl = null } = partsByStart.get(startsAt) ?? {};
    let isAddressLink =
      link !== null && partUrl !== null && partText.length === endsAt - startsAt && acceptedEncodedLinkUrl(partUrl) === link;
    for (let run of runs.slice(first, end) as Dynamic)
      kept.push(
        isAddressLink
          ? {
              ...run,
              link: null,
            }
          : run,
      );
  }
  return kept;
}
export function findLinksInRichText({ paragraphs: paragraphs }: Dynamic, text?: Dynamic) {
  let foundLinks = MAY_HOLD_URL_PATTERN.test(text) ? findLinksInText(text).parts : [];
  let addresses = new (Set as Dynamic)();
  let keepAddress = (input?: Dynamic) => {
    if (input === null || (!addresses.has(input) && addresses.size === MAX_LINKS_IN_TEXT)) return null;
    addresses.add(input);
    return input;
  };
  let runs = paragraphs.flatMap(
    ({ runs: runs2 }: Dynamic, index?: Dynamic) => [
      ...(index === 0
        ? []
        : [
            {
              text: `
`,
              marks: NO_TEXT_MARKS,
              link: null,
            },
          ]),
      ...runs2,
    ],
  );
  let runStarts: Dynamic = [];
  runs.reduce((start?: Dynamic, run?: Dynamic, index?: Dynamic) => ((runStarts[index] = start), start + run.text.length), 0);
  let overlapsLink = (from?: Dynamic, to?: Dynamic) =>
    runs.some(
      ({ text: text2, link: link }: Dynamic, index?: Dynamic) =>
        link !== null && (runStarts[index] ?? 0) < to && (runStarts[index] ?? 0) + text2.length > from,
    );
  return {
    parts: runs.flatMap(({ text: text2, marks: marks, link: link }: Dynamic, index?: Dynamic) => {
      let [start, end] = [runStarts[index] ?? 0, (runStarts[index] ?? 0) + text2.length];
      if (link !== null || foundLinks.length === 0) {
        let url = link === null ? null : keepAddress(acceptedLinkUrl(link));
        return [
          {
            text: text2,
            startsAt: start,
            url: url,
            isLinkOnWords: url !== null,
            marks: marks,
          },
        ];
      }
      return foundLinks.flatMap(({ text: text3, startsAt: startsAt, url: url }: Dynamic) => {
        let [from, to] = [Math.max(start, startsAt), Math.min(end, startsAt + text3.length)];
        if (from >= to) return [];
        let isClear = !overlapsLink(startsAt, startsAt + text3.length);
        return [
          {
            text: text.slice(from, to),
            startsAt: from,
            url: isClear ? keepAddress(url) : null,
            isLinkOnWords: false,
            marks: marks,
          },
        ];
      });
    }),
    addresses: [...addresses],
  };
}
export function runsWithLinksOnWords(text?: Dynamic, runs?: Dynamic) {
  let kept = [...runsWithoutAddressLinks(text, runs)];
  let { parts: parts } = findLinksInRichText(
    {
      paragraphs: [
        {
          list: {
            kind: 'none',
          },
          runs: kept,
        },
      ],
    },
    text,
  );
  let linkStarts = new (Set as Dynamic)(parts.flatMap((part: Dynamic) => (part.isLinkOnWords ? [part.startsAt] : [])));
  let startsAt: Dynamic = 0;
  for (let [index, run] of kept.entries() as Dynamic) {
    if (run.link !== null && !linkStarts.has(startsAt))
      kept[index] = {
        ...run,
        link: null,
      };
    startsAt += run.text.length;
  }
  return kept;
}
export function groupLinkParts(parts?: Dynamic) {
  let groups: Dynamic = [];
  for (let part of parts as Dynamic) {
    let previous = groups.at(-1)?.at(-1);
    if (
      previous !== undefined &&
      part.url !== null &&
      part.url === previous.url &&
      !part.isLinkOnWords &&
      !previous.isLinkOnWords &&
      part.startsAt === previous.startsAt + previous.text.length
    )
      groups.at(-1)?.push(part);
    else groups.push([part]);
  }
  return groups;
}
export function cellTextLinks(cell: Dynamic, { cellControl: cellControl }: Dynamic, text?: Dynamic, overrideLink?: Dynamic) {
  if (cell === null || cellControl.kind === 'dropdown' || overrideLink !== null) return NO_TEXT_LINKS;
  let { input: cellInput } = cell;
  let richText = cellInput.kind === 'richText' ? richTextPlainText(cell) : null;
  if (!(cellInput.kind === 'text' ? cellInput.value === text : richText !== null && richText === text)) return NO_TEXT_LINKS;
  if (cellInput.kind !== 'richText' && !MAY_HOLD_URL_PATTERN.test(text)) return NO_TEXT_LINKS;
  let cached = CELL_TEXT_LINKS_CACHE.get(cell);
  if (cached?.text === text) return cached.links;
  let links = cellInput.kind === 'richText' ? findLinksInRichText(cellInput, text) : findLinksInText(text);
  CELL_TEXT_LINKS_CACHE.set(cell, {
    text: text,
    links: links,
  });
  return links;
}
export function cellLinkAddresses(sheet?: Dynamic, cellId?: Dynamic) {
  let [cell, format] = [sheet.cellOf(cellId), sheet.formatOf(cellId)];
  let { text: text } = shownCellText(cell, 1 / 0, sheet.decimalSign);
  return cellTextLinks(cell, format, text, null).addresses;
}
export function singleAddressList(addresses?: Dynamic, address?: Dynamic) {
  if (!addresses.includes(address)) return NO_TEXT_LINKS.addresses;
  let byAddress = SINGLE_ADDRESS_CACHE.get(addresses) ?? new (Map as Dynamic)();
  SINGLE_ADDRESS_CACHE.set(addresses, byAddress);
  let list = byAddress.get(address) ?? [address];
  byAddress.set(address, list);
  return list;
}
export function linkAddressesOfCell(sheet?: Dynamic, cellId?: Dynamic, chosenAddress?: Dynamic) {
  let cell = sheet.cellOf(cellId);
  if (chosenAddress === null || cell === null) return cellLinkAddresses(sheet, cellId);
  let cached = CHOSEN_ADDRESS_CACHE.get(cell);
  if (cached?.[0] === chosenAddress) return cached;
  let list = [chosenAddress];
  CHOSEN_ADDRESS_CACHE.set(cell, list);
  return list;
}
export const NO_TEXT_MARKS: Dynamic = [];
export const PLAIN_LINK_PART_LOOK = {
  isLinkOnWords: false,
  marks: NO_TEXT_MARKS,
};
export const MAX_LINKS_IN_TEXT = 10;
export const MAX_URL_CANDIDATES = 30;
export const URL_IN_TEXT_PATTERN = /https?:\/\/[^\s<>"'`。，、；：！？]+|\bwww\.[^\s<>"'`。，、；：！？]+/gi;
export const URL_GLUED_BEFORE_PATTERN = /[A-Za-z\d@.-]/;
export const URL_PUNCTUATION_BEFORE_PATTERN = /[/:=?&#%]/;
export const URL_TRAILING_PUNCTUATION = '.,;:!?\f\r\uFEFF*_';
export const CLOSING_BRACKET_OPENERS = {
  ')': '(',
  ']': '[',
  '}': '{',
};
export const CONTROL_OR_BACKSLASH_PATTERN = /[\p{C}\\]/u;
export const PLAIN_HOSTNAME_PATTERN = /^[a-z\d-]+(?:\.[a-z\d-]+)+$/;
export const NO_TEXT_LINKS = {
  parts: [],
  addresses: [],
};
export const MAY_HOLD_URL_PATTERN = /https?:\/\/|www\./i;
export const textHasLinks = (text?: Dynamic) => MAY_HOLD_URL_PATTERN.test(text) && findLinksInText(text).addresses.length > 0;
export const CELL_TEXT_LINKS_CACHE = new (WeakMap as Dynamic)();
export const SINGLE_ADDRESS_CACHE = new (WeakMap as Dynamic)();
export const CHOSEN_ADDRESS_CACHE = new (WeakMap as Dynamic)();
