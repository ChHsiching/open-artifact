import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { controlFor, initialProps, liveScript, parseDefault } from '../src/lib/live-props.ts';

describe('controlFor', () => {
  it('maps declared types to controls', () => {
    assert.deepEqual(controlFor({ name: 'variant', type: "'primary' | 'secondary' | 'ghost'" }), { kind: 'select', options: ['primary', 'secondary', 'ghost'] });
    assert.deepEqual(controlFor({ name: 'disabled', type: 'boolean' }), { kind: 'boolean' });
    assert.deepEqual(controlFor({ name: 'size', type: 'number | undefined' }), { kind: 'number' });
    assert.deepEqual(controlFor({ name: 'label', type: 'string' }), { kind: 'text' });
    assert.deepEqual(controlFor({ name: 'children', type: 'React.ReactNode' }), { kind: 'text', multiline: true });
    assert.deepEqual(controlFor({ name: 'items', type: 'string[]' }), { kind: 'json' });
  });

  it('skips functions and refs', () => {
    assert.equal(controlFor({ name: 'onClick', type: '(event: MouseEvent) => void' }), null);
    assert.equal(controlFor({ name: 'ref', type: 'Ref<HTMLButtonElement>' }), null);
  });
});

describe('initial props', () => {
  it('reads defaults and fills required props', () => {
    assert.equal(parseDefault({ kind: 'select', options: ['a', 'b'] }, "'b'"), 'b');
    assert.equal(parseDefault({ kind: 'boolean' }, 'true'), true);
    assert.deepEqual(
      initialProps([
        { name: 'variant', type: "'primary' | 'ghost'", optional: true, defaultValue: "'ghost'" },
        { name: 'tone', type: "'info' | 'warn'", optional: false },
        { name: 'children', type: 'ReactNode', optional: true },
        { name: 'title', type: 'string', optional: false },
        { name: 'onClick', type: '() => void', optional: true },
      ]),
      { variant: 'ghost', tone: 'info', children: 'Label', title: 'Title' },
    );
  });
});

describe('liveScript', () => {
  it('escapes markup in the props', () => {
    const script = liveScript('DS', 'Button', { children: '</script><b>' }, 'x');
    assert.ok(!script.slice(8, -9).includes('</script>'));
  });
});
