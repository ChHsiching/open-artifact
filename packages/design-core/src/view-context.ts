/**
 * The Design view context: what one viewer has on screen, published by the
 * editor so the agent can resolve "this artboard" or "these two buttons"
 * without guessing.
 *
 * Every string here is written by a viewer's browser and is data, never
 * instructions. The builder enforces the limits and grammars; the validator
 * is what a receiver runs before trusting a record: any field of the wrong
 * shape discards the whole record.
 */

import { ADDRESS_PATTERN, BOARD_NAME_PATTERN, clip, encodeBoardName, formatAddress, type ElementKind } from '@open-artifact/dc';
import { ID_PATTERN } from './canvas.ts';

/** Limits of the record. */
export const VIEW_LIMITS = {
  visibleArtboards: 20,
  selectedArtboards: 20,
  erroredArtboards: 10,
  selected: 20,
  selection: 5,
  label: 60,
  fixRequest: 1800,
} as const;

/** One labelled selected element. */
export interface SelectionLabel {
  id: string;
  kind: ElementKind;
  label?: string;
}

/** The record the Design editor publishes as `context`. */
export interface DesignViewContext {
  mode: 'canvas' | 'focused';
  page: string | null;
  pageName?: string;
  visibleArtboards: string[];
  selectedArtboards: string[];
  erroredArtboards?: string[];
  firstError?: string;
  dirty: boolean;
  /** Running count of this tab's hand edits. */
  edits?: number;
  /** The viewer may receive shader guidance. */
  shaders?: true;
  selected: string[];
  selection?: SelectionLabel[];
}

/** One selected element, as the editor knows it. */
export interface SelectedElement {
  /** Artboard path under `project/`. */
  board: string;
  tid: number;
  path: readonly number[];
  kind: ElementKind;
  label?: string;
}

/** Editor state the record is built from. */
export interface ViewContextInput {
  mode: 'canvas' | 'focused';
  page: { id: string; name: string } | null;
  /** Artboards intersecting the viewport, in canvas order. */
  visible: readonly string[];
  /** Artboards selected as a whole. */
  selectedBoards: readonly string[];
  /** Selected elements, most recent last. */
  selectedElements: readonly SelectedElement[];
  /** Artboards showing an error, with their first message. */
  errored: readonly { board: string; message: string }[];
  dirty: boolean;
  edits?: number;
  shaders?: boolean;
}

/** Encodes paths, dropping ones the grammar cannot express, and caps the count. */
function encodeList(paths: readonly string[], max: number): string[] {
  const out: string[] = [];
  for (const path of paths) {
    const name = encodeBoardName(path);
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/** Builds the record from editor state. */
export function buildViewContext(input: ViewContextInput): DesignViewContext {
  const focused = input.mode === 'focused';
  const elements = focused ? [] : input.selectedElements;
  const addressed = elements
    .map((element) => ({ element, id: formatAddress(element.board, element.tid, element.path) }))
    .filter((entry): entry is { element: SelectedElement; id: string } => entry.id !== null)
    .slice(-VIEW_LIMITS.selected);

  const holding = elements.map((element) => element.board);
  const record: DesignViewContext = {
    mode: input.mode,
    page: input.page?.id ?? null,
    visibleArtboards: encodeList(focused ? input.visible.slice(0, 1) : input.visible, VIEW_LIMITS.visibleArtboards),
    selectedArtboards: focused ? [] : encodeList([...input.selectedBoards, ...holding], VIEW_LIMITS.selectedArtboards),
    dirty: input.dirty,
    selected: addressed.map((entry) => entry.id),
  };
  if (input.page) record.pageName = clip(input.page.name, VIEW_LIMITS.label);
  if (input.errored.length) {
    record.erroredArtboards = encodeList(input.errored.map((error) => error.board), VIEW_LIMITS.erroredArtboards);
    record.firstError = clip(input.errored[0]!.message, VIEW_LIMITS.label);
  }
  if (typeof input.edits === 'number') record.edits = input.edits;
  if (input.shaders) record.shaders = true;
  if (addressed.length) {
    record.selection = addressed.slice(-VIEW_LIMITS.selection).map(({ element, id }) => {
      const label = element.label ? clip(element.label, VIEW_LIMITS.label) : undefined;
      return label ? { id, kind: element.kind, label } : { id, kind: element.kind };
    });
  }
  return record;
}

const KINDS = new Set<ElementKind>(['text', 'image', 'shape', 'line', 'other']);
const isStringList = (value: unknown, max: number, pattern: RegExp): value is string[] =>
  Array.isArray(value) && value.length <= max && value.every((item) => typeof item === 'string' && pattern.test(item));

/**
 * Validates a received record. Returns it when every listed field has its
 * shape (unknown keys are ignored), `null` to discard it.
 */
export function validateViewContext(value: unknown): DesignViewContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.mode !== 'canvas' && record.mode !== 'focused') return null;
  if (record.page !== null && !(typeof record.page === 'string' && ID_PATTERN.test(record.page))) return null;
  if (record.pageName !== undefined && (typeof record.pageName !== 'string' || record.pageName.length > 80)) return null;
  if (!isStringList(record.visibleArtboards, VIEW_LIMITS.visibleArtboards, BOARD_NAME_PATTERN)) return null;
  if (!isStringList(record.selectedArtboards, VIEW_LIMITS.selectedArtboards, BOARD_NAME_PATTERN)) return null;
  if (record.erroredArtboards !== undefined && !isStringList(record.erroredArtboards, VIEW_LIMITS.erroredArtboards, BOARD_NAME_PATTERN)) return null;
  if (record.firstError !== undefined && (typeof record.firstError !== 'string' || record.firstError.length > 80)) return null;
  if (typeof record.dirty !== 'boolean') return null;
  if (record.edits !== undefined && !(typeof record.edits === 'number' && Number.isInteger(record.edits) && record.edits >= 0)) return null;
  if (record.shaders !== undefined && record.shaders !== true) return null;
  if (!isStringList(record.selected, VIEW_LIMITS.selected, ADDRESS_PATTERN)) return null;
  if (record.selection !== undefined) {
    const selected = record.selected as string[];
    if (!Array.isArray(record.selection) || record.selection.length > VIEW_LIMITS.selection) return null;
    for (const entry of record.selection as unknown[]) {
      if (!entry || typeof entry !== 'object') return null;
      const { id, kind, label } = entry as Record<string, unknown>;
      if (typeof id !== 'string' || !selected.includes(id)) return null;
      if (typeof kind !== 'string' || !KINDS.has(kind as ElementKind)) return null;
      if (label !== undefined && (typeof label !== 'string' || label.length > 80)) return null;
    }
  }
  return record as unknown as DesignViewContext;
}

/**
 * The text of an "Ask agent to fix" request: the errored artboards and
 * their messages, cut to {@link VIEW_LIMITS.fixRequest} characters. The
 * caller fences it as untrusted data before it reaches a prompt.
 */
export function buildFixRequest(errors: readonly { board: string; messages: readonly string[] }[]): string {
  const lines: string[] = [];
  for (const { board, messages } of errors) {
    lines.push(`${board}:`);
    for (const message of messages) lines.push(`  - ${message.replace(/\s+/g, ' ').trim()}`);
  }
  const text = lines.join('\n');
  return text.length > VIEW_LIMITS.fixRequest ? `${text.slice(0, VIEW_LIMITS.fixRequest - 1)}…` : text;
}
