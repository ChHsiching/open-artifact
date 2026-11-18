/** Serialize edited browser markup back to the Markdown a brand book stores. */
export function markdownOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue || '').replace(/\u00a0/g, ' ');
  if (!(node instanceof HTMLElement)) return '';
  const contents = () => Array.from(node.childNodes, markdownOf).join('');
  switch (node.tagName) {
    case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
      return '#'.repeat(Number(node.dataset.level || node.tagName.slice(1))) + ' ' + contents() + '\n\n';
    case 'P': case 'DIV': return contents().trimEnd() + '\n\n';
    case 'BR': return '\n';
    case 'B': case 'STRONG': return '**' + contents() + '**';
    case 'I': case 'EM': return '*' + contents() + '*';
    case 'S': case 'DEL': case 'STRIKE': return '~~' + contents() + '~~';
    case 'CODE': return '`' + contents() + '`';
    case 'PRE': {
      const code = node.textContent || '';
      const fence = '`'.repeat(Math.max(3, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length + 1)));
      return fence + (node.dataset.lang || '') + '\n' + code + '\n' + fence + '\n\n';
    }
    case 'BLOCKQUOTE': return contents().trimEnd().split('\n').map((line) => '> ' + line).join('\n') + '\n\n';
    case 'HR': return '---\n\n';
    case 'A': return '[' + contents() + '](' + (node.dataset.target ?? node.getAttribute('href') ?? '') + ')';
    case 'IMG': return '![' + (node.getAttribute('alt') || '') + '](' + (node.dataset.target ?? node.getAttribute('src') ?? '') + ')';
    case 'INPUT': return node instanceof HTMLInputElement && node.type === 'checkbox' ? (node.checked ? '[x] ' : '[ ] ') : '';
    case 'UL': case 'OL':
      return (node.parentElement?.tagName === 'LI' ? '\n' : '') + Array.from(node.children, (item, i) => {
        const nested = Array.from(item.childNodes, markdownOf).join('').trimEnd().split('\n');
        return (node.tagName === 'UL' ? '- ' : (i + 1) + '. ') + nested.join('\n  ');
      }).join('\n') + '\n\n';
    case 'TABLE': {
      const rows = Array.from((node as HTMLTableElement).rows);
      if (!rows[0]) return '';
      const cells = (values: string[]) => '| ' + values.join(' | ') + ' |';
      const row = (tr: HTMLTableRowElement) => cells(Array.from(tr.cells, (cell) => Array.from(cell.childNodes, markdownOf).join('').trim().replace(/\|/g, '\\|')));
      const alignment = Array.from(rows[0].cells, (cell) => ({ center: ':---:', left: ':---', right: '---:' })[cell.style.textAlign] ?? '---');
      return [row(rows[0]), cells(alignment), ...rows.slice(1).map(row)].join('\n') + '\n\n';
    }
    default: return contents();
  }
}
