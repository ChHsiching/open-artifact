import type { Dynamic } from '../dynamic.ts';
import {
  dateShownAsForOrder,
  isNumericReading,
  isSameJson,
  looksLikeTrueOrFalseColumn,
  notFittingExamples,
  losesPrecisionInAny,
  isFitTooPoor,
  decimalSignOfReading,
  importTextAt,
  planWithAnswers,
  importColumnTexts,
  readingFittingTexts,
  fitOfReading,
} from './column-readings.ts';
import { READING_DECIMAL_SIGNS, profileImportFile, profileImportColumn } from './file-profile.ts';
import { dayMonthOrderOf, NEW_SHEET_DESTINATION, MAX_BROUGHT_DOWN_DECIMAL_PLACES } from './import-basics.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function isSomeBatchOfTexts(texts?: Dynamic, isTrueOf?: Dynamic) {
  for (let start: Dynamic = 0; start < texts.length; start += TEXT_CHECK_BATCH)
    if (isTrueOf(texts.slice(start, start + TEXT_CHECK_BATCH))) return true;
  return false;
}
export function refineReadingForTexts(reading?: Dynamic, different?: Dynamic, core?: Dynamic) {
  if (reading.kind === 'date' || reading.kind === 'dateAndTime')
    return {
      ...reading,
      shownAs: dateShownAsForOrder(reading.order),
    };
  if (!isNumericReading(reading) || !('decimalSign' in reading)) return reading;
  let [decimalCharacter, groupCharacter] = reading.decimalSign === 'point' ? ['.', ','] : [',', '.'];
  let decimalPlaces = decimalPlacesShownAfter(different, decimalCharacter);
  if (reading.kind === 'currency')
    return {
      ...reading,
      decimalPlaces: decimalPlaces,
    };
  if (reading.kind === 'number')
    return {
      ...reading,
      decimalPlaces: decimalPlaces,
      groupsThousands: anyTextIncludes(different, groupCharacter),
    };
  let textsWithoutPercent = different.filter(({ text: text }: Dynamic) => !text.includes('%'));
  let hasNumbersOverOne = (
    core.textsUnderAColumnReading(
      {
        kind: 'number',
        decimalSign: reading.decimalSign,
        decimalPlaces: 0,
        groupsThousands: false,
      },
      textsWithoutPercent.map(({ text: text }: Dynamic) => text),
    )?.read ?? []
  ).some((read?: Dynamic) => read.kind === 'fits' && read.input.kind === 'number' && Math.abs(read.input.value) > 1);
  if (!hasNumbersOverOne)
    return {
      ...reading,
      decimalPlaces: decimalPlaces,
      numberAloneIs: 'aShareOfOne',
    };
  let textsWithPercent = different.filter(({ text: text }: Dynamic) => text.includes('%'));
  if (
    !isSomeBatchOfTexts(
      textsWithPercent.map(({ text: text }: Dynamic) => text),
      (batch?: Dynamic) => (core.fitOfColumnReadings([reading], batch)?.[0]?.fitting ?? 0) > 0,
    ) ||
    countOfTexts(textsWithPercent) > countOfTexts(textsWithoutPercent)
  )
    return {
      ...reading,
      decimalPlaces: decimalPlaces,
      numberAloneIs: 'percents',
    };
  return {
    ...reading,
    decimalPlaces: decimalPlacesShownAfter(textsWithPercent, decimalCharacter),
    numberAloneIs: 'noPercentage',
  };
}
export function decimalSignOfLeadingZeros(texts?: Dynamic) {
  let signs = new (Set as Dynamic)();
  for (let text of texts as Dynamic) signs.add(/(?:^|[^\d.,])0([.,])\d+(?![\d.,])/.exec(text)?.[1]);
  signs.delete(undefined);
  if (signs.size !== 1) return null;
  return signs.has(',') ? 'comma' : 'point';
}
export function doDecimalSignsReadDifferently(reading?: Dynamic, otherReading?: Dynamic, texts?: Dynamic, core?: Dynamic) {
  let textsWithSign = texts.filter((text?: Dynamic) => /[.,]/.test(text));
  return isSomeBatchOfTexts(textsWithSign, (batch?: Dynamic) => {
    let otherReads = core.textsUnderAColumnReading(otherReading, batch)?.read ?? [];
    return (core.textsUnderAColumnReading(reading, batch)?.read ?? []).some((read?: Dynamic, index?: Dynamic) => {
      let otherRead = otherReads[index];
      return read.kind === 'fits' && otherRead?.kind === 'fits' && !isSameJson(read.input, otherRead.input);
    });
  });
}
export function guessColumnReading({ texts: texts, different: different, readings: readings, fits: fits }: Dynamic, core?: Dynamic) {
  let textGuess = {
    reading: {
      kind: 'text',
    },
    isOpenBetweenDayAndMonthFirst: false,
    withOtherDecimalSign: null,
    ofDecimalSign: null,
  };
  if (different.length === 0) return textGuess;
  if (looksLikeTrueOrFalseColumn(texts))
    return {
      ...textGuess,
      reading: {
        kind: 'trueOrFalse',
      },
    };
  let differentTexts = different.map(({ text: text }: Dynamic) => text);
  let differentFits: Dynamic;
  let notFittingExamplesAt = (index?: Dynamic) => (
    (differentFits ??= core.fitOfColumnReadings([...readings], differentTexts) ?? []),
    notFittingExamples(differentFits[index], differentTexts)
  );
  let candidates = readings.flatMap((reading?: Dynamic, index?: Dynamic) => {
    let fit = fits[index];
    return fit !== undefined &&
      fit.sameAsReading === null &&
      fit.fitting > fit.notFitting &&
      !losesPrecisionInAny(reading, differentTexts) &&
      !isFitTooPoor(fit, () => notFittingExamplesAt(index))
      ? [
          {
            reading: reading,
            notFitting: fit.notFitting,
          },
        ]
      : [];
  });
  let fewestNotFitting = candidates.reduce(
    (fewest: Dynamic, { notFitting: notFitting }: Dynamic) => Math.min(fewest, notFitting),
    Number.POSITIVE_INFINITY,
  );
  let bestCandidates = candidates.filter(({ notFitting: notFitting }: Dynamic) => notFitting === fewestNotFitting);
  let [best] = bestCandidates;
  let bestReading = (
    (best !== undefined && dateOrderOfReading(best.reading) === 'yearMonthDay'
      ? bestCandidates.find(({ reading: reading }: Dynamic) => reading.kind === best.reading.kind && reading !== best.reading)
      : undefined) ?? best
  )?.reading;
  if (bestReading !== undefined) {
    let ordersOfKind = new (Set as Dynamic)(
      bestCandidates
        .filter(({ reading: reading }: Dynamic) => reading.kind === bestReading.kind)
        .map(({ reading: reading }: Dynamic) => dateOrderOfReading(reading)),
    );
    let isOtherDecimalSign = (reading?: Dynamic) =>
      reading.kind === bestReading.kind && decimalSignOfReading(reading) !== decimalSignOfReading(bestReading);
    let otherIndex = readings.findIndex(isOtherDecimalSign);
    let otherReading = candidates.find(({ reading: reading }: Dynamic) => isOtherDecimalSign(reading))?.reading ?? null;
    let hasDecimalTexts = fits[otherIndex]?.sameAsReading === null && differentTexts.some((text?: Dynamic) => /[.,]\d/.test(text));
    let signsDisagree = otherReading !== null && doDecimalSignsReadDifferently(bestReading, otherReading, differentTexts, core);
    let isOtherAmongBest = bestCandidates.some(({ reading: reading }: Dynamic) => reading === otherReading);
    let signOfLeadingZeros = hasDecimalTexts ? decimalSignOfLeadingZeros(differentTexts) : null;
    let [chosenReading, alternativeReading] =
      otherReading !== null && isOtherAmongBest && signOfLeadingZeros === decimalSignOfReading(otherReading)
        ? [otherReading, bestReading]
        : [bestReading, otherReading];
    let decimalSignEvidence = () => {
      if (signOfLeadingZeros === decimalSignOfReading(chosenReading)) return 'settles';
      if (isOtherAmongBest) return 'saysLittle';
      let textsWithDecimals = texts.filter((text?: Dynamic) => /[.,]\d/.test(text));
      let [fit] = core.fitOfColumnReadings(readings.slice(otherIndex, otherIndex + 1), textsWithDecimals) ?? [];
      if (fit === undefined) return 'saysLittle';
      if (alternativeReading === null && fit.fitting < fit.notFitting) return 'settles';
      return fit.notFitting * DECIMAL_SIGN_LEAN_RATIO >= textsWithDecimals.length ? 'leans' : 'saysLittle';
    };
    return {
      reading: refineReadingForTexts(chosenReading, different, core),
      isOpenBetweenDayAndMonthFirst: ordersOfKind.has('dayMonthYear') && ordersOfKind.has('monthDayYear'),
      withOtherDecimalSign: signsDisagree ? alternativeReading : null,
      ofDecimalSign: hasDecimalTexts ? decimalSignEvidence() : null,
    };
  }
  if (
    READING_DECIMAL_SIGNS.some(
      (decimalSign?: Dynamic) =>
        losesPrecisionInAny(
          {
            kind: 'number',
            decimalSign: decimalSign,
            decimalPlaces: 0,
            groupsThousands: false,
          },
          differentTexts,
        ),
    )
  )
    return textGuess;
  let filledCount = different.reduce((sum: Dynamic, { count: count }: Dynamic) => sum + count, 0);
  if (
    !(
      different.length >= MIN_GUESSED_DROPDOWN_OPTIONS &&
      different.length <= MAX_GUESSED_DROPDOWN_OPTIONS &&
      filledCount >= different.length * MIN_DROPDOWN_REPEATS
    )
  )
    return textGuess;
  let dropdownReading = {
    kind: 'dropdown',
    isColored: true,
  };
  let [dropdownFit] = core.fitOfColumnReadings([dropdownReading], texts) ?? [];
  return dropdownFit !== undefined && dropdownFit.notFitting === 0
    ? {
        ...textGuess,
        reading: dropdownReading,
      }
    : textGuess;
}
export function decimalSignQuestion(
  guesses: Dynamic,
  { columns: columns }: Dynamic,
  { delimiter: delimiter }: Dynamic,
  core?: Dynamic,
  labels?: Dynamic,
) {
  let columnsInDoubt = guesses.flatMap(
    ({ reading: reading, withOtherDecimalSign: other }: Dynamic, columnIndex?: Dynamic) =>
      other === null
        ? []
        : [
            {
              columnIndex: columnIndex,
              reading: reading,
              other: other,
            },
          ],
  );
  let signsThat = (evidence?: Dynamic) =>
    new (Set as Dynamic)(
      guesses.flatMap((guess?: Dynamic) => (guess.ofDecimalSign === evidence ? [decimalSignOfReading(guess.reading)] : [])),
    );
  let settledSigns = signsThat('settles');
  let leaningSigns = signsThat('leans');
  let defaultSign = delimiter === ';' ? 'comma' : core.decimalSign;
  let isDefaultInPlay = delimiter === ';' || (settledSigns.size === 0 && leaningSigns.size === 0);
  let signsInPlay = new (Set as Dynamic)([
    ...settledSigns,
    ...leaningSigns,
    ...signsThat('saysLittle'),
    ...(defaultSign === 'comma' && isDefaultInPlay ? [defaultSign] : []),
  ]);
  if (columnsInDoubt.length === 0 || signsInPlay.size < 2) return null;
  let decidingSigns = settledSigns.size > 0 ? settledSigns : leaningSigns;
  let choices = [
    ['comma', labels.comma],
    ['point', labels.point],
  ];
  return {
    id: 'decimal-sign',
    ask: labels.ask,
    options: choices.map(
      ([sign, label]: Dynamic) => ({
        label: label,
        readings: columnsInDoubt.map(
          ({ columnIndex: columnIndex, reading: reading, other: other }: Dynamic) => ({
            columnIndex: columnIndex,
            reading: decimalSignOfReading(reading) === sign ? reading : refineReadingForTexts(other, columns[columnIndex]?.different ?? [], core),
          }),
        ),
      }),
    ),
    recommendedIndex: (decidingSigns.size === 1 ? decidingSigns.has('comma') : defaultSign === 'comma') ? 0 : 1,
  };
}
export function planImportWithoutAgent(file?: Dynamic, profile?: Dynamic, core?: Dynamic, words?: Dynamic) {
  let guessReadings = ({ columns: columns2 }: Dynamic) =>
    columns2.map((columnProfile?: Dynamic) => guessColumnReading(columnProfile, core));
  let headerLine = profile.headerLine;
  let guesses = guessReadings(profile);
  let isHeaderARecord = headerLine !== null && headerLineFitsReadings(file, headerLine, profile, guesses, core);
  let linesLeftOut = isHeaderARecord
    ? Array.from<Dynamic, Dynamic>(
        {
          length: headerLine - 1,
        },
        (input?: Dynamic, index?: Dynamic) => index + 1,
      )
    : profile.linesLeftOut;
  let planHeaderLine = isHeaderARecord ? null : headerLine;
  let planProfile = isHeaderARecord
    ? profileImportFile(file, core, {
        headerLine: planHeaderLine,
        linesLeftOut: linesLeftOut,
      })
    : profile;
  let planGuesses = isHeaderARecord ? guessReadings(planProfile) : guesses;
  let dateColumnsInDoubt = planGuesses.flatMap(
    (guess?: Dynamic, columnIndex?: Dynamic) =>
      guess.isOpenBetweenDayAndMonthFirst
        ? [
            {
              columnIndex: columnIndex,
              reading: guess.reading,
            },
          ]
        : [],
  );
  let dateChoices = [
    ['monthDayYear', words.dateOrder.monthFirst],
    ['dayMonthYear', words.dateOrder.dayFirst],
  ];
  let dateOrderQuestion = {
    id: 'date-order',
    ask: words.dateOrder.ask,
    options: dateChoices.map(
      ([order, label]: Dynamic) => ({
        label: label,
        readings: dateColumnsInDoubt.map(
          ({ columnIndex: columnIndex, reading: reading }: Dynamic) => ({
            columnIndex: columnIndex,
            reading: withDateOrder(reading, order),
          }),
        ),
      }),
    ),
    recommendedIndex: dateChoices.findIndex(([order]: Dynamic) => order === dayMonthOrderOf(core)),
  };
  let signQuestion = decimalSignQuestion(planGuesses, planProfile, file, core, words.decimalSign);
  let columns = planGuesses.map(({ reading: reading }: Dynamic, columnIndex?: Dynamic) => {
    let heading = planHeaderLine === null ? '' : importTextAt(file, planHeaderLine, columnIndex).trim();
    return {
      name: heading === '' ? (words.names.columns[columnIndex] ?? '') : heading,
      reading: reading,
    };
  });
  let questions = [...(dateColumnsInDoubt.length > 0 ? [dateOrderQuestion] : []), ...(signQuestion === null ? [] : [signQuestion])];
  return planWithAnswers(
    {
      sheetName: words.names.sheet,
      headerLine: planHeaderLine,
      linesLeftOut: linesLeftOut,
      columns: columns,
      questions: questions,
      notes: [],
      destination: NEW_SHEET_DESTINATION,
      whyThere: null,
      destinationQuestion: null,
    },
    {},
  );
}
export function readingKeepingMoreHeld(wayNow?: Dynamic, waysToTry?: Dynamic, shared?: Dynamic) {
  let texts = shared.map(({ text: text }: Dynamic) => text);
  let keptBy = (way?: Dynamic) => {
    let values = way.read(texts);
    if (values === null) return null;
    let isNumberLost = ({ held: held }: Dynamic, index?: Dynamic) => typeof held === 'number' && typeof values[index] === 'string';
    return {
      left: shared.filter(({ held: held }: Dynamic, index?: Dynamic) => held === values[index]).length,
      numbersLost: shared.filter(isNumberLost).length,
    };
  };
  let keptNow = keptBy(wayNow);
  if (keptNow === null || keptNow.left === shared.length) return null;
  let best: Dynamic = null;
  for (let way of waysToTry()) {
    let kept = keptBy(way);
    if (kept === null) continue;
    let { left: left, numbersLost: numbersLost } = kept;
    if (numbersLost > keptNow.numbersLost || left < keptNow.left + 2) continue;
    if (
      best === null ||
      left > best.left ||
      (left === best.left &&
        (way.fitting > best.way.fitting || (way.fitting === best.way.fitting && way.isTheWorkbooksOwn && !best.way.isTheWorkbooksOwn)))
    )
      best = {
        way: way,
        left: left,
      };
  }
  return best?.way.reading ?? null;
}
export function wayOfReading(reading: Dynamic, fitting: Dynamic, reads: WorkbookReads) {
  return {
    reading: reading,
    fitting: fitting,
    isTheWorkbooksOwn:
      ('decimalSign' in reading && reading.decimalSign === reads.decimalSign) || ('order' in reading && reading.order === dayMonthOrderOf(reads)),
    read(texts?: Dynamic) {
      if (!isReadingParsed(reading)) return texts;
      let read = reads.textsUnderAColumnReading(reading, [...texts])?.read;
      if (read === undefined) return null;
      return texts.map((text?: Dynamic, index?: Dynamic) => {
        let readText = read[index];
        return readText?.kind === 'fits' && readText.input.kind === 'number' ? readText.input.value : text;
      });
    },
  };
}
export function waysToReadColumn(
  { different: different, readings: readings, fits: fits }: Dynamic,
  leastFitting: Dynamic,
  reads: WorkbookReads,
) {
  let texts = different.map(({ text: text }: Dynamic) => text);
  let fittingOf = (index?: Dynamic) => fits[index]?.fitting ?? 0;
  let ways = readings.flatMap((reading?: Dynamic, index?: Dynamic) => {
    let fittingsOfKind = readings.map(
      (other?: Dynamic, otherIndex?: Dynamic) => (other.kind === reading.kind ? fittingOf(otherIndex) : 0),
    );
    return fittingOf(index) === 0 ||
      fits[index]?.sameAsReading !== null ||
      losesPrecisionInAny(reading, texts) ||
      (leastFitting !== null && fittingOf(index) < Math.max(leastFitting, ...fittingsOfKind))
      ? []
      : [wayOfReading(reading, fittingOf(index), reads)];
  });
  return [
    wayOfReading(
      {
        kind: 'text',
      },
      0,
      reads,
    ),
    ...ways,
  ];
}
export function readingAsSheetHolds(
  file: Dynamic,
  lines: Dynamic,
  columnIndex: Dynamic,
  reading: Dynamic,
  shared: Dynamic,
  reads: WorkbookReads,
) {
  if (shared.length < LEAST_SHARED_ROWS) return null;
  let texts = importColumnTexts(file, lines, columnIndex);
  let fitting = readingFittingTexts(reading, texts);
  let wayNow = wayOfReading(fitting, 0, reads);
  let sharedLines = shared.map(({ line: line }: Dynamic) => line);
  if (
    readingKeepingMoreHeld(wayNow, () => waysToReadColumn(profileImportColumn(file, sharedLines, columnIndex, reads), null, reads), shared) === null
  )
    return null;
  let profile = profileImportColumn(file, lines, columnIndex, reads);
  let fittingNow = isReadingParsed(fitting) ? (fitOfReading(fitting, texts, reads)?.fitting ?? 0) : 0;
  let better = readingKeepingMoreHeld(wayNow, () => waysToReadColumn(profile, fittingNow, reads), shared);
  if (better === null) return null;
  let refined = refineReadingForTexts(better, profile.different, reads);
  return refined.kind === 'percent' && better.kind === 'percent'
    ? {
        ...refined,
        numberAloneIs: better.numberAloneIs,
      }
    : refined;
}
export function scrambledIndex(index?: Dynamic) {
  let value: Dynamic = index + 1;
  value = Math.imul(value ^ (value >>> 16), 73244475);
  value = Math.imul(value ^ (value >>> 16), 73244475);
  return (value ^ (value >>> 16)) >>> 0;
}
export const MIN_GUESSED_DROPDOWN_OPTIONS = 2;
export const MAX_GUESSED_DROPDOWN_OPTIONS = 8;
export const MIN_DROPDOWN_REPEATS = 3;
export const anyTextIncludes = (different?: Dynamic, character?: Dynamic) =>
  different.some(({ text: text }: Dynamic) => text.includes(character));
export const decimalPlacesShownAfter = (different?: Dynamic, decimalCharacter?: Dynamic) =>
  different.reduce((places: Dynamic, { text: text }: Dynamic) => {
    let afterSign = text.slice(text.lastIndexOf(decimalCharacter) + 1);
    let digitCount = text.includes(decimalCharacter) ? (/^\d*/.exec(afterSign)?.[0].length ?? 0) : 0;
    return Math.min(MAX_BROUGHT_DOWN_DECIMAL_PLACES, Math.max(places, digitCount));
  }, 0);
export const countOfTexts = (texts?: Dynamic) =>
  texts.reduce((total: Dynamic, { count: count }: Dynamic) => total + count, 0);
export const TEXT_CHECK_BATCH = 200;
export const dateOrderOfReading = (reading?: Dynamic) =>
  reading.kind === 'date' || reading.kind === 'dateAndTime' ? reading.order : null;
export const DECIMAL_SIGN_LEAN_RATIO = 20;
export const isTextOrDropdownReading = ({ kind: kind }: Dynamic) => kind === 'text' || kind === 'dropdown';
export const headerLineFitsReadings = (
  file: Dynamic,
  headerLine: Dynamic,
  { columns: columns }: Dynamic,
  guesses?: Dynamic,
  core?: Dynamic,
) =>
  guesses.every(({ reading: reading }: Dynamic, columnIndex?: Dynamic) => {
    if (columns[columnIndex]?.different.length === 0) return true;
    if (isTextOrDropdownReading(reading)) return false;
    return fitOfReading(reading, [importTextAt(file, headerLine, columnIndex)], core)?.notFitting === 0;
  });
export const withDateOrder = (reading?: Dynamic, order?: Dynamic) =>
  reading.kind === 'date' || reading.kind === 'dateAndTime'
    ? {
        ...reading,
        order: order,
        shownAs: dateShownAsForOrder(order),
      }
    : reading;
export const LEAST_SHARED_ROWS = 2;
export const isReadingParsed = (reading?: Dynamic) =>
  reading.kind !== 'text' && reading.kind !== 'dropdown' && reading.kind !== 'trueOrFalse';
export const SHARED_ROWS_COMPARED = 200;
export const SHARED_ROWS_KEPT = 20 * SHARED_ROWS_COMPARED;
