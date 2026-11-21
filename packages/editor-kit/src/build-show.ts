/**
 * The build show: watching the agent's work go together.
 *
 * An agent writes a file whole (an artboard, a slide), so the page gets all of
 * it at once. While the agent works, an editor replays how that content goes
 * together instead of showing it in one frame: its blocks appear one after
 * another, outer before inner in document order, each drawn in by the agent's
 * cursor (a box dragged out from its top-left corner, a line of text swept
 * from its start). Every block is a real element of what was written; the show
 * only spreads its arrival over a few seconds.
 *
 * Nothing is written. The elements are hidden and revealed with Web
 * Animations, which leave their attributes and styles alone, and are dropped
 * when the show ends; `finish()` shows everything at once.
 *
 * Planning (`blockKind`, `planBuild`, `cursorAt`, `outlinesAt`) is pure, so it
 * runs under node's test runner; `collectBlocks` and `playBuild` work on a DOM.
 */

export interface BuildPoint {
  x: number;
  y: number;
}

export interface BuildRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BuildSize {
  w: number;
  h: number;
}

/**
 * How a block appears: `frame` (a background that fills the frame) fades in;
 * `box` and `media` are dragged out from their top-left corner; `text` and
 * `line` are swept along.
 */
export type BuildKind = 'frame' | 'box' | 'media' | 'text' | 'line';

/** A block as planning sees it. */
export interface BuildBlockInfo {
  /** In frame units (artboard or slide pixels). */
  rect: BuildRect;
  kind: BuildKind;
  /** Index of the nearest block that contains it, or -1. */
  parent: number;
}

/** A block of a DOM. */
export interface BuildBlock extends BuildBlockInfo {
  el: Element;
}

/** One step of the show: one block drawn in by the cursor. */
export interface BuildStep {
  /** The block the cursor draws. */
  block: number;
  /** Blocks left out of the show that appear with it (none of their ancestors is in the show). */
  with: number[];
  kind: BuildKind;
  rect: BuildRect;
  /** When the cursor leaves for this block, ms from the start. */
  leave: number;
  /** When the block starts to appear (the cursor presses). */
  at: number;
  /** How long it takes to appear, ms. */
  dur: number;
  /** Where the cursor presses, and where it lets go. */
  from: BuildPoint;
  to: BuildPoint;
}

export interface BuildPlan {
  steps: BuildStep[];
  /** Where the cursor starts. */
  start: BuildPoint;
  /** When the last block has appeared, ms from the start. */
  end: number;
}

/** A show to draw: its plan in a layer's units and when it started (`performance.now()`). */
export interface BuildShowView {
  plan: BuildPlan;
  startedAt: number;
}

/** Where the cursor waits between shows: a point, and the box being prepared there. */
export interface BuildIdle {
  at: BuildPoint;
  rect?: BuildRect;
}

export interface PlanOptions {
  /** Where the cursor comes from (frame units). Default: just above the frame's top-left corner. */
  start?: BuildPoint;
  /** The longest the show may take, ms. */
  budget?: number;
  /** The most blocks the cursor draws; smaller ones appear with them. */
  max?: number;
}

/** Defaults: about five seconds, thirty blocks. */
export const BUILD_BUDGET_MS = 5200;
export const BUILD_MAX_STEPS = 30;
/** How long an outline stays after its block appeared, ms. */
export const OUTLINE_FADE_MS = 520;

/** What a block's computed style says, for {@link blockKind}. */
export interface BlockLook {
  tag: string;
  /** A background colour or image is painted. */
  fill: boolean;
  /** A border is painted. */
  border: boolean;
  /** A box shadow is painted. */
  shadow: boolean;
  /** It holds text of its own (a text node child). */
  text: boolean;
}

const MEDIA = new Set(['IMG', 'SVG', 'VIDEO', 'CANVAS', 'IFRAME', 'PICTURE', 'OBJECT', 'EMBED', 'X-EMBED']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'TITLE', 'TEMPLATE', 'NOSCRIPT', 'BR', 'WBR', 'HELMET', 'SOURCE', 'TRACK']);

/** Whether an element is a block of the show, and how it appears; null: a plain wrapper, not shown on its own. */
export function blockKind(look: BlockLook, rect: BuildRect, frame: BuildSize): BuildKind | null {
  const tag = look.tag.toUpperCase();
  if (MEDIA.has(tag)) return 'media';
  const painted = look.fill || look.border || look.shadow;
  if (painted) {
    if (rect.w * rect.h >= 0.85 * frame.w * frame.h) return 'frame';
    if (Math.min(rect.w, rect.h) <= 4 && Math.max(rect.w, rect.h) >= 12) return 'line';
    return 'box';
  }
  return look.text ? 'text' : null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Where the cursor presses and lets go to draw a block. */
function strokeOf(kind: BuildKind, r: BuildRect, frame: BuildSize): { from: BuildPoint; to: BuildPoint } {
  const pin = (p: BuildPoint): BuildPoint => ({ x: clamp(p.x, 0, frame.w), y: clamp(p.y, 0, frame.h) });
  if (kind === 'text') {
    const half = Math.min(r.h / 2, 18);
    return { from: pin({ x: r.x, y: r.y + half }), to: pin({ x: r.x + r.w, y: r.y + r.h - half }) };
  }
  if (kind === 'line') {
    return r.w >= r.h
      ? { from: pin({ x: r.x, y: r.y + r.h / 2 }), to: pin({ x: r.x + r.w, y: r.y + r.h / 2 }) }
      : { from: pin({ x: r.x + r.w / 2, y: r.y }), to: pin({ x: r.x + r.w / 2, y: r.y + r.h }) };
  }
  return { from: pin({ x: r.x, y: r.y }), to: pin({ x: r.x + r.w, y: r.y + r.h }) };
}

/** How long a block takes to appear before the budget is applied, ms. */
function revealMs(kind: BuildKind, r: BuildRect, frame: BuildSize): number {
  const share = Math.sqrt(Math.max(0, r.w * r.h) / Math.max(1, frame.w * frame.h));
  switch (kind) {
    case 'frame':
      return 420;
    case 'text':
      return 200 + Math.min(280, (r.w / Math.max(1, frame.w)) * 420);
    case 'line':
      return 220;
    case 'media':
      return 300 + 200 * share;
    default:
      return 240 + 300 * share;
  }
}

/**
 * Which blocks the cursor draws: frames always, then the largest, at most
 * `max`. The rest appear with the nearest drawn block that contains them, or,
 * when none does, with the drawn block before them.
 */
export function pickSteps(blocks: readonly BuildBlockInfo[], max: number): { kept: number[]; with: Map<number, number[]> } {
  const order = blocks.map((b, i) => ({ i, score: b.kind === 'frame' ? Infinity : b.rect.w * b.rect.h * (b.kind === 'text' ? 1.5 : 1) }));
  order.sort((a, b) => b.score - a.score || a.i - b.i);
  const keep = new Set(order.slice(0, Math.max(1, max)).map((o) => o.i));
  const kept = blocks.map((_, i) => i).filter((i) => keep.has(i));
  const attached = new Map<number, number[]>();
  for (let i = 0; i < blocks.length; i++) {
    if (keep.has(i)) continue;
    let p = blocks[i]!.parent;
    while (p >= 0 && !keep.has(p)) p = blocks[p]!.parent;
    if (p >= 0) continue; // hidden with its drawn ancestor
    const before = kept.filter((k) => k < i);
    const host = before.length ? before[before.length - 1]! : kept[0];
    if (host === undefined) continue;
    attached.set(host, [...(attached.get(host) ?? []), i]);
  }
  return { kept, with: attached };
}

/** The show for a frame's blocks (in document order). */
export function planBuild(blocks: readonly BuildBlockInfo[], frame: BuildSize, options: PlanOptions = {}): BuildPlan {
  const start = options.start ?? { x: frame.w * 0.04, y: -frame.h * 0.04 };
  const { kept, with: attached } = pickSteps(blocks, options.max ?? BUILD_MAX_STEPS);
  const diagonal = Math.hypot(frame.w, frame.h) || 1;
  const raw: { block: number; travel: number; dur: number; from: BuildPoint; to: BuildPoint }[] = [];
  let at = start;
  for (const block of kept) {
    const info = blocks[block]!;
    const { from, to } = strokeOf(info.kind, info.rect, frame);
    const travel = clamp(140 + (360 * Math.hypot(from.x - at.x, from.y - at.y)) / diagonal, 140, 480);
    raw.push({ block, travel, dur: revealMs(info.kind, info.rect, frame), from, to });
    at = to;
  }
  const total = raw.reduce((sum, s) => sum + s.travel + s.dur, 0);
  const k = total > 0 ? Math.min(1, (options.budget ?? BUILD_BUDGET_MS) / total) : 1;
  const steps: BuildStep[] = [];
  let t = 0;
  for (const s of raw) {
    const leave = t;
    const pressAt = leave + s.travel * k;
    const dur = s.dur * k;
    const info = blocks[s.block]!;
    steps.push({ block: s.block, with: attached.get(s.block) ?? [], kind: info.kind, rect: info.rect, leave, at: pressAt, dur, from: s.from, to: s.to });
    t = pressAt + dur;
  }
  return { steps, start, end: t };
}

const easeInOut = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOut = (u: number): number => 1 - Math.pow(1 - u, 3);
const lerp = (a: BuildPoint, b: BuildPoint, u: number): BuildPoint => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

/** The cursor at time `t` (ms from the start): where it is, whether it presses, and the step it works on (-1: none). */
export function cursorAt(plan: BuildPlan, t: number): { x: number; y: number; pressed: boolean; step: number } {
  let previous = plan.start;
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i]!;
    if (t < s.leave) return { ...previous, pressed: false, step: i - 1 };
    if (t < s.at) {
      const u = s.at > s.leave ? (t - s.leave) / (s.at - s.leave) : 1;
      return { ...lerp(previous, s.from, easeInOut(u)), pressed: false, step: i };
    }
    if (t < s.at + s.dur) return { ...lerp(s.from, s.to, easeOut((t - s.at) / s.dur)), pressed: true, step: i };
    previous = s.to;
  }
  return { ...previous, pressed: false, step: plan.steps.length - 1 };
}

/** One outline drawn around a block as it appears, `alpha` from 1 to 0 as it fades. `grow` is how far it is dragged out. */
export interface BuildOutline {
  step: number;
  rect: BuildRect;
  kind: BuildKind;
  alpha: number;
  grow: number;
}

/** The outlines showing at time `t`: the block appearing, and the last ones fading. */
export function outlinesAt(plan: BuildPlan, t: number): BuildOutline[] {
  const out: BuildOutline[] = [];
  plan.steps.forEach((s, i) => {
    if (t < s.at || t >= s.at + s.dur + OUTLINE_FADE_MS) return;
    const into = t - s.at;
    const grow = into >= s.dur ? 1 : easeOut(into / s.dur);
    const alpha = into <= s.dur ? 1 : 1 - (into - s.dur) / OUTLINE_FADE_MS;
    out.push({ step: i, rect: s.rect, kind: s.kind, alpha, grow });
  });
  return out;
}

/** A plan moved by (dx, dy): from a frame's units to the units of the layer around it. */
export function shiftPlan(plan: BuildPlan, dx: number, dy: number): BuildPlan {
  const p = (q: BuildPoint): BuildPoint => ({ x: q.x + dx, y: q.y + dy });
  return {
    ...plan,
    start: p(plan.start),
    steps: plan.steps.map((s) => ({ ...s, rect: { ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy }, from: p(s.from), to: p(s.to) })),
  };
}

/** The keyframes a block appears with. `opacity` is its own; `clip` false when it has a clip-path of its own. */
export function revealKeyframes(kind: BuildKind, rect: BuildRect, opacity: number, clip: boolean): Keyframe[] {
  const fade = (from: number): Keyframe[] => [{ opacity: from * opacity }, { opacity }];
  if (!clip || kind === 'frame') return fade(0);
  switch (kind) {
    case 'text':
      return [
        { opacity: 0.25 * opacity, clipPath: 'inset(0 100% 0 0)' },
        { opacity, clipPath: 'inset(-8px -8px -8px -8px)' },
      ];
    case 'line':
      return rect.w >= rect.h
        ? [{ opacity, clipPath: 'inset(0 100% 0 0)' }, { opacity, clipPath: 'inset(-4px -4px -4px -4px)' }]
        : [{ opacity, clipPath: 'inset(0 0 100% 0)' }, { opacity, clipPath: 'inset(-4px -4px -4px -4px)' }];
    default:
      return [
        { opacity: 0.5 * opacity, clipPath: 'inset(0 100% 100% 0)' },
        { opacity, clipPath: 'inset(-24px -24px -24px -24px)' },
      ];
  }
}

/* -------------------------------------------------------------------------- */
/* DOM                                                                         */
/* -------------------------------------------------------------------------- */

/** True when a computed colour paints something. */
function paints(color: string): boolean {
  if (!color || color === 'transparent') return false;
  const rgba = /rgba?\(([^)]+)\)/.exec(color);
  if (!rgba) return true;
  const parts = rgba[1]!.split(/[\s,/]+/).filter(Boolean);
  return parts.length < 4 || parseFloat(parts[3]!) > 0;
}

function lookOf(el: Element, cs: CSSStyleDeclaration): BlockLook {
  const side = (s: 'Top' | 'Right' | 'Bottom' | 'Left'): boolean =>
    parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 && cs.getPropertyValue(`border-${s.toLowerCase()}-style`) !== 'none' && paints(cs.getPropertyValue(`border-${s.toLowerCase()}-color`));
  let text = false;
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && node.textContent && node.textContent.trim()) {
      text = true;
      break;
    }
  }
  return {
    tag: el.tagName,
    fill: paints(cs.backgroundColor) || (cs.backgroundImage !== '' && cs.backgroundImage !== 'none'),
    border: side('Top') || side('Right') || side('Bottom') || side('Left'),
    shadow: cs.boxShadow !== '' && cs.boxShadow !== 'none',
    text,
  };
}

export interface CollectOptions {
  /** Where the frame's top-left corner is, in the coordinates of `getBoundingClientRect` (default 0, 0). */
  origin?: BuildPoint;
  /** Screen pixels per frame unit (default 1). */
  scale?: number;
  /** Blocks beyond this many are not looked at (very large pages). */
  limit?: number;
}

/** The blocks under `root` (not `root` itself), in document order, in frame units. */
export function collectBlocks(root: Element, frame: BuildSize, options: CollectOptions = {}): BuildBlock[] {
  return collectElements(root.children, frame, options);
}

/** The blocks of `elements` and what is in them, in the order given, in frame units. */
export function collectElements(elements: Iterable<Element>, frame: BuildSize, options: CollectOptions = {}): BuildBlock[] {
  const list = [...elements];
  const win = list[0]?.ownerDocument.defaultView;
  if (!win) return [];
  const origin = options.origin ?? { x: 0, y: 0 };
  const scale = options.scale || 1;
  const limit = options.limit ?? 600;
  const blocks: BuildBlock[] = [];
  const visit = (el: Element, parent: number): void => {
    if (blocks.length >= limit) return;
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag)) return;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none') return;
    let here = parent;
    if (cs.display !== 'contents' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0) {
      const box = el.getBoundingClientRect();
      const rect = { x: (box.left - origin.x) / scale, y: (box.top - origin.y) / scale, w: box.width / scale, h: box.height / scale };
      const onFrame = rect.x < frame.w && rect.y < frame.h && rect.x + rect.w > 0 && rect.y + rect.h > 0;
      const kind = onFrame && rect.w > 0.5 && rect.h > 0.5 ? blockKind(lookOf(el, cs), rect, frame) : null;
      if (kind) {
        here = blocks.length;
        blocks.push({ el, rect, kind, parent });
      }
    }
    if (MEDIA.has(tag)) return;
    for (const child of el.children) visit(child, here);
  };
  for (const el of list) visit(el, -1);
  return blocks;
}

/**
 * Keeps the blocks `keep` accepts (a show of part of a frame, such as what a
 * change added), each under its nearest kept ancestor.
 */
export function keepBlocks<T extends BuildBlockInfo>(blocks: readonly T[], keep: (block: T, index: number) => boolean): T[] {
  const placed = new Map<number, number>();
  const kept: T[] = [];
  blocks.forEach((block, i) => {
    if (!keep(block, i)) return;
    let p = block.parent;
    while (p >= 0 && !placed.has(p)) p = blocks[p]!.parent;
    placed.set(i, kept.length);
    kept.push({ ...block, parent: p >= 0 ? placed.get(p)! : -1 });
  });
  return kept;
}

/** A show running on a DOM. */
export interface BuildRun {
  readonly plan: BuildPlan;
  /** `performance.now()` of the page that started it, when it started. */
  readonly startedAt: number;
  /** Shows everything now and ends the show. */
  finish(): void;
  /** Resolves when the show ends, by itself or by `finish()`. */
  readonly done: Promise<void>;
}

/** True when the reader asked for less motion. */
export function prefersReducedMotion(win: Window | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  try {
    return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/**
 * Plays a plan on its blocks: each is hidden at once and appears at its step.
 * Run it in the same task that first shows the content, so nothing flashes.
 */
export function playBuild(blocks: readonly BuildBlock[], plan: BuildPlan): BuildRun {
  const animations: Animation[] = [];
  const animate = (index: number, kind: BuildKind, at: number, dur: number): void => {
    const block = blocks[index];
    const el = block?.el as (Element & { animate?: Element['animate'] }) | undefined;
    if (!block || !el?.animate) return;
    try {
      const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
      const opacity = cs ? parseFloat(cs.opacity) || 1 : 1;
      const clip = !cs || cs.clipPath === '' || cs.clipPath === 'none';
      animations.push(el.animate(revealKeyframes(kind, block.rect, opacity, clip), { delay: at, duration: Math.max(1, dur), fill: 'both', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }));
    } catch {
      /* an element that left the document */
    }
  };
  for (const step of plan.steps) {
    animate(step.block, step.kind, step.at, step.dur);
    for (const other of step.with) animate(other, 'frame', step.at, step.dur);
  }
  const startedAt = performance.now();
  let end!: () => void;
  const done = new Promise<void>((resolve) => (end = resolve));
  let over = false;
  const stop = (): void => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    for (const animation of animations) {
      try {
        animation.cancel();
      } catch {
        /* gone */
      }
    }
    end();
  };
  const timer = setTimeout(stop, plan.end + 80);
  return { plan, startedAt, finish: stop, done };
}
