/**
 * "Start with a layout": under an empty doc's first line, a row of layouts that fit the page's width and a More menu
 * with the rest. Pointing at one shows it in grey where it would go; pressing one puts it in.
 */
import { ChromeMenu, ChromeMenuItem } from '@open-artifact/editor-kit/react';
import { ChevronDown } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useDocs } from '../app/store.ts';
import { useEditor } from '../editor/format.ts';
import { showNotice } from '../suggest/store.ts';
import { LAYOUTS, type Layout, type LayoutBlock, applyLayout, bodyIsEmpty, columnWidth, layoutById, layoutDate } from './layouts.ts';

/** The gap between the empty line and the row. */
const GAP = 12;
/** The delay between one button's fade-in and the next. */
const STAGGER_MS = 40;

interface Seat {
  left: number;
  top: number;
  width: number;
  /** Where the title sits, when it is empty and would take the layout's name. */
  title: { left: number; top: number; font: string } | null;
}

/** Where the row goes: under the line below the title (or under the title, when there is none). */
function seatOf(view: EditorView): Seat | null {
  const page = view.dom.closest('.doc-page');
  const doc = view.state.doc;
  const line = view.nodeDOM(doc.childCount > 1 ? doc.firstChild!.nodeSize : 0);
  const titleDom = view.nodeDOM(0);
  if (!page || !(line instanceof HTMLElement) || !(titleDom instanceof HTMLElement)) return null;
  const pageBox = page.getBoundingClientRect();
  const box = line.getBoundingClientRect();
  const textBox = view.dom.getBoundingClientRect();
  const titleBox = titleDom.getBoundingClientRect();
  const style = getComputedStyle(titleDom);
  return {
    left: textBox.left - pageBox.left,
    top: box.bottom - pageBox.top + GAP,
    width: textBox.width,
    title:
      doc.firstChild!.content.size === 0
        ? { left: titleBox.left - pageBox.left, top: titleBox.top - pageBox.top, font: `${style.fontWeight} 32px/1.2 var(--doc-heading-font)` }
        : null,
  };
}

/** How many buttons fit beside the More button in `width`. */
function fitting(widths: number[], more: number, gap: number, width: number): number {
  let used = more;
  let count = 0;
  for (const each of widths) {
    used += each + gap;
    if (used > width) break;
    count++;
  }
  return count;
}

export function StartRow(): ReactNode {
  const view = useEditor(state => state.view);
  const state = useEditor(state => state.state);
  const writable = useDocs(state => state.writable);
  const shown = !!view && !!state && writable && bodyIsEmpty(state.doc);
  return shown ? <Row view={view} /> : null;
}

function Row({ view }: { view: EditorView }): ReactNode {
  const state = useEditor(hold => hold.state);
  const row = useRef<HTMLDivElement>(null);
  const measured = useRef<{ widths: number[]; gap: number } | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useLayoutEffect(() => {
    const place = () => setSeat(seatOf(view));
    place();
    const observer = new ResizeObserver(place);
    observer.observe(view.dom);
    return () => observer.disconnect();
  }, [view, state]);

  useLayoutEffect(() => {
    if (!previewing) return undefined;
    view.dom.setAttribute('data-start-previewing', '');
    return () => view.dom.removeAttribute('data-start-previewing');
  }, [view, previewing]);

  useLayoutEffect(() => {
    const node = row.current;
    if (!node || !seat) return;
    measured.current ??= {
      widths: Array.from(node.children, child => child.getBoundingClientRect().width),
      gap: Number.parseFloat(getComputedStyle(node).columnGap) || 0,
    };
    const { widths, gap } = measured.current;
    setCount(fitting(widths.slice(0, -1), widths.at(-1) ?? 0, gap, seat.width));
  }, [seat]);

  if (!seat) return null;
  const laidOut = count !== null && count > 0;
  const inRow = count === null ? LAYOUTS : LAYOUTS.slice(0, count);
  const inMore = count === null ? [] : LAYOUTS.slice(count);
  const preview = laidOut && previewing ? layoutById(previewing) : undefined;
  const rowHeight = row.current?.offsetHeight ?? 32;

  const press = (layout: Layout) => {
    const tr = applyLayout(view.state, layout);
    if (!tr) return;
    view.dispatch(tr);
    view.focus();
    showNotice(`${layout.title} layout added`);
  };
  const toText = () => {
    setPreviewing(null);
    view.focus();
  };
  const pointing = (id: string) => ({
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType !== 'touch') setPreviewing(id);
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (event.currentTarget.matches(':focus-visible')) setPreviewing(id);
    },
    onBlur: () => setPreviewing(current => (current === id ? null : current)),
  });
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      toText();
      return;
    }
    const last = inRow.length;
    const at = Math.min(focusIndex, last);
    const next = ({ ArrowRight: Math.min(at + 1, last), ArrowLeft: Math.max(at - 1, 0), Home: 0, End: last } as Record<string, number>)[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setFocusIndex(next);
    (row.current?.children[next] as HTMLElement | undefined)?.focus();
  };
  const fade = (index: number): CSSProperties => ({ animationDelay: `${index * STAGGER_MS}ms`, animationFillMode: 'backwards' });
  const tabIndex = (index: number) => (Math.min(focusIndex, inRow.length) === index ? 0 : -1);

  return (
    <>
      <div className="pointer-events-none absolute z-10" style={{ left: seat.left, top: seat.top, width: seat.width }} data-doc-start-clip="">
        <div
          ref={row}
          role="toolbar"
          aria-label="Start with a layout"
          className={`pointer-events-auto flex w-max items-center gap-2 ${laidOut ? '' : 'invisible'}`}
          onKeyDown={onKeyDown}
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
              toText();
            } else event.preventDefault();
          }}
          onPointerLeave={() => setPreviewing(null)}
          data-testid="doc-start-row"
        >
          {inRow.map((layout, index) => (
            <button
              key={layout.id}
              type="button"
              className="doc-start-button"
              tabIndex={tabIndex(index)}
              style={fade(index)}
              data-doc-start={layout.id}
              {...pointing(layout.id)}
              onFocus={event => {
                setFocusIndex(index);
                pointing(layout.id).onFocus(event);
              }}
              onClick={() => press(layout)}
            >
              {layout.title}
            </button>
          ))}
          <ChromeMenu
            side="bottom"
            align="start"
            open={moreOpen}
            onOpenChange={open => {
              setMoreOpen(open);
              if (!open) setPreviewing(null);
            }}
            trigger={
              <button
                type="button"
                className="doc-start-button"
                tabIndex={tabIndex(inRow.length)}
                style={fade(inRow.length)}
                onPointerEnter={() => setPreviewing(null)}
                onFocus={() => setFocusIndex(inRow.length)}
                data-testid="doc-start-more"
              >
                More
                <ChevronDown className="size-3.5 opacity-60" strokeWidth={2} />
              </button>
            }
          >
            {inMore.map(layout => (
              <ChromeMenuItem key={layout.id} onSelect={() => press(layout)}>
                <span className="block" data-doc-start={layout.id} onPointerEnter={() => setPreviewing(layout.id)}>
                  {layout.title}
                </span>
              </ChromeMenuItem>
            ))}
          </ChromeMenu>
        </div>
      </div>
      {preview ? <Preview layout={preview} seat={seat} top={seat.top + rowHeight + GAP} /> : null}
    </>
  );
}

/** The layout in grey under the row, as it would be laid out. */
function Preview({ layout, seat, top }: { layout: Layout; seat: Seat; top: number }): ReactNode {
  return (
    <>
      {seat.title ? (
        <div className="doc-start-ghost-title" style={{ left: seat.title.left, top: seat.title.top, font: seat.title.font }} aria-hidden="true">
          {layout.title}
        </div>
      ) : null}
      <div className="doc-text doc-start-preview" style={{ left: seat.left, top, width: seat.width }} aria-hidden="true" data-doc-start-preview={layout.id}>
        {layout.blocks.map((block, index) => (
          <PreviewBlock key={index} block={block} />
        ))}
      </div>
    </>
  );
}

const Hint = ({ text }: { text?: string }) =>
  text ? (
    <p className="doc-empty-hint doc-layout-hint" data-layout-hint={text}>
      <br />
    </p>
  ) : (
    <p>
      <br />
    </p>
  );

function PreviewBlock({ block }: { block: LayoutBlock }): ReactNode {
  switch (block.t) {
    case 'date':
      return <p>{layoutDate(new Date())}</p>;
    case 'h2':
      return <h2>{block.text}</h2>;
    case 'hint':
      return <Hint text={block.text} />;
    case 'table': {
      const width = columnWidth(block.head.length);
      return (
        <div className="tableWrapper">
          <table style={{ width: width * block.head.length }}>
            <colgroup>
              {block.head.map((_, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <tbody>
              <tr>
                {block.head.map(text => (
                  <th key={text} data-colwidth={width}>
                    <p>{text}</p>
                  </th>
                ))}
              </tr>
              {Array.from({ length: block.rows }, (_, row) => (
                <tr key={row}>
                  {block.head.map(text => (
                    <td key={text} data-colwidth={width}>
                      <Hint />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'numbers':
      return (
        <ol>
          {block.hints.map(text => (
            <li key={text}>
              <Hint text={text} />
            </li>
          ))}
        </ol>
      );
    case 'bullets':
      return (
        <ul>
          {block.hints.map(text => (
            <li key={text}>
              <Hint text={text} />
            </li>
          ))}
        </ul>
      );
    case 'checks':
      return (
        <ul data-kind="check">
          {block.hints.map(text => (
            <li key={text} className="doc-check-item" data-checked="false">
              <span className="doc-check" />
              <div className="doc-check-body">
                <Hint text={text} />
              </div>
            </li>
          ))}
        </ul>
      );
  }
}
