/**
 * Hand edits to a one-writer page: the stored markup (a twin of the mounted
 * page, paired element by element) is changed by steps, the mounted page
 * follows it, and every change can be undone. Words being typed are a visit
 * with its own undo until they end.
 */

import type { DashboardFile } from '@open-artifact/data-core';
import { DASHBOARD_ENTRY_FILENAME, areDashboardFilesEqual } from '@open-artifact/data-core';
import { serializeNodeHtml, type DraftTwins, type PageKeptMarkup } from '../page/parse.ts';
import type { PageHandle } from '../page/runtime.ts';
import { LINK_ATTRIBUTES, applyLinkAttributes, isInlineWrapper, readInlineRuns, writeInlineRuns, type InlineRun } from './runs.ts';

/** Rewrite a text block's runs. */
export interface DraftWordsStep {
  words: Element;
  runs: InlineRun[];
}
/** Move a node: into `in` before `before` (null `in` takes it out). */
export interface DraftPlaceStep {
  place: Node;
  in: ParentNode | null;
  before: Node | null;
}
export type DraftStep = DraftWordsStep | DraftPlaceStep;

interface DraftEntry {
  steps: DraftStep[];
  verb: string;
}

export interface DraftEnded {
  step: DraftStep;
  verb: string;
}

/** An edit in progress on one element (typing in a text block); it has its own undo steps until it ends. */
export interface DraftVisit {
  el: Element;
  end(): DraftEnded | null;
  /** One step of the visit's own history; false when it has none left that way. */
  turn(forward: boolean): boolean;
  dirty(): boolean;
  can(forward: boolean): boolean;
}

export interface PageDraft {
  files: readonly DashboardFile[];
  stored: DocumentFragment;
  storedOf(live: Node | null): Element | null;
  do(step: DraftStep, verb: string): void;
  undo(): string | null;
  redo(): string | null;
  canUndo(): boolean;
  canRedo(): boolean;
  count(): number;
  open(visit: DraftVisit): void;
  visit(): DraftVisit | null;
  settle(keep: boolean): void;
  touch(): void;
  hold(on: boolean): void;
  holding(): boolean;
  /** Where the last undo or redo happened (to bring it into view). */
  last(): Element | null;
  pass(): void;
  revert(): DraftEnded[];
  text(): string;
  reads(node: Node): boolean;
  stands(files: readonly DashboardFile[]): boolean;
  subscribe(listener: () => void): () => void;
}

const DRAFT_INLINE_COPY_SELECTOR = 'b, i, a';
const DRAFT_CARRIED_SELECTOR = 'script, template, meta';

export const draftStepTarget = (step: DraftStep): Node => ('words' in step ? step.words : step.place);

const isBlankTextNode = (node: Node | null): node is Text => node !== null && node.nodeType === Node.TEXT_NODE && (node.nodeValue ?? '').trim() === '';

export function createPageDraft(files: readonly DashboardFile[], stored: DocumentFragment, twins: DraftTwins, live: Element, pass: () => void): PageDraft {
  const done: DraftEntry[] = [];
  const undone: DraftEntry[] = [];
  const gapBefore = new WeakMap<Node, Text | null>();
  const listeners = new Set<() => void>();
  let visiting: DraftVisit | null = null;
  let held = false;
  let lastPlace: Element | null = null;
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const liveCopy = (storedElement: Element): Element | null => {
    const liveElement = twins.liveOf(storedElement);
    if (liveElement !== null || !storedElement.matches(DRAFT_INLINE_COPY_SELECTOR)) return liveElement;
    const made = live.ownerDocument.importNode(storedElement, false);
    twins.pair(storedElement, made);
    return made;
  };

  const follow = (storedParent: ParentNode, deep: boolean): void => {
    const liveParent = storedParent === stored ? live : storedParent instanceof Element ? twins.liveOf(storedParent) : null;
    if (liveParent === null) return;
    const wanted = [...storedParent.childNodes].flatMap((child): Node | Node[] => (child instanceof Element ? (liveCopy(child) ?? []) : child));
    const kept = new Set(wanted);
    for (const child of [...liveParent.children]) if (!kept.has(child)) child.remove();
    let cursor: ChildNode | null = liveParent.firstChild;
    const drop = (node: ChildNode): void => {
      cursor = node.nextSibling;
      node.remove();
    };
    for (const node of wanted) {
      if (node instanceof Element) {
        while (cursor !== null && cursor !== node && !(cursor instanceof Element)) drop(cursor);
        if (cursor === node) cursor = cursor.nextSibling;
        else liveParent.insertBefore(node, cursor);
      } else if (cursor !== null && cursor.nodeType === node.nodeType) {
        if (cursor.nodeValue !== node.nodeValue) cursor.nodeValue = node.nodeValue;
        cursor = cursor.nextSibling;
      } else liveParent.insertBefore(live.ownerDocument.importNode(node, false), cursor);
    }
    while (cursor !== null) drop(cursor);
    if (!deep) return;
    for (const child of [...storedParent.children].filter(isInlineWrapper)) {
      const liveChild = twins.liveOf(child);
      if (liveChild !== null)
        applyLinkAttributes(
          liveChild,
          LINK_ATTRIBUTES.map((name) => child.getAttribute(name)),
        );
      follow(child, true);
    }
  };

  const move = (node: ChildNode, parent: ParentNode | null, before: Node | null): void => {
    const gap = node.parentNode === null ? (gapBefore.get(node) ?? null) : isBlankTextNode(node.previousSibling) ? node.previousSibling : null;
    gap?.remove();
    node.remove();
    gapBefore.set(node, gap);
    if (parent === null) return;
    const previous = before === null ? parent.lastChild : before instanceof Element ? before.previousSibling : null;
    parent.insertBefore(node, isBlankTextNode(previous) ? previous : before);
    if (gap !== null) parent.insertBefore(gap, node);
  };

  const apply = (step: DraftStep): DraftStep => {
    if ('words' in step) {
      const inverse: DraftWordsStep = { words: step.words, runs: readInlineRuns(step.words) };
      writeInlineRuns(step.words, step.runs);
      follow(step.words, true);
      return inverse;
    }
    const from = step.place.parentNode;
    const inverse: DraftPlaceStep = { place: step.place, in: from, before: step.place.nextSibling };
    move(step.place as ChildNode, step.in, step.before);
    if (from !== null) follow(from, false);
    if (step.in !== null && step.in !== from) follow(step.in, false);
    return inverse;
  };
  const applyAll = (steps: DraftStep[]): DraftStep[] => steps.map(apply).reverse();
  const unpaired = (element: Element): Element[] =>
    [...element.children].flatMap((child): Element[] => (twins.liveOf(child) === null ? [child] : isInlineWrapper(child) ? unpaired(child) : []));

  const withComments = (parent: Node | null, runs: InlineRun[]): InlineRun[] => [
    ...runs.map((run): InlineRun => {
      if (typeof run === 'string' || run.runs === undefined) return run;
      if ('ref' in run) return { ...run, runs: withComments(run.ref instanceof Element ? run.ref : null, run.runs) };
      return { ...run, runs: withComments(null, run.runs) };
    }),
    ...[...(parent?.childNodes ?? [])].filter((node) => node.nodeType === Node.COMMENT_NODE).map((node): InlineRun => ({ ref: node })),
  ];
  const keepComments = (step: DraftStep): DraftStep => ('words' in step ? { words: step.words, runs: withComments(step.words, step.runs) } : step);

  const record = (step: DraftStep, verb: string): void => {
    const target = draftStepTarget(step);
    if ('place' in step && step.in !== null && (target.contains(step.in) || step.before === target || (step.before !== null && step.before.parentNode !== step.in))) return;
    const carried =
      target.parentNode === null || !(target instanceof Element)
        ? []
        : 'words' in step
          ? unpaired(target)
          : [...target.querySelectorAll(DRAFT_CARRIED_SELECTOR)];
    lastPlace = null;
    done.push({
      steps: applyAll([...carried.map((element): DraftStep => ({ place: element, in: target.parentNode, before: target })), keepComments(step)]),
      verb,
    });
    undone.length = 0;
    pass();
    notify();
  };

  const followStored = (liveElement: Element): void => {
    const storedElement = twins.storedOf(liveElement);
    if (storedElement !== null) follow(storedElement, true);
  };

  const settle = (keep: boolean): void => {
    const current = visiting;
    if (current === null) return;
    visiting = null;
    lastPlace = null;
    const ended = current.end();
    followStored(current.el);
    if (keep && ended !== null) record(ended.step, ended.verb);
    notify();
  };

  const turn = (from: DraftEntry[], to: DraftEntry[]): string | null => {
    if (visiting?.turn(from === undone) === true) {
      lastPlace = visiting.el;
      notify();
      return null;
    }
    if (from.length === 0 || (from === undone && visiting?.dirty() === true)) return null;
    if (visiting !== null && from === done) {
      while (visiting.turn(true));
      const before = done.length;
      settle(true);
      const entry = done.length > before ? done.pop() : undefined;
      if (entry !== undefined) undone.push({ ...entry, steps: applyAll(entry.steps) });
    }
    settle(true);
    const entry = from.pop();
    const step = from === done ? entry?.steps[0] : entry?.steps.at(-1);
    if (entry === undefined || step === undefined) return null;
    const target = draftStepTarget(step);
    const parent = target.parentNode;
    to.push({ ...entry, steps: applyAll(entry.steps) });
    const place = target.parentNode === null ? parent : target;
    lastPlace = place === stored ? live : place instanceof Element ? twins.liveOf(place) : null;
    pass();
    notify();
    return entry.verb;
  };

  return {
    files,
    stored,
    storedOf: twins.storedOf,
    do(step, verb) {
      settle(true);
      record(step, verb);
    },
    undo: () => turn(done, undone),
    redo: () => turn(undone, done),
    canUndo: () => done.length > 0 || visiting?.can(false) === true,
    canRedo: () => visiting?.can(true) === true || (undone.length > 0 && visiting?.dirty() !== true),
    count: () => done.length + (visiting?.dirty() === true ? 1 : 0),
    open(visit) {
      settle(true);
      followStored(visit.el);
      visiting = visit;
      notify();
    },
    visit: () => visiting,
    settle,
    touch: notify,
    hold(on) {
      held = on;
      notify();
    },
    holding: () => held,
    last: () => lastPlace,
    pass,
    revert() {
      settle(false);
      const steps = done.reverse().flatMap(({ steps: entrySteps, verb }) =>
        applyAll(entrySteps)
          .slice(-1)
          .map((step): DraftEnded => ({ step, verb })),
      );
      done.length = 0;
      undone.length = 0;
      lastPlace = null;
      pass();
      notify();
      return steps.reverse();
    },
    text: () => serializeNodeHtml(stored),
    reads(node) {
      const copy = stored.cloneNode(true);
      copy.normalize();
      return copy.isEqualNode(node);
    },
    stands: (next) =>
      areDashboardFilesEqual(
        next,
        files.map((file) => (file.name === DASHBOARD_ENTRY_FILENAME ? { ...file, text: serializeNodeHtml(stored) } : file)),
      ),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** A draft of the mounted page, when its stored markup is kept (edit mode on a one-writer page). */
export function createMountedPageDraft(page: PageHandle): PageDraft | null {
  if (!page.ensureKept()) return null;
  const kept: PageKeptMarkup | null = page.kept();
  const files = page.snapshot().files;
  if (kept === null || files === null) return null;
  return createPageDraft(files, kept.stored, kept.twins, page.root, () => page.redraw());
}
