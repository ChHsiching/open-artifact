// End-to-end tests of the sheets type: update and read on a folder with no server (a read there is refused, a
// first update makes the Sheet), refusals as JSON on stderr, check, export to Excel and CSV, then open: the page shows the workbook, an
// update sent while it is open reaches it at once, a chart made with batch is drawn in its frame, comments, and stop.
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { until } from './lib/http.mjs';
import { after, before, describe, it } from 'node:test';
import { launch } from './lib/browser.mjs';
import { cli } from './lib/cli.mjs';
import { browserOff, install, removeTmp, tmpDir, typePath } from './lib/target.mjs';

const T = { timeout: 90000 };
const TYPE = 'sheets';

function skip() {
  const dir = typePath(TYPE);
  if (!fs.existsSync(path.join(dir, 'SKILL.md'))) return `${TYPE} is not in ${dir}`;
  const missing = ['scripts/cli.mjs', 'scripts/sheets.wasm', 'scripts/editors/sheets/index.html', 'scripts/editors/sheets/assets/chart-frame.txt'].filter(f => !fs.existsSync(path.join(dir, f)));
  return missing.length ? `${TYPE} is not built (npm run build): no ${missing.join(', ')}` : false;
}

const edits = (base, list) => JSON.stringify({ kind: 'applyEdits', base, edits: list });
const refusalOf = out => JSON.parse(out.stderr.trim().split('\n').pop()).data.refusal;
const formulaBar = `document.querySelector('textarea[aria-label="Formula bar"]')`;

describe(TYPE, { skip: skip() }, () => {
  const ctx = {};

  before(() => {
    const { dir } = install(typePath(TYPE), TYPE);
    ctx.cli = cli(dir, {
      OPEN_ARTIFACT_TYPE_SERVER_HOME: path.join(tmpDir('sheets-state'), 'state'),
      HOME: tmpDir('sheets-home'),
      OPEN_ARTIFACT_USER: 'E2E',
    });
    ctx.root = path.join(tmpDir('sheets-root'), 'budget');
    fs.mkdirSync(ctx.root, { recursive: true });
  });

  after(async () => {
    await ctx.browserPromise?.then(b => b.close()).catch(() => {});
    await ctx.cli?.run(['stop']).catch(() => {});
    removeTmp();
  });

  it('a read on a folder with no Sheet says to start it with an update', T, async () => {
    const out = await ctx.cli.run(['read', ctx.root]);
    assert.notEqual(out.code, 0);
    assert.match(out.stdout + out.stderr, /NOT_A_SHEET/);
    assert.ok(!fs.existsSync(path.join(ctx.root, 'sheet')));
  });

  it('a first update makes a Sheet of one blank sheet, Sheet1, and applies its edits to it', T, async () => {
    const out = await ctx.cli.json(['update', ctx.root, edits(1, [
      { kind: 'renameSheet', sheet: 'Sheet1', name: 'Budget' },
      { kind: 'writeCells', sheet: 'Budget', topLeft: 'A1', rows: [['Item', 'Cost'], ['Rent', 1200], ['Food', 300], ['Total', '=SUM(B2:B3)']] },
    ])]);
    assert.equal(out.revision, 2);
    assert.ok(fs.existsSync(path.join(ctx.root, 'sheet', 'sheet.json')));
    const info = await ctx.cli.json(['info', ctx.root, '--json']);
    assert.deepEqual([info.revision, info.title], [2, 'Untitled sheet']);
    const sheets = await ctx.cli.json(['read', ctx.root]);
    assert.deepEqual(sheets.sheets.map(s => s.name), ['Budget']);
  });

  it('read gives what cells hold: values, and formulas with what they work out to', T, async () => {
    const cells = await ctx.cli.json(['read', ctx.root, JSON.stringify({ kind: 'readCells', sheet: 'Budget', range: 'A1:B4' })]);
    assert.deepEqual(cells.rows['2'], ['Rent', 1200]);
    assert.deepEqual(cells.rows['4'], ['Total', { formula: '=SUM(B2:B3)', value: 1500 }]);
  });

  it('formats go in and read back as formatCells takes them', T, async () => {
    await ctx.cli.json(['update', ctx.root, edits(2, [{ kind: 'formatCells', sheet: 'Budget', ranges: ['B2:B4'], format: { numberFormat: { pattern: '$#,##0.00' } } }])]);
    const read = await ctx.cli.json(['read', ctx.root, JSON.stringify({ kind: 'readCellFormats', sheet: 'Budget', range: 'B2:B4' })]);
    assert.ok(read.formats.some(f => f.format.numberFormat?.pattern === '$#,##0.00'), JSON.stringify(read));
  });

  it('a stale base, an unknown edit and an unknown key are refused with JSON on stderr, writing nothing', T, async () => {
    const stale = await ctx.cli.run(['update', ctx.root, edits(1, [{ kind: 'addSheet', name: 'Late' }])]);
    assert.equal(stale.code, 1);
    assert.equal(refusalOf(stale), 'baseIsNotTheRevision');
    const unknown = await ctx.cli.run(['update', ctx.root, edits(3, [{ kind: 'paintCells', sheet: 'Budget' }])]);
    assert.equal(unknown.code, 1);
    assert.equal(refusalOf(unknown), 'unreadableEdit');
    const extra = await ctx.cli.run(['update', ctx.root, edits(3, [{ kind: 'addSheet', name: 'X', color: 'red' }])]);
    assert.equal(extra.code, 1);
    const info = await ctx.cli.json(['info', ctx.root, '--json']);
    assert.equal(info.revision, 3);
  });

  it('check passes the Sheet', T, async () => {
    const out = await ctx.cli.json(['check', ctx.root, '--json']);
    assert.equal(out.type, TYPE);
    assert.deepEqual(out.findings, []);
  });

  it('export writes an Excel file and a CSV of one sheet with the worked-out values', T, async () => {
    const xlsx = await ctx.cli.json(['export', ctx.root]);
    assert.match(xlsx.file, /\.xlsx$/);
    assert.equal(fs.readFileSync(xlsx.file).subarray(0, 2).toString(), 'PK');
    const csv = await ctx.cli.json(['export', ctx.root, '--csv', '--sheet', 'Budget']);
    assert.equal(fs.readFileSync(csv.file, 'utf8').trim().split(/\r?\n/).join('|'), 'Item,Cost|Rent,"$1,200.00"|Food,$300.00|Total,"$1,500.00"');
  });

  it('open serves the page, and an update while it is open reaches it at once', T, async () => {
    const opened = await ctx.cli.json(['open', ctx.root, '--json']);
    assert.equal(opened.type, TYPE);
    const again = await ctx.cli.json(['open', ctx.root, '--json']);
    assert.equal(again.url, opened.url, 'open again gave another address');
    const response = await fetch(opened.url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /__OPEN_ARTIFACT_BOOT__/);
    if (browserOff) return;
    ctx.browserPromise ??= launch();
    const page = await (await ctx.browserPromise).load(opened.url, { ready: `document.querySelector('[role=grid][aria-label="Budget"]') !== null && ${formulaBar}?.value === 'Item'`, settle: 800, ignore: [/\/favicon\.ico$/] });
    try {
      assert.ok(await page.waitFor(`${formulaBar}?.value === 'Item'`, 1000), 'the page does not show Budget with A1 selected');
      await ctx.cli.json(['update', ctx.root, edits(3, [{ kind: 'writeCells', sheet: 'Budget', topLeft: 'A1', rows: [['Line']] }])]);
      assert.ok(await page.waitFor(`${formulaBar}?.value === 'Line'`, 10000), 'the open page did not get the update');
      await page.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      assert.ok(await page.waitFor(`(() => {
        const picker = document.querySelector('[aria-label="All sheets"]')?.getBoundingClientRect();
        const tab = document.querySelector('[role="tab"]')?.getBoundingClientRect();
        return picker?.width === 52 && picker.height === 32 && tab?.height === 32;
      })()`), 'the sheet picker and tabs should use the touch layout');
      assert.deepEqual(page.problems, []);
    } finally {
      await page.close();
    }
  });

  it('a chart made with batch is drawn in its sandboxed frame on the open page', T, async () => {
    const code = "export default () => <sheet.Visualize data-component='costs' sources={{rows:{kind:'ref', ref:'input/rows', adapter:{kind:'cells'}}, chartSize:{kind:'data', data:[{width:320, height:200}]}}}>{({rows, chartSize}) => { const {width, height} = chartSize.at(0); const body = rows.slice(1).filter(r => typeof r.at(1).value === 'number'); const most = Math.max(1, ...body.map(r => r.at(1).value)); const band = width / Math.max(1, body.length); return <svg width='320' height='200' viewBox={`0 0 ${width} ${height}`} role='img' aria-label='Costs'>{body.map((r, i) => <Tooltip key={i} content={r.at(0).text} detail={r.at(1).text}><rect x={i * band + 4} y={height - height * r.at(1).value / most} width={band - 8} height={height * r.at(1).value / most} fill='var(--chart-categorical-1)'/></Tooltip>)}</svg>; }}</sheet.Visualize>;";
    const file = path.join(tmpDir('sheets-chart'), 'chart.json');
    fs.writeFileSync(file, JSON.stringify([
      { $lid: 'w', verb: 'create', payload: { code } },
      { verb: 'update', payload: { kind: 'applyEdits', base: 4, edits: [{ kind: 'addChart', chart: { name: 'Costs', caption: '', widget: '$lid:w', inputs: [{ name: 'rows', cells: { sheet: 'Budget', range: 'A1:B3' } }], sheet: 'Budget', topLeft: 'D1', widthInPixels: 320, heightInPixels: 200 } }] } },
    ]));
    const out = await ctx.cli.json(['batch', ctx.root, file]);
    assert.equal(out.acks[0].outcome, 'published', JSON.stringify(out));
    assert.equal(out.acks[1].data.revision, 5);
    const charts = await ctx.cli.json(['read', ctx.root, JSON.stringify({ kind: 'readCharts', sheet: 'Budget' })]);
    assert.equal(charts.charts.length, 1);
    if (browserOff) return;
    const opened = await ctx.cli.json(['open', ctx.root, '--json']);
    ctx.browserPromise ??= launch();
    const page = await (await ctx.browserPromise).load(opened.url, { ready: `document.querySelector('[role=grid][aria-label="Budget"]') !== null`, settle: 800, ignore: [/\/favicon\.ico$/] });
    try {
      assert.ok(await page.waitFor(`document.querySelector('iframe.sheet-chart-frame[data-is-on-show="true"]') !== null`, 20000), 'the chart was not drawn');
      assert.equal((await page.evaluateAll(`document.querySelector('iframe.sheet-chart-frame')?.getAttribute('sandbox')`)).find(Boolean), 'allow-scripts');
      assert.deepEqual(page.problems, []);
    } finally {
      await page.close();
    }
  });

  it('hands an Excel upload to a listening agent and removes a declined upload', T, async () => {
    const root = tmpDir('sheets-import');
    const opened = await ctx.cli.json(['open', root, '--type', 'sheets', '--json']);
    await ctx.cli.json(['update', root, edits(1, [{ kind: 'writeCells', sheet: 'Sheet1', topLeft: 'A1', rows: [['Costs'], [24]] }])]);
    const exported = await ctx.cli.json(['export', root]);
    const bytes = fs.readFileSync(exported.file);
    const upload = async () => {
      const response = await fetch(new URL('_api/sheet/import?name=Costs.xlsx', opened.url), { method: 'POST', body: bytes });
      assert.equal(response.status, 200);
      return response.json();
    };
    const declined = await upload();
    assert.equal(declined.sentToAgent, false);
    assert.equal(fs.existsSync(path.join(root, declined.path)), false);
    const waiter = await ctx.cli.start(['wait', root, '--timeout', '12'], { firstLine: false });
    try {
      assert.ok(await until(() => fs.existsSync(path.join(root, '_agent', 'waiting'))));
      const reply = await upload();
      assert.equal(reply.sentToAgent, true);
      assert.deepEqual(fs.readFileSync(path.join(root, reply.path)), bytes);
      assert.equal((await waiter.exited).code, 0);
      assert.match(waiter.stdout(), /sheet\/imports\/Costs\.xlsx/);
    } finally { waiter.child.kill(); }
  });

  it('publishes the selected cell to the agent, and follows a guest editing over HTTP', {
    ...T, skip: browserOff || !Object.values(os.networkInterfaces()).flat().some(nic => nic?.family === 'IPv4' && !nic.internal),
  }, async () => {
    const root = path.join(tmpDir('sheets-coedit'), 'book');
    const opened = await ctx.cli.json(['open', root, '--type', 'sheets', '--json']);
    const browser = await (ctx.browserPromise ??= launch());
    const grid = "document.querySelector('[role=gridcell]')";
    const owner = await browser.load(opened.url, { ready: grid, ignore: [/\/favicon\.ico$/] });
    let guest;
    const frame = "document.querySelector('iframe[name=open-artifact-shell]')";
    const click = async (page, expr, inSheet = true) => {
      assert.ok(await page.waitFor(expr, 8000), expr);
      const point = await page.evaluate(`(() => {
        const frame = ${frame};
        const element = (document => ${expr})(${inSheet ? 'frame.contentDocument' : 'document'});
        const box = element.getBoundingClientRect(), offset = frame.getBoundingClientRect();
        return [box.x + box.width/2 + ${inSheet ? 'offset.x' : '0'}, box.y + box.height/2 + ${inSheet ? 'offset.y' : '0'}];
      })()`);
      await page.click(...point);
    };
    try {
      await click(owner, "document.querySelector('button[aria-label=Share]')", false);
      await click(owner, "document.querySelector('[aria-label=\"General access\"]')", false);
      await click(owner, "[...document.querySelectorAll('[data-share-menu] [role^=menuitem]')].find(el => el.textContent.includes('Anyone on your network'))", false);
      assert.ok(await owner.waitFor("document.querySelector('[data-share-dot]')"));
      const { links } = await (await fetch(new URL('_api/frame/share', opened.url))).json();
      await owner.press('Escape');
      guest = await browser.load(links.editor.url, { ready: 'document.querySelector("form input[name=name]")', ignore: [/\/favicon\.ico$/] });
      await guest.evaluate(`(() => { const form = document.querySelector('form'); form.elements.name.value = 'Sheet guest'; form.submit() })()`);
      assert.ok(await guest.waitFor("document.querySelector('iframe[name=open-artifact-shell]')"));
      assert.equal(await guest.evaluate("fetch('_api/frame/share').then(r => r.status)"), 403);
      await click(guest, grid);
      await guest.type('Guest edit');
      await guest.press('Enter');
      assert.ok(await until(async () => {
        const answer = await ctx.cli.json(['read', root, JSON.stringify({ kind: 'readCells', sheet: 'Sheet1', range: 'A1' })]);
        return answer.rows[1]?.[0] === 'Guest edit';
      }), 'guest edit was not saved');
      for (let i = 0; i < 64; i++) await guest.press('ArrowDown');
      await owner.press('Escape');
      await click(owner, grid);
      await owner.press('ArrowRight');
      assert.ok(await until(async () => (await ctx.cli.json(['context', root, '--json'])).context?.activeCell === 'B1'), 'owner selection was not published');
      const row66 = "[...document.querySelectorAll('[role=rowheader]')].some(el => el.textContent.trim() === '66')";
      assert.ok(!(await owner.evaluateAll(row66)).includes(true));
      await click(owner, `document.querySelector('.sheet-peers-overlay [aria-label^="People here"]')`);
      await click(owner, `document.querySelector('[aria-label="Follow Sheet guest"]:not(:disabled)')`);
      assert.ok(await owner.waitFor(row66, 5000), 'following did not scroll to the guest');
      const note = "document.querySelector('.sheet-peers-overlay [role=status]')";
      assert.ok(await owner.waitFor(note + "?.textContent.includes('Following Sheet guest')"));
      await owner.press('Escape');
      assert.ok(await owner.waitFor("document.querySelector('[role=grid]') && " + note + ' === null'));
      assert.deepEqual(owner.problems, []);
    } finally {
      await guest?.close();
      await owner.close();
      await ctx.cli.json(['share', root, '--off', '--json']);
    }
  });

  it('takes a snapshot after the workbook is visible without changing the active selection', { ...T, skip: browserOff }, async () => {
    const { createTypeServer } = await import('../packages/type-server/src/server.ts');
    const root = tmpDir('sheets-snapshot');
    await ctx.cli.json(['update', root, edits(1, [{ kind: 'writeCells', sheet: 'Sheet1', topLeft: 'A1', rows: [['Snapshot cell']] }])]);
    const secret = 'sheet-camera-test';
    const server = createTypeServer({ assetsDir: path.join(typePath(TYPE), 'scripts'), types: [TYPE], secret, idleMs: 0, log: () => {} });
    try {
      await server.listen();
      const opened = await server.open({ root, type: TYPE });
      const context = path.join(root, '_agent', 'view-context.json');
      fs.mkdirSync(path.dirname(context), { recursive: true });
      const selection = JSON.stringify({ context: { activeCell: 'B2' } });
      fs.writeFileSync(context, selection);
      const response = await fetch(new URL('/__open-artifact/actions/snapshot', opened.url), {
        method: 'POST', headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
        body: JSON.stringify({ id: opened.id, root, args: { width: 800, height: 600 } }),
      });
      const result = await response.json();
      assert.ok(response.ok, JSON.stringify(result));
      const png = fs.readFileSync(result.image);
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), 800);
      assert.equal(fs.readFileSync(context, 'utf8'), selection);
    } finally { await server.stop(); }
  });

  it('shares, downloads both formats and posts a cell comment through the global frame', { ...T, skip: browserOff }, async () => {
    const browser = await (ctx.browserPromise ??= launch());
    const overrides = {
      HOME: tmpDir('sheets-shell-home'),
      OPEN_ARTIFACT_HOME: tmpDir('sheets-daemon'),
      OPEN_ARTIFACT_TYPE_SERVER_HOME: tmpDir('sheets-shell-state'),
      OPEN_ARTIFACT_USER_TYPES: tmpDir('sheets-user-types'),
      OPEN_ARTIFACT_BROWSER: 'none',
    };
    const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    let daemon, shell;
    try {
      const { startDaemon } = await import('../packages/daemon/src/daemon.ts');
      const { api, readDaemon } = await import('../packages/daemon/src/client.ts');
      daemon = await startDaemon({ port: 0, quiet: true, idleMs: 0, builtinTypesDir: path.dirname(typePath(TYPE)) });
      const state = await readDaemon();
      const made = await api(state, 'tools.call', {
        name: 'Artifact', arguments: { action: 'publish', type_url: 'open-artifact://type/sheets', title: 'Frame workbook' },
        caller: { harness: 'e2e', session: 'sheet-frame', workspace: tmpDir('sheets-workspace') },
      });
      assert.equal(made.error, undefined, JSON.stringify(made));
      const id = made.url.split('/').at(-1);
      const root = daemon.store.require(id).root;
      await ctx.cli.json(['update', root, edits(1, [{ kind: 'writeCells', sheet: 'Sheet1', topLeft: 'A1', rows: [['Item', 'Price'], ['Book', 4]] }, { kind: 'addSheet', name: 'Archive' }])]);
      shell = await browser.load(state.url + '/a/' + id, { ready: "document.querySelector('[role=gridcell]')?.textContent === 'Item'" });
      const click = async expr => {
        assert.ok(await shell.waitFor(expr, 5000), expr + ' ' + await shell.evaluate('document.body.innerText'));
        const point = await shell.evaluate(`(() => { const r = (${expr}).getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2] })()`);
        await shell.click(...point);
      };
      const share = "document.querySelector('button[aria-label=Share]')";
      const textButton = label => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
      await click(share);
      await click("document.querySelector('[aria-label=\"General access\"]')");
      await click("[...document.querySelectorAll('[data-share-menu] [role^=menuitem]')].find(el => el.textContent.includes('Anyone on your network'))");
      assert.ok(await shell.waitFor("document.querySelector('[data-share-dot]')"), 'sharing was not enabled');
      await click("document.querySelector('[aria-label=\"General access\"]')");
      await click("[...document.querySelectorAll('[data-share-menu] [role^=menuitem]')].find(el => el.textContent.includes('Only this computer'))");
      assert.ok(await shell.waitFor("!document.querySelector('[data-share-dot]')"));
      const downloads = path.join(overrides.HOME, 'Downloads');
      for (const [label, suffix] of [['Excel', '.xlsx'], ['CSV', '.csv']]) {
        if (label === 'CSV') await click(share);
        await click(textButton('Export'));
        await click(`document.querySelector('[data-export-row="${label}"]')`);
        const file = () => fs.existsSync(downloads) && fs.readdirSync(downloads).find(f => f.endsWith(suffix));
        assert.ok(await until(file), label + ' was not downloaded');
        const saved = path.join(downloads, file());
        if (label === 'CSV') assert.equal(fs.readFileSync(saved, 'utf8').trim(), 'Item,Price\r\nBook,4');
        else {
          const { execFileSync } = await import('node:child_process');
          const output = await ctx.cli.json(['export', root]);
          for (const part of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml']) {
            const extract = file => execFileSync('unzip', ['-p', file, part], { encoding: 'utf8' });
            assert.equal(extract(saved), extract(output.file));
          }
        }
      }
      await click("document.querySelector('[data-comments-button] button[aria-label=Comments]')");
      assert.ok(await shell.waitFor("document.documentElement.hasAttribute('data-comment-mode')"));
      const [offsetX, offsetY] = await shell.evaluate("(() => {const r = document.querySelector('iframe').getBoundingClientRect(); return [r.x, r.y]})()");
      const points = await shell.evaluateAll("(() => {const r = document.querySelector('[role=gridcell]')?.getBoundingClientRect(); return r && [r.x+r.width/2, r.y+r.height/2]})()");
      const [x, y] = points.find(Array.isArray);
      await shell.click(x + offsetX, y + offsetY);
      assert.ok(await shell.waitFor("[...document.querySelectorAll('[data-comments-layer]')].some(layer => layer.shadowRoot?.querySelector('[data-cds=CommentComposer] textarea'))", 5000));
      await shell.type('Check this price');
      await shell.press('Enter');
      assert.ok(await until(async () => (await ctx.cli.json(['comments', root, '--json'])).threads.some(thread =>
        thread.messages.some(m => m.text === 'Check this price') && thread.where.includes('A1'))), 'cell comment was not saved at A1');
      await shell.press('Escape');
      const nextTab = "[...document.querySelectorAll('[role=tab]')].find(tab => (tab.ariaLabel ?? '').includes('Archive') || tab.textContent.includes('Archive'))";
      assert.ok(await shell.waitFor(nextTab, 5000), JSON.stringify(await shell.evaluateAll("[...document.querySelectorAll('[role=tab]')].map(t => [t.textContent,t.ariaLabel])")));
      const originalHash = await shell.evaluate('location.hash');
      await shell.evaluateAll(nextTab + '?.click()');
      assert.ok(await until(async () => {
        const hash = await shell.evaluate('location.hash');
        return hash.startsWith('#page=') && hash !== originalHash;
      }), 'The frame address did not follow the selected sheet');
      const linked = await browser.load(await shell.evaluate('location.href'), { ready: "document.querySelector('[role=grid][aria-label=Archive]')" });
      try {
        assert.ok(await linked.waitFor("document.querySelector('[role=grid][aria-label=Archive]')"));
        assert.deepEqual(linked.problems, []);
      } finally { await linked.close(); }
      assert.deepEqual(shell.problems, []);
    } finally {
      await shell?.close();
      await daemon?.close();
      for (const [key, original] of Object.entries(previous)) {
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
      }
    }
  });

  it('comments lists no threads on a new Sheet, and stop stops the server', T, async () => {
    const comments = await ctx.cli.json(['comments', ctx.root, '--json']);
    assert.deepEqual(comments.threads, []);
    const stop = await ctx.cli.run(['stop']);
    assert.equal(stop.code, 0, stop.stderr);
    assert.match(stop.stdout, /Stopped the server/);
  });
});
