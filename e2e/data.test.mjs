// End-to-end tests of the data type's command line, without a browser: the fixture dashboard (fixtures/data) is
// written through write-db and passes check; a broken copy of each kind fails it with the finding the page would
// show; write-db refuses what the page would drop and writes nothing; upload, read-db --text and delete-asset; open,
// wait and stop.
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { cli, run } from './lib/cli.mjs';
import { fixtures, install, removeTmp, tmpDir, typePath } from './lib/target.mjs';

const T = { timeout: 90000 };
const TYPE = 'data';

function skip() {
  const dir = typePath(TYPE);
  if (!fs.existsSync(path.join(dir, 'SKILL.md'))) return `${TYPE} is not in ${dir}`;
  const missing = ['scripts/cli.mjs', 'scripts/editors/data/index.html'].filter(f => !fs.existsSync(path.join(dir, f)));
  return missing.length ? `${TYPE} is not built (npm run build): no ${missing.join(', ')}` : false;
}

const docPath = (root, doc) => path.join(root, 'db', `${doc}.json`);
const readDoc = (root, doc) => JSON.parse(fs.readFileSync(docPath(root, doc), 'utf8'));
const writeDoc = (root, doc, value) => {
  fs.mkdirSync(path.dirname(docPath(root, doc)), { recursive: true });
  fs.writeFileSync(docPath(root, doc), typeof value === 'string' ? value : JSON.stringify(value));
};
const findingsOf = out => out.json.findings.map(f => `${f.level} ${f.file.replace(/^db\//, '').replace(/\.json$/, '')} ${f.message}`);

describe(TYPE, { skip: skip() }, () => {
  const ctx = {};

  /** A copy of the loaded fixture dashboard. */
  const copy = label => {
    const root = path.join(tmpDir(`data-${label}`), 'dashboard');
    fs.cpSync(ctx.root, root, { recursive: true });
    return root;
  };

  before(async () => {
    const { dir } = install(typePath(TYPE), TYPE);
    const home = tmpDir('data-home');
    ctx.connectors = path.join(home, 'connectors.json');
    fs.writeFileSync(ctx.connectors, JSON.stringify({ mcpServers: { sales: { command: 'true' } } }));
    ctx.cli = cli(dir, {
      OPEN_ARTIFACT_TYPE_SERVER_HOME: path.join(tmpDir('data-state'), 'state'),
      HOME: home,
      OPEN_ARTIFACT_USER: 'E2E',
      OPEN_ARTIFACT_CONNECTORS: ctx.connectors,
    });
    ctx.root = path.join(tmpDir('data-root'), 'dashboard');
    const load = await run(path.join(fixtures, 'data', 'load.mjs'), [ctx.cli.script, ctx.root], { env: ctx.cli.env() });
    assert.equal(load.code, 0, `the fixture did not load: ${load.stderr}`);
  });

  after(async () => {
    await ctx.cli?.run(['stop']).catch(() => {});
    removeTmp();
  });

  it('check passes the fixture, warning only of the dataset nothing names', T, async () => {
    const out = await ctx.cli.run(['check', ctx.root, '--json']);
    assert.equal(out.code, 0, out.stdout);
    assert.equal(out.json.type, TYPE);
    assert.deepEqual(findingsOf(out), ['warning datasets/unused nothing on the page names it; Sources labels it "Unused".']);
  });

  it('check says when a live query names a connector the owner has not set up', T, async () => {
    const out = await ctx.cli.run(['check', ctx.root, '--json'], { env: { OPEN_ARTIFACT_CONNECTORS: path.join(path.dirname(ctx.connectors), 'none.json') } });
    assert.equal(out.code, 0, out.stdout);
    const warnings = findingsOf(out).filter(line => line.includes('there is no connectors.json'));
    assert.deepEqual(warnings.map(line => line.split(' ')[1]), ['datasets/broken', 'datasets/orders', 'datasets/tickets']);
  });

  const broken = {
    'a file without updated': [root => { const d = readDoc(root, 'datasets/signups'); delete d.updated; writeDoc(root, 'datasets/signups', d); }, 'error datasets/signups needs updated'],
    'an old rows dataset': [root => writeDoc(root, 'datasets/old', { title: 'Old', source: { kind: 'rows', rows: [] } }), 'error datasets/old is an old rows dataset'],
    'a url that is no upload': [root => { const d = readDoc(root, 'datasets/signups'); d.source.url = 'https://example.com/a.csv'; writeDoc(root, 'datasets/signups', d); }, 'error datasets/signups source.url "https://example.com/a.csv" isn’t an attached file'],
    'a filter with no rule': [root => { const d = readDoc(root, 'datasets/orders'); delete d.source.rules; writeDoc(root, 'datasets/orders', d); }, 'error datasets/orders {{region}} is written into the query’s text with no rule'],
    'a rule with a word it does not know': [root => { const d = readDoc(root, 'datasets/orders'); d.source.rules.region.bogus = 1; writeDoc(root, 'datasets/orders', d); }, 'error datasets/orders source.rules are refused'],
    'a look with no set': [root => writeDoc(root, 'dash/look', { corners: '8px' }), 'error dash/look has no set the dashboard can use'],
    'a file named without its format': [root => { const d = readDoc(root, 'datasets/signups'); d.source.name = 'signups'; delete d.source.format; writeDoc(root, 'datasets/signups', d); }, 'warning datasets/signups source.format is left out'],
    'a mark of no dataset': [root => { const d = readDoc(root, 'files/index.html'); d.text += '\n<b data-source="nosuch" data-field="x">1</b>'; writeDoc(root, 'files/index.html', d); }, 'error files/index.html <b>: data-source="nosuch" names no dataset or dash.calc'],
    'a dataset read but not marked': [root => { const d = readDoc(root, 'files/app.js'); d.text += '\ndash.data("unused");'; writeDoc(root, 'files/app.js', d); }, 'error datasets/unused files/app.js reads it, but no element is marked'],
    'a token that does not exist': [root => { const d = readDoc(root, 'files/app.css'); d.text += '\n.x { color: var(--dash-nope); }'; writeDoc(root, 'files/app.css', d); }, 'error files/index.html var(--dash-nope) is no token of the dashboard'],
    'no dash/meta': [root => fs.rmSync(docPath(root, 'dash/meta')), 'error dash/meta is missing'],
    'a page that failed in the owner’s browser': [
      root => writeDoc(root, 'data/users/owner/check', { v: 1, status: 'failed', at: Date.now(), page: [{ kind: 'error', name: 'TypeError', message: 'x', file: 'app.js', count: 1 }] }),
      'error data/users/owner/check the page\'s code threw: TypeError in app.js',
    ],
  };
  for (const [name, [edit, expected]] of Object.entries(broken))
    it(`check names ${name}`, T, async () => {
      const root = copy(name.replace(/[^a-z]+/gi, '-'));
      edit(root);
      const out = await ctx.cli.run(['check', root, '--json']);
      assert.ok(out.json, out.stdout + out.stderr);
      assert.equal(out.code, expected.startsWith('error') ? 1 : 0, out.stdout);
      assert.ok(findingsOf(out).some(line => line.startsWith(expected)), `${expected}\nnot in:\n${findingsOf(out).join('\n')}`);
    });

  const refused = {
    'a person’s own document': [[{ op: 'set', path: 'data/users/owner/check', data: {} }], 'READ_ONLY_PATH'],
    'a dataset id the page ignores': [[{ op: 'set', path: 'dash/params', data: { region: 'North' } }, { op: 'set', path: 'datasets/a.b', data: { title: 'x' } }], 'REFUSED'],
    'a page file without its text': [[{ op: 'set', path: 'files/extra.js', data: { body: '' } }], 'REFUSED'],
    'a page file over 256 KB': [[{ op: 'set', path: 'files/extra.js', data: { text: 'x'.repeat(300 * 1024) } }], 'TOO_LARGE'],
  };
  for (const [name, [writes, code]] of Object.entries(refused))
    it(`write-db refuses ${name} and writes nothing`, T, async () => {
      const root = copy('refused');
      const before = fs.readFileSync(docPath(root, 'dash/params'), 'utf8');
      const out = await ctx.cli.run(['write-db', root, JSON.stringify(writes)]);
      assert.equal(out.code, 1, out.stdout);
      assert.equal(out.json?.error, code, out.stdout);
      assert.match(out.json.message, /Nothing was written\.$/);
      assert.equal(fs.readFileSync(docPath(root, 'dash/params'), 'utf8'), before);
      assert.ok(!fs.existsSync(docPath(root, 'files/extra.js')) && !fs.existsSync(docPath(root, 'data/users/owner/check')));
    });

  it('write-db starts a dashboard in an empty folder from its dash/meta, and update removes a key with __delete__', T, async () => {
    const root = path.join(tmpDir('data-new'), 'dashboard');
    const first = await ctx.cli.json(['write-db', root, JSON.stringify([{ op: 'set', path: 'dash/meta', data: { title: 'New' } }])]);
    assert.equal(first.writes[0].created, true);
    const refusedRoot = path.join(tmpDir('data-none'), 'dashboard');
    const none = await ctx.cli.run(['write-db', refusedRoot, JSON.stringify([{ op: 'set', path: 'notes/a', data: {} }])]);
    assert.equal(none.code, 1);
    assert.match(none.stderr, /not a db-backed artifact/);
    await ctx.cli.json(['write-db', root, JSON.stringify([{ op: 'update', path: 'dash/meta', data: { title: { __delete__: true }, lang: 'en' } }])]);
    assert.deepEqual(readDoc(root, 'dash/meta'), { lang: 'en' });
  });

  it('upload stores a file under a name, read-db --text prints a page file, delete-asset refuses an upload in use', T, async () => {
    const root = copy('uploads');
    const src = path.join(tmpDir('data-src'), 'rows');
    fs.writeFileSync(src, 'a,b\n1,2\n');
    const up = await ctx.cli.run(['upload', root, src, '--name', 'rows.csv']);
    assert.equal(up.code, 0, up.stderr);
    const [url, type, size, name] = up.stdout.trim().split('\t');
    assert.match(url, /^\/_blob\/[0-9a-f]{32}$/);
    assert.deepEqual([type, size, name], ['text/csv', '8', 'rows.csv']);
    const missing = await ctx.cli.run(['upload', root, `${src}.gone`]);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /No such file/);

    const text = await ctx.cli.run(['read-db', root, 'files/index.html', '--text']);
    assert.equal(text.code, 0, text.stderr);
    assert.equal(text.stdout, readDoc(root, 'files/index.html').text);
    const notText = await ctx.cli.run(['read-db', root, 'dash/meta', '--text']);
    assert.equal(notText.code, 1);

    const signups = readDoc(root, 'datasets/signups').source.url;
    const inUse = await ctx.cli.run(['delete-asset', root, signups]);
    assert.equal(inUse.code, 1);
    assert.equal(inUse.json?.error, 'IN_USE', inUse.stdout);
    const gone = await ctx.cli.json(['delete-asset', root, url]);
    assert.equal(gone.deleted, url);
  });

  it('open serves the dashboard, wait (and comments --wait) ends quietly with nothing sent, stop ends the server', T, async () => {
    const root = copy('open');
    const opened = await ctx.cli.json(['open', root, '--json']);
    assert.equal(opened.type, TYPE);
    const page = await fetch(opened.url);
    assert.equal(page.status, 200);
    const wait = await ctx.cli.run(['wait', root, '--timeout', '1']);
    assert.equal(wait.code, 2, wait.stdout);
    const commentsWait = await ctx.cli.run(['comments', root, '--wait', '--timeout', '1']);
    assert.equal(commentsWait.code, 2, commentsWait.stdout);
    const comments = await ctx.cli.run(['comments', root]);
    assert.equal(comments.code, 0);
    const stop = await ctx.cli.run(['stop']);
    assert.equal(stop.code, 0, stop.stderr);
  });
});
