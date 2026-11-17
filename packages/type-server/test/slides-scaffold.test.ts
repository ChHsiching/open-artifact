import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { TYPES } from '../src/types.ts';

describe('slides scaffold', () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'open-artifact-slides-scaffold-'));
  });
  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('starts an empty folder as a source deck that checks clean', async () => {
    const project = join(dir, 'empty', 'project');
    const files = TYPES.slides.scaffold('Q3 Review', project);
    const index = JSON.parse(files['deck.json']!) as { v: number; format?: unknown; title: string };
    assert.equal(index.v, 5);
    assert.deepEqual(index.format, { v: 1, shared: ['project/deck.css'] });
    assert.equal(index.title, 'Q3 Review');
    assert.ok(files['deck.css'], 'deck.css is sent with the index');
    const findings = TYPES.slides.check(new Map(Object.entries(files)));
    assert.deepEqual(findings.filter((f) => f.level !== 'info'), []);
  });

  it('keeps a folder of inline slides without an index inline', async () => {
    const project = join(dir, 'inline', 'project');
    await mkdir(join(project, 'slides'), { recursive: true });
    await writeFile(join(project, 'slides', 'cover.html'), '<section id="cover"></section>');
    const files = TYPES.slides.scaffold('Old deck', project);
    const index = JSON.parse(files['deck.json']!) as { v: number; format?: unknown };
    assert.equal(index.v, 4);
    assert.equal(index.format, undefined);
    assert.equal(files['deck.css'], undefined);
  });

  it('never overwrites a deck.css that is already there', async () => {
    const project = join(dir, 'css', 'project');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'deck.css'), 'section{color:red}');
    const files = TYPES.slides.scaffold('Kept', project);
    assert.equal(JSON.parse(files['deck.json']!).v, 5);
    assert.equal(files['deck.css'], undefined);
  });
});
