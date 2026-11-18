import type { Dynamic } from '../dynamic.ts';
export function dropStrayClosingBraces(text?: Dynamic) {
  let openers: Dynamic = [];
  let kept: Dynamic = '';
  let inString: Dynamic = false;
  for (let index: Dynamic = 0; index < text.length; index++) {
    let character = text.charAt(index);
    if (inString) {
      if (character === '"') inString = false;
      if (character === '\\') kept += text.charAt(index++);
    } else if (character === '"') inString = true;
    else if (character === '{' || character === '[') openers.push(character);
    else if (character === '}' && openers.at(-1) !== '{') continue;
    else if (character === '}' || character === ']') openers.pop();
    kept += text.charAt(index);
  }
  return kept;
}
export function parseMendedJson(text?: Dynamic) {
  let start = text.search(/[[{]/);
  let end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']')) + 1;
  if (start < 0 || end <= start || /[[{]/.test(text.slice(end))) return;
  let slice = text.slice(start, end);
  let mended = dropStrayClosingBraces(slice);
  if (mended === slice) return;
  try {
    return JSON.parse(mended);
  } catch {
    return;
  }
}
export function scanJsonPrefix(text?: Dynamic, start?: Dynamic) {
  let openers: Dynamic = [];
  let lastCut: Dynamic = null;
  let inString: Dynamic = false;
  let isKeyString: Dynamic = false;
  let markCut = (end?: Dynamic) => {
    lastCut = {
      end: end,
      closers: openers.reduce((closers: Dynamic, { closer: closer }: Dynamic) => closer + closers, ''),
    };
  };
  for (let index: Dynamic = start; index < text.length; index++) {
    let character = text[index];
    let opener = openers.at(-1);
    if (inString) {
      if (character === '\\') index++;
      else if (character === '"') {
        inString = false;
        if (!isKeyString) markCut(index + 1);
      }
    } else if (character === '"') {
      inString = true;
      isKeyString = opener?.closer === '}' && opener.isKeyNext;
    } else if (character === '{' || character === '[') {
      openers.push({
        closer: character === '{' ? '}' : ']',
        isKeyNext: true,
      });
      markCut(index + 1);
    } else if (character === '}' || character === ']') {
      if (opener?.closer !== character) return lastCut;
      openers.pop();
      markCut(index + 1);
      if (openers.length === 0) return lastCut;
    } else if (character === ':' && opener !== undefined) opener.isKeyNext = false;
    else if (character === ',' && opener !== undefined) {
      markCut(index);
      opener.isKeyNext = true;
    }
  }
  return lastCut;
}
export function parsePartialJson(text?: Dynamic) {
  let start = text.indexOf('{');
  let cut = start < 0 ? null : scanJsonPrefix(text, start);
  if (cut === null) return;
  try {
    return JSON.parse(text.slice(start, cut.end) + cut.closers);
  } catch {
    return;
  }
}
export function readPartialStringField(text?: Dynamic, fieldName?: Dynamic) {
  let match = new (RegExp as Dynamic)(`^[^{]*\\{\\s*"${fieldName}"\\s*:\\s*"`, 'u').exec(text);
  if (match === null) return null;
  let escapedSoFar = /^(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*/u.exec(text.slice(match[0].length))?.[0] ?? '';
  try {
    let parsed = JSON.parse(`"${escapedSoFar.replaceAll(/\p{Cc}/gu, ' ')}"`);
    return typeof parsed === 'string' ? parsed.replace(/[\ud800-\udbff]$/, '') : null;
  } catch {
    return null;
  }
}
