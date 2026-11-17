/**
 * Vector paths on the canvas: the Pen tool's bezier nodes and node editing
 * of lines, arrows and paths.
 *
 * A path note is a `pen` note that also keeps its `nodes` (anchor points with
 * optional in/out control handles) and whether it is `closed`. Its `points`
 * are the curve sampled into a polyline, so every renderer (engine, DOM,
 * export) draws it unchanged. Lines and arrows have no `nodes`: their
 * `points` are the nodes. Freehand (Pencil) strokes are not node-edited.
 *
 * All coordinates are relative to the note's `x`,`y`.
 */

import type { CanvasNote } from '@open-artifact/design-core';

/** An anchor and its control handles (offsets from the anchor). */
export interface BezierNode {
  x: number;
  y: number;
  /** Incoming handle, relative to the anchor. */
  in?: [number, number];
  /** Outgoing handle, relative to the anchor. */
  out?: [number, number];
}

/** What can be dragged when editing a path: an anchor, or one of its handles. */
export type NodePart = 'anchor' | 'in' | 'out';

/** Screen-independent sampling: segments are cut into this many world px at most. */
const SAMPLE_STEP = 6;
const MAX_SEGMENT_SAMPLES = 48;

const round = (n: number): number => Math.round(n * 10) / 10;

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** The curve through `nodes` as a polyline (closing back to the first node when `closed`). */
export function sampleBezier(nodes: readonly BezierNode[], closed = false): [number, number][] {
  if (!nodes.length) return [];
  const out: [number, number][] = [[round(nodes[0]!.x), round(nodes[0]!.y)]];
  const count = closed && nodes.length > 2 ? nodes.length : nodes.length - 1;
  for (let i = 0; i < count; i++) {
    const a = nodes[i]!;
    const b = nodes[(i + 1) % nodes.length]!;
    const c1 = { x: a.x + (a.out?.[0] ?? 0), y: a.y + (a.out?.[1] ?? 0) };
    const c2 = { x: b.x + (b.in?.[0] ?? 0), y: b.y + (b.in?.[1] ?? 0) };
    const straight = !a.out && !b.in;
    if (straight) {
      out.push([round(b.x), round(b.y)]);
      continue;
    }
    const length = Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(b.x - c2.x, b.y - c2.y);
    const steps = Math.max(2, Math.min(MAX_SEGMENT_SAMPLES, Math.ceil(length / SAMPLE_STEP)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([round(cubic(a.x, c1.x, c2.x, b.x, t)), round(cubic(a.y, c1.y, c2.y, b.y, t))]);
    }
  }
  return out;
}

/** The SVG path data of `nodes` (for drafts and node overlays), mapped through `at`. */
export function bezierPathData(nodes: readonly BezierNode[], closed: boolean, at: (x: number, y: number) => { x: number; y: number } = (x, y) => ({ x, y })): string {
  if (!nodes.length) return '';
  const first = at(nodes[0]!.x, nodes[0]!.y);
  let d = `M${first.x} ${first.y}`;
  const count = closed && nodes.length > 2 ? nodes.length : nodes.length - 1;
  for (let i = 0; i < count; i++) {
    const a = nodes[i]!;
    const b = nodes[(i + 1) % nodes.length]!;
    const end = at(b.x, b.y);
    if (!a.out && !b.in) {
      d += `L${end.x} ${end.y}`;
      continue;
    }
    const c1 = at(a.x + (a.out?.[0] ?? 0), a.y + (a.out?.[1] ?? 0));
    const c2 = at(b.x + (b.in?.[0] ?? 0), b.y + (b.in?.[1] ?? 0));
    d += `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
  }
  return closed && nodes.length > 2 ? `${d}Z` : d;
}

/** The editable nodes of a note: its bezier `nodes`, or a line's / arrow's points. `null`: not node-editable. */
export function editableNodes(note: CanvasNote): BezierNode[] | null {
  if (note.kind === 'pen') {
    const nodes = readNodes(note.nodes);
    return nodes && nodes.length >= 2 ? nodes : null;
  }
  if (note.kind === 'line' || note.kind === 'arrow') {
    const points = note.points ?? [];
    return points.length >= 2 ? points.map(([x, y]) => ({ x, y })) : null;
  }
  return null;
}

/** Valid nodes from stored JSON, or `null`. */
export function readNodes(value: unknown): BezierNode[] | null {
  if (!Array.isArray(value)) return null;
  const pair = (v: unknown): [number, number] | undefined =>
    Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? [Number(v[0]), Number(v[1])] : undefined;
  const nodes: BezierNode[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const { x, y } = entry as { x?: unknown; y?: unknown };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const node: BezierNode = { x: Number(x), y: Number(y) };
    const handleIn = pair((entry as { in?: unknown }).in);
    const handleOut = pair((entry as { out?: unknown }).out);
    if (handleIn) node.in = handleIn;
    if (handleOut) node.out = handleOut;
    nodes.push(node);
  }
  return nodes;
}

/**
 * The note patch for edited nodes: a path note keeps `nodes` and re-samples
 * `points`; a line or arrow writes its points. Coordinates stay relative to
 * the note's `x`,`y` (they may go negative).
 */
export function notePatchForNodes(note: CanvasNote, nodes: readonly BezierNode[]): Partial<CanvasNote> {
  const clean = nodes.map((n) => ({ x: round(n.x), y: round(n.y), ...(n.in ? { in: [round(n.in[0]), round(n.in[1])] as [number, number] } : {}), ...(n.out ? { out: [round(n.out[0]), round(n.out[1])] as [number, number] } : {}) }));
  if (note.kind === 'pen') return { nodes: clean, points: sampleBezier(clean, note.closed === true) };
  return { points: clean.map((n) => [Math.round(n.x), Math.round(n.y)] as [number, number]) };
}

/**
 * Drags one part of node `index` by `dx`,`dy`. An anchor carries its
 * handles. A handle mirrors its opposite handle (keeping that one's length)
 * unless `independent` (Alt held).
 */
export function dragNode(nodes: readonly BezierNode[], index: number, part: NodePart, dx: number, dy: number, independent = false): BezierNode[] {
  return nodes.map((node, i) => {
    if (i !== index) return node;
    if (part === 'anchor') return { ...node, x: node.x + dx, y: node.y + dy };
    const own = node[part] ?? [0, 0];
    const moved: [number, number] = [own[0] + dx, own[1] + dy];
    const other = part === 'in' ? 'out' : 'in';
    const next: BezierNode = { ...node, [part]: moved };
    if (!independent && node[other]) {
      const length = Math.hypot(node[other]![0], node[other]![1]);
      const angle = Math.atan2(moved[1], moved[0]) + Math.PI;
      next[other] = [Math.cos(angle) * length, Math.sin(angle) * length];
    }
    return next;
  });
}

/** Removes node `index` (paths keep at least two nodes). */
export function removeNode(nodes: readonly BezierNode[], index: number): BezierNode[] {
  if (nodes.length <= 2) return [...nodes];
  return nodes.filter((_, i) => i !== index);
}

/** Inserts a straight node halfway along the segment after node `index`. */
export function splitSegment(nodes: readonly BezierNode[], index: number, closed = false): BezierNode[] {
  const a = nodes[index];
  const b = nodes[(index + 1) % nodes.length];
  if (!a || !b || (index === nodes.length - 1 && !closed)) return [...nodes];
  return [...nodes.slice(0, index + 1), midpoint(a, b), ...nodes.slice(index + 1)];
}

function midpoint(a: BezierNode, b: BezierNode): BezierNode {
  const c1 = { x: a.x + (a.out?.[0] ?? 0), y: a.y + (a.out?.[1] ?? 0) };
  const c2 = { x: b.x + (b.in?.[0] ?? 0), y: b.y + (b.in?.[1] ?? 0) };
  return { x: round(cubic(a.x, c1.x, c2.x, b.x, 0.5)), y: round(cubic(a.y, c1.y, c2.y, b.y, 0.5)) };
}

/** Toggles a node between a corner (no handles) and a smooth one (handles along its neighbours). */
export function toggleSmooth(nodes: readonly BezierNode[], index: number, closed = false): BezierNode[] {
  const node = nodes[index];
  if (!node) return [...nodes];
  if (node.in || node.out) return nodes.map((n, i) => (i === index ? { x: n.x, y: n.y } : n));
  const prev = nodes[index - 1] ?? (closed ? nodes[nodes.length - 1] : undefined);
  const next = nodes[index + 1] ?? (closed ? nodes[0] : undefined);
  const from = prev ?? node;
  const to = next ?? node;
  const tx = to.x - from.x;
  const ty = to.y - from.y;
  const length = Math.hypot(tx, ty) || 1;
  const reach = Math.min(Math.hypot(node.x - from.x, node.y - from.y), Math.hypot(to.x - node.x, to.y - node.y)) / 3 || 24;
  const ux = (tx / length) * reach;
  const uy = (ty / length) * reach;
  return nodes.map((n, i) => (i === index ? { x: n.x, y: n.y, in: [-ux, -uy], out: [ux, uy] } : n));
}

/** World nodes from a Pen-tool draft, made relative to the first anchor (the note's origin). */
export function relativeNodes(world: readonly BezierNode[]): { origin: { x: number; y: number }; nodes: BezierNode[] } {
  const origin = { x: Math.round(world[0]?.x ?? 0), y: Math.round(world[0]?.y ?? 0) };
  return { origin, nodes: world.map((n) => ({ ...n, x: n.x - origin.x, y: n.y - origin.y })) };
}
