/**
 * The address rules of the link card in rich Markdown editing: what a typed
 * address becomes in the Markdown source, how it is shown, and what may open.
 */

/** Longest address the card writes into a link. */
export const MAX_LINK_LENGTH = 2048;

/** Extensions that make `name.ext` a project file rather than a domain. */
const FILE_EXTENSIONS = new Set(['md', 'markdown', 'html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'pdf', 'woff', 'woff2', 'ttf', 'otf', 'mp4', 'webm']);

/** Characters that would end or open a Markdown link target early. */
function escapeTarget(target: string): string {
  return target.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\[/g, '%5B').replace(/\]/g, '%5D').replace(/</g, '%3C').replace(/>/g, '%3E');
}

/** Whether a path without a scheme starts with a host name (`example.com/x`). */
function looksLikeHost(text: string): boolean {
  const host = text.split(/[/?#]/, 1)[0]!.split(':', 1)[0]!;
  if (host === 'localhost') return true;
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9-]+$/i.test(label))) return false;
  const last = labels[labels.length - 1]!.toLowerCase();
  return /^[a-z]{2,24}$/.test(last) && !FILE_EXTENSIONS.has(last);
}

/**
 * The link target written for a typed address, or null when it cannot be one.
 * Web addresses get `https://` when they have no scheme and a lower-case
 * scheme; project paths stay relative with spaces encoded.
 */
export function normalizeTypedLink(raw: string): string | null {
  const typed = raw.trim();
  if (!typed) return null;
  const scheme = /^[a-z0-9.-]+:\d+(?:[/?#]|$)/i.test(typed) ? null : /^([a-z][a-z0-9+.-]*):/i.exec(typed);
  let target: string;
  if (scheme) {
    const name = scheme[1]!.toLowerCase();
    if (name !== 'http' && name !== 'https' && name !== 'mailto') return null;
    const rest = typed.slice(scheme[0].length);
    if (/\s/.test(rest) || (name !== 'mailto' && !/^\/\/[^/\s]+/.test(rest))) return null;
    target = name + ':' + rest;
  } else if (typed.startsWith('//')) {
    if (/\s/.test(typed)) return null;
    target = 'https:' + typed;
  } else if (looksLikeHost(typed)) {
    if (/\s/.test(typed)) return null;
    target = 'https://' + typed;
  } else {
    target = typed.replace(/\s/g, '%20');
  }
  const escaped = escapeTarget(target);
  return escaped.length > MAX_LINK_LENGTH ? null : escaped;
}

/** Whether an address leaves the project (a web page or mail). */
export function isWebLink(target: string): boolean {
  return /^(?:https?:|mailto:)/i.test(target);
}

/** The address split for display: the site in front, the rest after it. */
export function shownLink(target: string): { site: string; rest: string } {
  const web = /^https?:\/\/([^/?#]+)(.*)$/i.exec(target);
  if (web) return { site: web[1]!.replace(/^www\./i, ''), rest: web[2] === '/' ? '' : web[2]! };
  const mail = /^mailto:(.*)$/i.exec(target);
  if (mail) return { site: decodeURIComponent(mail[1]!), rest: '' };
  return { site: target, rest: '' };
}

/** Whether a resolved address may be opened from the card. */
export function canOpenLink(resolved: string): boolean {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(resolved).protocol);
  } catch {
    return false;
  }
}

/** Where the card goes: below the link, or above it when below would leave the window. */
export function placeLinkCard(link: { top: number; bottom: number; left: number }, card: { width: number; height: number }, window: { width: number; height: number }, gap = 6): { top: number; left: number } {
  const below = link.bottom + gap;
  const above = link.top - gap - card.height;
  const top = below + card.height <= window.height - gap || above < gap ? below : above;
  const left = Math.max(gap, Math.min(link.left, window.width - card.width - gap));
  return { top, left };
}
