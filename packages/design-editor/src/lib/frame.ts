/**
 * Building the document an artboard iframe loads, and the source of a new
 * artboard.
 */

import { SUPPORT_SCRIPT_TAG, escapeAttribute, escapeText } from '@open-artifact/dc';

/** URLs the frame document needs. */
export interface FrameUrls {
  /** Absolute URL of the board runtime (`support.js`). */
  runtime: string;
  /** Absolute URL of `project/` (with trailing slash). */
  project: string;
}

/** Marks a canvas frame: its viewport never scrolls. */
const CANVAS_FRAME = '<style>html[data-dc-canvas]{overflow:hidden}</style><script>document.documentElement.setAttribute("data-dc-canvas","")</script>';

/** The folder part of a project path (`sub/A.dc.html` → `sub/`). */
export function dirOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash + 1);
}

/**
 * The `srcdoc` of an artboard frame: its source with the runtime script
 * pointing at the served runtime and a `<base>` so relative URLs (images,
 * fonts, `ds/` styles) resolve inside `project/`.
 *
 * A frame on the canvas (`canvas`) clips what overflows its artboard
 * instead of scrolling: the artboard is a fixed-size picture there. Play
 * frames keep scrolling.
 */
export function frameDocument(path: string, source: string, urls: FrameUrls, options: { canvas?: boolean } = {}): string {
  const base = `<base href="${escapeAttribute(new URL(dirOf(path), urls.project).toString())}">${options.canvas ? CANVAS_FRAME : ''}`;
  const runtime = `<script src="${escapeAttribute(urls.runtime)}"></script>`;
  let html = source.includes(SUPPORT_SCRIPT_TAG) ? source.replace(SUPPORT_SCRIPT_TAG, runtime) : source;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    html = `${html.slice(0, at)}${base}${source.includes(SUPPORT_SCRIPT_TAG) ? '' : runtime}${html.slice(at)}`;
  } else {
    html = `${base}${source.includes(SUPPORT_SCRIPT_TAG) ? '' : runtime}${html}`;
  }
  return html;
}

/** Options of {@link newBoardSource}. */
export interface NewBoardOptions {
  title: string;
  width: number;
  height: number;
  /** Background of the root element. */
  background?: string;
  lang?: string;
}

/** The source of a new, empty artboard: a root of exactly its size, on a body without margins. */
export function newBoardSource({ title, width, height, background = '#ffffff', lang = 'en' }: NewBoardOptions): string {
  const props = JSON.stringify({ $preview: { width, height } });
  return `<!doctype html>
<html lang="${escapeAttribute(lang)}">
<head>
<meta charset="utf-8">
<title>${escapeText(title)}</title>
${SUPPORT_SCRIPT_TAG}
</head>
<body>
<x-dc>
<helmet><style>body { margin: 0; }</style></helmet>
<div style="width: ${width}px; height: ${height}px; background: ${background}; position: relative; overflow: hidden;"></div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='${props}'>
class Component extends DCLogic {}
</script>
</body>
</html>
`;
}

/** A free board file name next to `taken` (`Untitled.dc.html`, `Untitled 2.dc.html`, …). */
export function freeBoardName(stem: string, taken: ReadonlySet<string>): string {
  const clean = stem.replace(/[^A-Za-z0-9 _.-]/g, '').trim() || 'Artboard';
  for (let n = 1; ; n++) {
    const name = `${n === 1 ? clean : `${clean} ${n}`}.dc.html`.replace(/ /g, '-');
    if (!taken.has(name)) return name;
  }
}
