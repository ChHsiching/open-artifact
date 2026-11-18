/**
 * Turns the tree a chart's worker sends into React elements, keeping only svg that places and paints shapes, and
 * giving up on a tree that is too big to draw.
 */
import * as React from 'react';
import { FRAGMENT_TAG, TOOLTIP_TAG, VISUALIZE_TAG } from './messages.ts';
import type { ChartFrameFault } from '../charts/frame-messages.ts';

const wordSet = (...lists: string[]): ReadonlySet<string> => new Set(lists.join(' ').split(' '));

export const DRAWN_TAGS = wordSet('svg g path line rect circle ellipse polyline polygon text tspan');
const TAGS_LEFT_OUT = wordSet('title desc');
const ATTRIBUTES_OF_WORDS = wordSet('role aria-label aria-hidden');
export const ATTRIBUTES_OF_PLACE_AND_PAINT = wordSet(
  'viewBox preserveAspectRatio width height transform d points x y x1 y1 x2 y2 cx cy r rx ry dx dy rotate',
  'fill fillOpacity fillRule color opacity visibility display overflow paintOrder pointerEvents stroke strokeWidth strokeOpacity',
  'strokeLinecap strokeLinejoin strokeMiterlimit shapeRendering textRendering fontSize fontWeight fontStyle letterSpacing',
  'wordSpacing textAnchor dominantBaseline alignmentBaseline baselineShift textLength lengthAdjust',
);
const ROLES = wordSet('img group presentation none');
const TAGS_THAT_MAY_DASH = wordSet('line path polyline');
const NO_DASHES = new Set<unknown>([undefined, false, 'none', '', 0, '0']);
const ATTRIBUTES_OF_PATHS = wordSet('d points');
const FUNCTIONS_IN_VALUES = wordSet(
  'var calc min max clamp',
  'rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix light-dark',
  'translate scale rotate skewx skewy matrix',
);
const LETTERS_OF_A_VALUE = /^[\w \t\n.,%#()+*/-]*$/;
const TAGS_OF_WORDS = wordSet('text tspan');
const TAGS_THAT_GROUP = wordSet('svg g');

/** How much of everything one drawing may hold. */
export const MOST = {
  deep: 64,
  nodes: 20_000,
  elements: 8500,
  elementsOfWords: 2500,
  tooltips: 2000,
  sideBySide: 32,
  lookedThrough: 2_000_000,
  callsDeep: 8,
  lettersInValue: 1000,
  lettersInOne: 200_000,
  lettersToRead: 50_000,
  letters: 4_000_000,
} as const;

const isShortDashes = (value: unknown): boolean =>
  (typeof value === 'number' || (typeof value === 'string' && value.length <= 100)) &&
  String(value)
    .trim()
    .split(/[\s,]+/)
    .every((part) => Number(part) >= 1 && Number(part) <= 12);

/** Whether a value is plain numbers, words and the CSS functions that only work out a length, a color or a turn. */
function isPlainValue(value: string, mostCallsDeep: number): boolean {
  if (!LETTERS_OF_A_VALUE.test(value)) return false;
  let [nameStart, depth] = [0, 0];
  for (let at = 0; at < value.length; at++) {
    const letter = value.charAt(at);
    if (letter === '(' && !FUNCTIONS_IN_VALUES.has(value.slice(nameStart, at).toLowerCase())) return false;
    if (letter === '(' && ++depth > mostCallsDeep) return false;
    if (letter === ')' && --depth < 0) return false;
    if (!/[a-z-]/i.test(letter)) nameStart = at + 1;
  }
  return true;
}

export class DrawingFault extends Error {
  readonly fault: ChartFrameFault;
  constructor(fault: ChartFrameFault) {
    super(fault);
    this.fault = fault;
  }
}

type Attribute = string | number;

/** What draws a chart's tooltip around its marks. */
export interface DrawnTooltipProps {
  content: string;
  detail?: string;
  hoverable: boolean;
  children?: React.ReactNode;
}
type Drawn = React.ReactNode;

interface Breadth {
  sideBySide: number;
  nodes: number;
}

const NOTHING_WIDE: Breadth = { sideBySide: 0, nodes: 0 };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
const ownValue = (object: Record<string, unknown>, name: string): unknown => (Object.hasOwn(object, name) ? object[name] : undefined);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * The React elements of a drawn tree, with `Tooltip` around the marks that have one; `press` is called with the number
 * of a click handler. Throws a DrawingFault for
 * a tree that is malformed, holds what a chart may not draw, or is too big.
 */
export function drawTree(tree: unknown, press: (handler: number) => void, Tooltip: React.ComponentType<DrawnTooltipProps>): Drawn {
  let [nodes, elements, elementsOfWords, tooltips, letters, lettersRead] = [0, 0, 0, 0, 0, 0];
  let lookedThrough = 0;
  const counted = (text: string, most: number): string => {
    letters += text.length;
    if (text.length > most || letters > MOST.letters) throw new DrawingFault('tooManyRows');
    return text;
  };
  const shortened = (text: string): string =>
    counted(text, Infinity).length > MOST.lettersInValue
      ? `${text.slice(0, MOST.lettersInValue - 1).replace(/[\uD800-\uDBFF]$/, '')}…`
      : text;
  const read = (text: string): string => {
    lettersRead += text.length;
    if (lettersRead > MOST.lettersToRead) throw new DrawingFault('tooManyRows');
    return text;
  };
  const attributeValue = (name: string, value: unknown): Attribute | undefined => {
    const isOfWords = ATTRIBUTES_OF_WORDS.has(name);
    if (!isOfWords && !ATTRIBUTES_OF_PLACE_AND_PAINT.has(name)) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'boolean') return isOfWords ? String(value) : undefined;
    if (typeof value !== 'string') return undefined;
    if (name === 'role') return ROLES.has(value) ? value : undefined;
    if (isOfWords) return shortened(value);
    const isPath = ATTRIBUTES_OF_PATHS.has(name);
    counted(value, isPath ? MOST.lettersInOne : MOST.lettersInValue);
    return isPlainValue(value, isPath ? 0 : MOST.callsDeep) ? value : undefined;
  };

  const breadths = new WeakMap<object, Breadth>();
  const breadthOf = (drawn: Drawn): Breadth => {
    if (drawn === null) return NOTHING_WIDE;
    return (typeof drawn === 'object' ? breadths.get(drawn) : undefined) ?? { sideBySide: 1, nodes: 1 };
  };
  const breadthOfAll = (list: readonly Drawn[]): Breadth =>
    list.map(breadthOf).reduce((sum, { sideBySide, nodes: count }) => ({ sideBySide: sum.sideBySide + sideBySide, nodes: sum.nodes + count }), NOTHING_WIDE);
  const holding = <T extends object>(made: T, children: readonly Drawn[]): T => {
    const inner = breadthOfAll(children);
    lookedThrough += (1 + inner.sideBySide) * inner.nodes;
    if (lookedThrough > MOST.lookedThrough) throw new DrawingFault('tooManyRows');
    breadths.set(made, { sideBySide: 1, nodes: 1 + inner.nodes });
    return made;
  };
  const grouped = (list: Drawn[]): Drawn[] => {
    if (breadthOfAll(list).sideBySide <= MOST.sideBySide) return list;
    const groups: Drawn[][] = [];
    let [group, room]: [Drawn[], number] = [[], 0];
    for (const drawn of list) {
      if (breadthOf(drawn).sideBySide > room) {
        [group, room] = [[], MOST.sideBySide];
        groups.push(group);
      }
      group.push(drawn);
      room -= breadthOf(drawn).sideBySide;
    }
    return grouped(groups.map((members, at) => holding(React.createElement('g', { key: `group ${String(at)}` }, ...members), members)));
  };
  const wordsOf = (value: unknown): string | undefined =>
    typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? shortened(String(value)) : undefined;

  function drawElement(node: Record<string, unknown>, depth: number, mayGroup: boolean): Drawn {
    const [tag, key, attributes, onClick, children] = ['tag', 'key', 'attributes', 'onClick', 'children'].map((name) => ownValue(node, name));
    if (!Array.isArray(children) || !isPlainObject(attributes) || (key !== null && typeof key !== 'string')) throw new DrawingFault('threw');
    if (typeof tag === 'string' && TAGS_LEFT_OUT.has(tag)) return null;
    const keyed: { key?: string } = key === null ? {} : { key: counted(key, MOST.lettersInOne) };
    if (tag === TOOLTIP_TAG) {
      if (children.length > MOST.nodes) throw new DrawingFault('tooManyRows');
      const shown: unknown[] = children.filter((child) => child !== null);
      const [first] = shown;
      if (first === undefined) return null;
      if (++tooltips > MOST.tooltips) throw new DrawingFault('tooManyRows');
      const firstTag = isPlainObject(first) ? ownValue(first, 'tag') : undefined;
      const wrapsOneShape = shown.length === 1 && typeof firstTag === 'string' && DRAWN_TAGS.has(firstTag);
      if (!wrapsOneShape && !mayGroup) throw new DrawingFault('notDrawnInSheets');
      const group = { tag: 'g', key: null, attributes: {}, onClick: null, children };
      const detail = wordsOf(ownValue(attributes, 'detail'));
      const trigger = drawNode(wrapsOneShape ? first : group, depth + 1, false);
      const made = React.createElement(
        Tooltip,
        { ...keyed, content: wordsOf(ownValue(attributes, 'content')) ?? '', ...(detail === undefined ? {} : { detail }), hoverable: true },
        trigger,
      );
      breadths.set(made, breadthOf(trigger));
      return made;
    }
    const childrenMayGroup = tag === FRAGMENT_TAG ? mayGroup : typeof tag === 'string' && TAGS_THAT_GROUP.has(tag);
    const drawnChildren = drawList(children, depth, childrenMayGroup);
    if (tag === FRAGMENT_TAG) {
      const made = React.createElement(React.Fragment, keyed, ...drawnChildren);
      breadths.set(made, breadthOf(drawnChildren));
      return made;
    }
    if (++elements > MOST.elements) throw new DrawingFault('tooManyRows');
    if (tag === VISUALIZE_TAG) return holding(React.createElement('div', { ...keyed, className: 'chart-drawn-by-hand' }, ...drawnChildren), drawnChildren);
    if (typeof tag !== 'string' || !DRAWN_TAGS.has(tag)) throw new DrawingFault('notDrawnInSheets');
    if (TAGS_OF_WORDS.has(tag) && ++elementsOfWords > MOST.elementsOfWords) throw new DrawingFault('tooManyRows');
    for (const dashes of [ownValue(attributes, 'strokeDasharray'), ownValue(attributes, 'stroke-dasharray')])
      if (!NO_DASHES.has(dashes) && !(TAGS_THAT_MAY_DASH.has(tag) && !Object.hasOwn(attributes, 'pathLength') && isShortDashes(dashes)))
        throw new DrawingFault('notDrawnInSheets');
    const props: Record<string, Attribute | ((event: React.MouseEvent) => void)> & { key?: string } = { ...keyed };
    for (const name of Object.keys(attributes)) {
      const value = attributeValue(name, attributes[name]);
      if (value !== undefined) props[name] = value;
    }
    if (isCount(onClick))
      props.onClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        press(onClick);
      };
    return holding(React.createElement(tag, props, ...drawnChildren), drawnChildren);
  }

  function drawNode(node: unknown, depth: number, mayGroup: boolean): Drawn {
    if (node === null) return null;
    if (depth > MOST.deep || ++nodes > MOST.nodes) throw new DrawingFault('tooManyRows');
    if (typeof node === 'string') return read(node);
    if (typeof node === 'number') return read(String(node));
    if (Array.isArray(node)) return drawList(node, depth, mayGroup);
    if (isPlainObject(node)) return drawElement(node, depth, mayGroup);
    throw new DrawingFault('threw');
  }

  function drawList(list: readonly unknown[], depth: number, mayGroup: boolean): Drawn[] {
    if (list.length > MOST.nodes) throw new DrawingFault('tooManyRows');
    const drawn = Array.from(list, (item) => drawNode(item ?? null, depth + 1, mayGroup));
    const laidOut = mayGroup ? grouped(drawn) : drawn;
    breadths.set(laidOut, breadthOfAll(laidOut));
    return laidOut;
  }

  const drawing = drawNode(tree, 0, false);
  holding({}, [drawing]);
  return drawing;
}
