// End-to-end tests of the docs type's command line, without a browser: create a doc from markdown, read its tabs
// and outline, edit a tab and suggest an edit, add and remove tabs and a dropdown list in one batch, export markdown,
// Word and a page to print (and PDF when Chrome is here), import them back as tabs, archive the folder; open, wait
// and stop.
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { findChrome } from './lib/browser.mjs';
import { cli } from './lib/cli.mjs';
import { browserOff, install, removeTmp, tmpDir, typePath } from './lib/target.mjs';

const T = { timeout: 90000 };
const TYPE = 'docs';
const SOURCE = ['# Plan', '', 'Intro words with a [link](https://example.com).', '', '## Goals', '', '- One', '- Two', '', '| Owner | Task |', '| --- | --- |', '| Ana | Design |', ''].join('\n');

function skip() {
  const dir = typePath(TYPE);
  if (!fs.existsSync(path.join(dir, 'SKILL.md'))) return `${TYPE} is not in ${dir}`;
  const missing = ['scripts/cli.mjs', 'scripts/editors/docs/index.html', 'scripts/pdf-reader.mjs'].filter(f => !fs.existsSync(path.join(dir, f)));
  return missing.length ? `${TYPE} is not built (npm run build): no ${missing.join(', ')}` : false;
}

describe(TYPE, { skip: skip() }, () => {
  const ctx = {};
  const tabs = async root => (await ctx.cli.json(['read', root])).files;
  const call = (verb, root, body) => ctx.cli.json([verb, root, JSON.stringify(body)]);

  before(async () => {
    const { dir } = install(typePath(TYPE), TYPE);
    ctx.cli = cli(dir, { OPEN_ARTIFACT_TYPE_SERVER_HOME: path.join(tmpDir('docs-state'), 'state'), HOME: tmpDir('docs-home'), OPEN_ARTIFACT_USER: 'E2E' });
    ctx.root = path.join(tmpDir('docs-root'), 'plan');
    const source = path.join(tmpDir('docs-src'), 'plan.md');
    fs.writeFileSync(source, SOURCE);
    const created = await ctx.cli.json(['create', ctx.root, '--markdown', source, '--name', 'Plan']);
    assert.equal(created.created.name, 'Plan');
    ctx.tab = created.lids.f;
  });

  after(async () => {
    await ctx.cli?.run(['stop']).catch(() => {});
    removeTmp();
  });

  it('create writes doc/doc.json and a tab, check passes it, read gives the outline', T, async () => {
    assert.ok(fs.existsSync(path.join(ctx.root, 'doc', 'doc.json')));
    const check = await ctx.cli.run(['check', ctx.root, '--json']);
    assert.equal(check.code, 0, check.stdout);
    assert.equal(check.json.type, TYPE);
    assert.deepEqual((await tabs(ctx.root)).map(file => file.id), [ctx.tab]);
    const outline = await ctx.cli.run(['read', ctx.root, ctx.tab]);
    assert.equal(outline.code, 0, outline.stderr);
    assert.match(outline.stdout, /heading='1'>Plan</);
    assert.match(outline.stdout, /<list [^>]*kind='bullet'/);
    const markdown = await ctx.cli.run(['read', ctx.root, ctx.tab, '--markdown']);
    assert.match(markdown.stdout, /\| Ana \| Design \|/);
  });

  it('update writes blocks from markdown; a suggested edit stays out of exports until it is accepted', T, async () => {
    const plain = await call('update', ctx.root, { tab: ctx.tab, ops: [{ op: 'insert', target: { kind: 'root' }, source: { markdown: '## Risks\n\nNone yet, **so far**.' } }] });
    assert.match(plain.xml, /heading='2'>Risks</);
    const suggested = await call('update', ctx.root, { tab: ctx.tab, suggest: true, ops: [{ op: 'insert', target: { kind: 'root' }, source: { markdown: 'A suggested line.' } }] });
    assert.match(suggested.suggestId, /^sg_/);
    const open = await ctx.cli.json(['read', ctx.root, ctx.tab, '--suggestions']);
    assert.deepEqual(open.suggestions.map(s => [s.id, s.via]), [[suggested.suggestId, 'agent']]);
    const exported = await ctx.cli.run(['export', ctx.root, '--tab', ctx.tab]);
    assert.match(exported.stdout, /None yet, \*\*so far\*\*\./);
    assert.doesNotMatch(exported.stdout, /A suggested line/);
    const refused = await ctx.cli.run(['update', ctx.root, JSON.stringify({ tab: ctx.tab, ops: [{ op: 'delete', target: { kind: 'blocks', ids: ['nope.1'] } }] })]);
    assert.equal(refused.code, 1, refused.stdout);
  });

  it('batch adds a tab and a dropdown list at once; delete removes a tab but never the last', T, async () => {
    const out = await call('batch', ctx.root, {
      batch: [
        { verb: 'create', object: 'file', payload: { birthName: 'Notes' } },
        { verb: 'create', object: 'enum', payload: { name: 'Status', options: [{ name: 'Open' }, { name: 'Done' }] } },
      ],
    });
    assert.equal(out.acks.length, 2);
    const notes = out.acks[0].minted;
    assert.match(notes, /^[0-9a-f]{8}-[0-9a-f]{4}$/);
    assert.deepEqual((await tabs(ctx.root)).map(file => file.name), ['Tab 1', 'Notes']);
    await call('delete', ctx.root, { ref: { object: 'file', id: notes } });
    assert.deepEqual((await tabs(ctx.root)).map(file => file.id), [ctx.tab]);
    const last = await ctx.cli.run(['delete', ctx.root, JSON.stringify({ ref: { object: 'file', id: ctx.tab } })]);
    assert.equal(last.code, 1);
  });

  it('export writes Word and a page to print; import brings markdown and Word back as new tabs', T, async () => {
    const out = tmpDir('docs-out');
    const docx = path.join(out, 'plan.docx');
    const html = path.join(out, 'plan.html');
    assert.equal((await ctx.cli.run(['export', ctx.root, '--format', 'docx', '--out', docx])).code, 0);
    assert.equal(fs.readFileSync(docx).subarray(0, 2).toString(), 'PK');
    assert.equal((await ctx.cli.run(['export', ctx.root, '--format', 'html', '--out', html])).code, 0);
    assert.match(fs.readFileSync(html, 'utf8'), /<h1[^>]*>Plan<\/h1>/);
    const md = path.join(out, 'extra.md');
    fs.writeFileSync(md, '# Extra\n\n- [ ] A task\n- [x] Done\n');
    const fromMarkdown = await ctx.cli.json(['import', ctx.root, md, '--name', 'Extra']);
    assert.equal(fromMarkdown.format, 'markdown');
    const fromWord = await ctx.cli.json(['import', ctx.root, docx, '--name', 'From Word']);
    assert.equal(fromWord.format, 'docx');
    const names = (await tabs(ctx.root)).map(file => file.name);
    assert.deepEqual(names, ['Tab 1', 'Extra', 'From Word']);
    const word = (await tabs(ctx.root)).find(file => file.name === 'From Word');
    const back = await ctx.cli.run(['export', ctx.root, '--tab', word.id]);
    assert.match(back.stdout, /None yet, \*\*so far\*\*\./);
  });

  it('export prints a PDF with Chrome, and import reads its words back', { ...T, skip: browserOff ? 'E2E_BROWSER=0' : findChrome() ? false : 'no Chrome found' }, async () => {
    const pdf = path.join(tmpDir('docs-pdf'), 'plan.pdf');
    const out = await ctx.cli.run(['export', ctx.root, '--tab', ctx.tab, '--format', 'pdf', '--paper', 'a4', '--out', pdf], { env: { CHROME_PATH: findChrome() } });
    assert.equal(out.code, 0, out.stderr);
    assert.equal(fs.readFileSync(pdf).subarray(0, 4).toString(), '%PDF');
    const imported = await ctx.cli.json(['import', ctx.root, pdf, '--name', 'From PDF']);
    assert.equal(imported.format, 'pdf');
    const tab = (await tabs(ctx.root)).find(file => file.name === 'From PDF');
    const words = await ctx.cli.run(['export', ctx.root, '--tab', tab.id]);
    assert.match(words.stdout, /Intro words/);
  });

  it('archive zips the folder beside it', T, async () => {
    const out = await ctx.cli.json(['archive', ctx.root, '--json']);
    assert.ok(fs.existsSync(out.file), JSON.stringify(out));
    assert.equal(fs.readFileSync(out.file).subarray(0, 2).toString(), 'PK');
  });

  it('open serves the doc, its calls go through the server, wait ends quietly with nothing sent, stop ends it', T, async () => {
    const opened = await ctx.cli.json(['open', ctx.root, '--json']);
    assert.equal(opened.type, TYPE);
    const page = await fetch(opened.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root">/);
    const viaServer = await call('update', ctx.root, { tab: ctx.tab, ops: [{ op: 'insert', target: { kind: 'root' }, source: { markdown: 'Written while open.' } }] });
    assert.ok(viaServer.rev > 0);
    assert.match((await ctx.cli.run(['export', ctx.root, '--tab', ctx.tab])).stdout, /Written while open\./);
    const wait = await ctx.cli.run(['wait', ctx.root, '--timeout', '1']);
    assert.equal(wait.code, 2, wait.stdout);
    const comments = await ctx.cli.run(['comments', ctx.root]);
    assert.equal(comments.code, 0, comments.stderr);
    const stop = await ctx.cli.run(['stop']);
    assert.equal(stop.code, 0, stop.stderr);
  });
});
