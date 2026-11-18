// Open a board authored in the original on-disk format through the installed type.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { findChrome, launch } from './lib/browser.mjs';
import { cli, run as runCli } from './lib/cli.mjs';
import { png, until } from './lib/http.mjs';
import { browserOff, fixtures, install, removeTmp, skipFor, tmpDir, typePath } from './lib/target.mjs';

const noBrowser = browserOff || !findChrome();
const pictureId = '0123456789abcdef0123456789abcdef';
const videoId = 'fedcba9876543210fedcba9876543210';
const bytes = png([34, 204, 117]);
const cell = '[data-wb-row="r2"][data-wb-col="c2"]';
const ready = 'document.querySelector(\'[aria-label="Board tools"]\')';
const webCardHref = 'https://example.org/diagram';
const localArtifactHref = 'open-artifact://artifact/art_0123456789';

describe('whiteboard', { skip: skipFor('whiteboard') }, () => {
  let run, root, url, browser;

  before(async () => {
    const { dir } = install(typePath('whiteboard'));
    const home = tmpDir('whiteboard-home');
    run = cli(dir, { HOME: home, OPEN_ARTIFACT_TYPE_SERVER_HOME: tmpDir('whiteboard-state') });
    root = tmpDir('whiteboard-board');
    const elements = {
      table1: { type: 'table', x: 0, y: 0, head: true, color: 'white', cols: { c1: { at: 1 }, c2: { at: 2 } },
        rows: { r1: { at: 1, c1: 'First', c2: 'Second' }, r2: { at: 2, c1: 'A', c2: 'B' } } },
      picture: { type: 'image', x: 350, y: 0, w: 130, h: 120, src: '_blob/' + pictureId, href: 'https://example.org/' },
      card: { type: 'link', x: 0, y: 160, href: webCardHref, title: 'Diagram', kind: 'whiteboard' },
      native: { type: 'link', x: 520, y: 180, href: localArtifactHref, title: 'Local board' },
      video: { type: 'image', x: 560, y: 0, w: 160, h: 100, src: '_blob/' + pictureId, video: '_blob/' + videoId },
      overlay: { type: 'shape', kind: 'rect', x: 550, y: -15, w: 60, h: 60, color: 'green', text: 'Top' },
      box: { type: 'shape', kind: 'database', x: 300, y: 180, w: 120, h: 90, text: 'Store', color: 'blue', by: 'agent' },
    };
    for (const sub of ['db/elements', 'db/board', '_blobs']) fs.mkdirSync(path.join(root, sub), { recursive: true });
    fs.writeFileSync(path.join(root, 'db/board/meta.json'), JSON.stringify({ v: 1, title: 'Editable diagram', order: Object.keys(elements) }));
    for (const [id, el] of Object.entries(elements)) fs.writeFileSync(path.join(root, 'db/elements', id + '.json'), JSON.stringify(el));
    fs.writeFileSync(path.join(root, '_blobs', pictureId), bytes);
    fs.writeFileSync(path.join(root, '_blobs', pictureId + '.json'), JSON.stringify({ name: 'diagram.png', contentType: 'image/png', bytes: bytes.length }));
    const movie = fs.readFileSync(path.join(fixtures, 'whiteboard/blue.webm'));
    fs.writeFileSync(path.join(root, '_blobs', videoId), movie);
    fs.writeFileSync(path.join(root, '_blobs', videoId + '.json'), JSON.stringify({ name: 'blue.webm', contentType: 'video/webm', bytes: movie.length }));
    ({ url } = await run.json(['open', root, '--type', 'whiteboard', '--json']));
    if (!noBrowser) browser = await launch({ width: 1200, height: 800 });
  });
  after(async () => {
    await browser?.close();
    await run?.run(['stop', root]);
    removeTmp();
  });

  it('checks the board and serves the original image bytes, MIME and ranges', async () => {
    const check = await run.run(['check', root, '--type', 'whiteboard']);
    assert.equal(check.code, 0, check.stdout + check.stderr);
    const image = new URL('/_blob/' + pictureId, url);
    const response = await fetch(image);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    const part = await fetch(image, { headers: { Range: 'bytes=0-7' } });
    assert.equal(part.status, 206);
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(0, 8));
  });

  for (const renderer of ['canvas', 'DOM']) {
    it(`edits a non-first cell, saves it, and reopens it with the ${renderer} renderer`, { skip: noBrowser }, async () => {
      const entry = new URL(url);
      if (renderer === 'DOM') entry.searchParams.set('open_artifact_engine', 'off');
      const p = await browser.load(entry.href, { ready });
      try {
        assert.ok(await p.waitFor(`document.querySelector('${cell}')`));
        if (renderer === 'canvas') assert.ok(await p.waitFor("document.querySelector('[data-wb-engine=on]')"));
        assert.equal(await p.evaluate("document.querySelector('#wb-card a').href"), webCardHref);
        assert.ok(await p.waitFor("document.querySelector('#wb-picture img')?.naturalWidth === 2"));
        const point = await p.evaluate(`(() => { const r = document.querySelector('${cell}').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
        await p.clickTimes(...point, 2);
        assert.ok(await p.waitFor(`document.querySelector('${cell} [contenteditable=true]')`, 3000), 'editor opens inside the clicked cell');
        await p.type(renderer);
        await p.press('Escape');
        const saved = () => JSON.parse(fs.readFileSync(path.join(root, 'db/elements/table1.json'))).rows.r2;
        assert.ok(await until(() => saved().c2.includes(renderer)));
        assert.equal(saved().c1, 'A');
        await p.cdp('Page.reload', {});
        assert.ok(await p.waitFor(`document.querySelector('${cell}')?.innerText.includes('${renderer}')`));
        assert.deepEqual(p.problems, []);
      } finally { await p.close(); }
    });
  }

  it('plays and pauses an imported video from the canvas', { skip: noBrowser }, async () => {
    const p = await browser.load(url, { ready });
    try {
      assert.ok(await p.waitFor("document.querySelector('.wb-live-layer #wb-overlay')"));
      const top = await p.evaluate(`(() => {
        const r = document.querySelector('#wb-overlay').getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-wb-id]')?.dataset.wbId;
      })()`);
      assert.equal(top, 'overlay', 'a shape in front of the video still receives the press');
      const play = '#wb-video [data-video-play]';
      assert.ok(await p.waitFor(`document.querySelector('${play}')`));
      const point = await p.evaluate(`(() => {const r = document.querySelector('${play}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];})()`);
      await p.click(...point);
      assert.ok(await p.waitFor("document.querySelector('#wb-video video')?.currentTime > 0.65"));
      await p.click(...point);
      assert.ok(await p.waitFor("document.querySelector('#wb-video video')?.paused === true", 3000));
    } finally { await p.close(); }
  });

  describe('global frame shell', { skip: noBrowser }, () => {
    let daemon, shellUrl, downloads, shellRoot, previous;

    before(async () => {
      const home = tmpDir('whiteboard-shell-home');
      downloads = path.join(home, 'Downloads');
      const env = {
        HOME: home,
        OPEN_ARTIFACT_HOME: path.join(home, 'daemon'),
        OPEN_ARTIFACT_USER_TYPES: path.join(home, 'types'),
        OPEN_ARTIFACT_TYPE_SERVER_HOME: path.join(home, 'servers'),
      };
      previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
      Object.assign(process.env, env);
      const { startDaemon } = await import('../packages/daemon/src/daemon.ts');
      daemon = await startDaemon({ port: 0, idleMs: 0, quiet: true, browse: null, builtinTypesDir: path.dirname(typePath('whiteboard')) });
      shellRoot = tmpDir('whiteboard-shell-board');
      for (const folder of ['db', '_blobs']) fs.cpSync(path.join(root, folder), path.join(shellRoot, folder), { recursive: true });
      const board = daemon.store.create({ root: shellRoot, type: 'whiteboard', title: 'Editable diagram' });
      shellUrl = daemon.viewUrl(board.id);
    });
    after(async () => {
      try { await daemon?.close(); } finally {
        for (const [key, value] of Object.entries(previous ?? {})) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

    it('opens sharing and downloads PNG and portable JSON from Share → Export', async () => {
      const p = await browser.load(shellUrl, { ready });
      try {
        const exportFromShell = async label => {
          await p.evaluate("document.querySelector('button[aria-label=Share]').click()");
          assert.ok(await p.waitFor("document.body.innerText.includes('Only this computer') && document.body.innerText.includes('Invite links')"));
          await p.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Export').click()");
          const row = `document.querySelector('[data-export-row="${label}"]')`;
          assert.ok(await p.waitFor(row + '?.disabled === false'));
          await p.evaluate(row + '.click()');
        };
        await exportFromShell('PNG image');
        const name = () => fs.existsSync(downloads) && fs.readdirSync(downloads).find(f => f.endsWith('.png'));
        assert.ok(await until(name, 15000), 'a PNG reached the download folder');
        const file = fs.readFileSync(path.join(downloads, name()));
        assert.equal(file.subarray(1, 4).toString(), 'PNG');
        assert.ok(file.readUInt32BE(16) > 350 && file.readUInt32BE(20) > 160);
        const samples = await p.evaluate(`(async () => {
          const img = new Image();
          img.src = 'data:image/png;base64,${file.toString('base64')}';
          await img.decode();
          const ctx = new OffscreenCanvas(img.width, img.height).getContext('2d');
          ctx.drawImage(img, 0, 0);
          const { data } = ctx.getImageData(0, 0, img.width, img.height);
          let count = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] === 34 && data[i + 1] === 204 && data[i + 2] === 117) count++;
          }
          return count;
        })()`);
        assert.ok(samples > 10, 'the exported board contains the pixels of the original upload');
        await exportFromShell('Board file');
        const filename = path.join(downloads, 'Editable diagram.json');
        assert.ok(await until(() => fs.existsSync(filename), 15000));
        const exported = JSON.parse(fs.readFileSync(filename));
        assert.equal(exported.format, 'open-artifact-whiteboard');
        const embedded = exported.items.find(el => el.id === 'picture').src;
        assert.ok(embedded.startsWith('data:image/'));
        assert.equal(await p.evaluate(`(async () => {
          const img = new Image(); img.src = ${JSON.stringify(embedded)}; await img.decode(); return img.naturalWidth;
        })()`), 2);
        assert.equal(exported.items.find(el => el.id === 'video').video, undefined);
        assert.deepEqual(p.problems, []);
      } finally { await p.close(); }
    });

    it('routes the board shortcut through the shell and keeps download out of the zoom menu', async () => {
      const p = await browser.load(shellUrl, { ready });
      try {
        await p.evaluateAll("document.querySelector('.wb-foot') && document.querySelector('button[aria-label^=Zoom]').click()");
        const shortcuts = "[...document.querySelectorAll('[role^=menuitem]')].find(e => e.textContent.includes('Single-key tool shortcuts'))";
        assert.ok(await p.waitFor(shortcuts));
        assert.ok(await p.waitFor("document.querySelector('.wb-foot [aria-label=Select]') && !document.body.innerText.includes('Download board')"));
        await p.evaluateAll(shortcuts + '?.click()');
        await p.click(420, 320);
        await p.evaluate(`addEventListener('message', e => {
          if (e.source === document.querySelector('iframe').contentWindow && e.data?.openArtifact === 'request_comment_mode') window.requestedOn = e.data.on;
        })`);
        await p.type('c');
        assert.ok(await p.waitFor("window.requestedOn === true && document.querySelector('button[aria-label=Comments]')?.getAttribute('aria-pressed') === 'true'"));
        assert.ok(await p.waitFor("document.querySelector('.wb-surface.wb-commenting')"));
      } finally { await p.close(); }
    });

    it('creates a pinned comment from the header and reads it in the global comments list', async () => {
      const p = await browser.load(shellUrl, { ready });
      try {
        const toggle = "document.querySelector('button[aria-label=Comments]')";
        assert.ok(await p.waitFor(toggle));
        assert.ok(await p.waitFor("document.querySelector('.wb-foot') && !document.querySelector('button[aria-label=Comment]')"));
        await p.evaluate(toggle + '.click()');
        assert.ok(await p.waitFor("document.querySelector('.wb-surface.wb-commenting')"));
        await p.click(420, 320);
        const layer = "document.querySelector('[data-comment-layer]')?.shadowRoot";
        assert.ok(await p.waitFor(layer + "?.querySelector('textarea')"));
        await p.type('Review this spot');
        await p.press('Enter');
        assert.ok(await until(() => fs.existsSync(path.join(shellRoot, 'comments.json')) && fs.readFileSync(path.join(shellRoot, 'comments.json'), 'utf8').includes('Review this spot')));
        await p.evaluate("document.querySelector('button[aria-label=\"Comment options\"]').click()");
        const list = "[...document.querySelectorAll('[role=menuitem]')].find(e => e.textContent.includes('Show all comments'))";
        assert.ok(await p.waitFor(list));
        assert.match(await p.evaluate(list + '.textContent'), /1/);
        await p.evaluate(list + '.click()');
        assert.ok(await p.waitFor("document.querySelector('[data-comments-panel-layer]')?.shadowRoot?.textContent.includes('Review this spot')"));
        assert.deepEqual(p.problems, []);
      } finally { await p.close(); }
    });

    it('places zoom beside the toolbar and above it when space runs out', async () => {
      const p = await browser.load(shellUrl, { ready });
      try {
        assert.ok(await p.waitFor(`document.querySelector('#wb-native a')?.href === '${daemon.origin}/a/art_0123456789'`));
        const layout = test => `(() => {
          const c = document.querySelector('.wb-corner-zoom')?.getBoundingClientRect();
          const f = document.querySelector('.wb-foot')?.getBoundingClientRect();
          return c && f && (${test});
        })()`;
        assert.ok(await p.waitFor(layout('c.left >= f.right && Math.abs(c.bottom - f.bottom) < 2'), 5000), 'zoom follows the available toolbar space');
        await p.evaluate("document.querySelector('iframe').style.width = '400px'");
        assert.ok(await p.waitFor(layout('c.bottom <= f.top - 6 && c.right <= 400'), 3000), 'zoom follows the available toolbar space');
      } finally { await p.close(); }
    });
  });

  it('recovers after an interrupted load and restores pictures on request', { skip: noBrowser }, async () => {
    const p = await browser.load(url, { ready });
    try {
      // Seed the marker only after the previous healthy load has released ownership. That takes 5 s of frames with no
      // gap over 2 s, and a frame stall on a busy machine (another suite running) starts the count again.
      assert.ok(await p.waitFor("!localStorage.getItem('wb-load:' + location.pathname)", 30000));
      await p.evaluate("localStorage.setItem('wb-load:' + location.pathname, '1')");
      await p.cdp('Page.reload', {});
      assert.ok(await p.waitFor("document.querySelector('#wb-picture.wb-paused-media')"));
      assert.equal(await p.evaluate("document.querySelector('#wb-picture img')"), null);
      await p.evaluate("window.recoveredInPlace = true; document.querySelector('.wb-recovery button').click()");
      assert.ok(await p.waitFor("document.querySelector('#wb-picture img')?.naturalWidth === 2"));
      assert.equal(await p.evaluate("Boolean(document.querySelector('.wb-recovery'))"), false);
      assert.equal(await p.evaluate('window.recoveredInPlace'), true);
    } finally { await p.close(); }
  });
  it('pastes a local artifact link as a card and syncs undo and redo to another tab', { skip: noBrowser }, async () => {
    const writer = await browser.load(url, { ready });
    const reader = await browser.load(url, { ready });
    try {
      const count = "document.querySelectorAll('[data-wb-type=link]').length";
      const before = await reader.evaluate(count);
      const transfer = `const d = new DataTransfer(); d.setData('text/plain', ${JSON.stringify(localArtifactHref)});`;
      await writer.evaluate(`(() => { ${transfer} document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: d })); })()`);
      assert.ok(await reader.waitFor(`${count} === ${before + 1}`, 5000));
      const mod = process.platform === 'darwin' ? { meta: true } : { ctrl: true };
      await writer.press('z', mod);
      assert.ok(await reader.waitFor(`${count} === ${before}`, 5000));
      await writer.press('z', { ...mod, shift: true });
      assert.ok(await reader.waitFor(`${count} === ${before + 1}`, 5000));
    } finally { await writer.close(); await reader.close(); }
  });

  it('shares a running and paused timer across two tabs', { skip: noBrowser }, async () => {
    const first = await browser.load(url, { ready });
    const second = await browser.load(url, { ready });
    try {
      await first.evaluate("document.querySelector('[data-wb-timer] button').click()");
      assert.ok(await first.waitFor("document.querySelector('button[aria-label=Start]')"));
      await first.evaluate("document.querySelector('button[aria-label=Start]').click()");
      assert.ok(await second.waitFor("document.querySelector('[data-wb-clock=running]')"));
      await second.evaluate("document.querySelector('[data-wb-clock=running]').click()");
      assert.ok(await second.waitFor("document.querySelector('button[aria-label=Pause]')"));
      await second.evaluate("document.querySelector('button[aria-label=Pause]').click()");
      assert.ok(await first.waitFor("document.querySelector('[data-wb-clock=held]')"));
    } finally { await first.close(); await second.close(); }
  });

  it('places a section from the Shapes tray using touch', { skip: noBrowser }, async () => {
    const p = await browser.load(url, { ready });
    const tap = async (x, y) => {
      await p.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await p.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const button = async label => {
      const selector = `button[aria-label="${label}"]`;
      assert.ok(await p.waitFor(`document.querySelector('${selector}')`, 3000));
      assert.ok(await p.waitFor(`(() => {const b=document.querySelector('${selector}'); const r=b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`, 3000));
      const point = await p.evaluate(`(() => {const r = document.querySelector('${selector}').getBoundingClientRect(); return [r.x+r.width/2,r.y+r.height/2];})()`);
      await tap(...point);
    };
    try {
      await p.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 740, deviceScaleFactor: 2, mobile: true });
      await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      assert.ok(await p.waitFor("matchMedia('(pointer: coarse) and (max-width:599px)').matches"));
      await p.cdp('Page.reload', {});
      assert.ok(await p.waitFor(ready));
      await button('Shapes');
      await button('Section');
      await tap(112, 225);
      const sections = () => fs.readdirSync(path.join(root, 'db/elements')).filter(n =>
        JSON.parse(fs.readFileSync(path.join(root, 'db/elements', n))).type === 'container');
      assert.ok(await until(() => sections().length > 0));
      assert.deepEqual(p.problems, []);
    } finally { await p.close(); }
  });

  // Opt in with the published reference CLI path. The normal suite has no dependency on another checkout.
  const reference = process.env.E2E_WHITEBOARD_REFERENCE;
  it('exchanges an editable shape in both directions with the reference editor', { skip: noBrowser || !reference }, async () => {
    const referenceRoot = tmpDir('whiteboard-reference-board');
    fs.cpSync(path.join(root, 'db'), path.join(referenceRoot, 'db'), { recursive: true });
    fs.cpSync(path.join(root, '_blobs'), path.join(referenceRoot, '_blobs'), { recursive: true });
    const env = { ...process.env, HOME: tmpDir('whiteboard-reference-home') };
    const refCli = args => runCli(reference, args, { env, cwd: referenceRoot });
    const opened = await refCli(['open', referenceRoot]);
    assert.equal(opened.code, 0, opened.stderr);
    let original, current;
    const exchange = async (from, to, destination) => {
      const label = "[...document.querySelectorAll('.wb-shape')].find(e => e.textContent.includes('Store'))";
      assert.ok(await from.waitFor(label));
      const point = await from.evaluate(`(() => {const r = (${label}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];})()`);
      await from.click(...point);
      const html = await from.evaluate(`(() => {const d = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', {bubbles: true, clipboardData: d})); return d.getData('text/html');})()`);
      assert.match(html, /data-appifact-object=/);
      const stores = () => fs.readdirSync(destination).map(n => JSON.parse(fs.readFileSync(path.join(destination, n)))).filter(el => el.type === 'shape' && el.text === 'Store').length;
      const before = stores();
      await to.evaluate(`(() => {const d = new DataTransfer(); d.setData('text/html', ${JSON.stringify(html)}); document.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, clipboardData: d}));})()`);
      assert.ok(await until(() => stores() === before + 1), 'the pasted shape reached the destination board');
    };
    try {
      original = await browser.load(opened.json.url, { ready });
      current = await browser.load(url, { ready });
      await exchange(original, current, path.join(root, 'db/elements'));
      await exchange(current, original, path.join(referenceRoot, 'db/elements'));
    } finally { await current?.close(); await original?.close(); await refCli(['stop', referenceRoot]); }
  });
});
