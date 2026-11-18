import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyOps, blockHash, blocksToMarkdown, type Chips, type DocState, docXml, imageInfo, parseMarkdown, Refusal, type Session } from '../src/index.ts';

interface Step {
  ops: unknown[];
  options: { guards?: boolean; ifRev?: number };
  expect: { ok: boolean; code?: string; xml?: string; rev?: number; next: number; minted?: unknown[]; notices?: unknown[] };
}
interface Vectors {
  chips: Chips;
  session: string;
  vectors: { markdown: string; steps: Step[] }[];
}

const vectors = JSON.parse(readFileSync(new URL('./ops-vectors.json', import.meta.url), 'utf8')) as Vectors;
const idsFor = (session: Session) => ({ take: () => `${session.sess}.${session.next++}` });

test('ops replay the recorded vectors', () => {
  for (const [index, vector] of vectors.vectors.entries()) {
    const session: Session = { sess: vectors.session, next: 1 };
    let doc: DocState = { rev: 1, blocks: parseMarkdown(vector.markdown, idsFor(session), vectors.chips, { me: { id: 'u1', name: 'Me' } }) };
    for (const [stepIndex, step] of vector.steps.entries()) {
      const where = `vector ${index} step ${stepIndex}`;
      try {
        const result = applyOps(doc, step.ops, session, step.options);
        assert.ok(step.expect.ok, `${where}: expected ${step.expect.code}`);
        assert.equal(docXml(result.doc), step.expect.xml, where);
        assert.equal(result.doc.rev, step.expect.rev, where);
        assert.deepEqual(result.results.map(item => item.minted ?? null), step.expect.minted, where);
        assert.deepEqual(result.notices, step.expect.notices, where);
        doc = result.doc;
      } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
        assert.ok(!step.expect.ok, `${where}: unexpected ${String(error)}`);
        assert.equal((error as Refusal).code, step.expect.code, where);
      }
      assert.equal(session.next, step.expect.next, `${where}: session counter`);
    }
  }
});

test('whole-block replace needs a guard on agent writes', () => {
  const session: Session = { sess: 'b0000000001', next: 1 };
  const doc: DocState = { rev: 3, blocks: parseMarkdown('One\n\nTwo', idsFor(session)) };
  const target = doc.blocks[0]!;
  const op = { op: 'replace', target: { kind: 'blocks', ids: [target.id] }, source: { text: 'Uno' } };
  assert.throws(() => applyOps(doc, [op], session, { guards: true, ifRev: 3 }), (error: Refusal) => error.code === 'missing_guard');
  const stale = { ...op, ifHash: '00000000' };
  assert.throws(() => applyOps(doc, [stale], session, { guards: true, ifRev: 3 }), (error: Refusal) => error.code === 'guard_mismatch');
  const result = applyOps(doc, [{ ...op, ifHash: blockHash(target) }], session, { guards: true, ifRev: 3 });
  assert.equal(result.doc.rev, 4);
  assert.match(docXml(result.doc), /Uno/);
});

test('markdown chips use the oa processing instruction', () => {
  const session: Session = { sess: 'c0000000001', next: 1 };
  const keys: Record<string, string> = {};
  const blocks = parseMarkdown('Due <?oa block d?>.\n\n<?oa block p?>', idsFor(session), { d: { type: 'date', value: '2026-11-02' }, p: { type: 'pending', intent: 'Next steps' } }, { keys });
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1]!.type, 'pending');
  assert.deepEqual(Object.keys(keys).sort(), ['d', 'p']);
  assert.throws(() => parseMarkdown('<?oa block nope?>', idsFor(session)), (error: Error & { code?: string }) => error.code === 'chip_unknown');
});

test('markdown survives a round trip', () => {
  const session: Session = { sess: 'd0000000001', next: 1 };
  const source = '# Title\n\nSome **bold** and *italic* words.\n\n- one\n- two\n\n> quoted\n\n```ts\nconst x = 1;\n```';
  const out = blocksToMarkdown(parseMarkdown(source, idsFor(session)));
  assert.equal(blocksToMarkdown(parseMarkdown(out, idsFor(session))), out);
  assert.match(out, /^# Title/);
  assert.match(out, /\*\*bold\*\*/);
});

test('image headers give kind and size', () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 640);
  new DataView(png.buffer).setUint32(20, 480);
  assert.deepEqual(imageInfo(png), { mime: 'image/png', width: 640, height: 480 });
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x00, 0x10, 0x00]);
  assert.deepEqual(imageInfo(gif), { mime: 'image/gif', width: 32, height: 16 });
  assert.equal(imageInfo(new Uint8Array([1, 2, 3, 4])), null);
});
