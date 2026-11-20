/**
 * The card under a link in rich Markdown editing: the address, and Open,
 * Copy link, Edit and Remove. Editing the address saves on Enter and puts
 * it back on Escape.
 */

import { Copy, ExternalLink, Pencil, Unlink } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { IconButton, INPUT_CLASS, cn, isComposingKey } from '@open-artifact/ui';
import { canOpenLink, normalizeTypedLink, placeLinkCard, shownLink } from '../lib/link-card.ts';
import { copyText } from '../services/downloads.ts';

export interface LinkCardProps {
  link: HTMLAnchorElement;
  /** Writes a new address into the link; returns false when it could not. */
  onEdit(target: string): boolean;
  onRemove(): void;
  /** Gives focus back to the text, with the caret in the link. */
  onReturn(): void;
}

/** The address the Markdown names: the project path for project links. */
export function linkTarget(link: HTMLAnchorElement): string {
  return link.dataset.target ?? link.getAttribute('href') ?? '';
}

const keepTextFocus = (event: MouseEvent) => event.preventDefault();

export function LinkCard({ link, onEdit, onRemove, onReturn }: LinkCardProps) {
  const card = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const target = linkTarget(link);
  const shown = shownLink(target);
  const openable = canOpenLink(link.href);

  useLayoutEffect(() => {
    const measure = () => {
      if (!card.current || !link.isConnected) return;
      const box = card.current.getBoundingClientRect();
      setPlace(placeLinkCard(link.getBoundingClientRect(), box, { width: window.innerWidth, height: window.innerHeight }));
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [link, editing]);

  const startEdit = () => {
    setDraft(target);
    setInvalid(false);
    setEditing(true);
  };
  const save = () => {
    const next = normalizeTypedLink(draft);
    if (next === null) {
      setInvalid(true);
      return;
    }
    if (next !== target && !onEdit(next)) return;
    setEditing(false);
    if (next === target) onReturn();
  };

  return (
    <div
      ref={card}
      role="dialog"
      aria-label="Link"
      data-link-card=""
      className="fixed z-50 flex max-w-[min(420px,calc(100vw-12px))] items-center gap-1 rounded-control border border-line bg-surface p-1 text-[12px] shadow-lg"
      style={place ? { top: place.top, left: place.left } : { top: -9999, left: -9999 }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isComposingKey(event.nativeEvent)) {
          event.preventDefault();
          event.stopPropagation();
          if (editing) setEditing(false);
          onReturn();
        }
      }}
    >
      {editing ? (
        <>
          <input
            autoFocus
            aria-label="Link address"
            aria-invalid={invalid || undefined}
            value={draft}
            spellCheck={false}
            className={cn(INPUT_CLASS, 'h-7 w-72 font-mono text-[12px]', invalid && 'border-danger')}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || isComposingKey(event.nativeEvent)) return;
              event.preventDefault();
              save();
            }}
          />
          {invalid ? <span role="alert" className="px-1 text-danger">Not a link address</span> : null}
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate px-1.5" title={target}>
            <span className="text-fg">{shown.site}</span>
            <span className="text-fg-subtle">{shown.rest}</span>
          </span>
          {openable ? (
            <IconButton size="sm" label="Open link" icon={<ExternalLink className="size-3.5" />} onMouseDown={keepTextFocus} onClick={() => window.open(link.href, '_blank', 'noopener,noreferrer')} />
          ) : null}
          <IconButton size="sm" label="Copy link" icon={<Copy className="size-3.5" />} onMouseDown={keepTextFocus} onClick={() => void copyText(target, 'link')} />
          <IconButton size="sm" label="Edit link" icon={<Pencil className="size-3.5" />} onClick={startEdit} />
          <IconButton size="sm" label="Remove link" icon={<Unlink className="size-3.5" />} onMouseDown={keepTextFocus} onClick={onRemove} />
        </>
      )}
    </div>
  );
}
