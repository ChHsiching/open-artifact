/**
 * The doc's tabs as a tree: subtabs indented under their tab, the open tab's headings under it, a menu on each row,
 * and rows dragged before, after or into one another. Drawn in the tab picker and, when the tabs show on the page,
 * beside the text.
 */
import { cn } from '@open-artifact/ui';
import { ChevronRight } from 'lucide-react';
import { type DragEvent, type KeyboardEvent, type ReactNode, useMemo, useRef, useState } from 'react';
import { orderedTabs, useDocs } from '../app/store.ts';
import { dropTab, dropTabAtEnd, openTab, stepTab } from './actions.ts';
import { jumpToHeading, type OutlineHeading, useOutline } from './outline.ts';
import { setTabsUi, useTabsUi } from './state.ts';
import { TabRenameInput } from './TabRenameInput.tsx';
import { TabRowMenu } from './TabRowMenu.tsx';
import { canMove, displayNames, type DropZone, dropMove, flatten, type FlatTab, type TabNode, tabTree } from './tree.ts';
import { PeerDots } from '../presence/PeerDots.tsx';

const DRAG_TYPE = 'application/x-docs-tab';
const INDENT_REM = 0.875;

interface DropHint {
  id: string;
  zone: DropZone;
}

export interface TabListProps {
  /** After a tab or heading is opened from the list (the picker closes). */
  onOpened?: () => void;
  className?: string;
}

/** What the toggle on a row folds: its subtabs, the open tab's headings, or both. */
type FoldKind = 'subtabs' | 'headings' | 'both';

const FOLD_WORDS: Record<FoldKind, string> = { subtabs: 'subtabs', headings: 'headings', both: 'headings and subtabs' };

function zoneAt(event: DragEvent<HTMLElement>): DropZone {
  const box = event.currentTarget.getBoundingClientRect();
  const offset = event.clientY - box.top;
  return offset < box.height * 0.25 ? 'before' : offset > box.height * 0.75 ? 'after' : 'into';
}

/** Rows hidden under a shut row are left out. */
function visibleRows(tree: readonly TabNode[], isOpen: (node: TabNode) => boolean): FlatTab[] {
  const rows: FlatTab[] = [];
  const walk = (nodes: readonly TabNode[], depth: number, parentId: string | undefined) => {
    for (const node of nodes) {
      rows.push({ node, depth, parentId });
      if (node.children.length && isOpen(node)) walk(node.children, depth + 1, node.id);
    }
  };
  walk(tree, 0, undefined);
  return rows;
}

export function TabList({ onOpened, className }: TabListProps): ReactNode {
  const files = useDocs(state => state.project?.files);
  const activeTab = useDocs(state => state.activeTab);
  const writable = useDocs(state => state.writable);
  const expanded = useTabsUi(state => state.expanded);
  const renaming = useTabsUi(state => state.renaming?.id ?? null);
  const headings = useOutline(activeTab);
  const tree = useMemo(() => tabTree(files ?? []), [files]);
  const names = useMemo(() => displayNames(tree), [tree]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const foldOf = (node: TabNode): FoldKind | null => {
    const subtabs = node.children.length > 0;
    const outline = node.id === activeTab && headings.length > 0;
    return subtabs && outline ? 'both' : subtabs ? 'subtabs' : outline ? 'headings' : null;
  };
  const isOpen = (node: TabNode) => expanded[node.id] ?? node.children.length > 0;
  const rows = visibleRows(tree, isOpen);
  const onlyTab = (files?.length ?? 0) <= 1;

  const open = (id: string) => {
    openTab(id);
    onOpened?.();
  };
  const jump = (heading: OutlineHeading) => {
    onOpened?.();
    // The picker gives focus back to its trigger as it closes; the editor takes it after that.
    requestAnimationFrame(() => jumpToHeading(heading));
  };

  const focusables = () => [...(box.current?.querySelectorAll<HTMLElement>('[data-tab-focus]') ?? [])];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = focusables();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      event.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, index))]?.focus();
    };
    const id = (document.activeElement as HTMLElement | null)?.dataset.tabRow;
    if (writable && id && event.altKey && event.shiftKey) {
      const step = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowRight' ? 'into' : event.key === 'ArrowLeft' ? 'out' : null;
      if (step) {
        event.preventDefault();
        void stepTab(id, step);
        return;
      }
    }
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at < 0 ? items.length - 1 : at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(items.length - 1);
    else if (id && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      const node = rows.find(row => row.node.id === id)?.node;
      if (!node || !foldOf(node)) return;
      event.preventDefault();
      setTabsUi(state => ({ expanded: { ...state.expanded, [id]: event.key === 'ArrowRight' } }));
    } else if (id && ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu')) {
      event.preventDefault();
      (document.activeElement as HTMLElement).parentElement?.querySelector<HTMLButtonElement>('[data-tab-menu]')?.click();
    } else if (id && writable && event.key === 'F2') {
      event.preventDefault();
      setTabsUi({ renaming: { id, draft: files?.find(file => file.id === id)?.name ?? '' } });
    }
  };

  const dragProps = (id: string) =>
    writable && renaming !== id
      ? {
          draggable: true,
          onDragStart: (event: DragEvent<HTMLElement>) => {
            event.dataTransfer.setData(DRAG_TYPE, id);
            event.dataTransfer.effectAllowed = 'move';
            setDragging(id);
          },
          onDragEnd: () => {
            setDragging(null);
            setHint(null);
          },
          onDragOver: (event: DragEvent<HTMLElement>) => {
            if (!dragging || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
            const zone = zoneAt(event);
            const move = dropMove(tree, id, zone);
            if (!move || dragging === id || !canMove(tree, dragging, move)) {
              setHint(null);
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            if (hint?.id !== id || hint.zone !== zone) setHint({ id, zone });
          },
          onDrop: (event: DragEvent<HTMLElement>) => {
            const moved = event.dataTransfer.getData(DRAG_TYPE);
            setDragging(null);
            setHint(null);
            if (!moved) return;
            event.preventDefault();
            event.stopPropagation();
            void dropTab(moved, id, zoneAt(event));
          },
        }
      : {};

  return (
    <div ref={box} className={cn('flex min-h-0 flex-col', className)} onKeyDown={onKeyDown}>
      <div role="tree" aria-label="Document tabs" className="flex flex-col gap-px">
        {rows.map(({ node, depth }) => {
          const id = node.id;
          const name = names.get(id) ?? node.file.name;
          const active = id === activeTab;
          const fold = foldOf(node);
          const opened = fold !== null && (fold === 'headings' ? expanded[id] === true : isOpen(node));
          const zone = hint?.id === id ? hint.zone : null;
          return (
            <div
              key={id}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={active}
              aria-expanded={fold ? opened : undefined}
              aria-label={name}
              className="relative"
              {...dragProps(id)}
            >
              <div
                className={cn(
                  'group/row relative flex h-8 items-center gap-0.5 rounded-[8px] pr-1',
                  active ? 'bg-chrome-pressed text-chrome-pressed-fg' : 'text-chrome-fg hover:bg-chrome-hover',
                  zone === 'into' && 'ring-1 ring-chrome-accent',
                  dragging === id && 'opacity-40',
                )}
                style={{ paddingLeft: `${0.25 + depth * INDENT_REM}rem` }}
                onDoubleClick={writable ? () => setTabsUi({ renaming: { id, draft: node.file.name } }) : undefined}
              >
                {zone === 'before' ? <span aria-hidden="true" className="absolute inset-x-1 -top-px h-0.5 rounded bg-chrome-accent" /> : null}
                {zone === 'after' ? <span aria-hidden="true" className="absolute inset-x-1 -bottom-px h-0.5 rounded bg-chrome-accent" /> : null}
                {fold ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`${opened ? 'Hide' : 'Show'} ${FOLD_WORDS[fold]} in ${name}`}
                    className="flex size-5 shrink-0 items-center justify-center rounded-[4px] text-chrome-muted hover:bg-chrome-hover hover:text-chrome-fg"
                    onClick={() => setTabsUi(state => ({ expanded: { ...state.expanded, [id]: !opened } }))}
                  >
                    <ChevronRight className={cn('size-3.5 transition-transform', opened && 'rotate-90')} strokeWidth={2} />
                  </button>
                ) : (
                  <span aria-hidden="true" className="size-5 shrink-0" />
                )}
                {renaming === id ? (
                  <TabRenameInput id={id} />
                ) : (
                  <button
                    type="button"
                    data-tab-focus=""
                    data-tab-row={id}
                    aria-current={active ? 'page' : undefined}
                    title={name}
                    className={cn('flex h-full min-w-0 flex-1 items-center rounded-[6px] px-1 text-left text-[14px] outline-none focus-visible:outline-2 focus-visible:outline-chrome-focus', active && 'font-medium')}
                    onClick={() => open(id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <PeerDots tabId={id} className="ml-1 inline-flex shrink-0" />
                  </button>
                )}
                {renaming === id ? null : <TabRowMenu tree={tree} id={id} name={name} writable={writable} onlyTab={onlyTab} />}
              </div>
              {active && opened && headings.length ? <HeadingRows headings={headings} depth={depth} tabName={name} onJump={jump} /> : null}
            </div>
          );
        })}
      </div>
      {writable && dragging ? (
        <div
          aria-hidden="true"
          className={cn('mt-0.5 h-6 rounded-[8px] border border-dashed border-chrome-line', hint?.id === '' && 'border-chrome-accent')}
          onDragOver={event => {
            if (!dragging) return;
            event.preventDefault();
            if (hint?.id !== '') setHint({ id: '', zone: 'after' });
          }}
          onDragLeave={() => setHint(null)}
          onDrop={event => {
            event.preventDefault();
            const moved = event.dataTransfer.getData(DRAG_TYPE);
            setDragging(null);
            setHint(null);
            if (moved) void dropTabAtEnd(moved);
          }}
        />
      ) : null}
    </div>
  );
}

function HeadingRows({ headings, depth, tabName, onJump }: { headings: readonly OutlineHeading[]; depth: number; tabName: string; onJump: (heading: OutlineHeading) => void }): ReactNode {
  const top = Math.min(...headings.map(heading => heading.level));
  return (
    <div role="group" aria-label={`Headings in ${tabName}`} className="flex flex-col py-0.5">
      {headings.map(heading => (
        <button
          key={heading.key}
          type="button"
          data-tab-focus=""
          title={heading.text}
          className="flex h-7 min-w-0 items-center rounded-[6px] pr-2 text-left text-[13px] text-chrome-muted outline-none hover:bg-chrome-hover hover:text-chrome-fg focus-visible:outline-2 focus-visible:outline-chrome-focus"
          style={{ paddingLeft: `${1.75 + depth * INDENT_REM + (heading.level - top) * 0.75}rem` }}
          onClick={() => onJump(heading)}
        >
          <span className="min-w-0 flex-1 truncate">{heading.text}</span>
        </button>
      ))}
    </div>
  );
}

/** How many tabs the doc has, and whether there is enough for the tabs to show beside the text. */
export function useTabsFitOnPage(): boolean {
  const files = useDocs(state => state.project?.files);
  const activeTab = useDocs(state => state.activeTab);
  const headings = useOutline(activeTab);
  return orderedTabs(files ?? []).length >= 2 || headings.length >= 2;
}
