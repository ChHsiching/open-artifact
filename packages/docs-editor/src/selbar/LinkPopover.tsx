/** The link box over a link or a selection: a card with the link's address and actions, or the fields to edit it. */
import { Card, ChromeDivider, ToolButton, TipGroup } from '@open-artifact/editor-kit/react';
import { ArrowRight, Copy, ExternalLink, Hash, Pencil, Unlink } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { useDocs } from '../app/store.ts';
import { useEditor } from '../editor/format.ts';
import { docHeadings, findPlace, parseDocHref } from './fragments.ts';
import { LinkForm } from './LinkForm.tsx';
import { closeLink, copyText, editLink, cardStillFits, openHref, shareableHref, unlink, useLinkPop, type LinkPop } from './links.ts';
import { shortLink } from './link-url.ts';
import { useLayerPlacement } from './use-placement.ts';
import { linkRange } from './watch.ts';

const ICON = { className: 'size-4', strokeWidth: 1.75 } as const;

/** What an in-doc link points at, named for the card. */
function useDocTargetName(view: EditorView, href: string): string | null {
  const files = useDocs(state => state.project?.files);
  return useMemo(() => {
    const place = parseDocHref(href);
    if (!place) return null;
    if (place.tab && !place.block && !place.slug) return files?.find(file => file.id === place.tab)?.name ?? 'Tab';
    if (place.tab && place.tab !== useEditor.getState().tab) return files?.find(file => file.id === place.tab)?.name ?? 'Heading in another tab';
    const pos = findPlace(view.state.doc, place);
    const heading = pos === null ? null : docHeadings(view.state.doc).find(item => item.pos === pos);
    return heading?.text ?? (pos === null ? 'Missing section' : 'Section');
  }, [view, href, files]);
}

function LinkCard({ view, pop }: { view: EditorView; pop: LinkPop }): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const docName = useDocTargetName(view, pop.href);
  const shareable = shareableHref(pop.href);
  const canEdit = view.editable;

  useEffect(() => {
    if (pop.byKey) root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [pop.byKey]);

  const follow = () => {
    openHref(pop.href);
    closeLink();
  };
  return (
    <div ref={root} className="flex items-center gap-0.5" onKeyDown={event => moveAlongRow(event, root.current)}>
      <button
        type="button"
        title={pop.href}
        onClick={follow}
        className="group flex h-7 min-w-0 max-w-[260px] items-center gap-1 rounded-[8px] px-2 text-left text-[13px] outline-none hover:bg-chrome-hover focus-visible:outline-2 focus-visible:outline-chrome-focus"
      >
        {docName !== null ? <Hash className="size-3.5 shrink-0 text-chrome-muted" strokeWidth={1.75} /> : <ArrowRight className="size-3.5 shrink-0 text-chrome-muted" strokeWidth={1.75} />}
        <span className="truncate group-hover:underline">{docName ?? shortLink(pop.href)}</span>
      </button>
      <ChromeDivider />
      <TipGroup>
        <ToolButton size="md" tipSide="top" label="Open link" icon={<ExternalLink {...ICON} />} onClick={follow} />
        <ToolButton
          size="md"
          tipSide="top"
          label="Copy link"
          icon={<Copy {...ICON} />}
          disabled={!shareable}
          onClick={() => {
            if (shareable) void copyText(shareable).finally(() => closeLink({ refocus: true }));
          }}
        />
        {canEdit ? (
          <>
            <ToolButton size="md" tipSide="top" label="Edit link" icon={<Pencil {...ICON} />} onClick={editLink} />
            <ToolButton size="md" tipSide="top" label="Remove link" icon={<Unlink {...ICON} />} onClick={unlink} />
          </>
        ) : null}
      </TipGroup>
    </div>
  );
}

/** Arrow keys, Home and End move along the card's buttons. */
function moveAlongRow(event: ReactKeyboardEvent, row: HTMLElement | null): void {
  if (!row || event.ctrlKey || event.metaKey || event.altKey || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  if (!buttons.length) return;
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (Math.max(at, 0) + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
  event.preventDefault();
  buttons[next]?.focus();
}

export function LinkPopover(): ReactNode {
  const pop = useLinkPop(state => state.pop);
  const view = useEditor(state => state.view);
  const state = useEditor(state => state.state);
  const box = useRef<HTMLDivElement>(null);
  const range = view && state ? linkRange(view) : null;
  const placement = useLayerPlacement(view, pop ? range : null, box, `${pop?.mode}:${state?.doc.content.size}`);

  // The card goes once its link does, or the cursor leaves it.
  useEffect(() => {
    if (pop && view && state && !cardStillFits(view)) closeLink();
  }, [pop, view, state]);

  useEffect(() => {
    if (!pop) return undefined;
    const outside = (event: Event) => {
      const target = event.target as Element | null;
      if (box.current?.contains(target) || target?.closest?.('[data-base-ui-portal], [role="tooltip"]')) return;
      // A press on the link itself reopens its card; anywhere else closes the box.
      closeLink();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closeLink({ refocus: true });
    };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', key);
    };
  }, [pop]);

  if (!pop || !view || !range) return null;
  return (
    <Card
      ref={box}
      role="dialog"
      aria-label="Link"
      data-link-box=""
      className={pop.mode === 'edit' ? 'absolute z-40 w-[min(360px,calc(100vw-16px))] flex-col items-stretch gap-0 p-3' : 'absolute z-40 max-w-[calc(100vw-16px)] p-1'}
      style={{ left: placement?.left ?? 0, top: placement?.top ?? 0, visibility: placement ? 'visible' : 'hidden' }}
    >
      {pop.mode === 'edit' ? <LinkForm view={view} pop={pop} /> : <LinkCard view={view} pop={pop} />}
    </Card>
  );
}
