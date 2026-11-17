/**
 * A small Markdown reader for READMEs and brand-book sections: headings,
 * paragraphs, lists (one nesting level), block quotes, fenced code,
 * tables, rules and images; inline bold, italic, code, links and images.
 *
 * It produces a tree for React to render, never HTML strings, so text
 * from the files cannot inject markup. Raw HTML in the source shows as text,
 * except comments, which are dropped.
 */

/** Inline content. */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'image'; src: string; alt: string };

/** Block content. */
export type Block =
  | { kind: 'heading'; level: number; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: { children: Inline[]; sub?: Block }[] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][]; align: ('left' | 'center' | 'right' | null)[] }
  | { kind: 'rule' };

/** Parses inline Markdown. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  const flush = (): void => {
    if (buffer) out.push({ kind: 'text', text: buffer });
    buffer = '';
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    // Escapes.
    if (rest[0] === '\\' && rest.length > 1 && /[\\`*_[\]()#!|<>-]/.test(rest[1]!)) {
      buffer += rest[1];
      i += 2;
      continue;
    }
    // Code span.
    const code = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest);
    if (code) {
      flush();
      out.push({ kind: 'code', text: code[2]!.trim() });
      i += code[0].length;
      continue;
    }
    // Image and link.
    const link = /^(!?)\[((?:[^\]\\]|\\.)*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/.exec(rest);
    if (link) {
      flush();
      if (link[1]) out.push({ kind: 'image', src: link[3]!, alt: link[2]! });
      else out.push({ kind: 'link', href: link[3]!, children: parseInline(link[2]!) });
      i += link[0].length;
      continue;
    }
    // Bold, then italic.
    const strong = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest);
    if (strong) {
      flush();
      out.push({ kind: 'strong', children: parseInline(strong[2]!) });
      i += strong[0].length;
      continue;
    }
    const em = /^(\*|_)(?=\S)([\s\S]*?\S)\1(?![*_\w])/.exec(rest);
    if (em && (em[1] === '*' || !/\w/.test(text[i - 1] ?? ''))) {
      flush();
      out.push({ kind: 'em', children: parseInline(em[2]!) });
      i += em[0].length;
      continue;
    }
    // HTML comments are dropped.
    const comment = /^<!--[\s\S]*?-->/.exec(rest);
    if (comment) {
      i += comment[0].length;
      continue;
    }
    buffer += rest[0];
    i += 1;
  }
  flush();
  return out;
}

/** Splits a table row into cells. */
function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out: string[] = [];
  let cell = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (trimmed[i] === '|') {
      out.push(cell.trim());
      cell = '';
    } else {
      cell += trimmed[i];
    }
  }
  out.push(cell.trim());
  return out;
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

/** Indent of a list item line; -1 when the line is not a list item. */
const itemIndent = (line: string): number => LIST_ITEM.exec(line)?.[1]!.length ?? -1;

/** Parses block Markdown. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    // Fenced code.
    const fence = /^\s*(```+|~~~+)\s*([\w+-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i++]!);
      i++;
      blocks.push({ kind: 'code', lang: fence[2] ?? '', text: body.join('\n') });
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]!.length, children: parseInline(heading[2]!) });
      i++;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      blocks.push({ kind: 'quote', blocks: parseMarkdown(body.join('\n')) });
      continue;
    }
    // Table: a header row, then a delimiter row.
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1]!)) {
      const head = cells(line).map(parseInline);
      const align = cells(lines[i + 1]!).map((cell) =>
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : null,
      );
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) rows.push(cells(lines[i++]!).map(parseInline));
      blocks.push({ kind: 'table', head, rows, align });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]!);
      const indent = item[1]!.length;
      const items: { children: Inline[]; sub?: Block }[] = [];
      while (i < lines.length) {
        const current = LIST_ITEM.exec(lines[i]!);
        if (current && current[1]!.length <= indent) {
          const text = [current[3]!];
          i++;
          // Continuation lines and nested items.
          const nested: string[] = [];
          while (i < lines.length && lines[i]!.trim() && !(itemIndent(lines[i]!) >= 0 && itemIndent(lines[i]!) <= indent)) {
            if (LIST_ITEM.test(lines[i]!) || nested.length) nested.push(lines[i]!);
            else text.push(lines[i]!.trim());
            i++;
          }
          const sub = nested.length ? parseMarkdown(nested.map((l) => l.slice(Math.min(l.search(/\S/), indent + 2))).join('\n'))[0] : undefined;
          items.push({ children: parseInline(text.join(' ')), ...(sub ? { sub } : {}) });
          continue;
        }
        if (!lines[i]!.trim() && i + 1 < lines.length && itemIndent(lines[i + 1]!) === indent) {
          i++;
          continue;
        }
        break;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    // Paragraph: until a blank line or another block starts.
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^\s{0,3}(#{1,6}\s|>|```|~~~)/.test(lines[i]!) &&
      !(body.length && LIST_ITEM.test(lines[i]!))
    ) {
      body.push(lines[i++]!.trim());
    }
    blocks.push({ kind: 'paragraph', children: parseInline(body.join(' ')) });
  }
  return blocks;
}

/** Plain text of inline content (for search and titles). */
export function inlineText(children: readonly Inline[]): string {
  return children
    .map((child) => ('text' in child ? child.text : 'children' in child ? inlineText(child.children) : child.kind === 'image' ? child.alt : ''))
    .join('');
}
