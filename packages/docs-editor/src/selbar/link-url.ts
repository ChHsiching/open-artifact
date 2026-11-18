/** What a typed link becomes, and how a link is shown. */

// Control, zero-width and bidi characters, which never belong in a link.
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g;
const MAX_LENGTH = 2048;
const HOST = /^(?:[\p{L}\p{N}\p{M}._-]+|\[[0-9a-f:.]+\])(?::\d{1,5})?$/iu;
const ASCII_HOSTNAME = /^(?:[a-z0-9._-]+|\[[0-9a-f:.]+\])$/i;
const PRINTABLE = /^[\x21-\x7e]+$/;
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const URL_IN_TEXT = /(?:https?:\/\/|mailto:)[^\s]+/gi;
const TRAILING_PUNCTUATION = /[).,;:!?\]}>'"]+$/;

export const stripInvisible = (text: string) => text.replace(INVISIBLE, '');

function tidy(text: string): string {
  return stripInvisible(text).trim().replace(/\\/g, '/');
}

/** An http(s) or mailto address, checked; `dotted` also wants a dot in the host (for words typed without a scheme). */
function checkedAddress(text: string, dotted = false): string | null {
  const scheme = /^https?:\/\/([^/?#]*)/i.exec(text);
  if (scheme) {
    const host = scheme[1]!;
    if (!HOST.test(host) || (dotted && !host.replace(/:\d+$/, '').includes('.'))) return null;
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (url.username || url.password || !url.hostname || !ASCII_HOSTNAME.test(url.hostname)) return null;
    const href = PRINTABLE.test(text) ? text : url.href;
    return href.length > MAX_LENGTH ? null : href;
  }
  if (/^mailto:/i.test(text)) {
    const address = text.slice(7);
    if (!address || /\s/.test(address)) return null;
    return !dotted || EMAIL.test(address.replace(/\?.*$/, '')) ? text : null;
  }
  return null;
}

/** The one address in a pasted sentence, if it holds exactly one. */
function addressInText(text: string): string | null {
  let found: string | null = null;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const address = checkedAddress(match[0].replace(TRAILING_PUNCTUATION, ''), true);
    if (!address) continue;
    if (found) return null;
    found = address;
  }
  return found;
}

/**
 * The link a typed or pasted text means, or null when it isn't one: an address (a bare `example.com` gets `https://`,
 * a bare email `mailto:`), a `tel:` number, a path on this site (`/…`) or a place in the doc (`#…`).
 */
export function normalizeHref(input: string): string | null {
  if (input.length > 8192) return null;
  const text = tidy(input);
  if (!text) return null;
  if (text.startsWith('#')) return /\s/.test(text) || text.length < 2 ? null : text;
  if (text.startsWith('//')) return null;
  if (text.startsWith('/')) return text.replace(/\s/g, space => encodeURIComponent(space));
  if (/^tel:/i.test(text)) return text.replace(/\s/g, '').length > 4 ? text.replace(/\s/g, '') : null;
  if (/^(https?:\/\/|mailto:)/i.test(text)) {
    const address = (text.match(URL_IN_TEXT) ?? []).length > 1 ? null : checkedAddress(text);
    if (address) return address;
  }
  const inText = addressInText(text);
  if (inText) return inText;
  if (/^[a-z][a-z0-9+-]*:/i.test(text) || /\s/.test(text)) return null;
  if (EMAIL.test(text)) return `mailto:${text}`;
  return checkedAddress(`https://${text}`, true);
}

/** An http(s) link split for showing: what opens, its origin and the rest. Null for any other link. */
export function webLinkParts(href: string): { open: string; origin: string; host: string; rest: string } | null {
  const text = stripInvisible(href);
  if (text.length > MAX_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
  const origin = `${url.protocol}//${url.host}`;
  const rest = url.pathname + url.search + url.hash;
  return { open: origin + rest, origin, host: url.host, rest: rest === '/' ? '' : rest };
}

/** A link's address shortened for a one-line card. */
export function shortLink(href: string): string {
  const parts = webLinkParts(href);
  if (!parts) return stripInvisible(href);
  const host = parts.host.length > 30 ? `…${parts.host.slice(-27)}` : parts.host;
  const rest = parts.rest.length > 28 ? `${parts.rest.slice(0, 16)}…${parts.rest.slice(-8)}` : parts.rest;
  return host + rest;
}
