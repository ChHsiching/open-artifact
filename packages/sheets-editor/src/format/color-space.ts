import type { Dynamic } from '../dynamic.ts';
export function hexToLinearRgb(hex?: Dynamic) {
  let [red, green, blue] = hexToRgbUnit(hex);
  return [srgbToLinear(red), srgbToLinear(green), srgbToLinear(blue)];
}
export function hexToOklch(input?: Dynamic) {
  let [value, value2, value3] = hexToLinearRgb(input);
  let value4 = Math.cbrt(0.4122214708 * value + 0.5363325363 * value2 + 0.0514459929 * value3);
  let value5 = Math.cbrt(0.2119034982 * value + 0.6806995451 * value2 + 0.1073969566 * value3);
  let value6 = Math.cbrt(0.0883024619 * value + 0.2817188376 * value2 + 0.6299787005 * value3);
  let value7 = 1.9779984951 * value4 - 2.428592205 * value5 + 0.4505937099 * value6;
  let value8 = 0.0259040371 * value4 + 0.7827717662 * value5 - 0.808675766 * value6;
  return {
    lightness: 0.2104542553 * value4 + 0.793617785 * value5 - 0.0040720468 * value6,
    chroma: Math.hypot(value7, value8),
    hue: Math.atan2(value8, value7),
  };
}
export function oklchToSrgb({ lightness: lightness, chroma: chroma, hue: hue }: Dynamic) {
  let value = chroma * Math.cos(hue);
  let value2 = chroma * Math.sin(hue);
  let value3 = (lightness + 0.3963377774 * value + 0.2158037573 * value2) ** 3;
  let value4 = (lightness - 0.1055613458 * value - 0.0638541728 * value2) ** 3;
  let value5 = (lightness - 0.0894841775 * value - 1.291485548 * value2) ** 3;
  return [
    linearToSrgb(4.0767416621 * value3 - 3.3077115913 * value4 + 0.2309699292 * value5),
    linearToSrgb(-1.2684380046 * value3 + 2.6097574011 * value4 - 0.3413193965 * value5),
    linearToSrgb(-0.0041960863 * value3 - 0.7034186147 * value4 + 1.707614701 * value5),
  ];
}
export function maxChromaInGamut(lightness?: Dynamic, hue?: Dynamic) {
  let low: Dynamic = 0;
  let high: Dynamic = MAX_CHROMA_SEARCH_LIMIT;
  for (let step: Dynamic = 0; step < 12; step += 1) {
    let middle = (low + high) / 2;
    if (
      isOklchInSrgbGamut({
        lightness: lightness,
        chroma: middle,
        hue: hue,
      })
    )
      low = middle;
    else high = middle;
  }
  return low;
}
export function hexAtLightness(oklch?: Dynamic, lightness?: Dynamic) {
  if (oklch.chroma < ACHROMATIC_CHROMA_LIMIT)
    return rgbUnitToHex(
      oklchToSrgb({
        lightness: lightness,
        chroma: 0,
        hue: 0,
      }),
    );
  let maxChromaNow = maxChromaInGamut(oklch.lightness, oklch.hue);
  let chroma = (maxChromaNow === 0 ? 0 : Math.min(1, oklch.chroma / maxChromaNow)) * maxChromaInGamut(lightness, oklch.hue);
  return rgbUnitToHex(
    oklchToSrgb({
      lightness: lightness,
      chroma: chroma,
      hue: oklch.hue,
    }),
  );
}
export function relativeLuminance(hex?: Dynamic) {
  let [red, green, blue] = hexToLinearRgb(hex);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
export function contrastRatio(hexA?: Dynamic, hexB?: Dynamic) {
  let [luminanceA, luminanceB] = [relativeLuminance(hexA), relativeLuminance(hexB)];
  return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05);
}
export const hexToRgbUnit = (hex?: Dynamic) => {
  let rgb = Number.parseInt(hex.slice(1), 16);
  return [(rgb >> 16) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255];
};
export const rgbUnitToHex = (channels?: Dynamic) =>
  `#${channels
    .map(
      (channel?: Dynamic) =>
        Math.round(Math.min(1, Math.max(0, channel)) * 255)
          .toString(16)
          .padStart(2, '0'),
    )
    .join('')}`;
export const srgbToLinear = (channel?: Dynamic) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (channel?: Dynamic) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** 0.4166666666666667 - 0.055;
export const SRGB_GAMUT_EPSILON = 0.00196078431372549;
export const isOklchInSrgbGamut = (oklch?: Dynamic) =>
  oklchToSrgb(oklch).every((input?: Dynamic) => input >= -SRGB_GAMUT_EPSILON && input <= 1 + SRGB_GAMUT_EPSILON);
export const MAX_CHROMA_SEARCH_LIMIT = 0.4;
export const ACHROMATIC_CHROMA_LIMIT = 0.012;
