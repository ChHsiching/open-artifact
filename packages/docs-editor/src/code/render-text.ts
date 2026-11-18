/** The live views of a CSV or Markdown block, as HTML built from escaped text (nothing in the source runs). */

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** CSV rows: quoted fields may hold commas, quotes (doubled) and line breaks; a final line break ends no row. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let touched = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      touched = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
      touched = true;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      touched = false;
    } else {
      field += char;
      touched = true;
    }
  }
  if (touched || field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** A CSV block as a table; its first row is the header. Empty when there is nothing to show. */
export function csvToHtml(text: string): string {
  const rows = parseCsv(text).filter(row => row.some(cell => cell.trim() !== '') || row.length > 1);
  if (!rows.length) return '';
  const width = Math.max(...rows.map(row => row.length));
  const cells = (row: string[], tag: 'th' | 'td') =>
    Array.from({ length: width }, (_, index) => `<${tag}>${escapeHtml(row[index] ?? '')}</${tag}>`).join('');
  const [head, ...body] = rows;
  const tbody = body.length ? `<tbody>${body.map(row => `<tr>${cells(row, 'td')}</tr>`).join('')}</tbody>` : '';
  return `<table><thead><tr>${cells(head!, 'th')}</tr></thead>${tbody}</table>`;
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Inline Markdown on one line: code, links (web and mail only), bold, italic, strikethrough. */
export function markdownInline(text: string): string {
  const codes: string[] = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_match, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) =>
    SAFE_URL.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : match,
  );
  out = out.replace(/\*\*(?=\S)(.+?)\*\*|__(?=\S)(.+?)__/g, (_match, a: string | undefined, b: string | undefined) => `<strong>${a ?? b}</strong>`);
  out = out.replace(/(^|[^*\w])\*(?=\S)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_(?=\S)([^_]+?)_(?![_\w])/g, '$1<em>$2</em>');
  out = out.replace(/~~(?=\S)(.+?)~~/g, '<del>$1</del>');
  return out.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => `<code>${codes[Number(index)]}</code>`);
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const splitRow = (line: string) => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
};

function tableHtml(lines: string[]): string {
  const head = splitRow(lines[0]!);
  const aligns = splitRow(lines[1]!).map(cell => (cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : null));
  const cell = (tag: 'th' | 'td', text: string, index: number) => {
    const align = aligns[index];
    return `<${tag}${align ? ` style="text-align:${align}"` : ''}>${markdownInline(text)}</${tag}>`;
  };
  const body = lines.slice(2).map(line => `<tr>${head.map((_h, index) => cell('td', splitRow(line)[index] ?? '', index)).join('')}</tr>`);
  return `<table><thead><tr>${head.map((text, index) => cell('th', text, index)).join('')}</tr></thead>${body.length ? `<tbody>${body.join('')}</tbody>` : ''}</table>`;
}

interface ListItem {
  indent: number;
  ordered: boolean;
  text: string;
}

function listHtml(items: readonly ListItem[]): string {
  let html = '';
  const stack: Array<{ indent: number; tag: 'ul' | 'ol' }> = [];
  for (const item of items) {
    const tag = item.ordered ? 'ol' : 'ul';
    while (stack.length && item.indent < stack.at(-1)!.indent) html += `</li></${stack.pop()!.tag}>`;
    const top = stack.at(-1);
    if (!top || item.indent > top.indent) {
      html += `<${tag}>`;
      stack.push({ indent: item.indent, tag });
    } else {
      html += '</li>';
      if (top.tag !== tag) {
        html += `</${top.tag}><${tag}>`;
        top.tag = tag;
      }
    }
    const task = /^\[([ xX])\]\s+(.*)$/.exec(item.text);
    html += task
      ? `<li class="task"><input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ${markdownInline(task[2]!)}`
      : `<li>${markdownInline(item.text)}`;
  }
  while (stack.length) html += `</li></${stack.pop()!.tag}>`;
  return html;
}

/** A Markdown block as HTML: headings, rules, quotes, nested and task lists, tables, fenced code, paragraphs. */
export function markdownToHtml(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(markdownInline).join('<br>')}</p>`);
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!line.trim()) {
      flush();
      continue;
    }
    if (FENCE.test(line)) {
      flush();
      const fence = FENCE.exec(line)![1]!;
      const code: string[] = [];
      for (index++; index < lines.length && !lines[index]!.trim().startsWith(fence); index++) code.push(lines[index]!);
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      out.push(`<h${heading[1]!.length}>${markdownInline(heading[2]!)}</h${heading[1]!.length}>`);
      continue;
    }
    if (RULE.test(line)) {
      flush();
      out.push('<hr>');
      continue;
    }
    if (QUOTE.test(line)) {
      flush();
      const quoted: string[] = [];
      for (; index < lines.length && QUOTE.test(lines[index]!); index++) quoted.push(QUOTE.exec(lines[index]!)![1]!);
      index--;
      out.push(`<blockquote>${markdownToHtml(quoted.join('\n'))}</blockquote>`);
      continue;
    }
    if (ITEM.test(line)) {
      flush();
      const items: ListItem[] = [];
      for (; index < lines.length && ITEM.test(lines[index]!); index++) {
        const match = ITEM.exec(lines[index]!)!;
        items.push({ indent: match[1]!.replace(/\t/g, '    ').length, ordered: /\d/.test(match[2]!), text: match[3]! });
      }
      index--;
      out.push(listHtml(items));
      continue;
    }
    if (line.includes('|') && index + 1 < lines.length && DIVIDER.test(lines[index + 1]!) && lines[index + 1]!.includes('-')) {
      flush();
      const rows = [line, lines[index + 1]!];
      for (index += 2; index < lines.length && lines[index]!.includes('|') && lines[index]!.trim(); index++) rows.push(lines[index]!);
      index--;
      out.push(tableHtml(rows));
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return out.join('');
}
