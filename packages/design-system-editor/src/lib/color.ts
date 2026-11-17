/**
 * Turning CSS color text into RGB, in the browser. A canvas understands
 * every color syntax the browser does (hex, rgb, hsl, oklch, color-mix…),
 * which keeps this page in step with how the colors actually render.
 */

import type { Rgb } from '@open-artifact/design-system-core';

let context: CanvasRenderingContext2D | null = null;
const cache = new Map<string, Rgb | null>();

/** Parses a CSS color; `null` when the browser does not read it as one. */
export function parseCssColor(value: string): Rgb | null {
  const key = value.trim();
  if (cache.has(key)) return cache.get(key)!;
  if (!context) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    context = canvas.getContext('2d', { willReadFrequently: true });
  }
  let result: Rgb | null = null;
  if (context && CSS.supports('color', key)) {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000';
    context.fillStyle = key;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    result = { r: r!, g: g!, b: b!, a: a! / 255 };
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, result);
  return result;
}

/** `#rrggbb` of a color (alpha dropped), for color inputs. */
export function toHex(value: string): string | null {
  const rgb = parseCssColor(value);
  if (!rgb) return null;
  return `#${[rgb.r, rgb.g, rgb.b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** True when text on this color should be light. */
export function isDark(value: string): boolean {
  const rgb = parseCssColor(value);
  if (!rgb) return false;
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b < 140 && rgb.a > 0.4;
}

/** Absolute URL of a project path (for previews, images and fonts). */
export function projectUrl(path = ''): string {
  return new URL(`project/${path.split('/').map(encodeURIComponent).join('/')}`, location.href).toString();
}

/** URL of an image or link target written in a Markdown file at `from`; `null` for anything off the system. */
export function resolveProjectLink(target: string, from: string): string | null {
  if (target.startsWith('/_blob/')) return new URL(target, location.href).toString();
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null;
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const parts: string[] = [];
  for (const part of `${dir}${target.split(/[?#]/)[0]}`.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return projectUrl(parts.join('/'));
}
