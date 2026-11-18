import type { Dynamic } from '../dynamic.ts';
import { NO_COLOR, colorsEqual } from '../model/colors.ts';
export function hueNamedByLabel(label?: Dynamic, isHueFree?: Dynamic) {
  let negationAt = label.search(NEGATION_PATTERN);
  let best: Dynamic = null;
  for (let [hue, pattern] of STATUS_HUE_PATTERNS as Dynamic) {
    let matchAt = label.search(pattern);
    let isAllowed = hue === 'none' || (isHueFree(hue) && (negationAt === -1 || matchAt < negationAt));
    if (matchAt !== -1 && isAllowed && (best === null || matchAt < best.at))
      best = {
        hue: hue,
        at: matchAt,
      };
  }
  return best?.hue ?? null;
}
export function colorSuggestedByLabel(label?: Dynamic, takenColors?: Dynamic) {
  let takenHues = standardHuesOf(takenColors);
  let hue = hueNamedByLabel(label, (hue2?: Dynamic) => !takenHues.includes(hue2));
  if (hue === null) return null;
  return hue === 'none'
    ? NO_COLOR
    : {
        kind: 'standard',
        hue: hue,
        shade: DROPDOWN_CHIP_SHADE,
      };
}
export function colorForNewOption(label?: Dynamic, takenColors?: Dynamic) {
  let suggested = colorSuggestedByLabel(label, takenColors);
  if (suggested !== null) return suggested;
  let takenHues = standardHuesOf(takenColors);
  let timesTaken = (hue?: Dynamic) => takenHues.filter((taken?: Dynamic) => taken === hue).length;
  let takenWeight = (hue?: Dynamic) => timesTaken(hue) + (timesTaken(HUES_ALIKE[hue]) > 0 ? 0.5 : 0);
  let leastTakenHue = DROPDOWN_HUES.reduce((best?: Dynamic, hue?: Dynamic) => (takenWeight(hue) < takenWeight(best) ? hue : best));
  let colorOfShade = (shade?: Dynamic) => ({
    kind: 'standard',
    hue: leastTakenHue,
    shade: shade,
  });
  let freeShade = DROPDOWN_SHADES.find(
    (shade?: Dynamic) => !takenColors.some((color?: Dynamic) => colorsEqual(colorOfShade(shade), color)),
  );
  return colorOfShade(freeShade ?? DROPDOWN_CHIP_SHADE);
}
export function colorOptionsAutomatically(options?: Dynamic) {
  let colored = assignOptionColors(options);
  return colored.filter(({ color: color }: Dynamic) => color.kind !== 'none').length > DROPDOWN_HUES.length
    ? withoutOptionColors(options)
    : colored;
}
export function assignOptionColors(
  options?: Dynamic,
  keptColorOf: Dynamic = () => {
    return;
  },
) {
  let colorByOption = new (Map as Dynamic)();
  for (let option of options as Dynamic) {
    let keptColor = keptColorOf(option);
    if (keptColor !== undefined) colorByOption.set(option, keptColor);
  }
  for (let option of options as Dynamic) {
    let keptColor = [...colorByOption.values()];
    if (!colorByOption.has(option) && colorSuggestedByLabel(option.label, keptColor) !== null)
      colorByOption.set(option, colorForNewOption(option.label, keptColor));
  }
  let usedColors = [...colorByOption.values()];
  return options.map((option?: Dynamic) => {
    let kept = colorByOption.get(option);
    let color = kept ?? colorForNewOption(option.label, usedColors);
    if (kept === undefined) usedColors.push(color);
    return {
      ...option,
      color: color,
    };
  });
}
export const DROPDOWN_HUES = ['blue', 'orange', 'teal', 'yellow', 'magenta', 'green', 'purple', 'red'];
export const DROPDOWN_CHIP_SHADE = 200;
export const DROPDOWN_COLOR_CHOICES = [
  NO_COLOR,
  ...['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'magenta'].map(
    (hue?: Dynamic) => ({
      kind: 'standard',
      hue: hue,
      shade: DROPDOWN_CHIP_SHADE,
    }),
  ),
];
export const DROPDOWN_SHADES = [DROPDOWN_CHIP_SHADE, 300];
export const wholeWordPattern = (words?: Dynamic) =>
  new (RegExp as Dynamic)(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, 'iu');
export const DONE_STATUS_WORDS = 'done|completed?|shipped|approved|accepted|resolved|live|launched|pass(?:ed|ing)?|paid|on[ -]track|yes';
export const BLOCKED_STATUS_WORDS = 'blocke(?:d|rs?)|stuck';
export const STATUS_HUE_PATTERNS = [
  ['none', wholeWordPattern('not[ -]started|backlog|to[ -]?do|icebox|idea|unassigned|none')],
  ['green', wholeWordPattern(DONE_STATUS_WORDS)],
  ['blue', wholeWordPattern('progress|doing|review|active|building|drafting|underway|started')],
  [
    'red',
    wholeWordPattern(
      `${BLOCKED_STATUS_WORDS}|risk|late|overdue|bug|fail(?:ed|ing|ure)?|reject(?:ed)?|declined?|off[ -]track|urgent|critical|high|no`,
    ),
  ],
  ['purple', wholeWordPattern('review|pending|waiting|qa|needs input|proposed')],
  ['teal', wholeWordPattern(`low|nice to have|someday|${DONE_STATUS_WORDS}`)],
  ['yellow', wholeWordPattern(`at[ -]risk|${BLOCKED_STATUS_WORDS}|med(?:ium)?|maybe|normal|plann(?:ed|ing)|next|scheduled|unpaid`)],
  ['magenta', wholeWordPattern('cancell?ed|archived|dropped|on hold|paused')],
];
export const NEGATION_PATTERN = wholeWordPattern('(?:not|no|part|partly|partially|half|almost|nearly)(?=[^\\p{L}\\p{N}]+[\\p{L}\\p{N}])');
export const standardHuesOf = (colors?: Dynamic) =>
  colors.flatMap((color?: Dynamic) => (color.kind === 'standard' ? [color.hue] : []));
export const HUES_ALIKE = {
  orange: 'red',
};
export const isDropdownDeliberatelyUncolored = (options?: Dynamic) =>
  options.every(({ color: color }: Dynamic) => color.kind === 'none') &&
  options.some(({ label: label }: Dynamic) => colorSuggestedByLabel(label, [])?.kind !== 'none');
export const colorForAddedOption = (label?: Dynamic, options?: Dynamic) =>
  isDropdownDeliberatelyUncolored(options)
    ? NO_COLOR
    : colorForNewOption(
        label,
        options.map(({ color: color }: Dynamic) => color),
      );
export const withoutOptionColors = (options?: Dynamic) =>
  options.map(
    (option?: Dynamic) => ({
      ...option,
      color: NO_COLOR,
    }),
  );
