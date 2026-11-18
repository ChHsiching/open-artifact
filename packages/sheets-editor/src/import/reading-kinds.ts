import type { Dynamic } from '../dynamic.ts';
import {
  dataLineNumbers,
  readingFittingTexts,
  trueOrFalseFit,
  precisionLossOf,
  decimalPlacesRead,
  isSameJson,
  fitOfReading,
} from './column-readings.ts';
import { profileImportColumn } from './file-profile.ts';
import { dayMonthOrderOf } from './import-basics.ts';
import { refineReadingForTexts } from './plan-without-agent.ts';
import { exampleOfReading } from './preview.ts';
export function readingKindsOfColumn(
  file?: Dynamic,
  plan?: Dynamic,
  columnIndex?: Dynamic,
  chosenReadings?: Dynamic,
  agentsReading?: Dynamic,
  core?: Dynamic,
  maxDropdownOptions?: Dynamic,
) {
  let lineNumbers = dataLineNumbers(file, plan);
  let { texts: texts, different: different, readings: readings, fits: fits } = profileImportColumn(file, lineNumbers, columnIndex, core);
  let filledCount = different.reduce((sum: Dynamic, { count: count }: Dynamic) => sum + count, 0);
  let noneFit = {
    fitting: 0,
    notFitting: filledCount,
  };
  let allFit = {
    fitting: filledCount,
    notFitting: 0,
  };
  let trueOrFalse = {
    kind: 'trueOrFalse',
  };
  let bestByKind = new (Map as Dynamic)([
    [
      'text',
      {
        reading: {
          kind: 'text',
        },
        ...allFit,
      },
    ],
    [
      'trueOrFalse',
      {
        reading: trueOrFalse,
        ...(readingFittingTexts(trueOrFalse, texts) === trueOrFalse ? trueOrFalseFit(texts) : noneFit),
      },
    ],
    [
      'dropdown',
      {
        reading: {
          kind: 'dropdown',
          isColored: true,
        },
        ...(different.length <= maxDropdownOptions ? allFit : noneFit),
      },
    ],
  ]);
  let [decimalSign = core.decimalSign] = chosenReadings.flatMap(
    (input?: Dynamic) => ('decimalSign' in input ? [input.decimalSign] : []),
  );
  let [dateOrder = dayMonthOrderOf(core)] = chosenReadings.flatMap((input?: Dynamic) => ('order' in input ? [input.order] : []));
  let isChosenOrder = (input?: Dynamic) =>
    ('decimalSign' in input && input.decimalSign === decimalSign) || ('order' in input && input.order === dateOrder);
  readings.forEach((reading?: Dynamic, index?: Dynamic) => {
    let { fitting: fitting, notFitting: notFitting } = fits[index] ?? noneFit;
    let best = bestByKind.get(reading.kind);
    if (
      best === undefined ||
      fitting > best.fitting ||
      (fitting === best.fitting && !isChosenOrder(best.reading) && (isChosenOrder(reading) || 'order' in reading))
    )
      bestByKind.set(reading.kind, {
        reading: reading,
        fitting: fitting,
        notFitting: notFitting,
      });
  });
  let digitsLostUnder = (reading?: Dynamic) => {
    if (reading.kind === 'trueOrFalse') return [];
    let lossByText = different.flatMap(({ text: text }: Dynamic) => {
      let loss = precisionLossOf(reading, text);
      return loss === null ? [] : [[text, loss]];
    });
    let unsure = lossByText.filter(([input]: Dynamic) => !ALL_DIGITS_PATTERN.test(input));
    if (unsure.length > MAX_TEXTS_RECHECKED) return null;
    let read =
      unsure.length === 0
        ? undefined
        : core.textsUnderAColumnReading(
            reading,
            unsure.map(([input]: Dynamic) => input),
          )?.read;
    let fitting = new (Set as Dynamic)(unsure.filter((input?: Dynamic, options?: Dynamic) => read?.[options]?.kind === 'fits'));
    return lossByText.filter((input?: Dynamic) => ALL_DIGITS_PATTERN.test(input[0]) || fitting.has(input));
  };
  let digitsOf = (reading?: Dynamic) => {
    let isText = reading.kind === 'text';
    let numberReadings = ['number', 'currency', 'percent'].flatMap((input?: Dynamic) => bestByKind.get(input)?.reading ?? []);
    let losses = (isText ? numberReadings : [reading]).map(digitsLostUnder);
    if (losses.includes(null)) return [];
    let lossByText = new (Map as Dynamic)(losses.flatMap((input?: Dynamic) => input ?? []));
    return ['leadingZeros', 'lastDigits'].flatMap((digits?: Dynamic) => {
      let count = different
        .filter(({ text: text }: Dynamic) => lossByText.get(text) === digits)
        .reduce((sum?: Dynamic, different2?: Dynamic) => sum + different2.count, 0);
      return count === 0
        ? []
        : {
            digits: digits,
            isKept: isText,
            count: count,
            filled: filledCount,
          };
    });
  };
  let decimalPlacesLostUnder = (reading?: Dynamic) => {
    if (!('decimalPlaces' in reading)) return [];
    let moreDecimals = different.flatMap((different2?: Dynamic) => {
      let places = decimalPlacesRead(reading, different2.text);
      return places !== null && places.places > reading.decimalPlaces
        ? [
            {
              ...different2,
              isPlain: places.isPlain,
            },
          ]
        : [];
    });
    if (moreDecimals.length === 0) return [];
    let unsure = moreDecimals.filter(({ isPlain: isPlain }: Dynamic) => !isPlain);
    if (unsure.length > MAX_TEXTS_RECHECKED) return [];
    let plainSample = moreDecimals.filter(({ isPlain: isPlain }: Dynamic) => isPlain).slice(0, 1);
    let checked = [...unsure, ...plainSample];
    let read = core.textsUnderAColumnReading(
      reading,
      checked.map(({ text: text }: Dynamic) => text),
    )?.read;
    let fitting = new (Set as Dynamic)(checked.filter((input?: Dynamic, options?: Dynamic) => read?.[options]?.kind === 'fits'));
    if (read === undefined || plainSample.some((input?: Dynamic) => !fitting.has(input))) return [];
    let count = moreDecimals
      .filter((input?: Dynamic) => input.isPlain || fitting.has(input))
      .reduce((sum?: Dynamic, different2?: Dynamic) => sum + different2.count, 0);
    return count === 0
      ? []
      : [
          {
            digits: 'decimalPlaces',
            shown: reading.decimalPlaces,
            count: count,
            filled: filledCount,
          },
        ];
  };
  let chosenReading = chosenReadings[0] === undefined ? undefined : readingFittingTexts(chosenReadings[0], texts);
  let agentsFittingReading = agentsReading !== null && readingFittingTexts(agentsReading, texts) === agentsReading ? agentsReading : null;
  return READING_KIND_ORDER.flatMap((kind?: Dynamic) => {
    let isChosen = chosenReading?.kind === kind;
    let isAgents = agentsFittingReading?.kind === kind;
    let best = bestByKind.get(kind);
    let refined =
      best === undefined || best.reading.kind === 'trueOrFalse' ? best?.reading : refineReadingForTexts(best.reading, different, core);
    let reading = (isAgents ? agentsFittingReading : refined) ?? (isChosen ? chosenReading : undefined);
    if (reading === undefined) return [];
    let isBest = best !== undefined && isSameJson(reading, refined);
    let { fitting: fitting, notFitting: notFitting } = (isBest ? best : fitOfReading(reading, texts, core)) ?? {
      fitting: 0,
      notFitting: 0,
    };
    let shownReading = isChosen ? chosenReading : reading;
    let isPicked = isChosen || isAgents;
    return {
      reading: reading,
      fitting: fitting,
      notFitting: notFitting,
      isAgentsPick: isAgents,
      digits: isPicked ? [...digitsOf(shownReading), ...decimalPlacesLostUnder(shownReading)] : [],
      example: isPicked || fitting > 0 ? exampleOfReading(shownReading, texts, core) : null,
    };
  });
}
export const withoutDecimalPlacesDigits = (kind?: Dynamic) => ({
  ...kind,
  digits: kind.digits.filter(({ digits: digits }: Dynamic) => digits !== 'decimalPlaces'),
});
export const ALL_DIGITS_PATTERN = /^\d+$/;
export const MAX_TEXTS_RECHECKED = 1000;
export const READING_KIND_ORDER = ['text', 'number', 'currency', 'percent', 'date', 'dateAndTime', 'timeOfDay', 'trueOrFalse', 'dropdown'];
