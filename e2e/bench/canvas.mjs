#!/usr/bin/env node
// Performance benchmark of the Design canvas: a large generated design opened in headless Chrome.
//
//   node e2e/bench/canvas.mjs                         120 artboards, 300 notes, artifact-types/ (build first)
//   node e2e/bench/canvas.mjs --boards 200 --notes 999
//   node e2e/bench/canvas.mjs --params open_artifact_live=all    extra query parameters for the editor page
//   node e2e/bench/canvas.mjs --label baseline --out results.json
//   node e2e/bench/canvas.mjs --compare 120x300,300x999   the canvas engine against open_artifact_engine=off (the DOM canvas)
//                                                         at each size (artboards x notes), as a table
//
// What it measures (see docs/zh-CN/rust-wasm-core.md, P0):
//   load      time from navigation until every artboard on screen shows its content (a booted frame or a snapshot),
//             and until every artboard of the page does; live frames, documents and DOM nodes then
//   memory    the JS heap of the page (after a GC) and the resident memory of the whole Chrome process tree
//   overview  wheel panning and Ctrl+wheel zooming with the whole page in view (zoom to fit)
//   work      wheel panning at 100 %
// Each scroll scenario reports frames per second, the 95th percentile and worst frame interval, frames over 25 ms and
// long tasks (> 50 ms) of the editor page.
//
// E2E_HEADFUL=1 runs Chrome with a window (real GPU compositing; headless numbers are for comparing runs, not absolute).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../lib/browser.mjs';
import { cli } from '../lib/cli.mjs';
import { install, removeTmp, target, tmpDir } from '../lib/target.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BOARDS = Number(opt('boards', 120));
const NOTES = Number(opt('notes', 300));
const PARAMS = opt('params', '');
const LABEL = opt('label', PARAMS || 'default');
const OUT = opt('out', null);
const COMPARE = opt('compare', null);
const COLUMNS = 12;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------- the design ------------------------------- */

function board(i) {
  const hue = (i * 37) % 360;
  const cards = Array.from({ length: 6 }, (_, k) => `
<div style="padding: 20px; border-radius: 14px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06); display: flex; flex-direction: column; gap: 8px">
<div style="width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, hsl(${hue} 70% 60%), hsl(${(hue + 60) % 360} 70% 50%))"></div>
<h3 style="margin: 0; font-size: 18px">Feature ${k + 1}</h3>
<p style="margin: 0; font-size: 13px; line-height: 1.5; color: #5b6168">Card ${k + 1} of artboard ${i + 1}, with enough text to wrap onto a second line in this column.</p>
</div>`).join('');
  const bars = Array.from({ length: 12 }, (_, k) => `<rect x="${k * 26}" y="${120 - ((i * 7 + k * 13) % 100)}" width="18" height="${(i * 7 + k * 13) % 100}" rx="3" fill="hsl(${hue} 60% 55%)"/>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Screen ${i + 1}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
body{margin:0}
</style>
</helmet>
<div style="width: 880px; height: 560px; box-sizing: border-box; padding: 40px; display: flex; flex-direction: column; gap: 24px; background: hsl(${hue} 40% 97%); font-family: system-ui, sans-serif">
<div style="display: flex; align-items: center; justify-content: space-between">
<h1 style="margin: 0; font-size: 32px; color: {{accent}}">Screen {{index}}</h1>
<svg width="312" height="120" viewBox="0 0 312 120">${bars}</svg>
</div>
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px">${cards}
</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"accent":{"editor":"color","default":"#22262b"},"$preview":{"width":880,"height":560}}'>
class Component extends DCLogic {
renderVals() {
return { accent: this.props.accent ?? '#22262b', index: ${i + 1} };
}
}
</script>
</body>
</html>
`;
}

function makeDesign(root) {
  const project = path.join(root, 'project');
  fs.mkdirSync(project, { recursive: true });
  const boards = {};
  const order = [];
  for (let i = 0; i < BOARDS; i++) {
    const name = `Screen${String(i + 1).padStart(3, '0')}.dc.html`;
    fs.writeFileSync(path.join(project, name), board(i));
    boards[name] = { x: (i % COLUMNS) * 1000, y: Math.floor(i / COLUMNS) * 700, w: 880, h: 560 };
    order.push(name);
  }
  const rows = Math.ceil(BOARDS / COLUMNS);
  const notes = {};
  for (let i = 0; i < NOTES; i++) {
    // Stickies in the gaps under each artboard row.
    const row = i % Math.max(rows, 1);
    const slot = Math.floor(i / Math.max(rows, 1));
    notes[`n${i + 1}`] = { x: (slot % (COLUMNS * 4)) * 250, y: row * 700 + 570, text: `Note ${i + 1}: check spacing`, w: 220, h: 110 };
  }
  const canvas = { v: 3, title: 'Benchmark canvas', launch: { view: 'canvas' }, pages: [], boards, order, notes, designSystems: [] };
  fs.writeFileSync(path.join(project, 'canvas.json'), JSON.stringify(canvas));
}

/* ------------------------------ in the page ------------------------------- */

/**
 * What every artboard shows: a booted frame, a loaded snapshot, or nothing yet. Run in the editor page. The canvas
 * engine draws snapshots into its canvas and says so itself (`__openArtifactCanvas`, services/engine.ts).
 */
const PAINT_STATE = `(() => {
  if (window.__openArtifactCanvas) return window.__openArtifactCanvas();
  const surface = document.querySelector('[data-canvas-surface]');
  if (!surface) return null;
  const view = surface.getBoundingClientRect();
  let total = 0, shown = 0, visible = 0, visibleShown = 0, visibleLive = 0, live = 0, booted = 0, snapshots = 0;
  for (const el of document.querySelectorAll('[data-board]')) {
    total++;
    const frame = el.querySelector('iframe');
    let ok = false, up = false;
    if (frame) {
      live++;
      try { if (frame.contentWindow && frame.contentWindow.__dc) { booted++; ok = true; up = true; } } catch {}
    }
    const img = el.querySelector('img[data-board-snapshot]');
    if (img) { snapshots++; if (img.complete && img.naturalWidth > 0) ok = true; }
    if (ok) shown++;
    const r = el.getBoundingClientRect();
    if (r.right > view.left && r.left < view.right && r.bottom > view.top && r.top < view.bottom) {
      visible++;
      if (ok) visibleShown++;
      if (up) visibleLive++;
    }
  }
  const layer = surface.children[1];
  const m = /scale\\(([\\d.e-]+)\\)/.exec(layer?.style.transform ?? '');
  return { total, shown, visible, visibleShown, visibleLive, live, booted, snapshots, zoom: m ? Number(m[1]) : null };
})()`;

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

async function wheel(page, steps, { dx = 0, dy = 0, ctrl = false, flip = 0 } = {}) {
  const x = 720, y = 450;
  for (let i = 0; i < steps; i++) {
    const sign = flip && Math.floor(i / flip) % 2 ? -1 : 1;
    const started = Date.now();
    await page.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: dx * sign, deltaY: dy * sign, modifiers: ctrl ? 2 : 0 });
    await sleep(Math.max(0, 16 - (Date.now() - started)));
  }
}

const BUSY = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];
const metricsOf = async page => Object.fromEntries((await page.cdp('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

/** Runs a scroll scenario; main-thread busy time (ms) comes from the renderer's own counters, frames from the page. */
async function scenario(page, run) {
  const before = await metricsOf(page);
  const t0 = Date.now();
  await page.evaluate('window.__bench.start()');
  await run();
  await sleep(300);
  const frames = await page.evaluate('window.__bench.stop()');
  const after = await metricsOf(page);
  const wall = Date.now() - t0;
  const busy = Object.fromEntries(BUSY.map(k => [k.replace('Duration', 'Ms').replace(/^./, c => c.toLowerCase()), Math.round((after[k] - before[k]) * 1000)]));
  return { ...frames, wallMs: wall, mainThreadBusyPct: Math.round((busy.taskMs / wall) * 100), ...busy };
}

/** Waits until what is on screen (or, with `all`, every artboard) shows its content; with `live`, a booted frame. */
async function settle(page, { all, live, timeout = 120000 } = {}) {
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < timeout) {
    state = await page.evaluate(PAINT_STATE);
    const done = !state || state.total === 0 ? false : all ? state.shown === state.total : live ? state.visible > 0 && state.visibleLive === state.visible : state.visibleShown === state.visible;
    if (done) return { ms: Date.now() - t0, state };
    await sleep(100);
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

async function main() {
  if (!fs.existsSync(path.join(target, 'design', 'scripts', 'cli.mjs'))) throw new Error(`${target} holds no built design type (npm run build)`);
  const { dir } = install(path.join(target, 'design'), 'design');
  const home = path.join(tmpDir('bench-state'), 'state');
  const userHome = tmpDir('bench-home');
  const run = cli(dir, { OPEN_ARTIFACT_TYPE_SERVER_HOME: home, HOME: userHome, OPEN_ARTIFACT_USER: 'Bench' });
  const root = path.join(tmpDir('bench-root'), 'artifact');
  makeDesign(root);
  const opened = await run.json(['open', root, '--json']);
  const url = PARAMS ? `${opened.url}?${PARAMS}` : opened.url;

  const browser = await launch();
  const result = { label: LABEL, boards: BOARDS, notes: NOTES, params: PARAMS };
  try {
    const t0 = Date.now();
    const page = await browser.load(url, { ready: 'window.__openArtifactCanvas || document.querySelector("[data-canvas-surface] [data-board]")', settle: 0, timeout: 60000 });
    const loaded = Date.now() - t0;
    await page.evaluate(RECORDER);
    await page.cdp('Performance.enable');
    const visible = await settle(page);
    const visibleMs = visible.ms === null ? null : loaded + visible.ms;
    const all = await settle(page, { all: true });
    await sleep(1000);
    await page.cdp('HeapProfiler.enable').catch(() => {});
    await page.cdp('HeapProfiler.collectGarbage').catch(() => {});
    const metrics = await metricsOf(page);
    const after = await page.evaluate(PAINT_STATE);
    result.load = {
      engine: Boolean(after.engine),
      pageMs: loaded,
      visiblePaintedMs: visibleMs,
      allPaintedMs: all.ms === null ? null : visibleMs + all.ms,
      liveFrames: after.live,
      snapshots: after.snapshots,
      zoom: after.zoom,
      documents: metrics.Documents,
      frames: metrics.Frames,
      nodes: metrics.Nodes,
    };
    result.memory = { jsHeapMB: Math.round(metrics.JSHeapUsedSize / 1048576), chromeRssMB: rssOfTree(browser.pid) };

    // Scroll scenarios go out and back (an even number of segments), so the camera ends where it started.
    result.overviewPan = await scenario(page, () => wheel(page, 120, { dx: 24, dy: 12, flip: 30 }));
    result.overviewZoom = await scenario(page, () => wheel(page, 120, { dy: -12, ctrl: true, flip: 30 }));

    // 100 %, then let the page settle (frames for what is on screen).
    await page.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1400, y: 880, button: 'left', clickCount: 1 }).catch(() => {});
    await page.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1400, y: 880, button: 'left', clickCount: 1 }).catch(() => {});
    // Shift+1 fits the page, Shift+0 then zooms to 100 % around the middle of the view.
    for (const [key, code, keyCode] of [['!', 'Digit1', 49], [')', 'Digit0', 48]]) {
      await page.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text: key, windowsVirtualKeyCode: keyCode, modifiers: 8 });
      await page.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers: 8 });
    }
    const work = await settle(page, { live: true });
    await sleep(1000);
    const workState = await page.evaluate(PAINT_STATE);
    const liveState = await page.evaluate(`window.__openArtifactLive ? (({ live, warming, moving, pointerDown }) => ({ live: live.length, warming: warming.length, moving, pointerDown }))(window.__openArtifactLive()) : null`);
    result.work = { zoom: workState.zoom, visible: workState.visible, visibleLiveMs: work.ms, liveFrames: workState.live, liveState };
    result.workPan = await scenario(page, () => wheel(page, 120, { dx: 30, dy: 15, flip: 30 }));
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

/* -------------------------------- compare --------------------------------- */

/** Runs this script once per size and renderer, and prints the results side by side. */
function compare() {
  const sizes = COMPARE.split(',').map(s => s.split('x').map(Number));
  const rows = [];
  for (const [boards, notes] of sizes) {
    for (const [label, params] of [['engine', PARAMS], ['dom', [PARAMS, 'open_artifact_engine=off'].filter(Boolean).join('&')]]) {
      console.error(`… ${boards} artboards, ${notes} notes, ${label}`);
      const argv = [process.argv[1], '--boards', String(boards), '--notes', String(notes), '--label', label, ...(params ? ['--params', params] : [])];
      const out = execFileSync(process.execPath, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 });
      rows.push(JSON.parse(out));
    }
  }
  const cell = v => (v === null || v === undefined ? '–' : String(v));
  const lines = [
    '| artboards × notes | canvas | ready ms | on screen ms | all ms | heap MB | Chrome RSS MB | overview pan fps / p95 ms | overview zoom fps / p95 ms | 100 % pan fps / p95 ms |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(r =>
      `| ${r.boards} × ${r.notes} | ${r.load.engine ? 'engine' : 'DOM'} | ${cell(r.load.pageMs)} | ${cell(r.load.visiblePaintedMs)} | ${cell(r.load.allPaintedMs)} | ${r.memory.jsHeapMB} | ${r.memory.chromeRssMB} | ${r.overviewPan.fps} / ${r.overviewPan.p95} | ${r.overviewZoom.fps} / ${r.overviewZoom.p95} | ${r.workPan.fps} / ${r.workPan.p95} |`,
    ),
  ];
  console.log(lines.join('\n'));
  const problems = rows.filter(r => r.problems?.length).map(r => `${r.boards}×${r.notes} ${r.label}: ${r.problems.join('; ')}`);
  if (problems.length) console.log(`\nProblems:\n${problems.join('\n')}`);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
}

if (COMPARE) compare();
else
  main().catch(e => {
    console.error(e);
    removeTmp();
    process.exit(1);
  });
