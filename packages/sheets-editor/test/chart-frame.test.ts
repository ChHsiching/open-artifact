import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chartModule } from '@open-artifact/sheets-core';
import { STOCK_CHART_PROGRAMS, STOCK_KINDS } from '@open-artifact/sheets-core/stock-charts';
import { ChartFault, emptyGlobal, runChart, type ChartRun } from '../src/chart-frame/chart-runtime.ts';
import { drawTree, DrawingFault, MOST, type DrawnTooltipProps } from '../src/chart-frame/drawing.ts';
import type { ChartInputs, ChartRow, DrawnElement, DrawnNode, FrameToWorker, WorkerToFrame } from '../src/chart-frame/messages.ts';
import { composeFrameDocument } from '../chart-frame-page.ts';

type Told = Exclude<FrameToWorker, { kind: 'code' }>;

/** Runs a chart's init with the runtime, drawing on every microtask, as the worker does. */
function runInit(init: unknown): { run: ChartRun; sent: WorkerToFrame[]; settle: () => Promise<void>; hear: (...told: Told[]) => Promise<void> } {
  const sent: WorkerToFrame[] = [];
  const queue: (() => void)[] = [];
  const run = runChart(() => init, (message) => sent.push(JSON.parse(JSON.stringify(message)) as WorkerToFrame), (task) => queue.push(task));
  const settle = async (): Promise<void> => {
    for (let task = queue.shift(); task !== undefined; task = queue.shift()) task();
    await Promise.resolve();
  };
  const hear = async (...told: Told[]): Promise<void> => {
    for (const message of told) run.hear(message);
    await settle();
  };
  return { run, sent, settle, hear };
}

async function initOfCode(code: string): Promise<unknown> {
  const module = (await import(`data:text/javascript;base64,${Buffer.from(chartModule(code)).toString('base64')}`)) as { init: unknown };
  return module.init;
}

const SIZE: Told = { kind: 'size', size: { width: 480, height: 280 } };
const cells = (...rows: (string | number)[][]): ChartRow[] =>
  rows.map((row) => row.map((value) => ({ value, text: typeof value === 'number' ? value.toLocaleString('en-US') : value })));
const ROWS: ChartInputs = { rows: cells(['Item', 'Cost', 'Tax'], ['Rent', 1200, 100], ['Food', 400, 50], ['Total', 1600, 150]) };

const drawings = (sent: WorkerToFrame[]): Extract<WorkerToFrame, { kind: 'drawing' }>[] =>
  sent.filter((message): message is Extract<WorkerToFrame, { kind: 'drawing' }> => message.kind === 'drawing');
const failures = (sent: WorkerToFrame[]): string[] =>
  sent.flatMap((message) => (message.kind === 'failed' ? [message.fault] : []));

const isElement = (node: DrawnNode): node is DrawnElement => typeof node === 'object' && node !== null && !Array.isArray(node);
function elementsOf(node: DrawnNode): DrawnElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf);
  if (!isElement(node)) return [];
  return [node, ...node.children.flatMap(elementsOf)];
}

const TestTooltip = ({ content, detail, children }: DrawnTooltipProps): React.ReactElement =>
  React.createElement('g', { 'data-tooltip': content, 'data-detail': detail }, children);
const toMarkup = (tree: unknown, press: (handler: number) => void = () => {}): string =>
  renderToStaticMarkup(React.createElement(React.Fragment, null, drawTree(tree, press, TestTooltip)));
const element = (tag: string, attributes: DrawnElement['attributes'] = {}, children: DrawnNode[] = [], onClick: number | null = null): DrawnElement => ({
  tag,
  key: null,
  attributes,
  onClick,
  children,
});
const faultOf = (run: () => unknown): string | null => {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof DrawingFault ? error.fault : 'other';
  }
};

describe('the chart runtime', () => {
  it('draws once both the inputs and the size have come', async () => {
    const init = (sheet: { Visualize: unknown }, react: { createElement: (...args: unknown[]) => unknown }) => () =>
      react.createElement(sheet.Visualize, { sources: { rows: { kind: 'ref', ref: 'input/rows', adapter: { kind: 'cells' } } } }, ({ rows }: { rows: ChartRow[] }) =>
        react.createElement('svg', { width: 10, height: 10 }, react.createElement('text', { fill: 'red' }, rows[1]?.[0]?.text)),
      );
    const { sent, hear } = runInit(init);
    await hear({ kind: 'inputs', inputs: ROWS });
    assert.equal(drawings(sent).length, 0);
    await hear(SIZE);
    const [drawing] = drawings(sent);
    assert.ok(drawing);
    assert.equal(drawing.heard, 2);
    const texts = elementsOf(drawing.tree).filter(({ tag }) => tag === 'text');
    assert.deepEqual(texts.map(({ children }) => children), [['Rent']]);
  });

  it('runs a click handler, waits for the drawing to be shown, and draws its state', async () => {
    const init = (_sheet: unknown, react: { createElement: (...args: unknown[]) => unknown }, hooks: { useState: (initial: number) => [number, (next: (n: number) => number) => void] }) =>
      function Counter() {
        const [count, setCount] = hooks.useState(0);
        return react.createElement('svg', null, react.createElement('rect', { onClick: () => setCount((n) => n + 1), width: count }));
      };
    const { sent, hear } = runInit(init);
    await hear({ kind: 'inputs', inputs: {} }, SIZE);
    const first = drawings(sent).at(-1);
    const rect = elementsOf(first?.tree ?? null).find(({ tag }) => tag === 'rect');
    assert.equal(rect?.attributes.width, 0);
    assert.equal(typeof rect?.onClick, 'number');
    await hear({ kind: 'pressed', drawing: first?.drawing ?? 0, handler: rect?.onClick ?? -1 });
    assert.equal(drawings(sent).length, 1, 'no drawing goes before the last is shown');
    await hear({ kind: 'shown' });
    const second = drawings(sent).at(-1);
    assert.equal(elementsOf(second?.tree ?? null).find(({ tag }) => tag === 'rect')?.attributes.width, 1);
  });

  it('stops a click from reaching the handlers around it when asked', async () => {
    const pressed: string[] = [];
    const init = (_sheet: unknown, react: { createElement: (...args: unknown[]) => unknown }) => () =>
      react.createElement(
        'g',
        { onClick: () => pressed.push('outer') },
        react.createElement('rect', { onClick: (event: { stopPropagation: () => void }) => (pressed.push('inner'), event.stopPropagation()) }),
        react.createElement('circle', { onClick: () => pressed.push('passes') }),
      );
    const { sent, hear } = runInit(init);
    await hear({ kind: 'inputs', inputs: {} }, SIZE);
    const drawing = drawings(sent)[0];
    const [rect, circle] = ['rect', 'circle'].map((tag) => elementsOf(drawing?.tree ?? null).find((one) => one.tag === tag));
    await hear({ kind: 'pressed', drawing: drawing?.drawing ?? 0, handler: rect?.onClick ?? -1 });
    await hear({ kind: 'pressed', drawing: drawing?.drawing ?? 0, handler: circle?.onClick ?? -1 });
    assert.deepEqual(pressed, ['inner', 'passes', 'outer']);
  });

  it('answers stillThere at once', async () => {
    const { sent, hear } = runInit(() => () => null);
    await hear({ kind: 'stillThere', nth: 3 });
    assert.deepEqual(sent, [{ kind: 'here', nth: 3 }]);
  });

  const failsWith = async (init: unknown, told: Told[] = [{ kind: 'inputs', inputs: ROWS }, SIZE]): Promise<string[]> => {
    const { sent, hear } = runInit(init);
    await hear(...told);
    return failures(sent);
  };

  it('fails a module whose init is no function, or gives none', async () => {
    assert.deepEqual(await failsWith(undefined), ['notAModule']);
    assert.deepEqual(await failsWith(() => 'chart'), ['notAModule']);
  });

  it('fails a name the code cannot reach as not drawn in Sheets', async () => {
    assert.deepEqual(await failsWith(() => () => { throw new ReferenceError('window is not defined'); }), ['notDrawnInSheets']);
  });

  it('fails the hooks it does not have, and hooks called out of order', async () => {
    const usesContext = (_sheet: unknown, _react: unknown, hooks: { useContext: () => unknown }) => () => hooks.useContext();
    assert.deepEqual(await failsWith(usesContext), ['notDrawnInSheets']);
    let flipped = false;
    const flips = (_sheet: unknown, react: { createElement: (...args: unknown[]) => unknown }, hooks: { useState: (n: number) => [number, (n: number) => void]; useRef: (n: number) => unknown }) =>
      function Flips() {
        if (flipped) hooks.useRef(0);
        const [step, setStep] = hooks.useState(0);
        if (step === 0) {
          flipped = true;
          setStep(1);
        }
        return react.createElement('g', null);
      };
    assert.deepEqual(await failsWith(flips), ['threw']);
  });

  it('fails an input it was not given, and an input of too many rows', async () => {
    const reads = (name: string) => (sheet: { Visualize: unknown }, react: { createElement: (...args: unknown[]) => unknown }) => () =>
      react.createElement(sheet.Visualize, { sources: { rows: { kind: 'ref', ref: `input/${name}`, adapter: { kind: 'cells' } } } }, () => null);
    assert.deepEqual(await failsWith(reads('other')), ['inputMissing']);
    const many: ChartInputs = { rows: Array.from({ length: 2001 }, () => cells(['x'])[0] ?? []) };
    assert.deepEqual(await failsWith(reads('rows'), [{ kind: 'inputs', inputs: many }, SIZE]), ['tooManyRows']);
  });

  it('fails a chart that never settles', async () => {
    const restless = (_sheet: unknown, _react: unknown, hooks: { useState: (n: number) => [number, (n: number) => void] }) =>
      function Restless() {
        const [count, setCount] = hooks.useState(0);
        setCount(count + 1);
        return null;
      };
    assert.deepEqual(await failsWith(restless), ['threw']);
  });

  it('gives chartSize the true size of the chart', async () => {
    let seen: unknown = null;
    const init = (sheet: { Visualize: unknown }, react: { createElement: (...args: unknown[]) => unknown }) => () =>
      react.createElement(sheet.Visualize, { sources: { chartSize: { kind: 'data', data: [{ width: 1, height: 1 }] } } }, ({ chartSize }: { chartSize: unknown }) => {
        seen = chartSize;
        return null;
      });
    await failsWith(init);
    assert.deepEqual(seen, [{ width: 480, height: 280 }]);
  });

  for (const kind of STOCK_KINDS)
    it(`draws the ${kind} stock chart into a tree the frame draws`, async () => {
      const { sent, hear } = runInit(await initOfCode(STOCK_CHART_PROGRAMS[kind]));
      await hear({ kind: 'inputs', inputs: ROWS }, SIZE);
      assert.deepEqual(failures(sent), []);
      const tree = drawings(sent)[0]?.tree ?? null;
      const markup = toMarkup(tree);
      assert.match(markup, /^<div class="chart-drawn-by-hand"><svg /);
      assert.match(markup, /Rent/);
      assert.match(markup, /data-tooltip=/);
      assert.doesNotMatch(markup, /--ui-|agent/);
    });
});

describe('the drawing of a tree', () => {
  it('keeps the attributes that place and paint, and drops the rest', () => {
    const markup = toMarkup(
      element('svg', { viewBox: '0 0 10 10', role: 'img', 'aria-label': 'A chart', className: 'x', id: 'y', href: 'z' }, [
        element('rect', { fill: 'var(--chart-categorical-1)', strokeWidth: 2, width: Infinity }),
        element('title', {}, ['gone']),
      ]),
    );
    assert.equal(markup, '<svg viewBox="0 0 10 10" role="img" aria-label="A chart"><rect fill="var(--chart-categorical-1)" stroke-width="2"></rect></svg>');
  });

  it('drops a value that would load something, and a role it does not know', () => {
    const markup = toMarkup(element('svg', { role: 'button' }, [element('rect', { fill: 'url(#x)' }), element('path', { d: 'M0 0 calc(1)' })]));
    assert.equal(markup, '<svg><rect></rect><path></path></svg>');
  });

  it('ends at a tag that is not svg, or dashes it does not allow', () => {
    assert.equal(faultOf(() => toMarkup(element('div'))), 'notDrawnInSheets');
    assert.equal(faultOf(() => toMarkup(element('svg', {}, [element('foreignObject')]))), 'notDrawnInSheets');
    assert.equal(faultOf(() => toMarkup(element('rect', { strokeDasharray: '4 2' }))), 'notDrawnInSheets');
    assert.equal(faultOf(() => toMarkup(element('path', { strokeDasharray: '40' }))), 'notDrawnInSheets');
    assert.equal(faultOf(() => toMarkup(element('line', { strokeDasharray: '4 2' }))), null);
  });

  it('ends at a malformed tree', () => {
    assert.equal(faultOf(() => toMarkup({ tag: 'svg', key: null, attributes: [], onClick: null, children: [] })), 'threw');
    assert.equal(faultOf(() => toMarkup(new Date())), 'threw');
  });

  it('ends at a tree too deep or too big', () => {
    let deep: DrawnNode = element('g');
    for (let depth = 0; depth < MOST.deep; depth++) deep = element('g', {}, [deep]);
    assert.equal(faultOf(() => toMarkup(element('svg', {}, [deep]))), 'tooManyRows');
    const many = Array.from({ length: MOST.elementsOfWords + 1 }, () => element('text'));
    assert.equal(faultOf(() => toMarkup(element('svg', {}, many))), 'tooManyRows');
  });

  it('groups more siblings than sit side by side', () => {
    const markup = toMarkup(element('svg', {}, Array.from({ length: 40 }, () => element('rect'))));
    assert.equal((markup.match(/<rect>/g) ?? []).length, 40);
    assert.equal((markup.match(/<g>/g) ?? []).length, 2);
  });

  it('wraps one mark in its tooltip, and several in a group within svg alone', () => {
    const tooltip = (children: DrawnNode[]): DrawnElement => element('Tooltip', { content: 'Rent', detail: '1,200' }, children);
    assert.equal(
      toMarkup(element('svg', {}, [tooltip([element('rect')])])),
      '<svg><g data-tooltip="Rent" data-detail="1,200"><rect></rect></g></svg>',
    );
    assert.equal(
      toMarkup(element('svg', {}, [tooltip([element('rect'), element('circle')])])),
      '<svg><g data-tooltip="Rent" data-detail="1,200"><g><rect></rect><circle></circle></g></g></svg>',
    );
    assert.equal(faultOf(() => toMarkup(element('text', {}, [tooltip([element('tspan'), 'x'])]))), 'notDrawnInSheets');
  });

  it('shortens long words, and ends at too many', () => {
    const markup = toMarkup(element('svg', { 'aria-label': 'x'.repeat(MOST.lettersInValue + 5) }));
    assert.match(markup, new RegExp(`aria-label="x{${String(MOST.lettersInValue - 1)}}…"`));
    assert.equal(faultOf(() => toMarkup(element('svg', {}, ['x'.repeat(MOST.lettersToRead + 1)]))), 'tooManyRows');
  });

  it('gives a press the number of its handler', () => {
    const pressed: number[] = [];
    const drawn = drawTree(element('rect', {}, [], 3), (handler) => pressed.push(handler), TestTooltip);
    assert.ok(React.isValidElement<{ onClick: (event: { stopPropagation: () => void }) => void }>(drawn));
    drawn.props.onClick({ stopPropagation: () => {} });
    assert.deepEqual(pressed, [3]);
  });
});

describe('the worker global', () => {
  it('keeps the language and deletes what reaches out', () => {
    const host = { fetch: () => {}, postMessage: () => {} };
    const global = Object.assign(Object.create(host) as object, { Math, JSON, location: {}, answer: 42 });
    assert.deepEqual(emptyGlobal(global), []);
    assert.deepEqual(Reflect.ownKeys(global).sort(), ['JSON', 'Math']);
    assert.equal('fetch' in global, false);
  });

  it('reports a name that cannot be deleted', () => {
    const global = {};
    Object.defineProperty(global, 'stuck', { value: {}, configurable: false });
    assert.deepEqual(emptyGlobal(global), ['stuck']);
  });

  it('names a fault for the frame', () => {
    assert.equal(new ChartFault('tooManyRows').fault, 'tooManyRows');
  });
});

describe('the frame document', () => {
  it('runs its one script by hash, and keeps the worker inert', () => {
    const page = composeFrameDocument({ worker: 'import(x);"</script>"', script: 'go("</script>")', style: 'a{}' });
    const scripts = [...page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 2);
    const [worker, main] = scripts;
    assert.match(worker?.[1] ?? '', /type="text\/plain" id="script-of-worker"/);
    const hash = createHash('sha256').update(main?.[2] ?? '').digest('base64');
    assert.ok(page.includes(`script-src 'sha256-${hash}' blob:`));
    assert.match(page, /default-src 'none'.*connect-src 'none'/);
  });
});
