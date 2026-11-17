/**
 * Clipboard payloads of the design editor and their encoding: the payload
 * rides in clipboard HTML inside a marker attribute (base64 JSON), next to
 * the elements' own source so other apps get usable HTML.
 */

import type { BoardEntry, CanvasNote } from '@open-artifact/design-core';

/** What a copy holds. */
export type ClipboardPayload =
  | {
      kind: 'elements';
      board: string;
      /** The elements' template source. */
      html: string[];
      /** The project it came from (pastes into the same artboard use the source as is). */
      from?: string;
      /**
       * Per element, its rendered markup when its source depends on the
       * artboard (loops, conditions, components, values): what a paste into
       * another artboard uses. `null` when the source stands on its own.
       */
      rendered?: (string | null)[];
      /** Style rules of the artboard that apply to the elements, carried into another artboard's helmet. */
      css?: string[];
      /**
       * The elements as standalone HTML (computed styles inline), for other
       * apps. Written to the clipboard, not kept in the marker.
       */
      standalone?: string;
    }
  | { kind: 'objects'; boards: { path: string; entry: BoardEntry; source: string }[]; notes: CanvasNote[] };

export const MARKER = 'data-open-artifact-design';


/* -------------------------------- encoding ------------------------------- */

function encode(payload: ClipboardPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(text: string): ClipboardPayload | null {
  try {
    const binary = atob(text);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes)) as ClipboardPayload;
    return value && (value.kind === 'elements' || value.kind === 'objects') ? value : null;
  } catch {
    return null;
  }
}

/** The clipboard flavours of a payload. */
export function clipboardData(payload: ClipboardPayload): { html: string; text: string } {
  if (payload.kind === 'elements') {
    // Other apps get the standalone rendering: the source needs this artboard's styles, data and components.
    const { standalone, ...kept } = payload;
    const body = standalone ?? payload.html.join('\n');
    return { html: `<meta ${MARKER}="${encode(kept)}">${body}`, text: body };
  }
  const text = [...payload.boards.map((b) => b.entry.title ?? b.path), ...payload.notes.map((n) => n.text).filter(Boolean)].join('\n');
  return { html: `<meta ${MARKER}="${encode(payload)}">`, text };
}

/** Reads our payload out of clipboard HTML. */
export function payloadFromHtml(html: string): ClipboardPayload | null {
  const match = new RegExp(`${MARKER}="([^"]*)"`).exec(html);
  return match ? decode(match[1]!) : null;
}

