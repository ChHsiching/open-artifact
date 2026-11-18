import type { Dynamic } from '../dynamic.ts';
import { firstLineHeight } from './cell-metrics-values.ts';
import { MAX_CHIP_BEYOND_LINE } from './cell-metrics.ts';
export const DROPDOWN_PILL_PADDING = 8;
export const DROPDOWN_ARROW_GAP = 3;
export const DROPDOWN_ARROW_WIDTH = 12;
export const PERSON_CHIP_END_PADDING = 8;
export const PERSON_CHIP_ARROW_GAP = 4;
export const PERSON_AVATAR_SIZE = 16;
export const PERSON_AVATAR_GAP = 4;
export const personChipInsetY = (fontSize?: Dynamic) =>
  Math.ceil((firstLineHeight(fontSize) + MAX_CHIP_BEYOND_LINE - PERSON_AVATAR_SIZE) / 2);
export const personChipWidth = (isOpen?: Dynamic, fontSize?: Dynamic) =>
  personChipInsetY(fontSize) +
  PERSON_AVATAR_SIZE +
  PERSON_AVATAR_GAP +
  (isOpen ? PERSON_AVATAR_GAP + DROPDOWN_ARROW_WIDTH + PERSON_CHIP_ARROW_GAP : PERSON_CHIP_END_PADDING);
export const PERSON_CHIP_GAP = 4;
export const personChipsWidth = (count?: Dynamic, isOpen?: Dynamic, fontSize?: Dynamic) =>
  personChipWidth(isOpen, fontSize) + (count - 1) * (PERSON_CHIP_GAP + personChipWidth(false, fontSize));
export const dropdownChipExtraWidth = (isOption?: Dynamic, hasArrow?: Dynamic) =>
  (isOption ? DROPDOWN_PILL_PADDING : 0) + (isOption || hasArrow ? DROPDOWN_ARROW_GAP : 0) + (hasArrow ? DROPDOWN_ARROW_WIDTH : 0);
