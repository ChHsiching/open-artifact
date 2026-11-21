import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Slide, SlideNode } from '@open-artifact/slides-core';
import { changedNodePaths } from '../src/lib/changed-nodes.ts';

const text = (t: string, style: Record<string, string> = {}): SlideNode => ({ kind: 'text', tag: 'p', style, runs: [{ text: t }] }) as unknown as SlideNode;
const box = (children: SlideNode[], style: Record<string, string> = {}): SlideNode => ({ kind: 'box', style, children }) as unknown as SlideNode;
const slide = (children: SlideNode[]): Slide => ({ id: 's', hidden: false, style: {}, children, notes: '' }) as Slide;

describe('changedNodePaths', () => {
  it('finds the nodes a change added or changed', () => {
    const before = slide([text('Title'), box([text('One')])]);
    const after = slide([text('Title'), box([text('One'), text('Two')]), text('Footer', { color: 'red' })]);
    assert.deepEqual([...changedNodePaths(before, after)].sort(), ['1.1', '2'], 'the card itself did not change');
  });

  it('leaves out nodes that only moved, and counts repeated nodes', () => {
    const before = slide([text('A'), text('B')]);
    assert.deepEqual([...changedNodePaths(before, slide([text('B'), text('A')]))], []);
    assert.deepEqual([...changedNodePaths(before, slide([text('A'), text('B'), text('B')]))], ['2']);
  });

  it('counts a node whose style changed and ignores where nodes were read from', () => {
    const read = (origin: number): SlideNode => ({ ...(text('A') as object), origin }) as unknown as SlideNode;
    assert.deepEqual([...changedNodePaths(slide([read(3)]), slide([read(7)]))], []);
    assert.deepEqual([...changedNodePaths(slide([text('A')]), slide([text('A', { left: '10px' })]))], ['0']);
  });
});
