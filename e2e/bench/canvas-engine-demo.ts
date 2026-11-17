// Standalone demo of @open-artifact/canvas-engine, bundled and served by e2e/bench/canvas-engine.mjs.
//
// The page owns a small document (300 textured "artboards", 1000 notes, 200 paths, plus a test cluster at negative
// x with known colours, a hole and the DOM element it shows) and mirrors it into the engine. Commits are applied to
// the document and patched back, as an editor would. `window.__demo` exposes what the benchmark drives and reads.
import { CanvasEngine, type CanvasItem, type CommitIntent, type HoleRect } from '@open-artifact/canvas-engine';

const params = new URLSearchParams(location.search);
const BOARDS = Number(params.get('boards') ?? 300);
const NOTES = Number(params.get('notes') ?? 1000);
const PATHS = Number(params.get('paths') ?? 200);
const COLUMNS = 20;

/** Deterministic pseudo-random numbers. */
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const doc = new Map<string, CanvasItem>();
const add = (item: CanvasItem) => doc.set(item.id, item);

const hsl = (h: number, s: number, l: number) => {
  // HSL → #rrggbb (the engine takes hex and rgb()).
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
};

for (let i = 0; i < BOARDS; i++) {
  add({
    id: `board-${i}`,
    kind: 'image',
    x: (i % COLUMNS) * 360,
    y: Math.floor(i / COLUMNS) * 300,
    w: 320,
    h: 240,
    fill: '#e7e5e4',
    radius: 4,
    shadow: { color: 'rgba(0,0,0,0.12)', blur: 12, dy: 4 },
    texture: `board-${i}`,
    layer: 0,
  });
}
const width = COLUMNS * 360;
const height = Math.ceil(BOARDS / COLUMNS) * 300;
for (let i = 0; i < NOTES; i++) {
  add({
    id: `note-${i}`,
    kind: 'rect',
    x: rnd() * (width - 120),
    y: rnd() * (height - 80),
    w: 120,
    h: 80,
    fill: hsl((i * 47) % 360, 90, 82),
    stroke: 'rgba(0,0,0,0.15)',
    strokeWidth: 1,
    radius: 6,
    shadow: { color: 'rgba(0,0,0,0.15)', blur: 6, dy: 2 },
    layer: 1,
  });
}
for (let i = 0; i < PATHS; i++) {
  const pts: number[] = [];
  const n = 60;
  let y = 75;
  for (let k = 0; k < n; k++) {
    y = Math.max(5, Math.min(145, y + (rnd() - 0.5) * 30));
    pts.push((k / (n - 1)) * 290 + 5, y);
  }
  const closed = i % 5 === 0;
  add({
    id: `path-${i}`,
    kind: 'path',
    x: rnd() * (width - 300),
    y: rnd() * (height - 150),
    w: 300,
    h: 150,
    points: pts,
    closed,
    fill: closed ? hsl((i * 71) % 360, 70, 70) + '80' : undefined,
    stroke: hsl((i * 71) % 360, 70, 40),
    strokeWidth: 3,
    cap: 'round',
    join: 'round',
    layer: 2,
  });
}

// Test cluster with known colours (see e2e/bench/canvas-engine.mjs for the screen positions it checks).
export const TEST = {
  notes: ['#fde68a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa'],
  line: '#2563eb',
  board: '#0ea5e9',
  under: '#ef4444',
  over: '#111827',
};
for (let i = 0; i < 6; i++) {
  add({ id: `t${i}`, kind: 'rect', x: -3000 + (i % 3) * 200, y: i < 3 ? 0 : -300, w: 120, h: 80, fill: TEST.notes[i]!, radius: 8, layer: 1 });
}
add({ id: 'line', kind: 'path', x: -3000, y: 295, w: 600, h: 10, points: [0, 5, 600, 5], stroke: TEST.line, strokeWidth: 10, layer: 2 });
add({ id: 'tb', kind: 'image', x: -2300, y: -300, w: 320, h: 240, fill: '#d6d3d1', texture: 'tb', layer: 0 });
add({ id: 'under', kind: 'rect', x: -1950, y: 50, w: 500, h: 350, fill: TEST.under, layer: 0, z: -1 });
add({ id: 'hole', kind: 'hole', x: -1900, y: 100, w: 300, h: 200, radius: 12, layer: 0, movable: false });
add({ id: 'over', kind: 'rect', x: -1880, y: 120, w: 80, h: 50, fill: TEST.over, radius: 4, layer: 1 });

/** Draws a texture for `key` at width w (the artboard's "render"). */
function paint(key: string, w: number): HTMLCanvasElement {
  const h = Math.round((w * 3) / 4);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (key === 'tb') {
    g.fillStyle = TEST.board;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.font = `${Math.round(w / 10)}px sans-serif`;
    g.fillText('Test board', w * 0.05, h * 0.2);
    return c;
  }
  const i = Number(key.split('-')[1]);
  const hue = (i * 37) % 360;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = hsl(hue, 70, 55);
  g.fillRect(0, 0, w, h * 0.3);
  g.fillStyle = '#111';
  g.font = `bold ${Math.round(w / 14)}px sans-serif`;
  g.fillText(`Screen ${i + 1}`, w * 0.06, h * 0.45);
  for (let k = 0; k < 6; k++) {
    g.fillStyle = hsl((hue + k * 20) % 360, 60, 85);
    g.fillRect(w * 0.06 + (k % 3) * w * 0.31, h * 0.55 + Math.floor(k / 3) * h * 0.22, w * 0.27, h * 0.18);
  }
  return c;
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
const live = document.getElementById('live') as HTMLDivElement;
const engine = await CanvasEngine.create(canvas, { grid: 'dots', snap: true });

const demo = {
  engine,
  doc,
  TEST,
  commits: [] as CommitIntent[],
  selections: [] as string[][],
  engineMs: [] as number[],
  frames: 0,
  holes: [] as HoleRect[],
  texturesPending: 0,
  texturesSet: 0,
  /** Forces a frame and reads canvas pixels (CSS px points) in the same task. */
  readback(points: [number, number][]): number[][] {
    engine.setCamera(engine.camera);
    engine.tick(performance.now());
    const c2 = document.createElement('canvas');
    c2.width = canvas.width;
    c2.height = canvas.height;
    const g = c2.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(canvas, 0, 0);
    const dpr = canvas.width / canvas.clientWidth;
    return points.map(([x, y]) => Array.from(g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data));
  },
  gl(): string {
    const gl = (document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null)!;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  },
};
(window as unknown as { __demo: typeof demo }).__demo = demo;

engine.on('frame', e => {
  demo.frames++;
  demo.engineMs.push(e.engineMs);
});
engine.on('selection', e => demo.selections.push(e.ids));
engine.on('holes', e => {
  demo.holes = e.holes;
  const h = e.holes.find(x => x.id === 'hole');
  live.style.display = h ? 'block' : 'none';
  if (h) live.style.transform = h.transform;
});
// Textures arrive asynchronously, a batch per frame, as renders would.
const queue: string[] = [];
engine.on('textureNeeded', e => {
  queue.push(...e.keys);
  demo.texturesPending = queue.length;
  pump();
});
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  requestAnimationFrame(function step() {
    for (const key of queue.splice(0, 24)) {
      engine.setTexture(key, [paint(key, 64), paint(key, 256)]);
      demo.texturesSet++;
    }
    demo.texturesPending = queue.length;
    if (queue.length) requestAnimationFrame(step);
    else pumping = false;
  });
}
// The document applies commits and patches the mirror back.
engine.on('commit', c => {
  demo.commits.push(c);
  if (c.op === 'move') {
    const items = c.ids.map(id => ({ ...doc.get(id)!, x: doc.get(id)!.x + c.dx, y: doc.get(id)!.y + c.dy }) as CanvasItem);
    items.forEach(add);
    engine.applyPatch(items);
  } else if (c.op === 'resize') {
    const item = { ...doc.get(c.id)!, ...c.rect } as CanvasItem;
    add(item);
    engine.applyPatch([item]);
  }
});

const t0 = performance.now();
engine.applyPatch([...doc.values()]);
(demo as Record<string, unknown>).patchMs = performance.now() - t0;
engine.fit({ x: 0, y: 0, w: width, h: height }, { padding: 20 });
(window as unknown as { __ready: boolean }).__ready = true;
