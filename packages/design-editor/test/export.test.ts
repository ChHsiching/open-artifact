import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exportFormats, exportJob, selectedArtboard, type ExportScene } from '../src/lib/export-formats.ts';

describe('the Shell export formats', () => {
  const board = { path: 'boards/hero.dc.html', png: [true, true] as const };
  const scene = (over: Partial<ExportScene> = {}): ExportScene => ({ artboard: board, page: 'p1', pageArtboards: 3, canvasArtboards: 5, ...over });
  const entries = (formats: ReturnType<typeof exportFormats>) =>
    formats.flatMap((f) => (f.variants ?? []).map((v) => `${f.format}:${v.id}${f.disabled || v.disabled ? ' (off)' : ''}`));

  const widths = ['png:w390', 'png:w768', 'png:w1024', 'png:w1280', 'png:w1440', 'png:w1920'];

  it('declares PNG, JPEG, PDF and HTML, each for the selected artboard, the whole page or the canvas', () => {
    const formats = exportFormats(scene());
    assert.deepEqual(
      formats.map((f) => f.format),
      ['png', 'jpeg', 'pdf', 'html'],
    );
    assert.deepEqual(entries(formats), ['png:current', 'png:current2x', ...widths, 'png:all', 'jpeg:current', 'jpeg:current2x', 'pdf:current', 'pdf:all', 'html:current', 'html:single', 'html:figma', 'html:canvas']);
    assert.ok(formats.length <= 8);
    // What the Shell accepts: at most 8 formats, ids it parses, labels it shows.
    for (const f of formats) {
      assert.match(f.format, /^[a-z0-9]{1,8}$/);
      for (const v of f.variants ?? []) assert.match(v.id, /^[a-z][a-z0-9_-]{0,31}$/);
    }
  });

  it('turns off what needs an artboard when none is selected, and what needs artboards on an empty page', () => {
    assert.deepEqual(entries(exportFormats(scene({ artboard: null }))), [
      'png:current (off)',
      'png:current2x (off)',
      ...widths.map((w) => `${w} (off)`),
      'png:all',
      'jpeg:current (off)',
      'jpeg:current2x (off)',
      'pdf:current (off)',
      'pdf:all',
      'html:current (off)',
      'html:single (off)',
      'html:figma (off)',
      'html:canvas',
    ]);
    assert.deepEqual(entries(exportFormats(scene({ artboard: null, pageArtboards: 0 }))).filter((e) => !e.endsWith('(off)')), ['html:canvas']);
    assert.deepEqual(entries(exportFormats(scene({ artboard: null, pageArtboards: 0, canvasArtboards: 0 }))).filter((e) => !e.endsWith('(off)')), []);
    assert.deepEqual(entries(exportFormats(scene({ artboard: { ...board, png: [true, false] } }))).slice(0, 2), ['png:current', 'png:current2x (off)']);
  });

  it('maps each entry to its export, and refuses what is not offered now', () => {
    const s = scene();
    assert.deepEqual(exportJob(s, 'png', 'current'), { kind: 'png', path: board.path, scale: 1 });
    assert.deepEqual(exportJob(s, 'png', 'current2x'), { kind: 'png', path: board.path, scale: 2 });
    assert.deepEqual(exportJob(s, 'png', 'all'), { kind: 'pngAll', page: 'p1' });
    assert.deepEqual(exportJob(s, 'pdf', 'current'), { kind: 'pdf', path: board.path });
    assert.deepEqual(exportJob(s, 'pdf', 'all'), { kind: 'pdfAll', page: 'p1' });
    assert.deepEqual(exportJob(s, 'html', 'current'), { kind: 'html', path: board.path });
    assert.deepEqual(exportJob(s, 'html', 'figma'), { kind: 'figma', path: board.path });
    assert.deepEqual(exportJob(s, 'html', 'single'), { kind: 'single', path: board.path });
    assert.deepEqual(exportJob(s, 'html', 'canvas'), { kind: 'site' });
    assert.deepEqual(exportJob(s, 'jpeg', 'current2x'), { kind: 'jpeg', path: board.path, scale: 2 });
    assert.deepEqual(exportJob(s, 'png', 'w1440'), { kind: 'png', path: board.path, scale: 1, width: 1440 });
    assert.equal(exportJob(s, 'png', 'w1441'), null);
    assert.deepEqual(exportJob(scene({ artboard: null }), 'html', 'canvas'), { kind: 'site' });
    assert.equal(exportJob(s, 'pptx', undefined), null);
    assert.equal(exportJob(s, 'png', undefined), null);
    assert.equal(exportJob(s, 'png', 'huge'), null);
    assert.equal(exportJob(scene({ artboard: null }), 'pdf', 'current'), null);
    assert.equal(exportJob(scene({ artboard: null }), 'html', 'figma'), null);
    assert.equal(exportJob(scene({ artboard: { ...board, png: [true, false] } }), 'png', 'current2x'), null);
    assert.equal(exportJob(scene({ pageArtboards: 0 }), 'pdf', 'all'), null);
  });

  it('takes the focused artboard, or the one selected alone on the canvas', () => {
    const boards = { 'a.dc.html': {}, 'b.dc.html': {} };
    const none = { kind: 'none' } as const;
    assert.equal(selectedArtboard({ mode: 'focused', focused: 'a.dc.html', selection: none }, boards), 'a.dc.html');
    assert.equal(selectedArtboard({ mode: 'canvas', focused: null, selection: { kind: 'objects', boards: ['b.dc.html'], notes: [] } }, boards), 'b.dc.html');
    assert.equal(selectedArtboard({ mode: 'canvas', focused: null, selection: { kind: 'objects', boards: ['a.dc.html', 'b.dc.html'], notes: [] } }, boards), null);
    assert.equal(selectedArtboard({ mode: 'canvas', focused: null, selection: { kind: 'elements', board: 'a.dc.html', items: [] } }, boards), 'a.dc.html');
    assert.equal(selectedArtboard({ mode: 'canvas', focused: null, selection: none }, boards), null);
    // An artboard that left the canvas is not exported.
    assert.equal(selectedArtboard({ mode: 'focused', focused: 'gone.dc.html', selection: none }, boards), null);
  });
});
