/**
 * Pasting: Markdown copied as plain text comes in as blocks (headings, lists, quotes, code, tables, links, emphasis),
 * and nothing over 1 MB is pasted at all, with a word saying why.
 */
import { type Block, parseMarkdown } from '@open-artifact/docs-core';
import { Fragment, type ResolvedPos, Slice } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '../editor/schema.ts';
import { blockToPage } from '../sync/page.ts';

/** The most one paste may carry. */
export const PASTE_MAX_BYTES = 1024 * 1024;

const BLOCK_LINE = /^ {0,3}(#{1,6} |```|~~~|\|.*\|\s*$)/;
const LIST_OR_QUOTE = /^ *([-*+] |\d{1,9}[.)] |> ?)/;
const TABLE_SEP = /^ *\|? *:?-{1,}:? *(\| *:?-{1,}:? *)*\|? *$/;
const INLINE = /(\*\*[^*\s][^*]*\*\*|__[^_\s][^_]*__|\[[^\]]+\]\([^)\s]+\)|`[^`\n]+`|~~[^~\s][^~]*~~)/;

/** The text reads as Markdown: a heading, fence or table, two list or quote lines, or inline marks. */
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.some(line => BLOCK_LINE.test(line) || (TABLE_SEP.test(line) && line.includes('-') && line.includes('|')))) return true;
  if (lines.filter(line => LIST_OR_QUOTE.test(line)).length >= 2) return true;
  return INLINE.test(text);
}

const bytesOf = (text: string) => new TextEncoder().encode(text).length;

let serial = 0;
const ids = { take: () => `paste-${++serial}` };

/** Markdown as a slice of blocks, open at its ends so a lone line joins the line it lands in. */
export function markdownSlice(text: string): Slice | null {
  let blocks: Block[];
  try {
    blocks = parseMarkdown(text, ids, {}, { lenient: true });
  } catch {
    return null;
  }
  if (!blocks.length) return null;
  try {
    const nodes = blocks.map(block => schema.nodeFromJSON(blockToPage(block)));
    return Slice.maxOpen(Fragment.from(nodes));
  } catch {
    return null;
  }
}

/** Where Markdown is read as text: code blocks keep it as typed. */
const takesBlocks = ($context: ResolvedPos) => $context.parent.type !== schema.nodes.codeBlock;

/**
 * Whether a paste is over the limit: `null` when it fits, else whether its text alone would (so pasting just the text
 * is worth offering). A plain paste (⇧⌘V) carries only its text, so only the text counts. Pure.
 */
export function pasteTooLarge(html: string, text: string, plain: boolean): { textFits: boolean } | null {
  const textBytes = text ? bytesOf(text) : 0;
  const size = plain ? textBytes : Math.max(html ? bytesOf(html) : 0, textBytes);
  if (size <= PASTE_MAX_BYTES) return null;
  return { textFits: !plain && !!html && !!text.trim() && textBytes <= PASTE_MAX_BYTES };
}

/** ProseMirror's own test for a plain paste: Shift held, and not Shift+Insert. */
const plainPaste = (view: EditorView): boolean => {
  const input = (view as unknown as { input?: { shiftKey?: boolean; lastKeyCode?: number | null } }).input;
  return !!input?.shiftKey && input.lastKeyCode !== 45;
};

export function pastePlugin(tooLarge: (textFits: boolean) => void): Plugin {
  return new Plugin({
    props: {
      handlePaste(view: EditorView, event: ClipboardEvent) {
        const data = event.clipboardData;
        if (!data) return false;
        const over = pasteTooLarge(data.getData('text/html'), data.getData('text/plain'), plainPaste(view));
        if (!over) return false;
        tooLarge(over.textFits);
        return true;
      },
      clipboardTextParser(text, $context, plain) {
        if (plain || !takesBlocks($context) || !looksLikeMarkdown(text)) return null as unknown as Slice;
        return markdownSlice(text) ?? (null as unknown as Slice);
      },
    },
  });
}

/** The word for a paste that was too large. */
export function tooLargeWords(textFits: boolean): string {
  if (!textFits) return 'What you pasted is larger than a document can take in one go (over 1 MB), so nothing was pasted; paste it in parts.';
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return `What you copied is too large to paste (over 1 MB), so nothing was pasted. You can paste just its text (${mac ? '⇧⌘V' : 'Ctrl+Shift+V'}) or paste it in parts.`;
}
