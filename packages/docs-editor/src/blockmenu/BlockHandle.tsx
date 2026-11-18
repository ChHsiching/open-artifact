/**
 * The handle in the left gutter of the top-level block under the pointer, and its menu: Copy, Duplicate and Delete,
 * and for a heading Copy link to heading and Collapse / Expand section. Readers get Copy and Copy link.
 */
import { ChromeButton, ChromeMenu, ChromeMenuItem, ChromeMenuSeparator } from '@open-artifact/editor-kit/react';
import { ChevronsDownUp, ChevronsUpDown, Copy, CopyPlus, GripVertical, Link, Trash2 } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useEditor } from '../editor/format.ts';
import { formatChord } from '../selbar/chords.ts';
import { type BlockRef, copyBlock, copyHeadingLink, deleteBlock, duplicateBlock, foldBlock, isFolded, isHeading, resolveBlock } from './block-actions.ts';

const HANDLE = 24;
const GUTTER = 30;
/** How far above or below a block the pointer may be and still be on it. */
const SLACK = 6;

interface Hover {
  ref: BlockRef;
  left: number;
  top: number;
}

/** The top-level block level with `y` on screen, skipping those folded away. */
function hoverAt(view: EditorView, x: number, y: number): Hover | null {
  const page = view.dom.closest('.doc-page');
  if (!page) return null;
  const pageBox = page.getBoundingClientRect();
  if (x < pageBox.left || x > pageBox.right) return null;
  let hit: Hover | null = null;
  view.state.doc.forEach((node, pos) => {
    if (hit) return;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const box = dom.getBoundingClientRect();
    if (box.height === 0 || y < box.top - SLACK || y > box.bottom + SLACK) return;
    const line = parseFloat(getComputedStyle(dom).lineHeight) || HANDLE;
    hit = {
      ref: { bid: typeof node.attrs.bid === 'string' ? node.attrs.bid : null, pos },
      left: box.left - pageBox.left - GUTTER,
      top: box.top - pageBox.top + (Math.min(box.height, line) - HANDLE) / 2,
    };
  });
  return hit;
}

export function BlockHandle(): ReactNode {
  const view = useEditor(state => state.view);
  const [hover, setHover] = useState<Hover | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;

  useEffect(() => {
    const scroller = view?.dom.closest('[data-doc-scroll]');
    if (!view || !scroller) return undefined;
    let frame = 0;
    let pointer = { x: 0, y: 0 };
    const track = () => {
      frame = 0;
      if (!menuOpenRef.current) setHover(hoverAt(view, pointer.x, pointer.y));
    };
    const move = (event: Event) => {
      const { clientX, clientY } = event as MouseEvent;
      pointer = { x: clientX, y: clientY };
      if (!frame) frame = requestAnimationFrame(track);
    };
    const leave = () => {
      if (!menuOpenRef.current) setHover(null);
    };
    const typing = () => {
      if (!menuOpenRef.current) setHover(null);
    };
    scroller.addEventListener('mousemove', move, { passive: true });
    scroller.addEventListener('mouseleave', leave);
    view.dom.addEventListener('keydown', typing);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('mousemove', move);
      scroller.removeEventListener('mouseleave', leave);
      view.dom.removeEventListener('keydown', typing);
    };
  }, [view]);

  useEffect(() => setHover(null), [view]);

  if (!view || !hover) return null;
  const block = resolveBlock(view.state.doc, hover.ref);
  if (!block) return null;
  return (
    <div className="absolute z-20" style={{ left: hover.left, top: hover.top }} data-block-handle="">
      <ChromeMenu
        side="bottom"
        align="start"
        open={menuOpen}
        onOpenChange={open => {
          setMenuOpen(open);
          if (!open) setHover(null);
        }}
        trigger={
          <ChromeButton square aria-label="Block options" className="size-6 text-chrome-muted opacity-70 hover:opacity-100 data-[popup-open]:opacity-100">
            <GripVertical className="size-4" strokeWidth={1.75} />
          </ChromeButton>
        }
      >
        <BlockMenuItems view={view} target={hover.ref} />
      </ChromeMenu>
    </div>
  );
}

function BlockMenuItems({ view, target }: { view: EditorView; target: BlockRef }): ReactNode {
  const block = resolveBlock(view.state.doc, target);
  if (!block) return null;
  const heading = isHeading(block.node) && typeof block.node.attrs.bid === 'string';
  const writer = view.editable;
  const folded = heading && isFolded(view, block.node);
  return (
    <>
      <ChromeMenuItem icon={<Copy className="size-4" />} onSelect={() => void copyBlock(view, target)}>
        Copy
      </ChromeMenuItem>
      {heading ? (
        <ChromeMenuItem icon={<Link className="size-4" />} onSelect={() => copyHeadingLink(view, target)}>
          Copy link to heading
        </ChromeMenuItem>
      ) : null}
      {writer ? (
        <>
          <ChromeMenuItem icon={<CopyPlus className="size-4" />} onSelect={() => duplicateBlock(view, target)}>
            Duplicate
          </ChromeMenuItem>
          {isHeading(block.node) ? (
            <ChromeMenuItem
              icon={folded ? <ChevronsUpDown className="size-4" /> : <ChevronsDownUp className="size-4" />}
              shortcut={formatChord('Mod-Alt-Enter')}
              disabled={!heading}
              onSelect={() => foldBlock(view, target)}
            >
              {folded ? 'Expand section' : 'Collapse section'}
            </ChromeMenuItem>
          ) : null}
          <ChromeMenuSeparator />
          <ChromeMenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => deleteBlock(view, target)}>
            Delete
          </ChromeMenuItem>
        </>
      ) : null}
    </>
  );
}
