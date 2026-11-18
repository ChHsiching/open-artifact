// End-to-end tests of the sheets type: update and read on a folder with no server (a read there is refused, a
// first update makes the Sheet), refusals as JSON on stderr, check, export to Excel and CSV, then open: the page shows the workbook, an
// update sent while it is open reaches it at once, a chart made with batch is drawn in its frame, comments, and stop.
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
    assert.match(await response.text(), /<title>Sheets<\/title>/);
    if (browserOff) return;
    ctx.browserPromise ??= launch();
    const page = await (await ctx.browserPromise).load(opened.url, { ready: `document.querySelector('[role=grid][aria-label="Budget"]') !== null && ${formulaBar}?.value === 'Item'`, settle: 800, ignore: [/\/favicon\.ico$/] });
    try {
      assert.ok(await page.waitFor(`${formulaBar}?.value === 'Item'`, 1000), 'the page does not show Budget with A1 selected');
      await ctx.cli.json(['update', ctx.root, edits(3, [{ kind: 'writeCells', sheet: 'Budget', topLeft: 'A1', rows: [['Line']] }])]);
      assert.ok(await page.waitFor(`${formulaBar}?.value === 'Line'`, 10000), 'the open page did not get the update');
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
      assert.equal(await page.evaluate(`document.querySelector('iframe.sheet-chart-frame').getAttribute('sandbox')`), 'allow-scripts');
      assert.deepEqual(page.problems, []);
    } finally {
      await page.close();
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
