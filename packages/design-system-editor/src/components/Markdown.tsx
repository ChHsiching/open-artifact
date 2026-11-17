/**
 * Rendering Markdown files, and editing them in place: the rendered text
 * turns into its source on double-click (or the Edit button) and commits on
 * blur or ⌘Enter. Links do not navigate: the page never opens addresses
 * written by others; the target shows on hover.
 */

import { Bold, Check, Code, Heading1, Heading2, Heading3, Italic, Link, List, ListChecks, ListOrdered, Pencil, Quote, Strikethrough } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, IconButton, cn } from '@open-artifact/ui';
import { parseMarkdown, type Block, type Inline } from '../lib/markdown.ts';
import { resolveProjectLink } from '../lib/color.ts';
import { MOD } from '@open-artifact/editor-kit';
import { FORMAT_KEYS, applyBlock, applyInline, continueOnEnter, indentList, type BlockFormat, type InlineFormat, type TextEdit } from '../lib/markdown-edit.ts';

const TOOLS: ({ kind: 'inline'; format: InlineFormat; label: string; icon: ReactNode; key?: string } | { kind: 'block'; format: BlockFormat; label: string; icon: ReactNode } | { kind: 'gap' })[] = [
  { kind: 'inline', format: 'bold', label: 'Bold', icon: <Bold className="size-3.5" />, key: 'B' },
  { kind: 'inline', format: 'italic', label: 'Italic', icon: <Italic className="size-3.5" />, key: 'I' },
  { kind: 'inline', format: 'strike', label: 'Strikethrough', icon: <Strikethrough className="size-3.5" /> },
  { kind: 'inline', format: 'code', label: 'Code', icon: <Code className="size-3.5" />, key: 'E' },
  { kind: 'inline', format: 'link', label: 'Link', icon: <Link className="size-3.5" />, key: 'K' },
  { kind: 'gap' },
  { kind: 'block', format: 'h1', label: 'Heading 1', icon: <Heading1 className="size-3.5" /> },
  { kind: 'block', format: 'h2', label: 'Heading 2', icon: <Heading2 className="size-3.5" /> },
  { kind: 'block', format: 'h3', label: 'Heading 3', icon: <Heading3 className="size-3.5" /> },
  { kind: 'gap' },
  { kind: 'block', format: 'bullet', label: 'Bulleted list', icon: <List className="size-3.5" /> },
  { kind: 'block', format: 'number', label: 'Numbered list', icon: <ListOrdered className="size-3.5" /> },
  { kind: 'block', format: 'task', label: 'Checklist', icon: <ListChecks className="size-3.5" /> },
  { kind: 'block', format: 'quote', label: 'Quote', icon: <Quote className="size-3.5" /> },
];

function InlineView({ runs, from }: { runs: readonly Inline[]; from: string }): ReactNode {
  return runs.map((run, index) => {
    switch (run.kind) {
      case 'text':
        return run.text;
      case 'strong':
        return (
          <strong key={index} className="font-semibold text-fg">
            <InlineView runs={run.children} from={from} />
          </strong>
        );
      case 'em':
        return (
          <em key={index}>
            <InlineView runs={run.children} from={from} />
          </em>
        );
      case 'code':
        return (
          <code key={index} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.88em] text-fg">
            {run.text}
          </code>
        );
      case 'link':
        return (
          <span key={index} title={run.href} className="text-accent underline decoration-accent/40 underline-offset-2">
            <InlineView runs={run.children} from={from} />
          </span>
        );
      case 'image': {
        const src = resolveProjectLink(run.src, from);
        return src ? (
          <img key={index} src={src} alt={run.alt} className="my-2 inline-block max-h-64 max-w-full rounded" />
        ) : (
          <span key={index} title={run.src} className="rounded border border-dashed border-line px-1 text-fg-subtle">
            {run.alt || 'image'}
          </span>
        );
      }
    }
  });
}

const HEADING = ['text-[26px] font-semibold tracking-tight', 'text-[20px] font-semibold', 'text-[16px] font-semibold', 'text-[14px] font-semibold', 'text-[13px] font-semibold', 'text-[12px] font-semibold uppercase tracking-wide'];

function BlockView({ block, from }: { block: Block; from: string }): ReactNode {
  switch (block.kind) {
    case 'heading': {
      const Tag = `h${Math.min(block.level + 1, 6)}` as 'h2';
      return (
        <Tag className={cn('mt-6 mb-2 text-fg first:mt-0', HEADING[block.level - 1])}>
          <InlineView runs={block.children} from={from} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className="my-2 leading-relaxed">
          <InlineView runs={block.children} from={from} />
        </p>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag className={cn('my-2 flex flex-col gap-1 pl-5', block.ordered ? 'list-decimal' : 'list-disc')}>
          {block.items.map((item, index) => (
            <li key={index} className="leading-relaxed">
              <InlineView runs={item.children} from={from} />
              {item.sub ? <BlockView block={item.sub} from={from} /> : null}
            </li>
          ))}
        </Tag>
      );
    }
    case 'quote':
      return (
        <blockquote className="my-3 border-l-2 border-line-strong pl-3 text-fg-muted">
          {block.blocks.map((inner, index) => (
            <BlockView key={index} block={inner} from={from} />
          ))}
        </blockquote>
      );
    case 'code':
      return <pre className="my-3 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-fg">{block.text}</pre>;
    case 'table':
      return (
        <div className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index} className="border-b border-line-strong px-2 py-1.5 text-left font-semibold text-fg" style={{ textAlign: block.align[index] ?? undefined }}>
                    <InlineView runs={cell} from={from} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, index) => (
                    <td key={index} className="border-b border-line px-2 py-1.5 align-top" style={{ textAlign: block.align[index] ?? undefined }}>
                      <InlineView runs={cell} from={from} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'rule':
      return <hr className="my-6 border-line" />;
  }
}

/** Renders Markdown read from the file at `from` (relative images resolve from there). */
export function MarkdownView({ source, from, className }: { source: string; from: string; className?: string }) {
  return (
    <div className={cn('text-[14px] text-fg-muted', className)}>
      {parseMarkdown(source).map((block, index) => (
        <BlockView key={index} block={block} from={from} />
      ))}
    </div>
  );
}

export interface EditableMarkdownProps {
  source: string;
  from: string;
  readOnly: boolean;
  onCommit(text: string): void;
  /** Shown when the source is empty. */
  placeholder?: string;
  className?: string;
}

/** A Markdown file that turns into its source for editing. */
export function EditableMarkdown({ source, from, readOnly, onCommit, placeholder = 'Nothing written yet.', className }: EditableMarkdownProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(source);
  }, [source, editing]);

  useEffect(() => {
    const element = area.current;
    if (!editing || !element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [draft, editing]);

  const start = (): void => {
    if (readOnly) return;
    setDraft(source);
    setEditing(true);
    requestAnimationFrame(() => area.current?.focus());
  };
  const commit = (): void => {
    setEditing(false);
    if (draft !== source) onCommit(draft);
  };
  /** Applies an edit to the textarea: new text, then the selection once React rendered it. */
  const apply = (edit: TextEdit | null): boolean => {
    const element = area.current;
    if (!edit || !element) return false;
    setDraft(edit.text);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(edit.start, edit.end);
    });
    return true;
  };
  const selection = (): TextEdit => {
    const element = area.current!;
    return { text: element.value, start: element.selectionStart, end: element.selectionEnd };
  };

  if (editing) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
          {TOOLS.map((tool, index) =>
            tool.kind === 'gap' ? (
              <span key={index} className="mx-1 h-4 w-px bg-line" />
            ) : (
              <IconButton
                key={tool.format}
                size="sm"
                label={tool.label}
                shortcut={tool.kind === 'inline' && tool.key ? `${MOD}${tool.key}` : undefined}
                icon={tool.icon}
                // Keep the textarea focused (and its selection) while clicking.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(tool.kind === 'inline' ? applyInline(selection(), tool.format) : applyBlock(selection(), tool.format))}
              />
            ),
          )}
        </div>
        <textarea
          ref={area}
          value={draft}
          spellCheck
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(source);
              setEditing(false);
            } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              commit();
            } else if ((event.metaKey || event.ctrlKey) && !event.altKey && FORMAT_KEYS[event.key.toLowerCase()]) {
              event.preventDefault();
              apply(applyInline(selection(), FORMAT_KEYS[event.key.toLowerCase()]!));
            } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              if (apply(continueOnEnter(selection()))) event.preventDefault();
            } else if (event.key === 'Tab') {
              if (apply(indentList(selection(), event.shiftKey))) event.preventDefault();
            }
          }}
          className="min-h-32 w-full resize-none rounded-lg border border-accent bg-surface p-3 font-mono text-[13px] leading-relaxed text-fg outline-none"
        />
        <div className="flex items-center justify-end gap-2 text-[11px] text-fg-subtle">
          <span>Markdown · {MOD}Enter to finish · Esc to cancel</span>
          <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onMouseDown={(event) => event.preventDefault()} onClick={commit}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('group relative', className)} onDoubleClick={start}>
      {source.trim() ? <MarkdownView source={source} from={from} /> : <p className="text-[14px] italic text-fg-subtle">{placeholder}</p>}
      {readOnly ? null : (
        <div className="absolute -top-1 right-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <IconButton size="sm" label="Edit" icon={<Pencil className="size-3.5" />} onClick={start} />
        </div>
      )}
    </div>
  );
}
