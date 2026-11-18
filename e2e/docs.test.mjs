// End-to-end tests of the docs type's command line and editor: create a doc from markdown, read its tabs
// and outline, edit a tab and suggest an edit, add and remove tabs and a dropdown list in one batch, export markdown,
// Word and a page to print (and PDF when Chrome is here), import them back as tabs, archive the folder; open, wait
// and stop.
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { findChrome, launch } from './lib/browser.mjs';
import { cli } from './lib/cli.mjs';
import { png, until } from './lib/http.mjs';
import { buttonNamed, chromeSkip, clickOn, textIn } from './lib/editor.mjs';
import { browserOff, install, removeTmp, tmpDir, typePath } from './lib/target.mjs';

const T = { timeout: 90000 };
const TYPE = 'docs';
const SOURCE = ['# Plan', '', 'Intro words with a [link](https://example.com).', '', '## Goals', '', '- One', '- Two', '', '| Owner | Task |', '| --- | --- |', '| Ana | Design |', ''].join('\n');

async function clickInEditor(page, element) {
  let point;
  assert.ok(await until(async () => (point = await page.evaluate(`(() => {
    const frame = document.querySelector('iframe[name="open-artifact-shell"]');
    const rect = (document => (${element})?.getBoundingClientRect())(frame.contentDocument);
    const outer = frame.getBoundingClientRect();
    return rect?.width ? [outer.x + rect.x + rect.width / 2, outer.y + rect.y + rect.height / 2] : null;
  })()`))), 'Missing editor control: ' + element);
  await page.click(...point);
}

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
    ctx.home = tmpDir('docs-home');
    ctx.cli = cli(dir, { OPEN_ARTIFACT_TYPE_SERVER_HOME: path.join(tmpDir('docs-state'), 'state'), HOME: ctx.home, OPEN_ARTIFACT_USER: 'E2E' });
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

  it('a selection comment can be written and posted with the comments list open', { ...T, skip: chromeSkip() }, async () => {
    const { url } = await ctx.cli.json(['open', ctx.root, '--json']);
    const browser = await launch();
    try {
      const page = await browser.load(url, { ready: textIn('Intro words'), ignore: [/\/favicon\.ico$/] });
      await clickOn(page, buttonNamed('Comment options'));
      await clickOn(page, buttonNamed('Show all comments'));
      await clickInEditor(page, "document.querySelector('.doc-text h1')");
      await page.press('Home');
      await page.press('End', { shift: true });
      await clickInEditor(page, buttonNamed('Comment'));
      const field = 'aside[aria-label="Comments"] textarea[aria-label="Add a comment"]';
      assert.ok(await page.waitFor(`document.activeElement.matches('${field}')`, 5000), 'the list did not focus the new comment');
      await page.type('Ready for review');
      await page.press('Enter');
      assert.ok(await page.waitFor(`document.querySelector('aside')?.innerText.includes('Ready for review') && !document.querySelector('${field}')`, 5000));
      const { threads } = await ctx.cli.json(['comments', ctx.root, '--json']);
      assert.equal(threads[0].messages[0].text, 'Ready for review');
      assert.equal((await page.evaluateAll(`document.querySelector('.doc-text h1')?.textContent`)).find(Boolean), 'Plan');
      assert.deepEqual(page.problems, []);
    } finally {
      await browser.close();
    }
  });

  it('exports from the shell and duplicates the live document under an independent identity', { ...T, skip: chromeSkip() }, async () => {
    const { putDocBlob } = await import('../packages/type-server/src/docs/blobs.ts');
    const picture = png();
    const ref = putDocBlob(ctx.root, picture);
    await call('update', ctx.root, { tab: ctx.tab, ops: [{ op: 'insert', target: { kind: 'root' }, source: { markdown: '![Review diagram](' + ref + ')' } }] });
    const { url } = await ctx.cli.json(['open', ctx.root, '--json']);
    const browser = await launch();
    try {
      const page = await browser.load(url, { ready: textIn('Intro words'), ignore: [/\/favicon\.ico$/] });
      await clickOn(page, buttonNamed('Artifact options'));
      await clickOn(page, buttonNamed('Export'));
      const rows = await page.evaluate("[...document.querySelectorAll('[data-export-row]')].map(b => b.dataset.exportRow)");
      assert.ok(rows.includes('PDF (.pdf) · Whole document · US Letter'));
      assert.ok(rows.includes('PDF (.pdf) · This tab · A4'));
      await clickOn(page, buttonNamed('Markdown (.md) · This tab'));
      const dir = path.join(ctx.home, 'Downloads');
      assert.ok(await until(() => fs.existsSync(dir) && fs.readdirSync(dir).some(file => file.endsWith('.md'))),
        `no .md in ${dir}: ${fs.existsSync(dir) ? fs.readdirSync(dir).join(', ') : 'no folder'}`);
      const file = fs.readdirSync(dir).find(name => name.endsWith('.md'));
      assert.match(fs.readFileSync(path.join(dir, file), 'utf8'), /None yet, \*\*so far/);
      await clickOn(page, buttonNamed('Artifact options'));
      await clickOn(page, buttonNamed('Duplicate'));
      assert.ok(await page.waitFor("document.activeElement.getAttribute('aria-label') === 'Name of the copy'"));
      await page.type('Independent review');
      await page.press('Enter');
      assert.ok(await page.waitFor("document.querySelector('header')?.innerText.includes('Independent review')"));
      const copy = path.join(path.dirname(ctx.root), 'Independent review');
      const manifest = root => JSON.parse(fs.readFileSync(path.join(root, 'doc/doc.json')));
      assert.notEqual(manifest(copy).id, manifest(ctx.root).id);
      assert.deepEqual(await tabs(copy), await tabs(ctx.root));
      assert.deepEqual((await ctx.cli.json(['read', copy, ctx.tab, '--suggestions'])).suggestions,
        (await ctx.cli.json(['read', ctx.root, ctx.tab, '--suggestions'])).suggestions);
      assert.deepEqual((await ctx.cli.json(['comments', copy, '--json'])).threads, []);
      assert.equal(fs.existsSync(path.join(copy, 'doc/tabs/.deleted')), false);
      assert.deepEqual(fs.readFileSync(path.join(copy, '_blobs', ref.slice(5) + '.png')), picture);
      await call('update', copy, { tab: ctx.tab, ops: [{ op: 'insert', target: { kind: 'root' }, source: { markdown: 'Only in the copy' } }] });
      assert.doesNotMatch((await ctx.cli.run(['export', ctx.root])).stdout, /Only in the copy/);
      assert.deepEqual(page.problems, []);
    } finally { await browser.close(); }
  });

  it('opens a linked tab through each guest role, and enforces its editing and commenting permissions', { ...T, skip: chromeSkip() }, async () => {
    const { createTypeServer } = await import('../packages/type-server/src/index.ts');
    const server = createTypeServer({
      secret: 'docs-roles', idleMs: 0, assetsDir: path.join(typePath('docs'), 'scripts'),
      lanAddresses: () => [], isLocal: req => !req.headers['x-test-guest'],
    });
    const browser = await launch();
    let threadId;
    try {
      const root = tmpDir('docs-guests');
      fs.cpSync(path.join(ctx.root, 'doc'), path.join(root, 'doc'), { recursive: true });
      await server.listen();
      const { url } = await server.open({ root, type: 'docs', title: 'Guest review' });
      const tab = (await tabs(ctx.root)).find(file => file.name === 'Extra');
      const owner = await browser.load(url + '#' + tab.id, { ready: "document.querySelector('.doc-text h1')?.textContent === 'Extra'" });
      assert.ok(await until(() => {
        try { return JSON.parse(fs.readFileSync(path.join(root, '_agent/view-context.json'))).context.tab === tab.id; } catch { return false; }
      }), 'active tab was not published to the agent');
      await clickOn(owner, buttonNamed('Share'));
      await owner.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true,value:async text=>{window.invite=text}})");
      const guest = await browser.load('about:blank');
      await guest.cdp('Network.setExtraHTTPHeaders', { headers: { 'x-test-guest': '1' } });
      for (const role of ['commenter', 'viewer', 'editor']) {
        const link = `document.querySelector('[data-share-link=${role}]')`;
        assert.ok(await owner.waitFor(link));
        if (!(await owner.evaluate(link + '.title'))) {
          await owner.evaluate(link + ".querySelector('button').click()");
          assert.ok(await owner.waitFor(link + '.title'));
        }
        await owner.evaluate(link + ".querySelector('button').click()");
        assert.ok(await owner.waitFor(`window.invite?.startsWith(${link}.title) && document.querySelector('[data-share-security]')`));
        const invite = new URL(await owner.evaluate('window.invite'));
        invite.host = new URL(url).host;
        assert.equal(invite.hash, '#' + tab.id);
        if (role === 'viewer') {
          invite.hash = '';
          invite.searchParams.set('tab', tab.id);
          invite.searchParams.set('comment', threadId);
        }
        await guest.cdp('Page.navigate', { url: invite.href });
        assert.ok(await guest.waitFor("document.querySelector('input[name=name]')"));
        await guest.evaluate("document.querySelector('[name=name]').value = 'Guest'; document.querySelector('form').requestSubmit()");
        assert.ok(await guest.waitFor("document.querySelector('.doc-text h1')?.textContent === 'Extra'"), role + ' failed to open the linked tab');
        assert.equal(await guest.evaluate('window.__OPEN_ARTIFACT_BOOT__.typeServer.role'), role);
        if (role === 'viewer') {
          const card = `document.querySelector('[data-comment-card="${threadId}"][data-open]')`;
          assert.ok(await guest.waitFor(card + "?.innerText.includes('Guest feedback on Extra')", 5000), 'linked comment did not open');
        }
        const editor = "document.querySelector('iframe').contentDocument.querySelector('.doc-text')";
        assert.equal(await guest.evaluate(editor + '.isContentEditable'), role === 'editor');
        await clickOn(guest, buttonNamed('Share'));
        assert.equal(await guest.evaluate(`!!(${buttonNamed('Export')})`), false);
        await clickOn(guest, buttonNamed('Close'));
        assert.ok(await until(() => guest.evaluate("document.querySelector('[role=dialog]') === null")));
        assert.equal(await guest.evaluate("fetch('_api/doc/export?format=markdown').then(r=>r.status)"), 403);
        assert.equal(await guest.evaluate("fetch('_api/frame/duplicate', {method:'POST'}).then(r=>r.status)"), 403);
        if (role === 'editor') {
          await clickInEditor(guest, "document.querySelector('.doc-text h1')");
          await guest.press('End');
          await guest.type(' reviewed');
          assert.ok(await until(() => fs.readFileSync(path.join(root, 'doc/tabs', tab.id + '.json'), 'utf8').includes('reviewed')));
        } else {
          assert.equal(await guest.evaluate("fetch('_api/doc/import', {method:'POST'}).then(r=>r.status)"), 403);
          const session = await guest.evaluate("fetch('_api/doc/session', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client:'guest-permissions'})}).then(r=>r.json())");
          if (role === 'commenter') {
            const [x, y, end] = await guest.evaluate(`(() => {
              const frame = document.querySelector('iframe'), doc = frame.contentDocument;
              const heading = doc.querySelector('.doc-text h1');
              const range = doc.createRange();
              range.selectNodeContents([...heading.childNodes].find(n => n.nodeType === Node.TEXT_NODE));
              const r = range.getBoundingClientRect(), f = frame.getBoundingClientRect();
              return [f.x + r.left + 1, f.y + r.top + r.height / 2, f.x + r.right - 1];
            })()`);
            const point = { x: (x + end) / 2, y, button: 'left', clickCount: 2 };
            await guest.cdp('Input.dispatchMouseEvent', { ...point, type: 'mousePressed' });
            await guest.cdp('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased' });
            assert.ok(await guest.waitFor("document.getSelection()?.toString().includes('Extra')", 3000));
            await clickInEditor(guest, buttonNamed('Comment'));
            assert.ok(await guest.waitFor("document.activeElement.matches('textarea')"));
            await guest.type('Guest feedback on Extra');
            await guest.press('Enter');
            assert.ok(await until(async () => {
              const { threads } = await (await fetch(new URL('_api/comments', url))).json();
              threadId = threads.find(t => t.messages.some(m => m.text === 'Guest feedback on Extra'))?.id;
              return threadId;
            }));
          } else {
            await clickOn(guest, buttonNamed('Comments'));
            assert.ok(await guest.waitFor("document.querySelector('aside')?.innerText.includes('Guest feedback on Extra')"));
          }
          assert.equal(session.commentable, role === 'commenter');
          assert.equal(session.writable, false);
        }
      }
    } finally { await browser.close(); await server.stop(); }
  });

  it('keeps the daemon library, editor title and tab links in sync when renaming and copying', { ...T, skip: chromeSkip() }, async () => {
    const overrides = {
      OPEN_ARTIFACT_HOME: tmpDir('docs-daemon'), OPEN_ARTIFACT_TYPE_SERVER_HOME: tmpDir('docs-daemon-state'),
      OPEN_ARTIFACT_USER_TYPES: tmpDir('docs-user-types'), OPEN_ARTIFACT_BROWSER: 'none',
    };
    const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    let daemon, browser;
    try {
      const { startDaemon } = await import('../packages/daemon/src/daemon.ts');
      const { api, readDaemon } = await import('../packages/daemon/src/client.ts');
      daemon = await startDaemon({ port: 0, idleMs: 0, quiet: true, builtinTypesDir: path.dirname(typePath('docs')) });
      const state = await readDaemon();
      const made = await api(state, 'tools.call', {
        name: 'Artifact', arguments: { action: 'publish', type_url: 'open-artifact://type/docs', title: 'Library review' },
        caller: { harness: 'e2e', session: 'docs-library', workspace: tmpDir('docs-workspace') },
      });
      assert.equal(made.error, undefined, JSON.stringify(made.error));
      const id = made.url.split('/').at(-1);
      const source = daemon.store.require(id).root;
      fs.cpSync(path.join(ctx.root, 'doc'), path.join(source, 'doc'), { recursive: true });
      const tab = (await tabs(ctx.root)).find(file => file.name === 'Extra');
      browser = await launch();
      const page = await browser.load(state.url + '/a/' + id + '#' + tab.id, { ready: "document.querySelector('.doc-text h1')?.textContent === 'Extra'" });
      await page.evaluate("location.hash = " + JSON.stringify('#' + ctx.tab));
      assert.ok(await page.waitFor("document.querySelector('.doc-text h1')?.textContent === 'Plan'"));
      await clickOn(page, buttonNamed('Artifact options'));
      await clickOn(page, buttonNamed('Rename'));
      assert.ok(await page.waitFor("document.activeElement.getAttribute('aria-label') === 'Document name'"));
      await page.type('Renamed review');
      await page.press('Enter');
      assert.ok(await until(() => daemon.store.require(id).title === 'Renamed review'));
      await clickOn(page, buttonNamed('Version history'));
      assert.ok(await page.waitFor("document.querySelector('[data-testid=history-panel]')"));
      await clickOn(page, buttonNamed('Artifact options'));
      await clickOn(page, buttonNamed('Duplicate'));
      assert.ok(await page.waitFor("document.activeElement.getAttribute('aria-label') === 'Name of the copy'"));
      await page.type('Library copy');
      await page.press('Enter');
      assert.ok(await page.waitFor("document.querySelector('header')?.innerText.includes('Library copy')"));
      const copyId = new URL(await page.evaluate('location.href')).pathname.split('/').at(-1);
      assert.notEqual(copyId, id);
      assert.equal(daemon.store.require(copyId).title, 'Library copy');
      assert.ok(await page.waitFor("document.querySelector('.doc-text h1')?.textContent === 'Plan'"));
    } finally {
      await browser?.close();
      await daemon?.close();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('opens the tab picker from the phone toolbar and navigates without losing the public address', { ...T, skip: chromeSkip() }, async () => {
    const { url } = await ctx.cli.json(['open', ctx.root, '--json']);
    const browser = await launch();
    try {
      const page = await browser.load(url, { ready: textIn('Intro words') });
      await page.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      assert.ok(await page.waitFor("document.querySelector('[data-doc-phone-bar]')"));
      await clickOn(page, buttonNamed('Document tabs'));
      assert.ok(await page.waitFor("document.querySelector('[role=tree]')?.offsetWidth > 0"));
      await clickInEditor(page, "[...document.querySelectorAll('[role=treeitem]')].find(row => row.innerText.trim() === 'Extra')");
      const tab = (await tabs(ctx.root)).find(file => file.name === 'Extra');
      assert.ok(await page.waitFor("document.querySelector('.doc-text h1')?.textContent === 'Extra'"));
      assert.equal(await page.evaluate('location.hash'), '#' + tab.id);
    } finally { await browser.close(); }
  });

  it('archive zips the folder beside it', T, async () => {
    const out = await ctx.cli.json(['archive', ctx.root, '--json']);
    assert.ok(fs.existsSync(out.file), JSON.stringify(out));
    const zip = fs.readFileSync(out.file);
    assert.equal(zip.subarray(0, 2).toString(), 'PK');
    for (const name of ['doc/.sessions.json', 'doc/.people.json', 'doc/tabs/.deleted/']) assert.ok(zip.includes(Buffer.from(name)), name);
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
