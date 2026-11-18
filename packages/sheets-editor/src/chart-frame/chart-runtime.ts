/**
 * What runs a chart in its worker: a global object emptied of all but the language, and a small runtime of
 * createElement and the hooks that draws the chart's component into a plain tree. The code never reaches a document:
 * a click comes back as the number of its handler.
 */
import {
  FRAGMENT_TAG,
  TOOLTIP_TAG,
  VISUALIZE_TAG,
  type ChartInputs,
  type ChartRow,
  type ChartSize,
  type DrawnElement,
  type DrawnNode,
  type FrameToWorker,
  type WorkerFault,
  type WorkerToFrame,
} from './messages.ts';

/** The names the code may still read on the global object: the language's own. */
const LANGUAGE_GLOBALS = new Set<PropertyKey>([
  'globalThis', 'Infinity', 'NaN', 'undefined', 'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'decodeURI',
  'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape', 'unescape', 'Object', 'Function', 'Boolean', 'Symbol',
  'Number', 'BigInt', 'String', 'RegExp', 'Date', 'Array', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Proxy',
  'Iterator', 'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError',
  'URIError', 'SuppressedError', 'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array',
  'Uint16Array', 'Int32Array', 'Uint32Array', 'BigInt64Array', 'BigUint64Array', 'Float16Array', 'Float32Array',
  'Float64Array', 'DisposableStack', 'AsyncDisposableStack', 'Math', 'JSON', 'Reflect', 'Intl',
]);

const SHARED_MEMORY_AND_MORE = ['SharedArrayBuffer', 'Atomics', 'WeakRef', 'FinalizationRegistry', 'WebAssembly', 'ShadowRealm', 'Temporal'];

/** Names a worker may have that are not own keys everywhere: each is deleted wherever it is found. */
const HOST_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'WebTransport', 'EventSource', 'FontFace', 'importScripts',
  'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'caches', 'RTCPeerConnection', 'Request', 'createImageBitmap',
  'setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame', 'MessageChannel', 'MessagePort', 'scheduler',
  'postMessage', 'close', 'self', 'navigator', 'location', 'performance', 'crypto', 'addEventListener',
  'removeEventListener', 'dispatchEvent', 'onmessage', 'onerror', 'onunhandledrejection', 'reportError', 'Response', 'Blob',
  'URL', 'Notification', 'fonts', 'GPU', 'MediaSource', 'structuredClone', 'OffscreenCanvas', 'FileReaderSync',
  'webkitRequestFileSystemSync', 'trustedTypes', 'cookieStore', ...SHARED_MEMORY_AND_MORE,
];

const isPrimitive = (value: unknown): boolean => Object(value) !== value;

/** Deletes every name from the global object and its prototypes but the language's own; gives the names that stayed. */
export function emptyGlobal(global: object): string[] {
  const chain: object[] = [];
  for (let link: object | null = global; link !== null && link !== Object.prototype; link = Object.getPrototypeOf(link)) chain.push(link);
  const isKept = (holder: object, name: PropertyKey): boolean => holder === global && typeof name === 'string' && LANGUAGE_GLOBALS.has(name);
  const remove = (holder: object, name: PropertyKey): void => {
    try {
      Reflect.deleteProperty(holder, name);
    } catch {
      // A name that cannot be deleted is reported below.
    }
  };
  const seen = new Set<PropertyKey>(HOST_GLOBALS);
  for (const holder of chain)
    for (const name of Reflect.ownKeys(holder)) {
      seen.add(name);
      if (!isKept(holder, name)) remove(holder, name);
    }
  for (const holder of chain)
    for (const name of new Set([...seen, ...Reflect.ownKeys(holder)])) {
      seen.add(name);
      if (!isKept(holder, name) && Object.getOwnPropertyDescriptor(holder, name) !== undefined) remove(holder, name);
    }
  const stayed = new Set<string>();
  for (const holder of chain)
    for (const name of new Set([...seen, ...Reflect.ownKeys(holder)])) {
      if (isKept(holder, name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(holder, name);
      if (descriptor !== undefined && !('value' in descriptor && isPrimitive(descriptor.value))) stayed.add(String(name));
    }
  return [...stayed];
}

export class ChartFault extends Error {
  readonly fault: WorkerFault;
  constructor(fault: WorkerFault) {
    super(fault);
    this.fault = fault;
  }
}

const notDrawnInSheets = (): never => {
  throw new ChartFault('notDrawnInSheets');
};

const MOST_ROWS_OF_AN_INPUT = 2000;
const INPUT_REF = /^input\/(.+)$/;
const CHART_SIZE_SOURCE = 'chartSize';
const MOST_DRAWINGS_IN_A_ROW = 25;

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
type Callable = (...args: unknown[]) => unknown;
const isFunction = (value: unknown): value is Callable => typeof value === 'function';
const isIterable = (value: unknown): value is Iterable<unknown> => isObject(value) && Symbol.iterator in value;
const isCellsAdapter = (adapter: unknown): boolean => isObject(adapter) && Object.keys(adapter).join() === 'kind' && adapter.kind === 'cells';
const isSize = (value: unknown): value is ChartSize =>
  isObject(value) && Object.keys(value).length === 2 && typeof value.width === 'number' && typeof value.height === 'number';
const rowsOrOneBlank = (rows: readonly ChartRow[]): readonly ChartRow[] =>
  rows[0] === undefined || rows[0].length === 0 ? [[{ value: null, text: '' }]] : rows;

interface Told {
  inputs: ChartInputs;
  size: ChartSize;
}

/** A source of <sheet.Visualize>: what it was read from (to tell when it changed) and its rows. */
interface ReadSource {
  revisions: unknown[];
  rows: () => readonly unknown[];
}

function readSource(name: string, source: unknown, { inputs, size }: Told): ReadSource {
  if (!isObject(source)) throw new ChartFault('notDrawnInSheets');
  if (source.kind === 'data') {
    const data = source.data;
    if (!Array.isArray(data)) throw new ChartFault('notDrawnInSheets');
    if (name === CHART_SIZE_SOURCE && data.length === 1 && isSize(data[0]) && size.width * size.height > 0)
      return { revisions: [size], rows: () => [{ ...size }] };
    return { revisions: [JSON.stringify(data)], rows: () => data };
  }
  const inputName = typeof source.ref === 'string' ? INPUT_REF.exec(source.ref)?.[1] : undefined;
  if (source.kind !== 'ref' || inputName === undefined || !isCellsAdapter(source.adapter)) throw new ChartFault('notDrawnInSheets');
  const rows = Object.hasOwn(inputs, inputName) ? inputs[inputName] : undefined;
  if (rows === undefined) throw new ChartFault('inputMissing');
  return { revisions: [rows], rows: () => rowsOrOneBlank(rows) };
}

/** An element the code made: the runtime's own, told apart by its mark. */
interface MadeElement {
  mark: typeof ELEMENT_MARK;
  type: unknown;
  key: string | null;
  props: Record<string, unknown>;
}

const ELEMENT_MARK: unique symbol = Symbol('element');
const isMadeElement = (value: unknown): value is MadeElement => isObject(value) && value.mark === ELEMENT_MARK;

const keyText = (key: unknown): string =>
  typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean' || typeof key === 'bigint' ? String(key) : Object.prototype.toString.call(key);

function createElement(type: unknown, props: unknown, ...children: unknown[]): MadeElement {
  const given: Record<string, unknown> = isObject(props) ? { ...props } : {};
  const { key, ...rest } = given;
  if (children.length > 0) rest.children = children.length === 1 ? children[0] : children;
  return { mark: ELEMENT_MARK, type, key: key === undefined ? null : keyText(key), props: rest };
}

interface VisualizeHooks {
  createElement: typeof createElement;
  useRef: <T>(initial: T) => { current: T };
}

interface HeldSources {
  revisions: unknown[];
  sources: Record<string, readonly unknown[]>;
}

const isHeldSources = (value: unknown): value is HeldSources => isObject(value) && 'revisions' in value;

const noDatum = (): Record<string, never> => ({});

/** Runs the one child of <sheet.Visualize> with its sources. */
const DrawWithSources = ({ draw, sources }: { draw: unknown; sources: unknown }): unknown =>
  isFunction(draw) && isObject(sources) ? draw(sources) : null;

/** <sheet.Visualize>: reads its sources (again only when one changed) and draws its child with them. */
function makeVisualize(told: () => Told, { createElement: make, useRef }: VisualizeHooks) {
  return function Visualize({ sources, definition, children }: { sources?: unknown; definition?: unknown; children?: unknown }): MadeElement {
    const held = useRef<unknown>(null);
    if (definition !== undefined || !isFunction(children) || !isObject(sources)) throw new ChartFault('notDrawnInSheets');
    const toldNow = told();
    const read = Object.entries(sources).map(([name, source]) => [name, readSource(name, source, toldNow)] as const);
    const revisions = read.flatMap(([name, source]) => [name, ...source.revisions]);
    let last = isHeldSources(held.current) ? held.current : null;
    if (last === null || last.revisions.length !== revisions.length || last.revisions.some((revision, at) => revision !== revisions[at])) {
      const rowsByName: Record<string, readonly unknown[]> = {};
      for (const [name, { rows }] of read) {
        const all = rows();
        if (all.length > MOST_ROWS_OF_AN_INPUT) throw new ChartFault('tooManyRows');
        rowsByName[name] = all;
      }
      if (!Object.hasOwn(rowsByName, 'datum')) Object.defineProperty(rowsByName, 'datum', { value: noDatum, enumerable: false });
      last = { revisions, sources: rowsByName };
      held.current = last;
    }
    return make(VISUALIZE_TAG, null, make(DrawWithSources, { draw: children, sources: last.sources }));
  };
}

/** The presentation properties a `style` may set, in React's names and in CSS's. */
const STYLE_PROPERTIES = new Set(
  'fill fillOpacity fillRule color opacity visibility display overflow paintOrder pointerEvents stroke strokeWidth strokeOpacity strokeLinecap strokeLinejoin strokeMiterlimit strokeDasharray shapeRendering textRendering fontSize fontWeight fontStyle letterSpacing wordSpacing textAnchor dominantBaseline alignmentBaseline baselineShift'.split(' '),
);
const STYLE_PROPERTY_OF_CSS = new Map(Array.from(STYLE_PROPERTIES, (name) => [name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), name]));
const withoutPixels = (value: string): string => (value.trim().split(/[\s,]+/).every((part) => /^[\d.]+(?:px)?$/.test(part)) ? value.replaceAll('px', '') : value);
const ELEMENTS_WITHOUT_CLICKS = new Set([FRAGMENT_TAG, TOOLTIP_TAG, VISUALIZE_TAG]);

/** Where an element is in the drawing, so its component keeps its hooks from one drawing to the next. */
interface Place {
  within: Place | null;
  step: number | string;
}

const placeText = (place: Place | null): string => {
  if (place === null) return '';
  const step = typeof place.step === 'number' ? `#${String(place.step)}` : `${String(place.step.length)}:${place.step}`;
  return `${placeText(place.within)}/${step}`;
};

const sameList = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, at) => Object.is(item, b[at]));

const ignore = (): void => {};

/** The words of a drawn tree, for a tooltip's content given as elements. */
function wordsOf(node: DrawnNode): string {
  const pieces = (part: DrawnNode): (string | null)[] => {
    if (part === null) return [];
    if (typeof part !== 'object') return [String(part)];
    if (Array.isArray(part)) return part.flatMap(pieces);
    const inner = part.children.flatMap(pieces);
    return part.tag === FRAGMENT_TAG ? inner : [null, ...inner, null];
  };
  let [words, breaks] = ['', 0];
  for (const piece of pieces(node)) {
    if (piece !== null) words += (breaks > 1 && words !== '' ? ' ' : '') + piece;
    breaks = piece === null ? breaks + 1 : 0;
  }
  return words;
}

interface StateHook {
  hook: 'state';
  value: unknown;
  reduce: unknown;
  set: (action: unknown) => void;
}
interface MemoHook {
  hook: 'memo';
  value: unknown;
  list: unknown;
}
interface EffectHook {
  hook: 'effect';
  list: unknown;
  due: (() => unknown) | null;
  undo: unknown;
}
interface RefHook {
  hook: 'ref';
  ref: { current: unknown };
}
interface IdHook {
  hook: 'id';
  id: string;
}
type Hook = StateHook | MemoHook | EffectHook | RefHook | IdHook;
type HookKind = Hook['hook'];
type HookOf<K extends HookKind> = Extract<Hook, { hook: K }>;
const isHookOf = <K extends HookKind>(hook: Hook | undefined, kind: K): hook is HookOf<K> => hook?.hook === kind;

/** A component of the drawing, with its hooks, kept from one drawing to the next by its place. */
interface Component {
  type: (props: unknown) => unknown;
  nth: number;
  kept: Hook[];
  drawnIn: number;
  ranWith: unknown;
  returned: unknown;
  readsWhatIsTold: boolean;
}

interface ClickHandler {
  run: (event: unknown) => unknown;
  around: number | null;
}

type Send = (message: WorkerToFrame) => void;
type Soon = (task: () => void) => void;

export interface ChartRun {
  failed: (error: unknown) => void;
  hear: (message: Exclude<FrameToWorker, { kind: 'code' }>) => void;
}

/** Draws the chart that `init` gives, again as its state or what it is told changes. */
export function runChart(readInit: () => unknown, send: Send, soon: Soon): ChartRun {
  const components = new Map<string, Component>();
  let [drawnComponents, goneComponents]: [Component[], Component[]] = [[], []];
  let current: { component: Component; at: number } | null = null;
  let [drawingCount, pass, componentCount, idCount, heardCount, heardAtLastDrawing] = [0, 0, 0, 0, 0, 0];
  let [isDue, isScheduled, isDrawing, isShown, hasFailed] = [false, false, false, true, false];
  let inputs: ChartInputs | null = null;
  let size: ChartSize | null = null;
  const handlersOfDrawing = new Map<number, ClickHandler[]>();
  let handlers: ClickHandler[] = [];
  let aroundHandler: number | null = null;

  const fail = (error: unknown): void => {
    if (hasFailed) return;
    hasFailed = true;
    const fault: WorkerFault = error instanceof ChartFault ? error.fault : error instanceof ReferenceError ? 'notDrawnInSheets' : 'threw';
    send({ kind: 'failed', fault });
  };

  const hookAt = <K extends HookKind>(kind: K, make: (component: Component) => HookOf<K>): HookOf<K> => {
    if (current === null) throw Error('a hook is called only as a component is drawn');
    const { kept } = current.component;
    const at = current.at++;
    if (at === kept.length) kept.push(make(current.component));
    const hook = kept[at];
    if (!isHookOf(hook, kind)) throw Error('a component calls the same hooks at every drawing');
    return hook;
  };

  const useReducer = (reduce: unknown, initial: unknown, init?: unknown): [unknown, (action: unknown) => void] => {
    const hook = hookAt('state', (component) => {
      const made: StateHook = {
        hook: 'state',
        value: isFunction(init) ? init(initial) : initial,
        reduce,
        set: (action) => {
          const next = isFunction(made.reduce) ? made.reduce(made.value, action) : action;
          if (Object.is(next, made.value)) return;
          made.value = next;
          component.ranWith = null;
          drawSoon();
        },
      };
      return made;
    });
    hook.reduce = reduce;
    return [hook.value, hook.set];
  };
  const useMemo = (make: unknown, list: unknown): unknown => {
    const hook = hookAt('memo', () => ({ hook: 'memo', value: undefined, list: null }));
    if (!sameList(hook.list, list)) {
      hook.value = isFunction(make) && make();
      hook.list = list;
    }
    return hook.value;
  };
  const useEffect = (effect: unknown, list: unknown): void => {
    const isFirst = current?.at === current?.component.kept.length;
    const hook = hookAt('effect', () => ({ hook: 'effect', list, due: null, undo: undefined }));
    if (isFunction(effect) && (isFirst || !sameList(hook.list, list))) hook.due = effect;
    hook.list = list;
  };
  const useRef = <T,>(initial: T): { current: T } => hookAt('ref', () => ({ hook: 'ref', ref: { current: initial } })).ref as { current: T };
  const hooks = {
    useState: (initial: unknown) =>
      useReducer(
        (value: unknown, action: unknown) => (isFunction(action) ? action(value) : action),
        initial,
        (value: unknown) => (isFunction(value) ? value() : value),
      ),
    useReducer,
    useMemo,
    useCallback: (callback: unknown, list: unknown) => useMemo(() => callback, list),
    useRef,
    useId: () => hookAt('id', () => ({ hook: 'id', id: `:chart-${String(++idCount)}:` })).id,
    useEffect,
    useLayoutEffect: useEffect,
    useInsertionEffect: useEffect,
    useImperativeHandle: ignore,
    useDebugValue: ignore,
    use: notDrawnInSheets,
    useActionState: notDrawnInSheets,
    useContext: notDrawnInSheets,
    useDeferredValue: notDrawnInSheets,
    useEffectEvent: notDrawnInSheets,
    useOptimistic: notDrawnInSheets,
    useSyncExternalStore: notDrawnInSheets,
    useTransition: notDrawnInSheets,
  };
  const designSystem = {
    Tooltip: TOOLTIP_TAG,
    Button: notDrawnInSheets,
    Menu: notDrawnInSheets,
    Popover: notDrawnInSheets,
    Dialog: notDrawnInSheets,
    Combobox: notDrawnInSheets,
    useToast: notDrawnInSheets,
  };
  const react = {
    ...hooks,
    createElement,
    Fragment: FRAGMENT_TAG,
    StrictMode: FRAGMENT_TAG,
    Suspense: FRAGMENT_TAG,
    Profiler: FRAGMENT_TAG,
    memo: (component: unknown) => component,
    isValidElement: isMadeElement,
    startTransition: (task: unknown) => void (isFunction(task) && task()),
    createContext: notDrawnInSheets,
    version: '19',
  };

  function drawComponent(type: (props: unknown) => unknown, props: unknown, place: Place): DrawnNode {
    const placeKey = placeText(place);
    let component = components.get(placeKey);
    if (component?.type !== type) {
      if (component !== undefined) goneComponents.push(component);
      component = { type, nth: ++componentCount, kept: [], drawnIn: pass, ranWith: null, returned: null, readsWhatIsTold: false };
      components.set(placeKey, component);
    }
    component.drawnIn = pass;
    if (component.ranWith !== props) {
      const outer = current;
      current = { component, at: 0 };
      component.ranWith = props;
      try {
        component.returned = type(props);
      } finally {
        current = outer;
      }
    }
    const drawn = drawNode(component.returned, { within: place, step: component.nth });
    drawnComponents.push(component);
    return drawn;
  }

  function drawElement({ type, key, props }: MadeElement, place: Place): DrawnNode {
    if (isFunction(type)) {
      const drawn = drawComponent(type, props, place);
      return key === null && !Array.isArray(drawn) ? drawn : { tag: FRAGMENT_TAG, key, attributes: {}, onClick: null, children: [drawn] };
    }
    if (typeof type !== 'string') return notDrawnInSheets();
    const attributes: DrawnElement['attributes'] = {};
    let onClick: number | null = null;
    const { children, style, ...rest } = props;
    const given: [string, unknown][] = Object.entries(rest);
    for (const [name, value] of isObject(style) ? Object.entries(style) : []) {
      if (!STYLE_PROPERTIES.has(name) && !STYLE_PROPERTY_OF_CSS.has(name)) continue;
      const plain = Array.isArray(value) ? String(value) : value;
      if (typeof plain === 'number' && Number.isFinite(plain)) given.push([name, plain]);
      else if (typeof plain === 'string' && plain !== '') given.push([name, withoutPixels(plain)]);
    }
    for (const [given_name, value] of given) {
      const name = STYLE_PROPERTY_OF_CSS.get(given_name) ?? given_name;
      if (typeof value === 'string' || typeof value === 'boolean') attributes[name] = value;
      else if (typeof value === 'number') attributes[name] = Number.isFinite(value) ? value : String(value);
      else if (type === TOOLTIP_TAG && (isMadeElement(value) || Array.isArray(value))) attributes[name] = wordsOf(drawNode(value, { within: place, step: `@${name}` }));
      else if (Array.isArray(value)) attributes[name] = String(value);
      else if (name === 'onClick' && isFunction(value) && !ELEMENTS_WITHOUT_CLICKS.has(type))
        onClick = handlers.push({ run: value, around: aroundHandler }) - 1;
    }
    const outerHandler = aroundHandler;
    aroundHandler = onClick ?? outerHandler;
    try {
      const childPlace: Place = { within: place, step: `<${type}` };
      const list = Array.isArray(children) ? children : [children];
      return { tag: type, key, attributes, onClick, children: children === undefined ? [] : drawList(list, childPlace) };
    } finally {
      aroundHandler = outerHandler;
    }
  }

  const drawList = (list: Iterable<unknown>, place: Place): DrawnNode[] =>
    Array.from(list, (item, at) => drawNode(item, { within: place, step: isMadeElement(item) && item.key !== null ? `$${item.key}` : at }));

  const iteratorsRead = new WeakMap<object, unknown[]>();
  const listOf = (iterable: Iterable<unknown>): Iterable<unknown> => {
    if (!('next' in iterable)) return iterable;
    const read = iteratorsRead.get(iterable) ?? [...iterable];
    iteratorsRead.set(iterable, read);
    return read;
  };

  function drawNode(node: unknown, place: Place): DrawnNode {
    if (node === null || node === undefined || typeof node === 'boolean') return null;
    if (typeof node === 'string' || (typeof node === 'number' && Number.isFinite(node))) return node;
    if (typeof node === 'number' || typeof node === 'bigint') return String(node);
    if (isMadeElement(node)) return drawElement(node, place);
    if (!isIterable(node)) throw Error('an object is nothing to draw');
    return drawList(listOf(node), place);
  }

  function click(handlersNow: ClickHandler[], at: number | null): void {
    const handler = handlersNow[at ?? -1];
    if (handler === undefined) return;
    const propagation = { goesOn: true };
    try {
      handler.run(Object.freeze({ preventDefault: ignore, stopPropagation: () => void (propagation.goesOn = false) }));
    } catch {
      // A handler that throws leaves the chart as it was.
    }
    if (propagation.goesOn) click(handlersNow, handler.around);
  }

  let chart: MadeElement | null = null;
  let drawingsInARow = 0;

  function draw(): void {
    isScheduled = false;
    if (hasFailed || !isDue || !isShown || chart === null || inputs === null || size === null) return;
    if (heardCount === heardAtLastDrawing) return;
    let tree: DrawnNode = null;
    try {
      isDrawing = true;
      while (isDue) {
        if (drawingsInARow++ === MOST_DRAWINGS_IN_A_ROW) throw Error('the chart never settles');
        isDue = false;
        pass++;
        [handlers, drawnComponents, goneComponents] = [[], [], []];
        tree = drawNode(chart, { within: null, step: '' });
        runEffects();
      }
    } catch (error) {
      return fail(error);
    } finally {
      isDrawing = false;
    }
    soon(() => {
      if (hasFailed || isDue) return;
      drawingsInARow = 0;
      handlersOfDrawing.set(++drawingCount, handlers);
      isShown = false;
      heardAtLastDrawing = heardCount;
      try {
        send({ kind: 'drawing', drawing: drawingCount, heard: heardCount, tree });
      } catch (error) {
        fail(error);
      }
    });
  }

  const effectsOf = (list: Component[]): EffectHook[] => list.flatMap(({ kept }) => kept.filter((hook): hook is EffectHook => hook.hook === 'effect'));

  function runEffects(): void {
    const gone = goneComponents;
    for (const [placeKey, component] of components) {
      if (component.drawnIn === pass) continue;
      components.delete(placeKey);
      gone.push(component);
    }
    const due = effectsOf([...new Set(drawnComponents)]).filter((effect) => effect.due !== null);
    for (const effect of [...effectsOf(gone), ...due]) {
      const { undo } = effect;
      effect.undo = undefined;
      if (isFunction(undo)) undo();
    }
    for (const effect of due) {
      const run = effect.due;
      effect.due = null;
      effect.undo = run?.();
    }
  }

  function drawSoon(): void {
    isDue = true;
    if (isScheduled || isDrawing) return;
    isScheduled = true;
    soon(draw);
  }

  try {
    const init = readInit();
    if (!isFunction(init)) throw new ChartFault('notAModule');
    const sheet = Object.freeze({
      Visualize: makeVisualize(
        () => {
          if (inputs === null || size === null) throw Error('nothing is drawn before both have come');
          if (current !== null) current.component.readsWhatIsTold = true;
          return { inputs, size };
        },
        { createElement, useRef },
      ),
      Embed: notDrawnInSheets,
    });
    const component = init(sheet, react, hooks, designSystem);
    if (!isFunction(component)) throw new ChartFault('notAModule');
    chart = createElement(component, null);
  } catch (error) {
    fail(error);
  }

  return {
    failed: fail,
    hear(message) {
      if (hasFailed) return;
      if (message.kind === 'shown') {
        isShown = true;
        for (const drawing of handlersOfDrawing.keys()) if (drawing < drawingCount) handlersOfDrawing.delete(drawing);
        if (isDue) drawSoon();
        return;
      }
      if (message.kind === 'stillThere') return send({ kind: 'here', nth: message.nth });
      heardCount++;
      if (message.kind === 'pressed') click(handlersOfDrawing.get(message.drawing) ?? [], message.handler);
      else for (const component of components.values()) if (component.readsWhatIsTold) component.ranWith = null;
      if (message.kind === 'inputs') inputs = message.inputs;
      else if (message.kind === 'size') size = message.size;
      drawSoon();
    },
  };
}
