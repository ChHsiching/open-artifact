#!/usr/bin/env node
// Headless check and benchmark of @open-artifact/canvas-engine (crates/open-artifact-canvas): the standalone demo page
// (e2e/bench/canvas-engine-demo.ts: 300 textured boards, 1000 notes, 200 paths) bundled with esbuild, served from
// memory, opened in headless Chrome.
//
//   node e2e/bench/canvas-engine.mjs                       build the wasm first: node scripts/build-wasm.mjs open-artifact-canvas
//   node e2e/bench/canvas-engine.mjs --out results.json --shot shot.png
//
// Checks: pixels of known items (texture, note, path, hole cut-out, item over a hole, background), a mouse drag
// commits exactly one `move` with the right delta, a marquee selects what it covers. Then measures 120 wheel pans
// and 120 Ctrl+wheel zooms over the whole scene and 120 pans at 100 %: frames per second, p95 and worst frame
// interval (rAF), and engine time per drawn frame (performance.now around the wasm frame call).
// Headless numbers are for comparing runs (E2E_HEADFUL=1 for a window).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { launch } from '../lib/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const OUT = opt('out', null);
const SHOT = opt('shot', null);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------- bundle --------------------------------- */

const esbuild = await import(path.join(root, 'node_modules/esbuild/lib/main.js'));
const built = await esbuild.build({
  entryPoints: [path.join(root, 'e2e/bench/canvas-engine-demo.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  write: false,
  minify: true,
  logLevel: 'error',
});
const js = built.outputFiles[0].text;
const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>canvas-engine demo</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#fff}
#under{position:fixed;inset:0;overflow:hidden}
#live{position:absolute;left:0;top:0;width:300px;height:200px;transform-origin:0 0;display:none;background:#7c3aed;color:#fff;font:600 20px system-ui;display:flex;align-items:center;justify-content:center}
#c{position:fixed;inset:0;width:100vw;height:100vh;display:block}</style></head>
<body><div id="under"><div id="live">Live DOM under a hole</div></div><canvas id="c"></canvas>
<script type="module" src="/demo.js"></script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/demo.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(js);
  } else if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(HTML);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

/* --------------------------------- helpers --------------------------------- */

const RECORDER = `(() => {
  const b = (window.__bench = { frames: [], long: [], running: false });
  b.observer = new PerformanceObserver(list => { if (b.running) for (const e of list.getEntries()) b.long.push(e.duration); });
  try { b.observer.observe({ type: 'longtask' }); } catch {}
  let generation = 0;
  b.start = () => {
    b.frames = []; b.long = []; b.running = true; window.__demo.engineMs.length = 0;
    const mine = ++generation;
    const tick = t => { if (!b.running || mine !== generation) return; b.frames.push(t); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  b.stop = () => {
    b.running = false;
    const gaps = b.frames.slice(1).map((t, i) => t - b.frames[i]).sort((x, y) => x - y);
    const span = b.frames.length > 1 ? b.frames[b.frames.length - 1] - b.frames[0] : 0;
    const q = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
    const r = v => Math.round(v * 100) / 100;
    const ms = window.__demo.engineMs.slice().sort((x, y) => x - y);
    return {
      fps: span ? Math.round(((b.frames.length - 1) / span) * 1000 * 10) / 10 : 0,
      p50: r(q(gaps, 0.5)), p95: r(q(gaps, 0.95)), worst: r(gaps[gaps.length - 1] ?? 0),
      slowFrames: gaps.filter(g => g > 25).length,
      longTasks: b.long.length,
      engineFrames: ms.length,
      engineMeanMs: r(ms.reduce((s, v) => s + v, 0) / (ms.length || 1)),
      engineP95Ms: r(q(ms, 0.95)),
      engineMaxMs: r(ms[ms.length - 1] ?? 0),
      drawCalls: window.__demo.engine.stats().drawCalls,
    };
  };
  return true;
})()`;

async function wheel(page, steps, { dx = 0, dy = 0, ctrl = false, flip = 0, x = 720, y = 450 } = {}) {
  for (let i = 0; i < steps; i++) {
    const sign = flip && Math.floor(i / flip) % 2 ? -1 : 1;
    const started = Date.now();
    await page.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: dx * sign, deltaY: dy * sign, modifiers: ctrl ? 2 : 0 });
    await sleep(Math.max(0, 16 - (Date.now() - started)));
  }
}

async function mouseDrag(page, from, to, steps = 10) {
  const ev = (type, [x, y], extra = {}) => page.cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
  await ev('mouseMoved', from, { button: 'none' });
  await ev('mousePressed', from, { buttons: 1, clickCount: 1 });
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    await ev('mouseMoved', [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], { buttons: 1 });
    await sleep(16);
  }
  await ev('mouseReleased', to, { buttons: 0, clickCount: 1 });
  await sleep(50);
}

async function scenario(page, run) {
  await page.evaluate('window.__bench.start()');
  await run();
  await sleep(300);
  return page.evaluate('window.__bench.stop()');
}

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const close = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

/* ----------------------------------- run ----------------------------------- */

const results = { checks: {}, scenarios: {} };
let failed = 0;
const check = (name, ok, detail) => {
  results.checks[name] = { ok, ...(detail === undefined ? {} : { detail }) };
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
};

const browser = await launch();
try {
  const t0 = Date.now();
  const page = await browser.load(base, { ready: 'window.__ready === true', settle: 0, timeout: 60000 });
  results.loadMs = Date.now() - t0;
  await page.evaluate(RECORDER);
  results.renderer = await page.evaluate('window.__demo.gl()');
  results.patchMs = Math.round((await page.evaluate('window.__demo.patchMs')) * 10) / 10;
  // Every visible texture delivered.
  const t1 = Date.now();
  while (Date.now() - t1 < 30000) {
    const s = await page.evaluate('({ pending: window.__demo.texturesPending, set: window.__demo.texturesSet })');
    if (s.set >= 300 && s.pending === 0) break;
    await sleep(100);
  }
  results.texturesMs = Date.now() - t1;
  results.stats = await page.evaluate('window.__demo.engine.stats()');
  check('all 300 board textures requested and stored', results.stats.textures >= 300, { textures: results.stats.textures, atlasLayers: results.stats.atlasLayers });

  /* pixels */
  await page.evaluate('window.__demo.engine.setCamera({ x: -3100, y: -400, zoom: 1 })');
  await sleep(300);
  // Wait for the test board texture (asked for when it came into view).
  for (let i = 0; i < 50 && !(await page.evaluate('window.__demo.engine.stats().textures >= 301')); i++) await sleep(50);
  await sleep(400); // past the fade-in
  const P = {
    note: [160, 140],
    line: [400, 700],
    board: [960, 300],
    hole: [1400, 650],
    over: [1260, 545],
    under: [1170, 470],
    background: [910, 610],
  };
  const px = await page.evaluate(`window.__demo.readback(${JSON.stringify(Object.values(P))})`);
  const got = Object.fromEntries(Object.keys(P).map((k, i) => [k, px[i]]));
  const T = await page.evaluate('window.__demo.TEST');
  check('pixel: note fill', close(got.note.slice(0, 3), hex(T.notes[3])) && got.note[3] === 255, got.note);
  check('pixel: path stroke', close(got.line.slice(0, 3), hex(T.line)), got.line);
  check('pixel: texture (not the placeholder)', close(got.board.slice(0, 3), hex(T.board), 10), got.board);
  check('pixel: hole is transparent', got.hole[3] === 0, got.hole);
  check('pixel: item above a hole draws', close(got.over.slice(0, 3), hex(T.over)), got.over);
  check('pixel: item below a hole draws outside it', close(got.under.slice(0, 3), hex(T.under)), got.under);
  check('pixel: background', close(got.background.slice(0, 3), [245, 245, 244], 4), got.background);
  const holes = await page.evaluate('window.__demo.holes');
  check('holes event places the DOM element', holes.length === 1 && holes[0].id === 'hole' && Math.abs(holes[0].x - 1200) < 0.01 && Math.abs(holes[0].y - 500) < 0.01, holes[0]);
  if (SHOT) {
    const { data } = await page.cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOT, Buffer.from(data, 'base64'));
  }

  /* drag → one move commit */
  await page.evaluate('window.__demo.engine.setOptions({ snap: false }); window.__demo.commits.length = 0');
  await mouseDrag(page, [360, 440], [480, 520]);
  const commits = await page.evaluate('window.__demo.commits');
  check('drag: exactly one move commit with the screen delta / zoom', commits.length === 1 && commits[0].op === 'move' && commits[0].ids.join() === 't1' && commits[0].dx === 120 && commits[0].dy === 80, commits);
  await page.evaluate('window.__demo.engine.setCamera({ x: -3100, y: -400, zoom: 1.5 }); window.__demo.commits.length = 0');
  // t2 at world (-2600, 0) → screen ((−2600+3100)*1.5, 400*1.5) = (750, 600); its centre is +(90, 60).
  await mouseDrag(page, [840, 660], [960, 720]);
  const commits2 = await page.evaluate('window.__demo.commits');
  check('drag at zoom 1.5: move commit in world units', commits2.length === 1 && commits2[0].ids.join() === 't2' && commits2[0].dx === 80 && commits2[0].dy === 40, commits2);

  /* marquee */
  await page.evaluate('window.__demo.engine.setCamera({ x: -3100, y: -400, zoom: 1 }); window.__demo.selections.length = 0; window.__demo.commits.length = 0');
  await mouseDrag(page, [60, 60], [600, 200]);
  const sel = await page.evaluate('window.__demo.engine.selection');
  const marqueeCommits = await page.evaluate('window.__demo.commits.length');
  check('marquee selects the three notes it covers', [...sel].sort().join() === 't3,t4,t5' && marqueeCommits === 0, sel);
  await page.evaluate('window.__demo.engine.setSelection([])');

  /* context loss: rebuilt, textures asked for again, same pixels */
  const lost = await page.evaluate(`(async () => {
    const d = window.__demo;
    const gl = document.getElementById('c').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_lose_context');
    let lost = 0, restored = 0;
    d.engine.on('contextlost', () => lost++);
    d.engine.on('contextrestored', () => restored++);
    const before = d.texturesSet;
    ext.loseContext();
    await new Promise(r => setTimeout(r, 200));
    ext.restoreContext();
    for (let i = 0; i < 100 && (d.texturesSet === before || d.texturesPending); i++) await new Promise(r => setTimeout(r, 50));
    await new Promise(r => setTimeout(r, 400));
    return { lost, restored, reRequested: d.texturesSet - before };
  })()`);
  const px2 = await page.evaluate(`window.__demo.readback(${JSON.stringify([P.board, P.note, P.hole, P.line])})`);
  check('context loss: restored, textures re-requested, same pixels', lost.lost === 1 && lost.restored === 1 && lost.reRequested > 0 && close(px2[0].slice(0, 3), hex(T.board), 10) && close(px2[1].slice(0, 3), hex(T.notes[3])) && px2[2][3] === 0 && close(px2[3].slice(0, 3), hex(T.line)), { ...lost, pixels: px2 });

  /* performance */
  await page.evaluate(`window.__demo.engine.fit({ x: 0, y: 0, w: 7200, h: 4500 }, { padding: 20 })`);
  await sleep(500);
  results.scenarios.overviewPan = await scenario(page, () => wheel(page, 120, { dy: 40, flip: 30 }));
  results.scenarios.overviewZoom = await scenario(page, () => wheel(page, 120, { dy: 5, ctrl: true, flip: 30 }));
  await page.evaluate(`window.__demo.engine.setCamera({ x: 1000, y: 800, zoom: 1 })`);
  await sleep(800);
  results.scenarios.workPan = await scenario(page, () => wheel(page, 120, { dx: 15, dy: 30, flip: 30 }));
  results.statsAfter = await page.evaluate('window.__demo.engine.stats()');
  if (SHOT) {
    // Extra views for a look: the work view with a selection, then the whole scene.
    await page.evaluate(`window.__demo.engine.setCamera({ x: 1000, y: 800, zoom: 1 }); window.__demo.engine.setSelection(['note-0'])`);
    const n0 = await page.evaluate(`(() => { const n = window.__demo.doc.get('note-0'); return window.__demo.engine.worldToScreen({ x: n.x, y: n.y }); })()`);
    await page.evaluate(`window.__demo.engine.setCamera({ x: window.__demo.doc.get('note-0').x - 600, y: window.__demo.doc.get('note-0').y - 400, zoom: 1.5 })`);
    await page.evaluate(`window.__demo.engine.setPeers([{ color: '#16a34a', cursor: { x: window.__demo.doc.get('note-0').x + 200, y: window.__demo.doc.get('note-0').y + 120 }, selection: ['note-1'] }])`);
    await sleep(400);
    void n0;
    fs.writeFileSync(SHOT.replace(/\.png$/, '-work.png'), Buffer.from((await page.cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await page.evaluate(`window.__demo.engine.fit({ x: 0, y: 0, w: 7200, h: 4500 }, { padding: 20 })`);
    await sleep(400);
    fs.writeFileSync(SHOT.replace(/\.png$/, '-overview.png'), Buffer.from((await page.cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  }
  const problems = page.problems.filter(p => !/favicon/.test(p));
  check('no page errors', problems.length === 0, problems.slice(0, 5));
} finally {
  await browser.close();
  server.close();
}

/* size */
const { WASM_BASE64 } = await import(path.join(root, 'packages/wasm-canvas/generated/bytes.js'));
const wasm = Buffer.from(WASM_BASE64, 'base64');
results.wasm = { rawBytes: wasm.length, gzipBytes: zlib.gzipSync(wasm, { level: 9 }).length, brotliBytes: zlib.brotliCompressSync(wasm).length };

console.log(JSON.stringify({ renderer: results.renderer, loadMs: results.loadMs, patchMs: results.patchMs, texturesMs: results.texturesMs, stats: results.statsAfter, scenarios: results.scenarios, wasm: results.wasm }, null, 2));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
