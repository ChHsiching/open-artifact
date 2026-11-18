import type { Dynamic } from '../dynamic.ts';
import { importDestinationOf, withByHandNamesOnly, importPlanOf } from './import-flow.ts';
import { isImportPlanComing, importPlanSoFar, openImportQuestionIds, columnsQuestionDecides, importQuestionExamples } from './import-review.ts';
import { importColumnsLeftOut, blankColumnsLeftOutOnGrid } from './bring-in.ts';
import { MAX_TEXTS_RECHECKED } from './reading-kinds.ts';
import { isLargeImportFile } from './places.ts';
export function importDestinationSort(open?: Dynamic) {
  if (importDestinationOf(open).kind === 'sheet' && !isImportPlanComing(open) && open.intoSheet !== null) return 'changesToASheet';
  return !isImportPlanComing(open) && open.newSheet?.hasRoom === false ? 'changesToASheet' : 'sheetToCome';
}
export function importColumnsComingInCount(open?: Dynamic) {
  let { plan: plan } = importPlanSoFar(open);
  let leftOutCount = importColumnsLeftOut(open, plan).length + columnsLeftOutOfSheetChanges(open).length;
  return plan.columns.length - leftOutCount;
}
export function openColumnQuestions(open?: Dynamic) {
  let { plan: plan } = importPlanSoFar(open);
  let openQuestionIds = new (Set as Dynamic)(openImportQuestionIds(open));
  let columnsLeftOut = new (Set as Dynamic)(importColumnsLeftOut(open, plan));
  return plan.questions.flatMap(({ id: id, options: options }: Dynamic) => {
    let columns = columnsQuestionDecides({
      options: options,
    }).filter((columnIndex?: Dynamic) => !columnsLeftOut.has(columnIndex));
    if (columns.length === 0) return [];
    let readingKinds = new (Set as Dynamic)(
      options
        .flatMap(({ readings: readings }: Dynamic) => readings)
        .filter(({ columnIndex: columnIndex, reading: reading }: Dynamic) => columns.includes(columnIndex) && reading.kind !== 'text')
        .map(({ reading: reading }: Dynamic) => reading.kind),
    );
    let isAllOf = (...kinds: Dynamic[]) =>
      readingKinds.size > 0 && [...readingKinds].every((kind?: Dynamic) => kinds.includes(kind));
    return [
      {
        questionId: id,
        names: columns.map((columnIndex?: Dynamic) => plan.columns[columnIndex]?.name ?? ''),
        columns: columns,
        isOpen: openQuestionIds.has(id),
        about: isAllOf('date', 'dateAndTime') ? 'date' : isAllOf('number', 'currency', 'percent') ? 'number' : 'other',
        example: importQuestionExamples(open, id)[0]?.[0]?.text ?? null,
      },
    ];
  });
}
export function betterReadingForTextColumn(kinds?: Dynamic) {
  if (kinds === undefined) return null;
  if (kinds.some(({ reading: reading, digits: digits }: Dynamic) => reading.kind === 'text' && digits.length > 0)) return null;
  let numberFitting = kinds.find(({ reading: reading }: Dynamic) => reading.kind === 'number')?.fitting ?? 0;
  let [best] = kinds
    .filter(({ reading: { kind: kind }, fitting: fitting, notFitting: notFitting }: Dynamic) => {
      let fitRatio = kind === 'number' ? OFFER_FIT_RATIO_NUMBER : OFFER_FIT_RATIO_OTHER;
      let fittingBeyondNumber = isPercentOrCurrency(kind) ? fitting - numberFitting : fitting;
      return (
        READINGS_WORTH_OFFERING.has(kind) &&
        ((kind !== 'number' && !isPercentOrCurrency(kind)) || fitting + notFitting <= MAX_TEXTS_RECHECKED) &&
        fittingBeyondNumber >= 2 &&
        notFitting > 0 &&
        fittingBeyondNumber * fitRatio >= fitting + notFitting
      );
    })
    .toSorted((first?: Dynamic, second?: Dynamic) => second.fitting - first.fitting);
  return best ?? null;
}
export function importSettingsToCheck(open?: Dynamic) {
  let tableRead = withByHandNamesOnly(open);
  let readings = importPlanOf(tableRead);
  let plan = importPlanSoFar(open).plan;
  let columnsLeftOut = new (Set as Dynamic)(importColumnsLeftOut(open, plan));
  let questions = openColumnQuestions(open);
  let columnsInQuestions = new (Set as Dynamic)(
    readings.questions.flatMap((question?: Dynamic) => columnsQuestionDecides(question)),
  );
  let columnsThatAreEmpty = blankColumnsLeftOutOnGrid(tableRead, readings);
  let columnsKeptAsText = new (Set as Dynamic)(
    importPlanSoFar(open).preview.columns.flatMap(
      ({ columnIndex: columnIndex, keptAsTextCount: keptAsTextCount }: Dynamic) => (keptAsTextCount > 0 ? [columnIndex] : []),
    ),
  );
  let textColumns = importPlanSoFar(open).preview.columns.flatMap(
    ({ columnIndex: columnIndex, reading: reading }: Dynamic) =>
      reading.kind === 'text' && !columnsLeftOut.has(columnIndex) ? [columnIndex] : [],
  );
  let textColumnsWithBetterReading = new (Set as Dynamic)(
    textColumns.filter(
      (columnIndex?: Dynamic) =>
        open.byHand.columns[columnIndex]?.reading === undefined && betterReadingForTextColumn(open.kinds[columnIndex]) !== null,
    ),
  );
  let isChangesToASheet = importDestinationSort(open) === 'changesToASheet';
  let linesLeftOut = plan.linesLeftOut.filter((line?: Dynamic) => line > (plan.headerLine ?? 0));
  let columnsLeftOutSorted = [...columnsLeftOut].toSorted((first?: Dynamic, second?: Dynamic) => first - second);
  return {
    questions: questions,
    columns: readings.columns.flatMap(
      (column?: Dynamic, columnIndex?: Dynamic) =>
        (columnsInQuestions.has(columnIndex) ||
          columnsKeptAsText.has(columnIndex) ||
          textColumnsWithBetterReading.has(columnIndex) ||
          (isChangesToASheet && open.byHand.columns[columnIndex]?.isLeftOut === false)) &&
        !columnsLeftOut.has(columnIndex)
          ? [columnIndex]
          : [],
    ),
    textColumnsYetToLookInto: isLargeImportFile(open.table)
      ? []
      : textColumns.filter((columnIndex?: Dynamic) => open.kinds[columnIndex] === undefined),
    columnsLeftOut: columnsLeftOutSorted,
    columnsThatAreEmpty: columnsThatAreEmpty,
    linesLeftOut: linesLeftOut,
  };
}
export const columnsLeftOutOfSheetChanges = (open?: Dynamic) =>
  importDestinationOf(open).kind === 'sheet' && open.intoSheet?.kind === 'changes' ? open.intoSheet.columnsLeftOut : [];
export const questionsNotAboutColumns = (questions?: Dynamic, leftOutColumns?: Dynamic) =>
  questions.filter(
    ({ columns: columns }: Dynamic) => !columns.some((columnIndex?: Dynamic) => leftOutColumns.includes(columnIndex)),
  );
export const READINGS_WORTH_OFFERING = new (Set as Dynamic)(['number', 'currency', 'percent', 'date', 'dateAndTime', 'timeOfDay']);
export const OFFER_FIT_RATIO_OTHER = 4;
export const OFFER_FIT_RATIO_NUMBER = 2;
export const isPercentOrCurrency = (kind?: Dynamic) => kind === 'percent' || kind === 'currency';
