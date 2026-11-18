/** A calculation's formula and its inputs: which parameter each input becomes, and where those names are in the code. */

export interface CalculationArgument {
  /** The formula's parameter name (`null` for a destructured one). */
  name: string | null;
  /** The source the input comes from. */
  input: string;
  /** The name can be marked in the code: it is a plain, unique parameter nothing in the body redeclares. */
  tinted: boolean;
}

export interface CalculationCodePiece {
  text: string;
  /** The input this piece names (its index), when it is one. */
  arg?: number;
}

export const JS_STRING_COMMENT_PATTERN = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;

/** The code with its strings and comments blanked (same length), so words found in it are code. */
export function maskJavaScriptStringsAndComments(code: string): string {
  return code.replace(JS_STRING_COMMENT_PATTERN, (match) => ' '.repeat(match.length));
}

/** The index of the bracket that closes the one at `start` (`(`, `[` and `{` counted together), or -1. */
export function findClosingBracket(code: string, start: number): number {
  let depth = 0;
  for (let index = start; index < code.length; index++) {
    const char = code.charAt(index);
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char) && --depth === 0) return index;
  }
  return -1;
}

/** A function's parameter list and where its head ends (`x => …`, `(a, b) => …`, `function (a) {…}`). */
export function parseFunctionParameters(code: string): { list: string; end: number } | null {
  const single = /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/.exec(code);
  if (single !== null) return { list: single[1] ?? '', end: single[0].length };
  const open = code.search(/[({]/);
  const close = code[open] === '(' ? findClosingBracket(code, open) : -1;
  return close === -1 ? null : { list: code.slice(open + 1, close), end: close + 1 };
}

/** Each parameter's simple name (`null` for a destructured one), bracketed defaults skipped. */
export function getParameterListNames(list: string): (string | null)[] {
  let text = '';
  for (let index = 0; index < list.length; index++) {
    text += list.charAt(index);
    if ('([{'.includes(list.charAt(index))) index = Math.max(index, findClosingBracket(list, index));
  }
  return text.split(',').flatMap((part) => (part.trim() === '' ? [] : [/^\s*([A-Za-z_$][\w$]*)\s*(?:=|$)/.exec(part)?.[1] ?? null]));
}

export function getFunctionParameterNames(code: string): (string | null)[] {
  return getParameterListNames(parseFunctionParameters(maskJavaScriptStringsAndComments(code))?.list ?? '');
}

function escapeIdentifier(name: string): string {
  return name.replace(/\$/g, '\\$');
}

/** The body declares the name again (a variable, function, class, catch binding or nested parameter). */
export function isIdentifierShadowed(body: string, name: string): boolean {
  const bare = `${escapeIdentifier(name)}(?![\\w$])`;
  const word = `(?:^|[^\\w$.])${bare}`;
  const declarations = [
    `\\b(?:const|let|var|function|class)\\s+${bare}`,
    `\\b(?:const|let|var)\\s*(?=[\\[{])(?:(?!\\bof\\b)[^=;])*?${word}(?!\\s*:)`,
    `\\bcatch\\s*\\(\\s*${bare}`,
    `${word}\\s*=>`,
  ];
  if (declarations.some((pattern) => new RegExp(pattern).test(body))) return true;
  const named = new RegExp(`${word}(?!\\s*:)`);
  return [...body.matchAll(/\(/g)].some(({ index: start }) => {
    const end = findClosingBracket(body, start);
    const nested = /^\s*=>/.test(body.slice(end + 1)) || /\bfunction\b[\s\w$*]*$/.test(body.slice(0, start));
    return end !== -1 && nested && named.test(body.slice(start + 1, end));
  });
}

/** The formula's inputs, each with the parameter it becomes. */
export function describeCalculationArguments(code: string, inputs: readonly string[]): CalculationArgument[] {
  const names = getFunctionParameterNames(code);
  const masked = maskJavaScriptStringsAndComments(code);
  const body = masked.slice(parseFunctionParameters(masked)?.end ?? 0);
  return inputs.map((input, index) => {
    const name = names[index] ?? null;
    return {
      name,
      input,
      tinted: name !== null && names.indexOf(name) === names.lastIndexOf(name) && !isIdentifierShadowed(body, name),
    };
  });
}

/** The code cut where a marked input's name is used (not as a property or an object key). */
export function splitCalculationCodeArguments(code: string, args: readonly CalculationArgument[]): CalculationCodePiece[] {
  const masked = maskJavaScriptStringsAndComments(code);
  const pieces: CalculationCodePiece[] = [];
  let end = 0;
  for (const match of masked.matchAll(/[\w$]+/g)) {
    const word = match[0];
    const start = match.index;
    const arg = args.findIndex((candidate) => candidate.tinted && candidate.name === word);
    if (arg === -1) continue;
    const before = masked.slice(0, start).trimEnd();
    const after = start + word.length;
    if (before.endsWith('.') ? !before.endsWith('...') : /[{,]$/.test(before) && /^\s*:/.test(masked.slice(after))) continue;
    if (start > end) pieces.push({ text: code.slice(end, start) });
    pieces.push({ text: word, arg });
    end = after;
  }
  if (end < code.length) pieces.push({ text: code.slice(end) });
  return pieces;
}
