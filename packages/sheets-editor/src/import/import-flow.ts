import type { Dynamic } from '../dynamic.ts';
import {
  planWithByHand,
  columnsLeftOutByHand,
  NOTHING_BY_HAND,
  columnsNamedInNote,
  byHandAfterNewPlan,
  linesWithByHand,
  changesByHand,
} from './by-hand.ts';
import { countFilledCellsToImport, makeUniqueSheetName, hasRoomForFilledCells } from '../model/workbook-room.ts';
import { isWorkbookOneUntouchedSheet } from './bring-in.ts';
import { readingsAsTheSheetHoldsFor } from './destination.ts';
import { planWithAnswers, isSameJson, planWithAgentRecommendations, mergeImportQuestions, chosenAnswersOf } from './column-readings.ts';
import { previewIntoSheet } from './into-sheet-preview.ts';
import { previewImportColumns, examplesOfQuestion } from './preview.ts';
import { isPromptDataTooLong, joinPrompts } from '../agent/prompt-text.ts';
import { withNoEffects } from '../state/transitions.ts';
import { profileImportFile } from './file-profile.ts';
import {
  importDataForAgent,
  planForAgent,
  askForImportPlan,
  askWithWish,
  askAfterRefusedPlan,
  withWorkbookSheets,
  shortenPlanNames,
  planFromAnswer,
} from './agent-plan.ts';
import { planImportWithoutAgent } from './plan-without-agent.ts';
import { withoutImportUndoOffer } from './file-awaited.ts';
import { findImportPlaces, likeliestImportDestination, tableImportRequest } from './places.ts';
import { NEW_SHEET_DESTINATION } from './import-basics.ts';
import { NOTHING_STOOD, importPlanSoFar } from './import-review.ts';
import { colorOptionsAutomatically, withoutOptionColors } from '../chips/dropdown-colors.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function importPlanWithByHand({ plan: plan, byHand: byHand, asTheSheetHolds: asTheSheetHolds, table: table, words: words }: Dynamic) {
  let columns = {
    ...byHand.columns,
  };
  for (let [columnIndex, reading] of Object.entries(asTheSheetHolds) as Dynamic) {
    let byHandColumn = columns[Number(columnIndex)];
    columns[Number(columnIndex)] = {
      ...byHandColumn,
      reading: byHandColumn?.reading ?? reading,
    };
  }
  return planWithByHand(
    plan,
    {
      ...byHand,
      columns: columns,
    },
    table,
    words.names,
  );
}
export function refreshChosenDestination(chosen?: Dynamic, latest?: Dynamic) {
  if (latest.kind === 'newSheet' || chosen.kind === 'newSheet') return latest;
  if (chosen.sheetId !== latest.sheetId) return latest;
  let { how: how } = latest;
  return how.kind === 'mergeByKey' && chosen.intoColumns[how.keyColumnIndex] !== latest.intoColumns[how.keyColumnIndex]
    ? latest
    : {
        ...latest,
        headerRowId: chosen.headerRowId,
        intoColumns: chosen.intoColumns,
      };
}
export function destinationWithColumnsLeftOut(importOfAFile?: Dynamic) {
  let destination = importDestinationOf(importOfAFile);
  if (destination.kind === 'newSheet') return destination;
  let { how: how, intoColumns: intoColumns } = destination;
  let leftOutIndexes = new (Set as Dynamic)(
    columnsLeftOutByHand(importOfAFile.byHand).filter((input?: Dynamic) => how.kind !== 'mergeByKey' || input !== how.keyColumnIndex),
  );
  return {
    ...destination,
    intoColumns: intoColumns.map((intoColumn?: Dynamic, index?: Dynamic) => (leftOutIndexes.has(index) ? null : intoColumn)),
  };
}
export function withoutColumnsLeftOutByHand(destination?: Dynamic, importOfAFile?: Dynamic) {
  if (destination?.kind !== 'changes') return destination;
  let leftOutByHand = new (Set as Dynamic)(columnsLeftOutByHand(importOfAFile.byHand));
  let columnsLeftOut = destination.columnsLeftOut.filter(
    ({ columnIndexInTheFile: columnIndexInTheFile }: Dynamic) => !leftOutByHand.has(columnIndexInTheFile),
  );
  return {
    ...destination,
    columnsLeftOut: columnsLeftOut,
  };
}
export function importPlanEssentials(importOfAFile?: Dynamic) {
  let { sheetName: sheetName, headerLine: headerLine, linesLeftOut: linesLeftOut, columns: columns } = importPlanAsShown(importOfAFile);
  return {
    sheetName: sheetName,
    headerLine: headerLine,
    linesLeftOut: linesLeftOut,
    columns: columns,
    destination: importDestinationOf(importOfAFile),
  };
}
export function newSheetForImport(importOfAFile: Dynamic, reads: WorkbookReads, newSheetBefore?: Dynamic) {
  let plan = importPlanAsShown(importOfAFile);
  let value = newSheetBefore ?? countFilledCellsToImport(importOfAFile.table, plan, columnsLeftOutByHand(importOfAFile.byHand));
  return {
    name: makeUniqueSheetName(plan.sheetName, reads),
    comesFirst: isWorkbookOneUntouchedSheet(reads, importOfAFile.words.stemOfNewSheetNames),
    filledCellCount: value,
    hasRoom: hasRoomForFilledCells(value, reads),
  };
}
export function refreshImportPreview(importOfAFile: Dynamic, reads: WorkbookReads, importBefore?: Dynamic) {
  let readingsHeld = readingsAsTheSheetHoldsFor(importOfAFile, reads);
  let asTheSheetHolds = readingsHeld ?? importBefore?.asTheSheetHolds ?? NOTHING_AS_THE_SHEET_HOLDS;
  let importNow = {
    ...importOfAFile,
    asTheSheetHolds: asTheSheetHolds,
  };
  let { table: table } = importNow;
  let value =
    importBefore === null
      ? null
      : {
          plan: importPlanAsShown(importBefore),
          preview: importBefore.preview,
        };
  let planWithByHand2 = importPlanWithByHand(importNow);
  let planWithAnswers2 = planWithAnswers(planWithByHand2, importNow.answers);
  let destination = destinationWithColumnsLeftOut(importNow);
  let value2 =
    value !== null && value.plan.headerLine === planWithAnswers2.headerLine && isSameJson(value.plan.linesLeftOut, planWithAnswers2.linesLeftOut);
  let isSameByHand = importBefore?.byHand === importNow.byHand && isSameJson(importBefore.asTheSheetHolds, importNow.asTheSheetHolds);
  let intoSheet =
    destination.kind === 'newSheet' ? null : withoutColumnsLeftOutByHand(previewIntoSheet(table, planWithAnswers2, destination, reads), importNow);
  return {
    ...importNow,
    preview: previewImportColumns(table, planWithAnswers2, reads, value, dropdownOptionsForImport),
    intoSheet: readingsHeld === null ? null : intoSheet,
    newSheet: destination.kind === 'newSheet' ? newSheetForImport(importNow, reads, null) : null,
    examples:
      importBefore !== null && value2 && importBefore.plan === importNow.plan && isSameByHand
        ? importBefore.examples
        : importNow.plan.questions.map((question?: Dynamic) => {
            let questionAsShown = planWithByHand2.questions.find(({ id: id }: Dynamic) => id === question.id);
            return examplesOfQuestion(table, planWithByHand2, questionAsShown ?? question, reads);
          }),
    kinds:
      importBefore !== null &&
      value2 &&
      importDestinationOf(importBefore).kind === destination.kind &&
      importBefore.plan === importNow.plan &&
      importBefore.answers === importNow.answers &&
      isSameByHand
        ? importBefore.kinds
        : {},
  };
}
export function askAgentAboutImport(importOfAFile?: Dynamic, nextImport?: Dynamic, request?: Dynamic) {
  if (isPromptDataTooLong(request.asked)) {
    let asking = {
      kind: 'hasFailed',
      wish: request.wish,
    };
    return withNoEffects({
      ...importOfAFile,
      importOfAFile: {
        ...nextImport,
        agent: asking,
        soFar: null,
      },
    });
  }
  let askCount = importOfAFile.importAskCount + 1;
  return {
    state: {
      ...importOfAFile,
      importAskCount: askCount,
      importOfAFile: {
        ...nextImport,
        agent: {
          kind: 'isAsked',
          askId: askCount,
          replyUnread: null,
          ...request,
        },
        soFar: request.wish === null ? (nextImport.soFar ?? startingImportSoFar(nextImport)) : null,
      },
    },
    effects: [
      {
        kind: 'askAgentAboutImport',
        askId: askCount,
        asked: request.asked,
      },
    ],
  };
}
export function startImportOfAFile(state: PageState, options?: Dynamic, context?: Dynamic, words?: Dynamic) {
  let profiled = importProfileCache.get(context.lines);
  let profile = profiled?.locale === options.locale ? profiled.tried : profileImportFile(context, options);
  importProfileCache.set(context.lines, {
    locale: options.locale,
    tried: profile,
  });
  let dataForAgent = importDataForAgent(context, profile, options);
  let value = refreshImportPreview(
    {
      table: context,
      words: words,
      dataForAgent: dataForAgent.whole,
      dataForAgentWithCountsAlone: dataForAgent.withCountsAlone,
      plan: planImportWithoutAgent(context, profile, options, words),
      isPlanByAgent: false,
      plansOfAgent: [],
      readingsOfAgent: [],
      plansHeardCount: 0,
      answers: {},
      byHand: NOTHING_BY_HAND,
      columnsAnswered: [],
      columnsAskedFor: [],
      places: null,
      placesGone: [],
      destinationChosen: null,
      isAnAnswerInDoubt: false,
      isDiscardAsked: false,
      agent: {
        kind: 'isToBeAsked',
      },
      soFar: null,
    },
    options,
    null,
  );
  return placeImportAndAskAgent(
    {
      ...state,
      pickForWorkbook: null,
      isListOfKeysOpen: false,
      cellHistory: null,
      lastDone: null,
      notice: null,
      undoOffer: withoutImportUndoOffer(state.undoOffer),
    },
    {
      ...value,
      soFar: startingImportSoFar(value),
    },
    options,
  );
}
export function placeImportAndAskAgent(state: Dynamic, importOfAFile: Dynamic, reads: WorkbookReads) {
  let { table: table, plan: plan } = importOfAFile;
  let value = findImportPlaces(table, plan, reads);
  let value2 = value === null || plan.questions.length > 0 ? NEW_SHEET_DESTINATION : likeliestImportDestination(value, table.columnCount);
  let value3 = value2.kind === 'newSheet' ? null : reads.whatATableChanges(tableImportRequest(value2, table, plan));
  if (value === null || (value2.kind === 'sheet' && value3 === null))
    return withNoEffects({
      ...state,
      importOfAFile: importOfAFile,
    });
  let value4 = planForAgent(plan, {}, value, null);
  let value5 = (input?: Dynamic) =>
    !isPromptDataTooLong(
      joinPrompts(joinPrompts(askForImportPlan(input), askWithWish(value4, '', '')), askAfterRefusedPlan(JSON.parse(value4), [])),
      IMPORT_PROMPT_HEADROOM,
    );
  let value6 = withWorkbookSheets(importOfAFile.dataForAgent, value);
  let value7 = value5(value6) ? value6 : withWorkbookSheets(importOfAFile.dataForAgentWithCountsAlone, value);
  let value8 = askForImportPlan(value7);
  let value9 = value5(value7);
  let value10 = refreshImportPreview(
    {
      ...importOfAFile,
      places: value,
      dataForAgent: value7,
      plan: {
        ...plan,
        destination: value3?.kind === 'refused' ? NEW_SHEET_DESTINATION : value2,
      },
      agent:
        importOfAFile.agent.kind === 'wasStopped' && value9
          ? importOfAFile.agent
          : {
              kind: 'isNotToBeHad',
              leftUndone: null,
              why: 'tooMuchToTell',
            },
      soFar: null,
    },
    reads,
    importOfAFile,
  );
  return importOfAFile.agent.kind === 'wasStopped' || !value9
    ? withNoEffects({
        ...state,
        importOfAFile: value10,
      })
    : askAgentAboutImport(state, value10, {
        asked: value8,
        attempt: 1,
        wish: null,
        isAskedAgain: false,
      });
}
export function receiveImportAnswer(state: PageState, reads: WorkbookReads, askId?: Dynamic, reply?: Dynamic) {
  let importOfAFile = state.importOfAFile;
  if (importOfAFile === null || importOfAFile.agent.kind !== 'isAsked' || importOfAFile.agent.askId !== askId) return withNoEffects(state);
  let { asked: asked, attempt: attempt, wish: wish, isAskedAgain: isAskedAgain } = importOfAFile.agent;
  let value = (input?: Dynamic) =>
    withNoEffects({
      ...state,
      importOfAFile: {
        ...importOfAFile,
        agent: input,
        soFar: input.kind === 'isAsked' ? importOfAFile.soFar : null,
      },
    });
  if (reply.kind === 'notToBeHad')
    return value({
      kind: 'isNotToBeHad',
      leftUndone: wish === null ? (isAskedAgain ? 'firstPlan' : null) : 'wish',
      why: 'noAgent',
    });
  let failed = {
    kind: 'hasFailed',
    wish: wish,
  };
  if (reply.kind !== 'answered') return value(failed);
  let shownBefore = importPlanAsShown(importOfAFile);
  let isSameReadingAsShown = ({ reading: reading }: Dynamic, columnIndex?: Dynamic) =>
    isSameJson(reading, shownBefore.columns[columnIndex]?.reading);
  let columnsNamed = columnsNamedInNote(wish ?? '', shownBefore.columns);
  let value2 = [...importOfAFile.plansOfAgent, ...importOfAFile.plansOfAgent.map(planWithAgentRecommendations), shownBefore].flatMap(
    (input?: Dynamic) => [input, shortenPlanNames(input)],
  );
  let value3 = (input?: Dynamic) =>
    wish === null ? importOfAFile.byHand : byHandAfterNewPlan(importOfAFile.byHand, value2, input);
  let answered = planFromAnswer(reply.answer, importOfAFile.table, reads, {
    mostOptionsInADropdown: reads.mostOptionsInADropdown(),
    names: importOfAFile.words.names,
    followsAWish: wish !== null,
    linesLeftOutBefore: importPlanWithByHand(importOfAFile).linesLeftOut,
    shownBefore: shownBefore,
    linesToComeIn: (input?: Dynamic) =>
      linesWithByHand(
        input,
        value3({
          ...importOfAFile.plan,
          ...input,
        }),
        importOfAFile.table,
      ),
    places: importOfAFile.places ?? [],
    destinationBefore: importDestinationOf(importOfAFile),
  });
  let keepReadingHeld = (column?: Dynamic, columnIndex?: Dynamic) =>
    importOfAFile.asTheSheetHolds[columnIndex] !== undefined && isSameReadingAsShown(column, columnIndex) && !columnsNamed.includes(columnIndex)
      ? {
          ...column,
          reading: importOfAFile.plan.columns[columnIndex]?.reading ?? column.reading,
        }
      : column;
  let checked =
    answered.kind === 'plan' && wish !== null
      ? {
          ...answered,
          plan: {
            ...answered.plan,
            columns: answered.plan.columns.map(keepReadingHeld),
          },
        }
      : answered;
  if (checked.kind === 'notKnownYet')
    return value({
      ...importOfAFile.agent,
      replyUnread: reply,
    });
  if (checked.kind === 'refused') {
    if (attempt >= MAX_IMPORT_ASK_ATTEMPTS) return value(failed);
    return askAgentAboutImport(state, importOfAFile, {
      asked: joinPrompts(asked, askAfterRefusedPlan(reply.answer, checked.problems)),
      attempt: attempt + 1,
      wish: wish,
      isAskedAgain: isAskedAgain,
    });
  }
  if (checked.kind === 'noChange')
    return value(
      wish === null
        ? failed
        : {
            kind: 'hasChangedNothing',
            wish: wish,
            why: checked.why,
            ...NOTHING_STOOD,
          },
    );
  let planWithByHand2 = importPlanWithByHand(importOfAFile);
  let value4 = importPlanWithByHand({
    ...importOfAFile,
    plan: checked.plan,
    byHand: value3(checked.plan),
  });
  let value5 = planWithByHand2.headerLine === value4.headerLine && isSameJson(planWithByHand2.linesLeftOut, value4.linesLeftOut);
  let value6 = importPlanSoFar(importOfAFile);
  let value7 =
    (wish === null || (checked.plan.summary ?? null) === null) &&
    value6.summary !== null &&
    value6.isSummaryWhole &&
    value6.isTableFound &&
    value6.plan.headerLine === value4.headerLine &&
    isSameJson(value6.plan.linesLeftOut, value4.linesLeftOut);
  let importWithAnswer = {
    ...importOfAFile,
    ...mergeImportQuestions(
      value7
        ? {
            ...checked.plan,
            summary: value6.summary,
          }
        : checked.plan,
      chosenAnswersOf(planWithByHand2, importOfAFile.answers),
      wish !== null && value5
        ? planWithByHand2.questions.filter(({ id: question }: Dynamic) => importOfAFile.answers[question] === undefined)
        : [],
    ),
    destinationChosen:
      importOfAFile.destinationChosen === null ? null : refreshChosenDestination(checked.plan.destination, importOfAFile.destinationChosen),
    byHand: value3(checked.plan),
    columnsAskedFor: [
      ...importOfAFile.columnsAskedFor,
      ...(wish === null || answered.kind !== 'plan' ? [] : answered.plan.columns).flatMap((column?: Dynamic, columnIndex?: Dynamic) => {
        let isNewReading =
          !['text', 'dropdown'].includes(column.reading.kind) &&
          value2.every((plan?: Dynamic) => !isSameJson(plan.columns[columnIndex]?.reading, column.reading));
        return isSameReadingAsShown(column, columnIndex) || (!columnsNamed.includes(columnIndex) && !isNewReading) ? [] : [columnIndex];
      }),
    ],
  };
  let readingsHeld = readingsAsTheSheetHoldsFor(importWithAnswer, reads);
  if (readingsHeld === null)
    return value({
      ...importOfAFile.agent,
      replyUnread: reply,
    });
  let answeredImport = {
    ...importWithAnswer,
    asTheSheetHolds: readingsHeld,
  };
  let value8 =
    wish !== null &&
    !answeredImport.isAnAnswerInDoubt &&
    isSameJson(importPlanEssentials(answeredImport), importPlanEssentials(importOfAFile)) &&
    isSameJson(importPlanEssentials(withoutAsTheSheetHolds(answeredImport)), importPlanEssentials(withoutAsTheSheetHolds(importOfAFile))) &&
    isSameJson(openImportQuestions(answeredImport), openImportQuestions(importOfAFile));
  let value9 =
    answeredImport.destinationChosen !== null &&
    !isSameJson(destinationPlace(checked.plan.destination), destinationPlace(answeredImport.destinationChosen));
  let value10 =
    wish === null || answeredImport.isAnAnswerInDoubt
      ? []
      : [
          ...changesByHand(checked.plan, answeredImport.byHand, shortenPlanNames(shownBefore)).filter(
            (input?: Dynamic) =>
              (input.kind !== 'sheetName' || importDestinationOf(answeredImport).kind === 'newSheet') &&
              (input.kind !== 'line' || answeredImport.byHand.lines[input.line] !== true || planWithByHand2.linesLeftOut.includes(input.line)),
          ),
          ...(value9
            ? [
                {
                  kind: 'destination',
                },
              ]
            : []),
        ];
  let stoodByHand = {
    stood: value10,
    namesOfStood: Object.fromEntries(
      value10.flatMap(
        (input?: Dynamic) => (input.kind === 'column' ? [[input.columnIndex, value4.columns[input.columnIndex]?.name ?? '']] : []),
      ),
    ),
    isStoodPointedAt: value10.length > 0,
  };
  if (value8)
    return withNoEffects({
      ...state,
      importOfAFile: {
        ...importOfAFile,
        ...(value9 && {
          plan: {
            ...importOfAFile.plan,
            destination: checked.plan.destination,
          },
        }),
        isAnAnswerInDoubt: false,
        agent: {
          kind: 'hasChangedNothing',
          wish: wish,
          why: null,
          ...stoodByHand,
        },
      },
    });
  let withPlanByAgent = {
    ...answeredImport,
    isAnAnswerInDoubt: answeredImport.isAnAnswerInDoubt && wish !== null,
    isPlanByAgent: true,
    plansOfAgent: [...importOfAFile.plansOfAgent, checked.plan],
    readingsOfAgent: checked.plan.columns.map(
      ({ reading: reading }: Dynamic, index?: Dynamic) =>
        wish !== null && isSameJson(reading, shownBefore.columns[index]?.reading) ? (importOfAFile.readingsOfAgent[index] ?? reading) : reading,
    ),
    plansHeardCount: importOfAFile.plansHeardCount + 1,
    agent: {
      kind: 'hasPlanned',
      ...stoodByHand,
    },
    soFar: null,
  };
  return withNoEffects({
    ...state,
    importOfAFile: refreshImportPreview(withPlanByAgent, reads, importOfAFile),
  });
}
export const MAX_IMPORT_ASK_ATTEMPTS = 2;
export const NOTHING_AS_THE_SHEET_HOLDS: Dynamic = {};
export const withoutAsTheSheetHolds = (importOfAFile?: Dynamic) => ({
  ...importOfAFile,
  asTheSheetHolds: NOTHING_AS_THE_SHEET_HOLDS,
});
export const importPlanAsShown = (importOfAFile?: Dynamic) =>
  planWithAnswers(importPlanWithByHand(importOfAFile), importOfAFile.answers);
export const byHandNamesOnly = (byHand?: Dynamic) => ({
  ...byHand,
  lines: {},
  columns: Object.fromEntries(
    Object.entries(byHand.columns).flatMap(
      ([input, { name: input2 }]: Dynamic) =>
        input2 === undefined
          ? []
          : [
              [
                input,
                {
                  name: input2,
                },
              ],
            ],
    ),
  ),
});
export const withByHandNamesOnly = (importOfAFile?: Dynamic) => ({
  ...importOfAFile,
  byHand: byHandNamesOnly(importOfAFile.byHand),
});
export const importPlanOf = (importOfAFile?: Dynamic) => importPlanAsShown(importOfAFile);
export const importDestinationOf = ({ plan: plan, destinationChosen: destinationChosen }: Dynamic) =>
  destinationChosen ?? plan.destination;
export const destinationPlace = (destination?: Dynamic) =>
  destination.kind === 'newSheet'
    ? destination
    : {
        sheetId: destination.sheetId,
        how: destination.how,
      };
export const openImportQuestions = (importOfAFile?: Dynamic) => [
  ...importPlanWithByHand(importOfAFile).questions.flatMap(
    ({ id: question, ask: ask, options: question2 }: Dynamic) =>
      importOfAFile.answers[question] === undefined
        ? [
            {
              ask: ask,
              options: question2,
            },
          ]
        : [],
  ),
  ...(importOfAFile.destinationChosen === null && importOfAFile.plan.destinationQuestion !== null ? [importOfAFile.plan.destinationQuestion] : []),
];
export const dropdownOptionsForImport = ({ isColored: isColored }: Dynamic, labels?: Dynamic) => {
  let options = labels.map(
    (label?: Dynamic) => ({
      label: label,
    }),
  );
  return isColored ? colorOptionsAutomatically(options) : withoutOptionColors(options);
};
export const startingImportSoFar = (importOfAFile?: Dynamic) => ({
  plan: importPlanAsShown(importOfAFile),
  preview: importOfAFile.preview,
  isTableFound: false,
  columnsReadCount: 0,
  summary: null,
  isSummaryWhole: false,
});
export const importProfileCache = new (WeakMap as Dynamic)();
export const IMPORT_PROMPT_HEADROOM = 4096;
export const importPlacesLeft = ({ places: places, placesGone: placesGone }: Dynamic) =>
  (places ?? []).filter(({ table: table }: Dynamic) => !placesGone.includes(table.sheetId));
