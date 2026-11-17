#!/usr/bin/env node
// Performance benchmark of the Slides editor's thumbnails: a large generated deck opened in headless Chrome.
//
//   node e2e/bench/slides.mjs                         500 slides, artifact-types/ (build first)
//   node e2e/bench/slides.mjs --slides 200
//   node e2e/bench/slides.mjs --params open_artifact_live=all    extra query parameters for the editor page (the baseline)
//   node e2e/bench/slides.mjs --params open_artifact_engine=off  the Canvas view drawn with the DOM rather than the canvas engine (S1)
//   node e2e/bench/slides.mjs --shots shots/          screenshots of each view
//   node e2e/bench/slides.mjs --label baseline --out results.json
//
// What it measures (see docs/zh-CN/rust-wasm-core.md §11, S0):
//   load      time from navigation until the rail's thumbnails on screen and the stage show their slides
//             (performance.now() in the page), then DOM nodes, JS heap (after a GC) and the Chrome process tree's RSS;
//             with virtualization, also the time until every slide has a current snapshot
//   rail      wheel-scrolling the rail from the top to the bottom
//   switch    ArrowDown through 40 slides, one every 100 ms
//   grid      switching to the Grid view (until the tiles on screen show their slides), then scrolling it to the bottom
//   canvas    switching to the Canvas view, then wheel panning and Ctrl+wheel zooming at "fit all slides"
//             (drawn by the canvas engine unless open_artifact_engine=off; "shown" then counts textured tiles and live holes)
//   smoke     on the canvas: click, Shift-click, a background click, a ⌘-drag marquee (engine only), a right-click menu,
//             dragging a slide after the next but one, and a double-click into editing; each check passes or says why not
// Each scroll scenario reports frames per second, the 95th percentile and worst frame interval, frames over 25 ms and
// long tasks (> 50 ms) of the editor page.
//
// E2E_HEADFUL=1 runs Chrome with a window (real GPU compositing; headless numbers are for comparing runs, not absolute).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { launch } from '../lib/browser.mjs';
import { cli } from '../lib/cli.mjs';
import { install, removeTmp, target, tmpDir } from '../lib/target.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const SLIDES = Number(opt('slides', 500));
const PARAMS = opt('params', '');
const LABEL = opt('label', PARAMS || 'default');
const OUT = opt('out', null);
/** A folder to save screenshots in (load, rail bottom, grid, canvas), for checking what the thumbnails show. */
const SHOTS = opt('shots', null);
/** Slides per outline section. */
const PER_SECTION = 20;
const PICTURES = 6;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* -------------------------------- the deck -------------------------------- */

/** A small PNG: a two-color diagonal gradient (no dependencies: zlib + CRC). */
function png(width, height, [r1, g1, b1], [r2, g2, b2]) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const o = row + 1 + x * 3;
      raw[o] = Math.round(r1 + (r2 - r1) * t);
      raw[o + 1] = Math.round(g1 + (g2 - g1) * t);
      raw[o + 2] = Math.round(b1 + (b2 - b1) * t);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const TOPICS = ['Quarterly results', 'Market overview', 'Customer stories', 'Product roadmap', 'Hiring plan', 'Risks and mitigations', 'Pricing', 'Architecture', 'Next steps', 'Competitive landscape'];
const ICONS = ['Chart', 'Users', 'Lightbulb', 'Globe', 'Lock', 'Star', 'Clock', 'Database'];
const SHAPES = ['ellipse', 'rounded', 'diamond', 'rect'];

function slide(i) {
  const id = `s${String(i + 1).padStart(3, '0')}`;
  const hue = (i * 37) % 360;
  const topic = TOPICS[i % TOPICS.length];
  const bullets = Array.from({ length: 4 }, (_, k) => `<li>Point ${k + 1} of slide ${i + 1}: ${topic.toLowerCase()} with enough words to wrap a little</li>`).join('');
  const picture = i % 3 === 0;
  const shape = SHAPES[i % SHAPES.length];
  const side = picture
    ? `<img src="project/ds/bench/assets/pic${(i % PICTURES) + 1}.png" alt="" style="width:640px; height:420px; object-fit:cover; border-radius:24px">`
    : `<div style="width:640px; height:420px; display:flex; flex-direction:column; gap:16px; padding:40px; border-radius:24px; background:hsl(${hue} 60% 92%)"><x-icon name="${ICONS[i % ICONS.length]}" style="color:hsl(${hue} 60% 40%); width:96px; height:96px"></x-icon><p style="font-size:44px; font-weight:600">${(i * 13) % 97}%</p><p style="font-size:28px">Change since last quarter</p></div>`;
  return `<section id="${id}" style="background:hsl(${hue} 30% 98%); font-family:system-ui; color:#1d1d1f; display:flex; flex-direction:column; padding:128px; gap:40px">
<x-shape kind="${shape}" style="position:absolute; left:1640px; top:64px; width:180px; height:180px; background:hsl(${hue} 70% 60%)"></x-shape>
<div style="position:absolute; left:0; top:0; width:24px; height:1080px; background:hsl(${hue} 70% 45%)"></div>
<h1 style="font-size:88px">${i + 1}. ${topic}</h1>
<p style="font-size:36px; color:#555">Slide ${i + 1} of the benchmark deck, section ${Math.floor(i / PER_SECTION) + 1}.</p>
<div style="display:flex; flex-direction:row; gap:48px; align-items:start">
<ul style="font-size:32px; flex:1">${bullets}</ul>
${side}
</div>
<aside>Speaker notes for slide ${i + 1}.</aside>
</section>
`;
}

function makeDeck(root) {
  const project = path.join(root, 'project');
  const slides = path.join(project, 'slides');
  const assets = path.join(project, 'ds', 'bench', 'assets');
  fs.mkdirSync(slides, { recursive: true });
  fs.mkdirSync(assets, { recursive: true });
  for (let k = 0; k < PICTURES; k++) {
    const hue = k * 60;
    const rgb = h => [Math.round(128 + 127 * Math.cos((h * Math.PI) / 180)), Math.round(128 + 127 * Math.cos(((h - 120) * Math.PI) / 180)), Math.round(128 + 127 * Math.cos(((h + 120) * Math.PI) / 180))];
    fs.writeFileSync(path.join(assets, `pic${k + 1}.png`), png(1200, 800, rgb(hue), rgb(hue + 90)));
  }
  const order = [];
  for (let i = 0; i < SLIDES; i++) {
    const id = `s${String(i + 1).padStart(3, '0')}`;
    fs.writeFileSync(path.join(slides, `${id}.html`), slide(i));
    order.push(id);
  }
  const sections = {};
  for (let i = 0; i < SLIDES; i += PER_SECTION) sections[`sec${i / PER_SECTION + 1}`] = { description: `Part ${i / PER_SECTION + 1} of the deck`, start: order[i] };
  const deck = {
    v: 4,
    createdOnFiles: { v: 1, at: new Date().toISOString() },
    lists: 'css',
    title: 'Benchmark deck',
    cover: order[0],
    order,
    sections,
    faces: {},
    designSystems: [],
    attachments: {},
  };
  fs.writeFileSync(path.join(project, 'deck.json'), JSON.stringify(deck));
}

/* ------------------------------ in the page ------------------------------- */

/**
 * What the slide thumbnails of the open view show: a live slide, a loaded snapshot, or nothing yet (a placeholder).
 * Run in the editor page. `t` is performance.now() (ms since navigation).
 */
const PAINT_STATE = `(() => {
  const engine = document.querySelector('[data-open-artifact-canvas-engine]');
  if (engine) {
    const e = window.__openArtifactCanvasEngine && window.__openArtifactCanvasEngine();
    if (!e) return { t: performance.now(), total: 0 };
    return { t: Math.round(performance.now()), engine: true, total: e.tiles, shown: e.textures, visible: e.visible, visibleShown: e.visibleShown, live: e.live, snapshots: e.textures, holes: e.holes, largeTextures: e.large, zoom: Math.round(e.camera.zoom * 1000) / 1000, gpu: e.engine && { drawCalls: e.engine.drawCalls, textureMB: Math.round(e.engine.textureBytes / 1048576), atlasLayers: e.engine.atlasLayers, wasmMB: Math.round(e.engine.wasmMemory / 1048576) }, slideTrees: document.querySelectorAll('.open-artifact-slide').length };
  }
  const root = document.querySelector('[data-open-artifact-thumbs]');
  if (!root) return { t: performance.now(), total: 0 };
  const view = root.getBoundingClientRect();
  let total = 0, shown = 0, visible = 0, visibleShown = 0, live = 0, snapshots = 0;
  for (const el of root.querySelectorAll('[data-slide-index]')) {
    total++;
    const box = el.querySelector('[data-open-artifact-thumb]');
    let ok = false;
    if (el.querySelector('.open-artifact-slide')) { live++; ok = true; }
    const img = box && box.querySelector('img');
    if (img) { snapshots++; if (img.complete && img.naturalWidth > 0) ok = true; }
    if (ok) shown++;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > view.left && r.left < view.right && r.bottom > view.top && r.top < view.bottom) {
      visible++;
      if (ok) visibleShown++;
    }
  }
  const stage = document.querySelector('[data-open-artifact-mode="edit"]');
  return { t: Math.round(performance.now()), total, shown, visible, visibleShown, live, snapshots, stage: Boolean(stage), slideTrees: document.querySelectorAll('.open-artifact-slide').length };
})()`;

const LIVE_STATE = `window.__openArtifactLive ? (({ thumbs, slides, live, snapshots, due, failed, captures, meanCaptureMs, worstCaptureMs, capturingSpanMs }) => ({ t: Math.round(performance.now()), thumbs, slides, live: live.length, snapshots, due, failed, captures, meanCaptureMs, worstCaptureMs, capturingSpanMs }))(window.__openArtifactLive()) : null`;

const RECORDER = `(() => {
  const b = (window.__bench = { frames: [], long: [], running: false });
  b.observer = new PerformanceObserver(list => { if (b.running) for (const e of list.getEntries()) b.long.push(e.duration); });
  try { b.observer.observe({ type: 'longtask' }); } catch {}
  let generation = 0;
  b.start = () => {
    b.frames = []; b.long = []; b.running = true;
    const mine = ++generation;
    const tick = t => { if (!b.running || mine !== generation) return; b.frames.push(t); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  b.stop = () => {
    b.running = false;
    const gaps = b.frames.slice(1).map((t, i) => t - b.frames[i]).sort((x, y) => x - y);
    const span = b.frames.length > 1 ? b.frames[b.frames.length - 1] - b.frames[0] : 0;
    const q = p => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))] : 0;
    return {
      fps: span ? Math.round(((b.frames.length - 1) / span) * 1000 * 10) / 10 : 0,
      p50: Math.round(q(0.5) * 10) / 10,
      p95: Math.round(q(0.95) * 10) / 10,
      worst: Math.round((gaps[gaps.length - 1] ?? 0) * 10) / 10,
      slowFrames: gaps.filter(g => g > 25).length,
      longTasks: b.long.length,
      longTaskMs: Math.round(b.long.reduce((s, d) => s + d, 0)),
    };
  };
  return true;
})()`;

/* --------------------------------- driving -------------------------------- */

async function wheel(page, steps, { x = 720, y = 450, dx = 0, dy = 0, ctrl = false, flip = 0, until } = {}) {
  for (let i = 0; i < steps; i++) {
    const sign = flip && Math.floor(i / flip) % 2 ? -1 : 1;
    const started = Date.now();
    await page.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: dx * sign, deltaY: dy * sign, modifiers: ctrl ? 2 : 0 });
    if (until && i % 10 === 9 && (await page.evaluate(until))) return i + 1;
    await sleep(Math.max(0, 16 - (Date.now() - started)));
  }
  return steps;
}

async function key(page, keyName, code, keyCode) {
  await page.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: keyName, code, windowsVirtualKeyCode: keyCode });
  await page.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: keyCode });
}

/** Center of the first element matching an expression, or null. */
const centerOf = (page, expression) =>
  page.evaluate(`(() => { const el = ${expression}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

async function clickOn(page, expression) {
  const at = await centerOf(page, expression);
  if (!at) throw new Error(`nothing to click: ${expression}`);
  await page.click(at.x, at.y);
}

/** Switches the view with the View menu. */
async function setView(page, label) {
  await clickOn(page, `document.querySelector('[aria-label="View"]')`);
  await sleep(300);
  await clickOn(page, `[...document.querySelectorAll('[role^="menuitem"]')].find(el => el.textContent.trim() === ${JSON.stringify(label)})`);
}

const BUSY = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];
const metricsOf = async page => Object.fromEntries((await page.cdp('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

/** Runs a scenario; main-thread busy time (ms) comes from the renderer's own counters, frames from the page. */
async function scenario(page, run) {
  const before = await metricsOf(page);
  const t0 = Date.now();
  await page.evaluate('window.__bench.start()');
  const extra = await run();
  await sleep(300);
  const frames = await page.evaluate('window.__bench.stop()');
  const after = await metricsOf(page);
  const wall = Date.now() - t0;
  const busy = Object.fromEntries(BUSY.map(k => [k.replace('Duration', 'Ms').replace(/^./, c => c.toLowerCase()), Math.round((after[k] - before[k]) * 1000)]));
  return { ...frames, wallMs: wall, mainThreadBusyPct: Math.round((busy.taskMs / wall) * 100), ...busy, ...(extra ?? {}) };
}

/** Waits until the thumbnails on screen (or, with `all`, every one) show their slide; `stage`: and the stage its slide. */
async function settle(page, { all = false, stage = false, timeout = 120000 } = {}) {
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < timeout) {
    state = await page.evaluate(PAINT_STATE);
    const done = state.total > 0 && (all ? state.shown === state.total : state.visible > 0 && state.visibleShown === state.visible) && (!stage || state.stage);
    if (done) return { ms: Date.now() - t0, state };
    await sleep(50);
  }
  return { ms: null, state };
}

/** Waits until every slide with a thumbnail has a current snapshot (virtualized runs only). */
async function snapshotsDone(page, timeout = 600000) {
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < timeout) {
    state = await page.evaluate(LIVE_STATE);
    if (!state) return { ms: null, state };
    if (state.slides > 0 && state.due === 0) return { ms: Date.now() - t0, state };
    await sleep(250);
  }
  return { ms: null, state };
}

function rssOfTree(rootPid) {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' })
    .trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
  const children = new Map();
  for (const [pid, ppid] of rows) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const rss = new Map(rows.map(([pid, , kb]) => [pid, kb]));
  let total = 0;
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    total += rss.get(pid) ?? 0;
    stack.push(...(children.get(pid) ?? []));
  }
  return Math.round(total / 1024);
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const { data } = await page.cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, `${LABEL.replace(/[^\w-]+/g, '_')}-${name}.png`), Buffer.from(data, 'base64'));
}

async function memory(page, browser) {
  await page.cdp('HeapProfiler.enable').catch(() => {});
  await page.cdp('HeapProfiler.collectGarbage').catch(() => {});
  const metrics = await metricsOf(page);
  const paint = await page.evaluate(PAINT_STATE);
  return { nodes: metrics.Nodes, jsHeapMB: Math.round(metrics.JSHeapUsedSize / 1048576), chromeRssMB: rssOfTree(browser.pid), slideTrees: paint.slideTrees, liveThumbs: paint.live, snapshotImgs: paint.snapshots, ...(paint.engine ? { textures: paint.snapshots, gpu: paint.gpu } : {}) };
}

/* ---------------------------------- smoke --------------------------------- */

const SHIFT = 8;
const META = 4;

/** A mouse drag from `from` to `to` in `steps` moves, holding `modifiers`. */
async function drag(page, from, to, { modifiers = 0, steps = 16 } = {}) {
  const at = (type, { x, y }, extra = {}) => page.cdp('Input.dispatchMouseEvent', { type, x, y, modifiers, ...extra });
  await at('mouseMoved', from);
  await at('mousePressed', from, { button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    await at('mouseMoved', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }, { button: 'left', buttons: 1 });
    await sleep(16);
  }
  await at('mouseReleased', to, { button: 'left', buttons: 0, clickCount: 1 });
}

/** The slides marked selected (or current) on the board, in deck order. */
const SELECTED = `[...document.querySelectorAll('[data-slide-id][aria-selected="true"]')].sort((a, b) => a.dataset.slideIndex - b.dataset.slideIndex).map(el => el.dataset.slideId)`;
/** The slide at each deck index the board shows. */
const AT = indices => `(() => { const at = {}; for (const el of document.querySelectorAll('[data-slide-id]')) at[el.dataset.slideIndex] = el.dataset.slideId; return ${JSON.stringify(indices)}.map(i => at[i] ?? null); })()`;

/**
 * Selecting, the context menu, reordering and opening slides on the Canvas view, with real mouse events. Zooms to
 * about 50 % around the middle of the deck first, then works on three neighbours in one row fully on screen.
 */
async function canvasSmoke(page, board) {
  const out = {};
  const pass = (name, ok, detail) => (out[name] = ok ? 'ok' : `FAILED: ${JSON.stringify(detail)}`);
  const engine = await page.evaluate(`Boolean(document.querySelector('[data-open-artifact-canvas-engine]'))`);
  await clickOn(page, `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Fit all slides')`);
  await sleep(800);
  for (let i = 0; i < 9; i++) {
    await clickOn(page, `document.querySelector('[aria-label="Zoom in"]')`);
    await sleep(120);
  }
  await sleep(1500);
  const tiles = await page.evaluate(`(() => {
    const host = ${board}.getBoundingClientRect();
    const out = [];
    for (const el of document.querySelectorAll('[data-slide-id]')) {
      const r = el.getBoundingClientRect();
      if (r.left > host.left + 40 && r.right < host.right - 40 && r.top > host.top + 60 && r.bottom < host.bottom - 60) out.push({ id: el.dataset.slideId, i: Number(el.dataset.slideIndex), x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return out.sort((a, b) => a.i - b.i);
  })()`);
  const start = tiles.findIndex((t, k) => tiles[k + 2]?.i === t.i + 2 && tiles[k + 2].y === t.y);
  if (start < 0) return { error: 'no three neighbours in a row on screen', tiles: tiles.length };
  const [a, b, c] = tiles.slice(start, start + 3);
  const mid = t => ({ x: t.x + t.w / 2, y: t.y + t.h * 0.4 });
  out.tiles = [a.id, b.id, c.id];

  await page.click(mid(a).x, mid(a).y);
  await sleep(300);
  let sel = await page.evaluate(SELECTED);
  pass('click', sel.length === 1 && sel[0] === a.id, sel);

  await page.click(mid(c).x, mid(c).y, { shift: true });
  await sleep(300);
  sel = await page.evaluate(SELECTED);
  pass('shiftClick', sel.join() === [a.id, b.id, c.id].join(), sel);

  // The row gap just above the middle slide.
  const gap = { x: b.x + 10, y: b.y - 20 };
  await page.click(gap.x, gap.y);
  await sleep(300);
  sel = await page.evaluate(SELECTED);
  pass('backgroundClick', sel.length === 1, sel);

  if (engine) {
    await drag(page, gap, { x: c.x + c.w - 10, y: c.y + 30 }, { modifiers: META });
    await sleep(400);
    sel = await page.evaluate(SELECTED);
    pass('marquee', sel.join() === [b.id, c.id].join(), sel);
  } else out.marquee = 'n/a (the DOM board pans on background drags)';

  await page.rightClick(mid(b).x, mid(b).y);
  await sleep(500);
  const menu = await page.evaluate(`[...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].map(el => el.textContent.trim()).filter(Boolean).slice(0, 4)`);
  pass('contextMenu', menu.length > 0, menu);
  await page.press('Escape');
  await sleep(300);

  // Drag the first slide onto the right half of the third: it lands after it.
  await page.click(mid(a).x, mid(a).y);
  await sleep(200);
  await drag(page, mid(a), { x: c.x + c.w * 0.8, y: mid(c).y }, { steps: 24 });
  await sleep(1000);
  const order = await page.evaluate(AT([a.i, a.i + 1, a.i + 2]));
  pass('reorder', order.join() === [b.id, c.id, a.id].join(), order);

  const now = await page.evaluate(AT([a.i]));
  await page.clickTimes(mid(a).x, mid(a).y, 2);
  await sleep(800);
  const editing = await page.evaluate(`document.body.innerText.includes('Slide ${a.i + 1} of ')`);
  pass('doubleClickEdits', editing, { slide: now[0] });
  await page.press('Escape');
  await sleep(1000);
  pass('escapeBackToCanvas', await page.evaluate(`Boolean(${board})`), null);
  return out;
}

async function main() {
  if (!fs.existsSync(path.join(target, 'slides', 'scripts', 'cli.mjs'))) throw new Error(`${target} holds no built slides type (npm run build)`);
  const { dir } = install(path.join(target, 'slides'), 'slides');
  const home = path.join(tmpDir('bench-state'), 'state');
  const userHome = tmpDir('bench-home');
  const run = cli(dir, { OPEN_ARTIFACT_TYPE_SERVER_HOME: home, HOME: userHome, OPEN_ARTIFACT_USER: 'Bench' });
  const root = path.join(tmpDir('bench-root'), 'artifact');
  makeDeck(root);
  const check = await run.run(['check', root]);
  if (check.code !== 0) throw new Error(`the generated deck does not check: ${(check.stdout || check.stderr).slice(0, 2000)}`);
  const opened = await run.json(['open', root, '--json']);
  const url = PARAMS ? `${opened.url}?${PARAMS}` : opened.url;

  const browser = await launch();
  const result = { label: LABEL, slides: SLIDES, params: PARAMS };
  try {
    const t0 = Date.now();
    const page = await browser.load(url, { ready: 'document.querySelector("[data-open-artifact-thumbs] [data-slide-index]")', settle: 0, timeout: 120000 });
    const loaded = Date.now() - t0;
    await page.evaluate(RECORDER);
    await page.cdp('Performance.enable');
    const visible = await settle(page, { stage: true });
    const afterLoad = await metricsOf(page);
    result.load = {
      readyWallMs: loaded,
      // performance.now() in the page when the rail's visible thumbnails and the stage first all showed their slides.
      interactiveMs: visible.state?.t ?? null,
      mainThreadMs: Math.round(afterLoad.TaskDuration * 1000),
      thumbs: visible.state?.total,
    };
    await sleep(1000);
    result.memoryAtLoad = await memory(page, browser);
    const snaps = await snapshotsDone(page);
    // performance.now() in the page when every slide had a current snapshot.
    result.load.allSnapshotsMs = snaps.ms === null ? null : snaps.state.t;
    result.load.live = snaps.state;
    await sleep(500);
    result.memorySettled = await memory(page, browser);
    await shot(page, 'load');

    // Rail: wheel from the top to the bottom.
    const railAt = await centerOf(page, `document.querySelector('[data-open-artifact-thumbs]')`);
    const railEnd = `(() => { const r = document.querySelector('[data-open-artifact-thumbs]'); return r.scrollTop + r.clientHeight >= r.scrollHeight - 2; })()`;
    result.rail = await scenario(page, async () => ({ wheels: await wheel(page, 1200, { x: railAt.x, y: railAt.y, dy: 100, until: railEnd }) }));
    // Right after the scroll: thumbnails not yet live show their snapshots.
    await shot(page, 'rail-moving');
    const railBottom = await settle(page, { timeout: 30000 });
    result.rail.bottomPaintedMs = railBottom.ms;
    await page.evaluate(`document.querySelector('[data-open-artifact-thumbs]').scrollTop = 0`);
    await sleep(800);

    // Switching slides: click the first thumbnail, then ArrowDown 40 times.
    await clickOn(page, `document.querySelector('[data-open-artifact-thumbs] [data-slide-index="0"]')`);
    await sleep(500);
    result.switch = await scenario(page, async () => {
      for (let i = 0; i < 40; i++) {
        await key(page, 'ArrowDown', 'ArrowDown', 40);
        await sleep(100);
      }
      return { current: await page.evaluate('location.hash') };
    });
    await sleep(800);

    // Grid view.
    const gridT0 = Date.now();
    await setView(page, 'Grid');
    const grid = await settle(page, { timeout: 60000 });
    result.gridOpen = { paintedMs: grid.ms === null ? null : Date.now() - gridT0, tiles: grid.state?.total };
    await sleep(1000);
    await shot(page, 'grid');
    const gridAt = await centerOf(page, `document.querySelector('[data-open-artifact-thumbs]')`);
    await page.evaluate(`document.querySelector('[data-open-artifact-thumbs]').scrollTop = 0`);
    await sleep(800);
    result.gridScroll = await scenario(page, async () => ({ wheels: await wheel(page, 1500, { x: gridAt.x, y: gridAt.y, dy: 100, until: railEnd }) }));
    result.memoryGrid = await memory(page, browser);

    // Canvas view: fit all slides, then pan and zoom.
    const canvasT0 = Date.now();
    await setView(page, 'Canvas');
    const canvas = await settle(page, { timeout: 60000 });
    result.canvasOpen = { paintedMs: canvas.ms === null ? null : Date.now() - canvasT0, tiles: canvas.state?.total };
    await sleep(1000);
    await shot(page, 'canvas');
    const board = `(document.querySelector('[data-open-artifact-canvas-engine]') ?? document.querySelector('[data-open-artifact-thumbs]'))`;
    result.canvasOpen.engine = await page.evaluate(`Boolean(document.querySelector('[data-open-artifact-canvas-engine]'))`);
    const canvasAt = await centerOf(page, board);
    result.canvasPan = await scenario(page, () => wheel(page, 120, { x: canvasAt.x, y: canvasAt.y, dx: 24, dy: 12, flip: 30 }));
    result.canvasZoom = await scenario(page, () => wheel(page, 120, { x: canvasAt.x, y: canvasAt.y, dy: -12, ctrl: true, flip: 30 }));
    // Zoomed in (100 % or so): the tiles near the view go live.
    await wheel(page, 25, { x: canvasAt.x, y: canvasAt.y, dy: -20, ctrl: true });
    await sleep(1500);
    await shot(page, 'canvas-zoomed');
    result.canvasZoomedIn = await scenario(page, () => wheel(page, 120, { x: canvasAt.x, y: canvasAt.y, dx: 30, dy: 15, flip: 30 }));
    result.memoryCanvas = await memory(page, browser);
    result.liveEnd = await page.evaluate(LIVE_STATE);
    result.smoke = await canvasSmoke(page, board);
    await shot(page, 'canvas-smoke');
    result.problems = page.problems.filter(p => !/favicon/.test(p)).slice(0, 10);
  } finally {
    await browser.close();
    await run.run(['stop']).catch(() => {});
    removeTmp();
  }
  console.log(JSON.stringify(result, null, 2));
  if (OUT) {
    const all = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
    fs.writeFileSync(OUT, JSON.stringify([...all, result], null, 2));
  }
}

main().catch(e => {
  console.error(e);
  removeTmp();
  process.exit(1);
});
