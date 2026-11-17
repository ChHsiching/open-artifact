/**
 * A canvas note in world coordinates: a title, a sticky, a shape, a drawn
 * path, an image or a link card. Double-click edits the text in place.
 *
 * Over the canvas engine a note is `bare`: its text only, laid out as it
 * would be on its body, which the engine draws (services/engine.ts).
 */

import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { CanvasNote } from '@open-artifact/design-core';
import { cn } from '@open-artifact/ui';
import { useDocument } from '../state/document.ts';
import { useView } from '../state/view.ts';
import { observeNoteSize } from '../services/engine.ts';
import { DEFAULT_STICKY, dashArray, inlineRuns, isPathNote, markdownBlocks, noteBounds, noteColor, noteFontSize } from '../lib/notes.ts';

/** Renders inline Markdown runs. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineRuns(text).map((run, index) =>
        run.code ? (
          <code key={index} className="rounded bg-black/10 px-1 font-mono text-[0.9em]">
            {run.text}
          </code>
        ) : (
          <span key={index} style={{ fontWeight: run.bold ? 700 : undefined, fontStyle: run.italic ? 'italic' : undefined }}>
            {run.text}
          </span>
        ),
      )}
    </>
  );
}

/** Sticky text with headings and lists. */
function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1">
      {markdownBlocks(text).map((block, index) =>
        block.kind === 'heading' ? (
          <div key={index} className="text-[1.15em] font-bold">
            <Inline text={block.text} />
          </div>
        ) : block.kind === 'item' ? (
          <div key={index} className="flex gap-1.5">
            <span>{block.ordered ? '•' : '–'}</span>
            <span>
              <Inline text={block.text} />
            </span>
          </div>
        ) : (
          <div key={index} className="min-h-[1em]">
            <Inline text={block.text} />
          </div>
        ),
      )}
    </div>
  );
}

/** Commits a note's text; an emptied sticky or title is removed. */
function commitText(id: string, text: string): void {
  const doc = useDocument.getState();
  const note = doc.canvas.notes[id];
  useView.getState().setNoteEdit(null);
  if (!note || note.text === text) {
    if (note && !text.trim() && (!note.kind || note.kind === 'sticky' || note.kind === 'title1')) removeNote(id);
    return;
  }
  if (!text.trim() && (!note.kind || note.kind === 'sticky' || note.kind === 'title1')) {
    removeNote(id);
    return;
  }
  doc.updateCanvas((canvas) => ({ ...canvas, notes: { ...canvas.notes, [id]: { ...canvas.notes[id]!, text } } }));
}

function removeNote(id: string): void {
  useDocument.getState().updateCanvas((canvas) => {
    const notes = { ...canvas.notes };
    delete notes[id];
    return { ...canvas, notes };
  });
}

/** The in-place text editor. */
function NoteEditor({ id, note, style }: { id: string; note: CanvasNote; style: CSSProperties }) {
  const [draft, setDraft] = useState(note.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // Focus after the current pointer event: a note created on pointerdown
    // mounts during it, and the browser's own mousedown focus change would
    // blur it at once (and an empty sticky is removed on blur).
    const timer = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight}px`;
  }, [draft]);
  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => commitText(id, draft)}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
          event.preventDefault();
          commitText(id, draft);
        }
      }}
      className="pointer-events-auto block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={style}
    />
  );
}

/** Arrow and line notes: an SVG over the bounds of their points. */
function PathNote({ note }: { note: CanvasNote }) {
  const bounds = noteBounds(note);
  const pad = 12;
  const stroke = noteColor(note.color, 'stroke', '#2b2b2b');
  const width = note.kind === 'pen' && typeof note.stroke === 'number' && note.stroke > 0 ? note.stroke : 3;
  const points = (note.points ?? []).map(([x, y]) => [x + note.x - bounds.x + pad, y + note.y - bounds.y + pad] as const);
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  const head = (() => {
    if (note.kind !== 'arrow' || points.length < 2) return null;
    const [x2, y2] = points[points.length - 1]!;
    const [x1, y1] = points[points.length - 2]!;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 12;
    const a = [x2 - size * Math.cos(angle - 0.45), y2 - size * Math.sin(angle - 0.45)];
    const b = [x2 - size * Math.cos(angle + 0.45), y2 - size * Math.sin(angle + 0.45)];
    return `M${a[0]} ${a[1]} L${x2} ${y2} L${b[0]} ${b[1]}`;
  })();
  return (
    <svg
      width={bounds.w + pad * 2}
      height={bounds.h + pad * 2}
      className="pointer-events-none absolute overflow-visible"
      style={{ left: bounds.x - note.x - pad, top: bounds.y - note.y - pad }}
    >
      <path d={d} fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={note.kind === 'pen' ? dashArray(note.dash, width) : undefined} strokeLinecap="round" strokeLinejoin="round" />
      {head ? <path d={head} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {/* A wide invisible stroke makes thin paths easy to grab. */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={16} className="pointer-events-auto" />
    </svg>
  );
}

export interface NoteViewProps {
  id: string;
  note: CanvasNote;
  /**
   * Text only, over a body the canvas engine draws: no fill, border or
   * shadow, no pointer except on the editor and links, and the rendered
   * size reported (`observeNoteSize`). Paths and images have no text and
   * render nothing.
   */
  bare?: boolean;
}

/** One note. Hit testing reads `data-note` on the outer element. */
export const NoteView = memo(function NoteView({ id, note, bare = false }: NoteViewProps) {
  const editing = useView((s) => s.noteEdit === id);
  const outer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => (bare && outer.current ? observeNoteSize(outer.current) : undefined), [bare]);
  const fontSize = noteFontSize(note.size, note.kind);
  const textStyle: CSSProperties = {
    fontSize,
    lineHeight: 1.35,
    fontWeight: note.bold || note.kind === 'title1' ? 700 : 400,
    fontStyle: note.italic ? 'italic' : undefined,
    color: note.kind === 'title1' ? noteColor(note.color, 'stroke', '#1d1d1b') : '#1d1d1b',
  };
  const position: CSSProperties = { left: note.x, top: note.y };

  if (bare && (isPathNote(note) || note.kind === 'image')) return null;

  if (isPathNote(note)) {
    return (
      <div data-note={id} className="absolute" style={position}>
        <PathNote note={note} />
      </div>
    );
  }

  if (note.kind === 'image') {
    return (
      <div data-note={id} className="absolute" style={{ ...position, width: note.w ?? 320, height: note.h ?? 240 }}>
        {note.src ? <img src={note.src} alt={note.text} draggable={false} className="size-full select-none object-contain" /> : null}
      </div>
    );
  }

  if (note.kind === 'link') {
    return (
      <div
        ref={outer}
        data-note={id}
        className={cn('absolute flex flex-col gap-1 rounded-lg border p-3', bare ? 'pointer-events-none border-transparent' : 'border-black/10 bg-white shadow-sm')}
        style={{ ...position, width: note.w ?? 280 }}
      >
        <div className="truncate text-[14px] font-semibold text-[#1d1d1b]">{note.text || note.href}</div>
        {note.href ? (
          <a
            href={note.href}
            target="_blank"
            rel="noreferrer noopener"
            onPointerDown={(event) => event.stopPropagation()}
            className="pointer-events-auto truncate text-[12px] text-[#2f6fd6] underline"
          >
            {note.href}
          </a>
        ) : null}
      </div>
    );
  }

  if (note.kind === 'rect' || note.kind === 'oval') {
    return (
      <div
        ref={outer}
        data-note={id}
        className={cn('absolute flex items-center justify-center p-2 text-center', note.kind === 'oval' && 'rounded-[50%]', bare && 'pointer-events-none')}
        style={{
          ...position,
          width: note.w ?? 160,
          height: note.h ?? 100,
          border: `3px solid ${bare ? 'transparent' : noteColor(note.color, 'stroke', '#2b2b2b')}`,
          background: note.fill && !bare ? noteColor(note.fill, 'sticky', 'transparent') : 'transparent',
          borderRadius: note.kind === 'rect' ? 6 : undefined,
        }}
      >
        {editing ? <NoteEditor id={id} note={note} style={{ ...textStyle, textAlign: 'center' }} /> : <span style={textStyle}>{note.text}</span>}
      </div>
    );
  }

  if (note.kind === 'title1') {
    return (
      <div
        ref={outer}
        data-note={id}
        className={cn('absolute', bare && 'pointer-events-none')}
        style={{ ...position, maxWidth: note.maxW ?? 1200, minWidth: 40, width: editing ? note.maxW ?? 1200 : note.w ?? 'max-content' }}
      >
        {editing ? (
          <NoteEditor id={id} note={note} style={textStyle} />
        ) : (
          <div className="whitespace-pre-wrap" style={textStyle}>
            {note.text || ' '}
          </div>
        )}
      </div>
    );
  }

  // Sticky.
  return (
    <div
      ref={outer}
      data-note={id}
      className={cn('absolute rounded-sm p-3', bare ? 'pointer-events-none' : 'shadow-[0_1px_2px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]')}
      style={{ ...position, width: note.w ?? 240, minHeight: note.h ?? 80, background: bare ? undefined : noteColor(note.color, 'sticky', DEFAULT_STICKY) }}
    >
      {editing ? <NoteEditor id={id} note={note} style={textStyle} /> : <div style={textStyle}><Markdown text={note.text} /></div>}
    </div>
  );
});
