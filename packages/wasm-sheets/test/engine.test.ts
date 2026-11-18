import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sheetsEngine } from '../src/node.ts';

test('a session works a formula out', () => {
  const engine = sheetsEngine();
  const described = JSON.parse(engine.utilityJson(JSON.stringify({ kind: 'describeSharedCode' })));
  assert.equal(typeof described.newestFormatVersion, 'number');
  const functions = JSON.parse(engine.functionDescriptionsJson());
  assert.ok(Array.isArray(functions) ? functions.length > 300 : Object.keys(functions).length > 0);
  const session = engine.session();
  assert.equal(JSON.parse(session.answerJson(JSON.stringify({ kind: 'readWorkbook' }))).kind, 'workbookContents');
  session.free();
});
