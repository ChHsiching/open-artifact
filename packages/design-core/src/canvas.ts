/**
 * `project/canvas.json`, the index of a Design artifact.
 *
 * It places every artboard (a `.dc.html` file under `project/`) on an
 * infinite canvas, orders them back to front, groups them into pages, and
 * holds the canvas notes. Readers keep every key they do not know: the file
 * is shared by the editor, agents and future versions, so a normalize/save
 * cycle must never drop data.
 */

/** Current index version. */
export const CANVAS_VERSION = 3;

/** Size limits of an artboard frame, CSS pixels. */
export const MIN_BOARD_SIZE = 40;
export const MAX_BOARD_SIZE = 8000;
/** Gap between frames in a row, and between rows. */
export const ROW_GAP = 80;
export const COLUMN_GAP = 120;
/** Most pages, notes, guides per board. */
export const MAX_PAGES = 40;
export const MAX_NOTES = 999;
export const MAX_GUIDES = 6;
/** How deep note groups may nest (see `note-groups.ts`). */
export const MAX_NOTE_GROUPS = 8;

/** Id grammar of pages and notes. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
/** Folder grammar of an installed design system (`project/ds/<folder>/`). */
export const DS_FOLDER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** What opens first. */
export type Launch = { view: 'canvas'; page?: string } | { view: 'focused'; file: string };

/** A page of the canvas. */
export interface CanvasPage {
  id: string;
  name: string;
}

/** A layout guide drawn over an artboard (never in Play or exports). */
export interface BoardGuide {
  kind: 'columns' | 'rows' | 'grid';
  count?: number | 'auto';
  gutter?: number;
  margin?: number;
  align?: 'stretch' | 'start' | 'center' | 'end';
  size?: number;
  offset?: number;
  color?: string;
  hidden?: boolean;
  [key: string]: unknown;
}

/** One artboard's frame on the canvas, keyed by its path under `project/`. */
export interface BoardEntry {
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  /** Page id; none = the first page. */
  page?: string;
  /** `"fill"`: a page that fills the window in the focused view. */
  expand?: 'fill';
  /** `"flow"`: PDF export paginates. */
  print?: 'flow' | 'fixed';
  paper?: 'letter' | 'a4';
  /** Has working controls: gets the Play button. */
  is_interactive?: boolean;
  /** Drawn without a frame (editor-set). */
  frameless?: boolean;
  guides?: BoardGuide[];
  /** Corner radius, px. */
  radius?: number;
  [key: string]: unknown;
}

/** Note kinds. No kind = a sticky. */
export type NoteKind = 'title1' | 'sticky' | 'rect' | 'oval' | 'pen' | 'line' | 'arrow' | 'image' | 'link';

/** Named note colors. */
export const NOTE_COLORS = ['gray', 'red', 'orange', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

/** Text sizes of notes. */
export type NoteSize = number | 's' | 'm' | 'l' | 'xl' | 'xxl';

/** A canvas note: a title over several artboards, a sticky, or a drawn shape. */
export interface CanvasNote {
  x: number;
  y: number;
  text: string;
  kind?: NoteKind;
  w?: number;
  h?: number;
  maxW?: number;
  maxH?: number;
  size?: NoteSize;
  bold?: boolean;
  italic?: boolean;
  page?: string;
  color?: NoteColor | string;
  fill?: NoteColor | string;
  /** Pen / line / arrow points, relative to `x`,`y`. */
  points?: [number, number][];
  /** Pen notes: stroke weight in px (default 3). */
  stroke?: number;
  /** Pen notes: dash pattern (default solid). */
  dash?: 'dashed' | 'dotted';
  /** Image notes: the uploaded blob url. */
  src?: string;
  /** Link notes: the target. */
  href?: string;
  /** Groups this note belongs to, innermost first (see `note-groups.ts`). */
  groups?: string[];
  [key: string]: unknown;
}

/** A design system installed into this canvas (tokens copied to `project/ds/<namespace>/`). */
export interface DesignSystemRecord {
  title: string;
  /** The folder under `project/ds/`. */
  namespace: string;
  /** Where it came from (an artifact address). */
  artifact: string;
  version: string | null;
  copiedAt: string;
  [key: string]: unknown;
}

/** The whole index. */
export interface Canvas {
  v: number;
  createdOnFiles?: { v: number; at: string };
  title?: string;
  launch?: Launch;
  pages: CanvasPage[];
  boards: Record<string, BoardEntry>;
  /** Board paths, back to front. */
  order: string[];
  notes: Record<string, CanvasNote>;
  designSystems: DesignSystemRecord[];
  [key: string]: unknown;
}

/** An empty index, as the editor creates it. */
export function emptyCanvas(title?: string, now = new Date()): Canvas {
  return {
    v: CANVAS_VERSION,
    createdOnFiles: { v: 1, at: now.toISOString().replace(/\.\d{3}Z$/, 'Z') },
    ...(title ? { title } : {}),
    launch: { view: 'canvas' },
    pages: [],
    boards: {},
    order: [],
    notes: {},
    designSystems: [],
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clampSize = (value: unknown, fallback: number): number =>
  Math.min(MAX_BOARD_SIZE, Math.max(MIN_BOARD_SIZE, Math.round(finite(value, fallback))));

/**
 * Normalizes parsed JSON into a {@link Canvas}: fills missing collections,
 * clamps sizes, drops entries that cannot be drawn, and puts every board in
 * `order` exactly once. Unknown keys survive.
 */
export function normalizeCanvas(input: unknown): Canvas {
  const raw = isRecord(input) ? input : {};
  const boards: Record<string, BoardEntry> = {};
  if (isRecord(raw.boards)) {
    for (const [path, entry] of Object.entries(raw.boards)) {
      if (!isRecord(entry)) continue;
      boards[path] = {
        ...entry,
        x: finite(entry.x, 0),
        y: finite(entry.y, 0),
        w: clampSize(entry.w, 880),
        h: clampSize(entry.h, 560),
      } as BoardEntry;
      if (Array.isArray(entry.guides)) boards[path]!.guides = (entry.guides as BoardGuide[]).slice(0, MAX_GUIDES);
    }
  }
  const seen = new Set<string>();
  const order: string[] = [];
  for (const path of Array.isArray(raw.order) ? raw.order : []) {
    if (typeof path === 'string' && boards[path] && !seen.has(path)) {
      seen.add(path);
      order.push(path);
    }
  }
  for (const path of Object.keys(boards)) if (!seen.has(path)) order.push(path);

  const pages = (Array.isArray(raw.pages) ? raw.pages : [])
    .filter((page): page is CanvasPage => isRecord(page) && typeof page.id === 'string' && ID_PATTERN.test(page.id))
    .map((page) => ({ ...page, name: typeof page.name === 'string' ? page.name : page.id }))
    .slice(0, MAX_PAGES);

  const notes: Record<string, CanvasNote> = {};
  if (isRecord(raw.notes)) {
    for (const [id, note] of Object.entries(raw.notes)) {
      if (!isRecord(note) || Object.keys(notes).length >= MAX_NOTES) continue;
      const { groups: rawGroups, ...rest } = note;
      const groups = normalizeNoteGroups(rawGroups);
      notes[id] = { ...rest, x: finite(note.x, 0), y: finite(note.y, 0), text: typeof note.text === 'string' ? note.text : '', ...(groups ? { groups } : {}) } as CanvasNote;
    }
  }

  let launch: Launch | undefined;
  if (isRecord(raw.launch)) {
    if (raw.launch.view === 'focused' && typeof raw.launch.file === 'string') launch = { view: 'focused', file: raw.launch.file };
    else launch = typeof raw.launch.page === 'string' ? { view: 'canvas', page: raw.launch.page } : { view: 'canvas' };
  }

  return {
    ...raw,
    v: finite(raw.v, CANVAS_VERSION),
    ...(launch ? { launch } : {}),
    pages,
    boards,
    order,
    notes,
    designSystems: Array.isArray(raw.designSystems) ? (raw.designSystems as DesignSystemRecord[]).filter(isRecord) : [],
  };
}

/** The cleaned `groups` of a stored note: unique valid ids, at most `MAX_NOTE_GROUPS`. */
export function normalizeNoteGroups(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = [...new Set(value.filter((group): group is string => typeof group === 'string' && ID_PATTERN.test(group)))].slice(0, MAX_NOTE_GROUPS);
  return out.length ? out : undefined;
}

/** Parses canvas.json text; invalid JSON yields an empty canvas and the error. */
export function parseCanvas(text: string): { canvas: Canvas; error: string | null } {
  try {
    return { canvas: normalizeCanvas(JSON.parse(text)), error: null };
  } catch (error) {
    return { canvas: normalizeCanvas({}), error: error instanceof Error ? error.message : String(error) };
  }
}

/** Serializes the index the way it is stored: two-space JSON with a trailing newline. */
export function serializeCanvas(canvas: Canvas): string {
  return `${JSON.stringify(canvas, null, 2)}\n`;
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                       */
/* -------------------------------------------------------------------------- */

/** The page id an entry belongs to (`null` on a canvas without pages). */
export function pageOf(canvas: Canvas, item: { page?: string }): string | null {
  if (!canvas.pages.length) return null;
  const first = canvas.pages[0]!.id;
  return item.page && canvas.pages.some((page) => page.id === item.page) ? item.page : first;
}

/** Board paths on a page, back to front. `null` = all (canvas without pages). */
export function boardsOnPage(canvas: Canvas, page: string | null): string[] {
  return canvas.order.filter((path) => page === null || pageOf(canvas, canvas.boards[path]!) === page);
}

/** Note ids on a page. */
export function notesOnPage(canvas: Canvas, page: string | null): string[] {
  return Object.keys(canvas.notes).filter((id) => page === null || pageOf(canvas, canvas.notes[id]!) === page);
}

/** A fresh id not used by `taken`. */
export function freshId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; ; i++) {
    const id = `${prefix}${i}`;
    if (!used.has(id)) return id;
  }
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** An axis-aligned rectangle in canvas pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The union of rectangles, or `null` for none. */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** True when two rectangles overlap (touching edges do not). */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Where a new frame of the given size goes: to the right of the last row's
 * rightmost frame (with {@link ROW_GAP}), or at the origin on an empty page.
 */
export function placeNewBoard(canvas: Canvas, page: string | null, size: { w: number; h: number }): { x: number; y: number } {
  const rects = boardsOnPage(canvas, page).map((path) => canvas.boards[path]!);
  if (!rects.length) return { x: 0, y: 0 };
  const lastRowTop = Math.max(...rects.map((r) => r.y));
  const row = rects.filter((r) => r.y === lastRowTop);
  const right = Math.max(...row.map((r) => r.x + r.w));
  let spot = { x: right + ROW_GAP, y: lastRowTop };
  // Never on top of something else.
  while (rects.some((r) => intersects(r, { ...spot, ...size }))) spot = { x: spot.x + ROW_GAP + size.w, y: spot.y };
  return spot;
}

/**
 * Lays frames out in rows (left to right, wrapping at `maxRowWidth`), with
 * the standard gaps. Returns new positions by path; sizes are unchanged.
 */
export function layoutRows(
  canvas: Canvas,
  paths: readonly string[],
  maxRowWidth = 4000,
  origin = { x: 0, y: 0 },
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  let x = origin.x;
  let y = origin.y;
  let rowHeight = 0;
  for (const path of paths) {
    const board = canvas.boards[path];
    if (!board) continue;
    if (x > origin.x && x + board.w - origin.x > maxRowWidth) {
      x = origin.x;
      y += rowHeight + COLUMN_GAP;
      rowHeight = 0;
    }
    out[path] = { x, y };
    x += board.w + ROW_GAP;
    rowHeight = Math.max(rowHeight, board.h);
  }
  return out;
}
