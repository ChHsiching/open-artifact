// End-to-end tests of the design-system type: the shared main path (lib/editor.mjs), plus what only a design
// system has: `generate`, uploads into an asset group, `list`, the Welcome page of an empty system, and files dropped
// on an asset group.
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';
import { buttonNamed, clickOn, editorSuite, startWait, textIn, typeInto } from './lib/editor.mjs';
import { png, until } from './lib/http.mjs';
import { copyFixture, tmpDir } from './lib/target.mjs';

const T = { timeout: 90000 };
const README = 'project/README.md';
const indexOf = root => JSON.parse(fs.readFileSync(path.join(root, 'project', 'design-system.json'), 'utf8'));

editorSuite({
  type: 'design-system',
  make: (ctx, root) => copyFixture('design-system', root),
  broken: (ctx, root) => {
    copyFixture('design-system', root);
    const file = path.join(root, 'project', 'design-system.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), namespace: 'Smoke System' }));
  },
  pageText: 'Smoke System',
  save: { file: README, edit: text => `${text}\nSaved by the page.\n` },
  diskEdit: {
    apply: ctx => fs.appendFileSync(path.join(ctx.root, README), '\nEdited on disk, shown on the overview.\n'),
    text: 'Edited on disk, shown on the overview.',
  },

  offline(ctx) {
    it('check refuses a namespace that is no JavaScript name, and design-system.json that is no JSON', T, async () => {
      const bad = path.join(tmpDir('ds-namespace'), 'artifact');
      ctx.spec.broken(ctx, bad);
      const out = await ctx.cli.run(['check', bad, '--json']);
      assert.equal(out.code, 1);
      assert.ok(out.json.findings.some(f => f.level === 'error' && /namespace/i.test(f.message)), out.stdout);
      fs.writeFileSync(path.join(bad, 'project', 'design-system.json'), '{ not json');
      const json = await ctx.cli.run(['check', bad]);
      assert.equal(json.code, 1, json.stdout);
    });

    it('generate writes the generated files, then finds them up to date', T, async () => {
      const root = path.join(tmpDir('ds-generate'), 'artifact');
      copyFixture('design-system', root);
      const first = await ctx.cli.run(['generate', root]);
      assert.equal(first.code, 0, first.stderr);
      assert.match(first.stdout, /^wrote {3}project\/tokens\.css$/m, first.stdout);
      assert.ok(fs.existsSync(path.join(root, 'project', 'tokens.css')));
      const again = await ctx.cli.run(['generate', root]);
      assert.equal(again.code, 0);
      assert.equal(again.stdout.trim(), 'Generated files are up to date.');
    });

    it('upload --group prints the record for an asset group, which the index then takes', T, async () => {
      const root = path.join(tmpDir('ds-upload'), 'artifact');
      copyFixture('design-system', root);
      const file = path.join(tmpDir('ds-upload-src'), 'Mark.png');
      fs.writeFileSync(file, png([9, 8, 7]));
      const out = await ctx.cli.json(['upload', root, file, '--group', 'Logos']);
      assert.equal(out.record.name, 'Mark.png');
      assert.match(out.url, /^\/_blob\/[0-9a-f]{32}$/);
      assert.equal(out.record.type, 'image/png');
      assert.deepEqual(out.indexPath.slice(0, 3), ['assetGroups', 'Logos', 'files']);
      assert.equal(out.shownAs, 'assets/Logos/Mark.png');
      assert.ok(fs.readdirSync(path.join(root, '_blobs')).some(f => f.startsWith(out.record.blob)), 'nothing under _blobs/');
      // As `next` says, the agent writes the record into the index.
      const index = indexOf(root);
      index.assetGroups.Logos.files[out.indexPath[3]] = out.record;
      index.assetGroups.Logos.order.push(out.record.name);
      fs.writeFileSync(path.join(root, 'project', 'design-system.json'), JSON.stringify(index, null, 2));
      const check = await ctx.cli.run(['check', root]);
      assert.equal(check.code, 0, check.stdout);
      const slash = await ctx.cli.run(['upload', root, file, '--group', 'a/b']);
      assert.equal(slash.code, 1, slash.stdout);
    });

    it('list finds the design system', T, async () => {
      const found = await ctx.cli.json(['list', path.dirname(ctx.root)]);
      assert.equal(found.systems.length, 1, JSON.stringify(found));
      assert.equal(found.systems[0].namespace, 'SmokeSystem');
      assert.equal(found.systems[0].root, ctx.root);
    });
  },

  chrome(ctx) {
    it('the overview shows the README, and opening the page writes the generated files', T, async () => {
      const page = ctx.page();
      assert.ok(page, 'the page did not open');
      assert.ok(await page.waitFor(textIn('Warm paper surfaces, one terracotta accent.'), 10000), 'the overview does not show the README');
      for (const file of ['tokens.css', 'manifest.json']) {
        assert.ok(await until(() => fs.existsSync(path.join(ctx.root, 'project', file)), 10000), `opening the page did not write project/${file}`);
      }
    });

    it('an empty system offers to start from code, and that request reaches wait', T, async () => {
      const root = path.join(tmpDir('ds-empty'), 'Empty System');
      fs.mkdirSync(root);
      const out = await ctx.cli.json(['open', root, '--type', 'design-system', '--title', 'Empty System', '--json']);
      const w = await startWait(ctx, root, 60);
      const page = await (await ctx.browser()).load(out.url, { ready: textIn('From code'), settle: 800 });
      try {
        await clickOn(page, `[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('From code'))`, 'From code');
        const area = `document.querySelector('textarea[placeholder^="Anything to add?"]')`;
        assert.ok(await page.waitFor(area, 5000), 'From code did not open');
        await typeInto(page, area, 'Use the web package.');
        // The card's own button, not the one in the header.
        await clickOn(page, `(${area}).parentElement.querySelector('button')`, 'the card’s Send to agent');
        const { code, stdout } = await w.done;
        assert.equal(code, 0, stdout);
        assert.match(stdout, /Build this design system from a code repository\./);
        assert.match(stdout, /^Use the web package\.$/m);
        assert.deepEqual(page.problems, []);
      } finally {
        w.child.kill('SIGTERM');
        await page.close();
      }
    });

    it('files dropped on an asset group are uploaded into it', T, async () => {
      const { root, url } = await ctx.openNew('drop');
      const page = await (await ctx.browser()).load(url, { ready: textIn('Smoke System'), settle: 800 });
      try {
        await clickOn(page, `[...document.querySelectorAll('nav button, nav a, aside button, aside a')].find(b => b.textContent.trim().startsWith('Assets'))`, 'Assets in the sidebar');
        const section = `[...document.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent.trim().startsWith('Logos'))`;
        assert.ok(await page.waitFor(section, 10000), 'no Logos group on the Assets page');
        const bytes = [...png([4, 5, 6])];
        await page.evaluate(`(() => {
          const dt = new DataTransfer();
          dt.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})], 'Dropped.png', { type: 'image/png' }));
          const target = ${section};
          target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
          target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
        })()`);
        let record;
        assert.ok(
          await until(() => (record = Object.values(indexOf(root).assetGroups.Logos.files).find(r => r.name === 'Dropped.png')), 15000),
          `nothing added to Logos: ${JSON.stringify(indexOf(root).assetGroups.Logos)}`,
        );
        assert.equal(record.type, 'image/png');
        assert.match(record.blob, /^[0-9a-f]{32}$/);
        assert.deepEqual(page.problems, []);
      } finally {
        await page.close();
      }
    });
  },
});
