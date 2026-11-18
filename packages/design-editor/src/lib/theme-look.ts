import { attributeValue, setStyle, styleMap, type Splice, type TemplateModel } from '@open-artifact/dc';
import { parseHex } from '@open-artifact/design-system-core';

export interface ThemeLook {
  id: string;
  name: string;
  colors: { name: string; value: string; variants: string[] }[];
  body?: string;
  heading?: string;
}

const COLOR_PROPERTY = /^(?:background(?:-color)?|color|border(?:-(?:top|bottom|left|right))?(?:-color)?|outline-color|fill|stroke)$/;
const COLOR_VALUE = /^(?:#[\da-f]{3,8}|rgba?\([\d.,% /]+\)|hsla?\([\d.,% /a-z]+\)|black|white)$/i;
const TOKEN = /^var\(\s*--([\w-]+)(?:,[^()]*)?\)$/;

function replacement(property: string, raw: string, look: ThemeLook, heading: boolean): string {
  const value = raw.trim();
  if (value.includes('{{')) return raw;
  if (property === 'font-family') return (heading ? look.heading ?? look.body : look.body) ?? raw;
  if (!COLOR_PROPERTY.test(property)) return raw;
  const token = TOKEN.exec(value)?.[1];
  const exact = look.colors.find(color => color.name === token || color.variants.includes(value.toLowerCase()));
  if (exact) return exact.value;
  if (!COLOR_VALUE.test(value)) return raw;
  const rgb = parseHex(value);
  const vivid = rgb && Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) > 48;
  const role = vivid ? /accent|brand|primary/ : /background/.test(property) ? /surface|background|paper|canvas|^bg/ :
    /border|outline|stroke/.test(property) ? /border|line|outline/ : /ink|foreground|body|^text/;
  return look.colors.find(color => role.test(color.name))?.value ?? raw;
}

/** Applies a look to ordinary declarations. Bindings and the board's logic stay editable. */
export function lookSplices(model: TemplateModel, look: ThemeLook): Splice[] {
  const changes: Splice[] = [];
  for (const element of model.elements) {
    const heading = /^h[1-6]$/.test(element.tag);
    const styles = styleMap(attributeValue(element, 'style') ?? '');
    const patch: Record<string, string> = {};
    for (const [prop, value] of Object.entries(styles)) {
      const next = replacement(prop, value, look, heading);
      if (next !== value) patch[prop] = next;
    }
    if (Object.keys(patch).length) changes.push(...setStyle(model, element, patch));
    if (element.tag !== 'style' || element.closeStart < 0) continue;
    const css = model.text.slice(element.openEnd, element.closeStart);
    // Limit changes to plain declarations. Quoted strings, comments and URLs are opaque.
    const themed = css.replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\([^)]*\)|([;{]\s*)([a-z-]+)(\s*:\s*)([^;{}]+?)(?=\s*[;}])/gi,
      (match, prefix: string | undefined, prop: string, colon: string, value: string) => prefix === undefined ? match : prefix + prop + colon + replacement(prop.toLowerCase(), value, look, false));
    if (css !== themed) changes.push({ start: element.openEnd, end: element.closeStart, text: themed });
  }
  return changes;
}
