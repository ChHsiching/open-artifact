import type { Dynamic } from '../dynamic.ts';
export const entryEditorElements = new (WeakSet as Dynamic)();
export const registerEntryEditor = (input?: Dynamic) => void entryEditorElements.add(input);
export const isEntryEditor = (input?: Dynamic) => typeof input === 'object' && input !== null && entryEditorElements.has(input);
export const ENTRY_EDITOR_ATTRIBUTE = 'data-is-entry-editor';
export const ENTRY_EDITOR_OR_INPUT_SELECTOR = 'input,textarea,[data-is-entry-editor]';
export const isTextInputOrEntryEditor = (input?: Dynamic) =>
  input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || isEntryEditor(input);
export const entryEditorOf = (input?: Dynamic) =>
  input instanceof Element ? (input.closest('[data-is-entry-editor]') ?? input) : input;
