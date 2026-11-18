/**
 * A chart's code: the rules that keep code from being published, and the module the page's chart frame runs.
 *
 * Code that the rules find fault with is staged with errors: it is kept, the chart goes on drawing with the code
 * published before, and each error names the line and the fix. The projection is the published code as an ES module
 * whose `init(sheet, React, hooks, ds)` returns the chart's component (the frame's worker imports it and calls init
 * with its own drawing runtime). JSX is lowered to React.createElement here, and the names the code may use without
 * importing them (the hooks, Tooltip) are taken from init's arguments.
 */

import { Parser } from 'acorn';
import jsx from 'acorn-jsx';

/** The longest code a widget takes (a chart's code is one line of a few thousand characters). */
export const MAX_CODE_LENGTH = 200_000;

/** A fault of chart code: where it is (from 1) and what to do about it. */
export interface ChartCodeError {
  line: number;
  column: number;
  message: string;
}

/** A node of the parsed program, as acorn gives it (ESTree, with JSX). */
interface SyntaxNode {
  type: string;
  start: number;
  end: number;
  loc?: { start: { line: number; column: number } };
  [key: string]: unknown;
}

const JsxParser = Parser.extend(jsx());

const isNode = (value: unknown): value is SyntaxNode =>
  typeof value === 'object' && value !== null && typeof (value as SyntaxNode).type === 'string' && typeof (value as SyntaxNode).start === 'number';

/** The node under `key`, or undefined. */
const childAt = (node: SyntaxNode, key: string): SyntaxNode | undefined => {
  const value = node[key];
  return isNode(value) ? value : undefined;
};

/** The nodes in the list under `key`. */
const childrenAt = (node: SyntaxNode, key: string): SyntaxNode[] => {
  const value = node[key];
  return Array.isArray(value) ? value.filter(isNode) : [];
};

const textAt = (node: SyntaxNode | undefined, key: string): string => {
  const value = node?.[key];
  return typeof value === 'string' ? value : '';
};

/** The nodes right under `node`, with the key each is under. */
function* childrenOf(node: SyntaxNode): Generator<[SyntaxNode, string]> {
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) yield [item, key];
    } else if (isNode(value)) yield [value, key];
  }
}

// ---------- the rules ----------

/** Names the code may not use, even for a local of its own. */
const NOT_TAKEN: Record<string, string> = {
  top: '"top" is a name the code may not use, even for a local of its own: name it otherwise (a top margin is y0).',
  parent: '"parent" is a name the code may not use, even for a local of its own: name it otherwise.',
  self: '"self" is a name the code may not use, even for a local of its own: name it otherwise.',
  window: '"window" is a name the code may not use, even for a local of its own: name it otherwise.',
  fetch: 'fetch is not taken: a chart draws from its inputs alone (bind the cells it needs as inputs).',
};

/** Where an identifier is not a name (a property's key, a member read with a dot, a label). */
function isNotAName(parent: SyntaxNode | null, key: string): boolean {
  if (!parent) return false;
  if (parent.type === 'MemberExpression' && key === 'property' && parent.computed !== true) return true;
  if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && key === 'key' && parent.computed !== true) return true;
  if ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && key === 'label') return true;
  return parent.type === 'MetaProperty';
}

/** A JSX element's name as written: `svg`, `sheet.Visualize`, `xlink:href`. */
function jsxName(name: SyntaxNode | undefined): string {
  if (!name) return '';
  if (name.type === 'JSXIdentifier') return textAt(name, 'name');
  if (name.type === 'JSXMemberExpression') return `${jsxName(childAt(name, 'object'))}.${textAt(childAt(name, 'property'), 'name')}`;
  return `${textAt(childAt(name, 'namespace'), 'name')}:${textAt(childAt(name, 'name'), 'name')}`;
}

/** Parses the code: the program, or the syntax error as a staged error. */
function parse(code: string): { program: SyntaxNode } | { error: ChartCodeError } {
  try {
    const program: unknown = JsxParser.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    if (!isNode(program)) throw new Error('no program');
    return { program };
  } catch (error) {
    const loc = (error as { loc?: { line: number; column: number } }).loc;
    const message = String(error instanceof Error ? error.message : error).replace(/\s*\(\d+:\d+\)$/, '');
    return { error: { line: loc?.line ?? 1, column: (loc?.column ?? 0) + 1, message: `The code does not parse: ${message}.` } };
  }
}

/**
 * What keeps chart code from being published: what does not parse, and what a Sheet stages with errors (an import, a
 * computed index, the names top, parent, self and window, fetch, a <style> element), with what a Sheet does not draw
 * (sheet.Embed, a definition) and code that exports no chart. [] when it may be published.
 */
export function chartCodeErrors(code: string): ChartCodeError[] {
  if (code.length > MAX_CODE_LENGTH) return [{ line: 1, column: 1, message: `The code is ${code.length} characters long; a chart's code takes at most ${MAX_CODE_LENGTH}. Work out what the chart shows in cells with formulas, and draw that.` }];
  const parsed = parse(code);
  if ('error' in parsed) return [parsed.error];
  const errors: ChartCodeError[] = [];
  const seen = new Set<string>();
  const fault = (node: SyntaxNode, message: string): void => {
    const line = node.loc?.start.line ?? 1;
    const column = (node.loc?.start.column ?? 0) + 1;
    const key = `${line}:${column}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push({ line, column, message });
  };
  let exportsTheChart = false;
  const visit = (node: SyntaxNode, parent: SyntaxNode | null, key: string): void => {
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ImportExpression':
        fault(node, "import is not taken: the code has the language's own names, React's hooks (useState, useMemo, …) and Tooltip, and no more.");
        break;
      case 'MetaProperty':
        if (textAt(childAt(node, 'meta'), 'name') === 'import') fault(node, "import.meta is not taken: the code has the language's own names and no more.");
        break;
      case 'ExportDefaultDeclaration':
        exportsTheChart = true;
        break;
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        fault(node, 'The code exports one thing, the chart: export default () => <sheet.Visualize …>. Declare the rest without export.');
        break;
      case 'Identifier': {
        const name = textAt(node, 'name');
        if (Object.hasOwn(NOT_TAKEN, name) && !isNotAName(parent, key)) fault(node, NOT_TAKEN[name]!);
        break;
      }
      case 'MemberExpression': {
        const property = childAt(node, 'property');
        if (node.computed === true && property && !(property.type === 'Literal' && typeof property.value === 'string')) {
          fault(property, "A computed index is not taken: write rows.at(i) for rows[i], and find a column by its heading (head.findIndex(h => h.text === 'Total')).");
        }
        break;
      }
      case 'JSXOpeningElement': {
        const name = jsxName(childAt(node, 'name'));
        if (name === 'style') fault(node, "A <style> element is not taken: set fill, stroke and fontSize on each shape, under React's names.");
        if (name === 'sheet.Embed') fault(node, 'sheet.Embed is not drawn in a Sheet: draw the chart with svg in one <sheet.Visualize>.');
        const hasDefinition = childrenAt(node, 'attributes').some((a) => a.type === 'JSXAttribute' && childAt(a, 'name')?.type === 'JSXIdentifier' && textAt(childAt(a, 'name'), 'name') === 'definition');
        if (name === 'sheet.Visualize' && hasDefinition) fault(node, 'A definition is not published in a Sheet: give <sheet.Visualize> sources, and a function of them as its one child that returns the <svg>.');
        break;
      }
    }
    for (const [child, childKey] of childrenOf(node)) visit(child, node, childKey);
  };
  visit(parsed.program, null, '');
  if (!exportsTheChart) errors.push({ line: 1, column: 1, message: "The code exports no chart: write it as export default () => <sheet.Visualize data-component='…' sources={{…}}>{(…) => <svg …>}</sheet.Visualize>." });
  return errors.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** An error as one line, for the page: `3:14 A computed index is not taken: …`. */
export const chartCodeErrorText = (error: ChartCodeError): string => `${error.line}:${error.column} ${error.message}`;

// ---------- the projection ----------

const RESULT = '__chartOfTheSheet';
const HOOKS = ['useState', 'useReducer', 'useMemo', 'useCallback', 'useRef', 'useId', 'useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useImperativeHandle', 'useDebugValue'];
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * The published code as the module the chart frame imports: JSX lowered to React.createElement, the default export
 * made init's answer. The code is put in a block of its own inside init, so its own names may shadow init's.
 */
export function chartModule(code: string): string {
  const parsed = parse(code);
  if ('error' in parsed) throw new Error(parsed.error.message);
  const isSpecial = (n: SyntaxNode): boolean => n.type === 'JSXElement' || n.type === 'JSXFragment' || n.type === 'ExportDefaultDeclaration';
  /** The outermost special nodes under `node`, in the order of the source. */
  const specialsUnder = (node: SyntaxNode): SyntaxNode[] => {
    const found: SyntaxNode[] = [];
    const walk = (n: SyntaxNode): void => {
      for (const [child] of childrenOf(n)) {
        if (isSpecial(child)) found.push(child);
        else walk(child);
      }
    };
    walk(node);
    return found.sort((a, b) => a.start - b.start);
  };
  /** The source of a node, its JSX lowered. */
  const emit = (node: SyntaxNode | undefined): string => {
    if (!node) return 'undefined';
    if (isSpecial(node)) return lower(node);
    let out = '';
    let at = node.start;
    for (const s of specialsUnder(node)) {
      out += code.slice(at, s.start) + lower(s);
      at = s.end;
    }
    return out + code.slice(at, node.end);
  };
  const tagOf = (name: SyntaxNode | undefined): string => {
    if (name?.type === 'JSXIdentifier') {
      const text = textAt(name, 'name');
      return /^[a-z]/.test(text) || text.includes('-') ? JSON.stringify(text) : text;
    }
    if (name?.type === 'JSXMemberExpression') return jsxName(name);
    return JSON.stringify(jsxName(name));
  };
  const propsOf = (attributes: SyntaxNode[]): string => {
    if (attributes.length === 0) return 'null';
    const parts = attributes.map((a) => {
      if (a.type === 'JSXSpreadAttribute') return `...${emit(childAt(a, 'argument'))}`;
      const name = jsxName(childAt(a, 'name'));
      const key = IDENTIFIER.test(name) ? name : JSON.stringify(name);
      const value = childAt(a, 'value');
      if (!value) return `${key}: true`;
      if (value.type === 'Literal') return `${key}: ${JSON.stringify(value.value)}`;
      if (value.type === 'JSXExpressionContainer') return `${key}: ${emit(childAt(value, 'expression'))}`;
      return `${key}: ${lower(value)}`;
    });
    return `{${parts.join(', ')}}`;
  };
  const childrenOfJsx = (children: SyntaxNode[]): string => {
    const out: string[] = [];
    for (const child of children) {
      if (child.type === 'JSXText') {
        const text = cleanText(textAt(child, 'value'));
        if (text !== '') out.push(JSON.stringify(text));
      } else if (child.type === 'JSXExpressionContainer') {
        const expression = childAt(child, 'expression');
        if (expression && expression.type !== 'JSXEmptyExpression') out.push(emit(expression));
      } else if (child.type === 'JSXSpreadChild') out.push(`...${emit(childAt(child, 'expression'))}`);
      else out.push(lower(child));
    }
    return out.map((c) => `, ${c}`).join('');
  };
  function lower(node: SyntaxNode): string {
    if (node.type === 'JSXFragment') return `React.createElement(React.Fragment, null${childrenOfJsx(childrenAt(node, 'children'))})`;
    if (node.type === 'JSXElement') {
      const opening = childAt(node, 'openingElement');
      return `React.createElement(${tagOf(opening && childAt(opening, 'name'))}, ${propsOf(opening ? childrenAt(opening, 'attributes') : [])}${childrenOfJsx(childrenAt(node, 'children'))})`;
    }
    // export default …: the chart init answers with.
    const d = childAt(node, 'declaration');
    if (!d) return '';
    const isDeclaration = d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration';
    const id = childAt(d, 'id');
    if (isDeclaration && id) return `${emit(d)}\n${RESULT} = ${textAt(id, 'name')};`;
    if (isDeclaration) return `${RESULT} = ${emit(d)};`;
    return `${RESULT} = (${emit(d)});`;
  }
  const body = emit(parsed.program);
  return [
    'export function init(sheet, React, hooks, ds) {',
    `  const { ${HOOKS.join(', ')} } = hooks;`,
    '  const { Tooltip } = ds;',
    `  let ${RESULT};`,
    '  {',
    body,
    '  }',
    `  return ${RESULT};`,
    '}',
    '',
  ].join('\n');
}

/** JSX text as React reads it: lines trimmed, the blank ones dropped, the rest joined by a space. */
function cleanText(value: string): string {
  const lines = value.split(/\r\n|\n|\r/);
  let lastFilled = 0;
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i]!)) lastFilled = i;
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!.replace(/\t/g, ' ');
    if (i !== 0) line = line.replace(/^[ ]+/, '');
    if (i !== lines.length - 1) line = line.replace(/[ ]+$/, '');
    if (line) out += i === lastFilled ? line : `${line} `;
  }
  return out;
}
