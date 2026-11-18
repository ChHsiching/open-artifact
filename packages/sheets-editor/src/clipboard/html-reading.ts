import type { Dynamic } from '../dynamic.ts';
export function decodeHtmlEntities(html?: Dynamic) {
  if (!html.includes('&')) return html;
  let decoded: Dynamic = '';
  let copiedUpTo: Dynamic = 0;
  for (let match of html.matchAll(HTML_ENTITY_PATTERN) as Dynamic) {
    let [entity, hexDigits, decimalDigits, entityName] = match;
    let codePoint = hexDigits === undefined ? Number(decimalDigits) : Number.parseInt(hexDigits, 16);
    let character =
      codePoint > 0 && codePoint <= 1114111 && (codePoint < 55296 || codePoint > 57343) ? String.fromCodePoint(codePoint) : undefined;
    let replacement = entityName === undefined ? character : HTML_NAMED_ENTITIES.get(entityName);
    if (replacement === undefined) return null;
    decoded += html.slice(copiedUpTo, match.index) + replacement;
    copiedUpTo = match.index + entity.length;
  }
  return decoded + html.slice(copiedUpTo);
}
export function clampHtmlSpan(attributeValue?: Dynamic, most?: Dynamic) {
  let span = Number.parseInt(attributeValue ?? '', 10);
  return Number.isNaN(span) ? 1 : Math.min(Math.max(span, 1), most);
}
export function* readHtmlTags(html?: Dynamic): Generator<Dynamic, Dynamic, Dynamic> {
  let readAt: Dynamic = 0;
  let textStart: Dynamic = 0;
  let isAfterText: Dynamic = false;
  let writtenBefore: Dynamic = '';
  for (;;) {
    let tagStart = html.indexOf('<', readAt);
    if (tagStart === -1) return;
    isAfterText ||= !isBlankHtmlText(html.slice(readAt, tagStart));
    HTML_TAG_START_PATTERN.lastIndex = tagStart;
    let tagMatch = HTML_TAG_START_PATTERN.exec(html);
    let isMarkupDeclaration = html[tagStart + 1] === '!' || html[tagStart + 1] === '?';
    if (tagMatch === null && !isMarkupDeclaration) {
      isAfterText = true;
      readAt = tagStart + 1;
      continue;
    }
    writtenBefore += html.slice(textStart, tagStart);
    if (tagMatch === null) {
      let value = html.startsWith('<!--', tagStart);
      let value2 = value ? html.indexOf('-->', tagStart + 4) : html.indexOf('>', tagStart);
      if (value2 === -1) return;
      readAt = value2 + (value ? 3 : 1);
      textStart = readAt;
      continue;
    }
    let tagName = (tagMatch[2] ?? '').toLowerCase();
    let attributes = new (Map as Dynamic)();
    readAt = HTML_TAG_START_PATTERN.lastIndex;
    for (;;) {
      HTML_TAG_END_PATTERN.lastIndex = readAt;
      if (HTML_TAG_END_PATTERN.test(html)) {
        readAt = HTML_TAG_END_PATTERN.lastIndex;
        break;
      }
      HTML_ATTRIBUTE_PATTERN.lastIndex = readAt;
      let match = HTML_ATTRIBUTE_PATTERN.exec(html);
      let value = decodeHtmlEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? '');
      if (match === null || value === null) {
        yield {
          kind: 'unreadable',
        };
        return;
      }
      let attributeName = (match[1] ?? '').toLowerCase();
      if (!attributes.has(attributeName)) attributes.set(attributeName, value);
      readAt = HTML_ATTRIBUTE_PATTERN.lastIndex;
    }
    let isClosing = tagMatch[1] === '/';
    yield {
      kind: 'tag',
      name: tagName,
      isClosing: isClosing,
      attributes: attributes,
      isAfterText: isAfterText,
      writtenBefore: writtenBefore,
    };
    isAfterText = false;
    writtenBefore = '';
    textStart = readAt;
    if (isClosing || !RAW_TEXT_TAGS.has(tagName)) continue;
    let rawTextEnd = new (RegExp as Dynamic)(`</${tagName}[\\s/>]`, 'gi');
    rawTextEnd.lastIndex = readAt;
    let rawTextEndIndex = rawTextEnd.exec(html)?.index ?? html.length;
    if (tagName === 'style')
      yield {
        kind: 'styleSheet',
        text: html.slice(readAt, rawTextEndIndex),
      };
    readAt = rawTextEndIndex;
    textStart = readAt;
  }
}
export function indexOfUnquoted(text?: Dynamic, from?: Dynamic, stopCharacters?: Dynamic) {
  let openQuote: Dynamic = null;
  for (let index: Dynamic = from; index < text.length; index += 1) {
    let character = text.charAt(index);
    if (character === '\\') index += 1;
    else if (openQuote !== null) openQuote = character === openQuote ? null : openQuote;
    else if (character === '"' || character === "'") openQuote = character;
    else if (stopCharacters.includes(character)) return index;
  }
  return text.length;
}
export function parseCssDeclarations(declarationsText?: Dynamic) {
  let declarations = new (Map as Dynamic)();
  for (let index: Dynamic = 0; index < declarationsText.length; ) {
    let declarationEnd = indexOfUnquoted(declarationsText, index, ';');
    let declaration = declarationsText.slice(index, declarationEnd);
    let colonIndex = declaration.indexOf(':');
    if (colonIndex !== -1) declarations.set(declaration.slice(0, colonIndex).trim().toLowerCase(), declaration.slice(colonIndex + 1).trim());
    index = declarationEnd + 1;
  }
  return declarations;
}
export function stripCssComments(css?: Dynamic) {
  let pieces: Dynamic = [];
  for (let index: Dynamic = 0; ; ) {
    let commentStart = css.indexOf('/*', index);
    pieces.push(css.slice(index, commentStart === -1 ? undefined : commentStart));
    let commentEnd = commentStart === -1 ? -1 : css.indexOf('*/', commentStart + 2);
    if (commentEnd === -1) return pieces.join(' ');
    index = commentEnd + 2;
  }
}
export function* readCssClassRules(css?: Dynamic): Generator<Dynamic, Dynamic, Dynamic> {
  let cleaned = stripCssComments(css.replaceAll(/<!--|-->/g, ' '));
  for (let index: Dynamic = 0; index < cleaned.length; ) {
    let blockStart = indexOfUnquoted(cleaned, index, '{');
    let blockEnd = indexOfUnquoted(cleaned, blockStart + 1, '}');
    let classNames2 = cleaned
      .slice(index, blockStart)
      .split(',')
      .flatMap((selector?: Dynamic) => CSS_CLASS_SELECTOR_PATTERN.exec(selector.trim())?.[1] ?? []);
    if (classNames2.length > 0)
      yield {
        classNames: classNames2,
        declarations: parseCssDeclarations(cleaned.slice(blockStart + 1, blockEnd)),
      };
    index = blockEnd + 1;
  }
}
export function unquoteCssString(input?: Dynamic) {
  return (/^(["'])([^]*)\1$/.exec(input)?.[2] ?? input).replaceAll(
    CSS_ESCAPE_PATTERN,
    (escape?: Dynamic, hexDigits?: Dynamic, escapedCharacter?: Dynamic) => {
      if (hexDigits === undefined) return escapedCharacter ?? '';
      let codePoint = Number.parseInt(hexDigits, 16);
      return codePoint > 0 && (codePoint < 55296 || codePoint > 57343) ? String.fromCodePoint(codePoint) : '';
    },
  );
}
export const HTML_NAMED_ENTITIES = new (Map as Dynamic)([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
]);
export const HTML_ENTITY_PATTERN = /&(?:#x([0-9a-f]+)|#([0-9]+)|([a-z][a-z0-9]*));/gi;
export const colspanOf = (attributes?: Dynamic) => clampHtmlSpan(attributes.get('colspan'), 1000);
export const rowspanOf = (attributes?: Dynamic) =>
  Number.parseInt(attributes.get('rowspan') ?? '', 10) === 0 ? null : clampHtmlSpan(attributes.get('rowspan'), 65534);
export const HTML_TAG_START_PATTERN = /<(\/?)([a-z][^\s/>]*)/iy;
export const HTML_ATTRIBUTE_PATTERN = /[\s/]*([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
export const HTML_TAG_END_PATTERN = /[\s/]*>/y;
export const RAW_TEXT_TAGS = new (Set as Dynamic)(['script', 'style', 'textarea', 'title', 'xmp']);
export const isBlankHtmlText = (text?: Dynamic) => !/\S/.test(text.replaceAll('&nbsp;', ''));
export const CSS_CLASS_SELECTOR_PATTERN = /^\.([a-z_][\w-]*)$/i;
export const CSS_ESCAPE_PATTERN = /\\(?:([0-9a-f]{4})|([^]))/gi;
