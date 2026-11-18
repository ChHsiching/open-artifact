import type { Dynamic } from '../dynamic.ts';
import { withNoEffects } from '../state/transitions.ts';
import { partialPlanFromAnswer, askForImportPlan, askWithWish, planForAgent } from './agent-plan.ts';
import {
  importPlanWithByHand,
  dropdownOptionsForImport,
  importPlacesLeft,
  importDestinationOf,
  refreshImportPreview,
  importPlanAsShown,
  newSheetForImport,
  placeImportAndAskAgent,
  receiveImportAnswer,
  askAgentAboutImport,
} from './import-flow.ts';
import { previewImportColumns } from './preview.ts';
import { columnsLeftOutByHand, withoutReadingsByHand, questionOptionOfReading, applyByHandChange } from './by-hand.ts';
import { withStopImportAskEffect, importRecordCount } from './bring-in.ts';
import { questionColumnIndexes, planWithAnswers, isSameJson, chosenAnswersOf } from './column-readings.ts';
import { readingKindsOfColumn, withoutDecimalPlacesDigits } from './reading-kinds.ts';
import { NEW_SHEET_DESTINATION } from './import-basics.ts';
import { matchHeadingsToColumns, fileHeadingsOf } from './places.ts';
import { joinPrompts } from '../agent/prompt-text.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
export function receivePartialImportAnswer(state: PageState, reads?: Dynamic, askId?: Dynamic, partialAnswer?: Dynamic) {
  let importOfAFile = state.importOfAFile;
  if (importOfAFile === null || importOfAFile.agent.kind !== 'isAsked' || importOfAFile.agent.askId !== askId) return withNoEffects(state);
  let soFar = importOfAFile.soFar;
  if (soFar === null || importOfAFile.agent.attempt > 1) return withNoEffects(state);
  let partialPlan = partialPlanFromAnswer(partialAnswer, importOfAFile.table, importOfAFile.plan, importOfAFile.words.names);
  let planWithByHand2 = importPlanWithByHand({
    ...importOfAFile,
    plan: {
      ...partialPlan.plan,
      summary: partialPlan.summary,
    },
  });
  let asking = {
    ...partialPlan,
    plan: planWithByHand2,
    summary: planWithByHand2.summary ?? null,
  };
  if (!(asking.columnsReadCount > soFar.columnsReadCount || (asking.isTableFound && !soFar.isTableFound))) {
    let { summary: summary, isSummaryWhole: isSummaryWhole } = asking;
    return summary === soFar.summary && isSummaryWhole === soFar.isSummaryWhole
      ? withNoEffects(state)
      : withNoEffects({
          ...state,
          importOfAFile: {
            ...importOfAFile,
            soFar: {
              ...soFar,
              summary: summary,
              isSummaryWhole: isSummaryWhole,
            },
          },
        });
  }
  let previewColumns = previewImportColumns(importOfAFile.table, asking.plan, reads, soFar, dropdownOptionsForImport);
  return withNoEffects({
    ...state,
    importOfAFile: {
      ...importOfAFile,
      soFar: {
        ...asking,
        preview: previewColumns,
      },
    },
  });
}
export function importLinesLeftOut(importOfAFile?: Dynamic) {
  let { plan: plan, preview: preview } = importPlanSoFar(importOfAFile);
  let value = (input?: Dynamic) => input > (plan.headerLine ?? 0);
  let linesByHand = Object.keys(importOfAFile.byHand.lines).map(Number).filter(value);
  let linesLeftOut = [...new (Set as Dynamic)([...linesByHand, ...preview.linesLeftOut])]
    .toSorted((input?: Dynamic, options?: Dynamic) => input - options)
    .map(
      (input?: Dynamic) => ({
        line: input,
        isLeftOut: !value(input) || plan.linesLeftOut.includes(input),
        canComeBack: value(input),
      }),
    );
  let length = linesLeftOut.filter(({ isLeftOut: isLeftOut }: Dynamic) => isLeftOut).length;
  return {
    lines: linesLeftOut,
    moreCount: preview.lineLeftOutCount - length,
  };
}
export function importNotesToShow(importOfAFile?: Dynamic) {
  if (!importOfAFile.isPlanByAgent) return [];
  let { whyThere: whyThere, notes: notes } = importOfAFile.plan;
  let askedBefore = new (Set as Dynamic)(importPlanSoFar(importOfAFile).plan.notes);
  return [
    ...new (Set as Dynamic)([
      ...(importPlacesLeft(importOfAFile).length > 0 && whyThere !== null ? [whyThere] : []),
      ...notes.filter((note?: Dynamic) => askedBefore.has(note)),
    ]),
  ];
}
export function columnsQuestionDecides({ options: options }: Dynamic) {
  return [
    ...new (Set as Dynamic)(
      options.flatMap(({ readings: readings }: Dynamic) => readings.map(({ columnIndex: columnIndex }: Dynamic) => columnIndex)),
    ),
  ].filter((input?: Dynamic) => {
    let mapped = options.map(
      ({ readings: readings }: Dynamic) =>
        JSON.stringify(readings.find((reading?: Dynamic) => reading.columnIndex === input)?.reading),
    );
    return new (Set as Dynamic)(mapped).size > 1;
  });
}
export function openImportQuestionIds(importOfAFile?: Dynamic) {
  let destination = importDestinationOf(importOfAFile);
  let questions = destination.kind === 'sheet' && destination.how.kind === 'mergeByKey' ? destination.how.keyColumnIndex : null;
  let decided = new (Set as Dynamic)(columnsLeftOutByHand(importOfAFile.byHand).filter((input?: Dynamic) => input !== questions));
  return importPlanWithByHand(importOfAFile)
    .questions.filter(
      (question?: Dynamic) =>
        importOfAFile.answers[question.id] === undefined && columnsQuestionDecides(question).some((input?: Dynamic) => !decided.has(input)),
    )
    .map(({ id: id }: Dynamic) => id);
}
export function stopAwaitingImportPlan(state: PageState) {
  let importOfAFile = state.importOfAFile;
  if (importOfAFile === null) return withNoEffects(state);
  if (isImportPlanComing(importOfAFile)) {
    let stopped = {
      ...importOfAFile,
      agent: {
        kind: 'wasStopped',
      },
      soFar: null,
    };
    return withStopImportAskEffect(
      state,
      withNoEffects({
        ...state,
        importOfAFile: stopped,
      }),
    );
  }
  if (importOfAFile.agent.kind !== 'isAsked') return withNoEffects(state);
  let nextState = {
    kind: 'hasFailed',
    wish: importOfAFile.agent.wish,
  };
  return withStopImportAskEffect(
    state,
    withNoEffects({
      ...state,
      importOfAFile: {
        ...importOfAFile,
        agent: nextState,
      },
    }),
  );
}
export function answerImportQuestion(state: PageState, reads: WorkbookReads, questionId?: Dynamic, optionIndex?: Dynamic) {
  let importOfAFile = state.importOfAFile;
  if (importOfAFile === null) return withNoEffects(state);
  let question = importOfAFile.plan.questions.find(({ id: question2 }: Dynamic) => question2 === questionId);
  if (question?.options[optionIndex] === undefined) return withNoEffects(state);
  let isInDoubt = questionColumnIndexes(question).every(
    (input?: Dynamic) => importOfAFile.byHand.columns[input]?.reading !== undefined,
  );
  if (importOfAFile.answers[questionId] === optionIndex && !isInDoubt) return withNoEffects(state);
  let answered = {
    ...importOfAFile.answers,
    [questionId]: optionIndex,
  };
  let answers = isInDoubt ? withoutReadingsByHand(importOfAFile.byHand, questionColumnIndexes(question)) : importOfAFile.byHand;
  let questionsAnswered = importPlanWithByHand(importOfAFile).questions.filter(({ id: id }: Dynamic) => id === questionId);
  let columnsAnswered = [...importOfAFile.columnsAnswered, ...questionsAnswered.flatMap(questionColumnIndexes)];
  let nextState = {
    ...withStoodNotPointedAt(importOfAFile),
    answers: answered,
    byHand: answers,
    isAnAnswerInDoubt: false,
  };
  let refreshed = refreshImportPreview(
    {
      ...nextState,
      columnsAnswered: columnsAnswered,
    },
    reads,
    importOfAFile,
  );
  return withNoEffects({
    ...state,
    importOfAFile: refreshed,
  });
}
export function changeImportByHand(state: PageState, reads: WorkbookReads, change?: Dynamic) {
  let importOfAFile = state.importOfAFile;
  if (importOfAFile === null || isImportPlanComing(importOfAFile) || importOfAFile.agent.kind === 'isAsked') return withNoEffects(state);
  let byHand =
    change.kind === 'column' && change.reading !== undefined && importOfAFile.asTheSheetHolds[change.columnIndex] === undefined
      ? questionOptionOfReading(importOfAFile.plan.questions, change.columnIndex, change.reading)
      : null;
  if (byHand !== null) return answerImportQuestion(state, reads, byHand.questionId, byHand.optionIndex);
  let planWithChange = applyByHandChange(importOfAFile.byHand, change);
  if (
    (change.kind === 'line' || change.kind === 'headings') &&
    importRecordCount({
      ...importOfAFile,
      byHand: planWithChange,
    }) === 0 &&
    importRecordCount(importOfAFile) > 0
  )
    return withNoEffects(state);
  let value = importOfAFile.isAnAnswerInDoubt && !('reading' in change);
  let nextImport = refreshImportPreview(
    {
      ...withStoodNotPointedAt(importOfAFile),
      byHand: planWithChange,
      isAnAnswerInDoubt: value,
    },
    reads,
    importOfAFile,
  );
  return withNoEffects({
    ...state,
    importOfAFile: dropDestinationIfSheetGone(nextImport, reads),
  });
}
export function loadImportColumnKinds(state: PageState, reads: WorkbookReads, columnIndex?: Dynamic) {
  let importOfAFile = state.importOfAFile;
  if (importOfAFile === null || importOfAFile.kinds[columnIndex] !== undefined) return withNoEffects(state);
  let mostOptions = reads.mostOptionsInADropdown();
  let plan = importPlanAsShown(importOfAFile);
  let columns = [plan, planWithAnswers(importOfAFile.plan, importOfAFile.answers)].flatMap(
    ({ columns: columns2 }: Dynamic) => columns2[columnIndex]?.reading ?? [],
  );
  let fromAgent =
    importOfAFile.isPlanByAgent && importOfAFile.asTheSheetHolds[columnIndex] === undefined ? importOfAFile.readingsOfAgent[columnIndex] : undefined;
  let value = (columns[1]?.kind === fromAgent?.kind ? columns[1] : fromAgent) ?? null;
  let readingKinds = readingKindsOfColumn(importOfAFile.table, plan, columnIndex, columns, value, reads, mostOptions);
  let value2 = importDestinationOf(importOfAFile).kind === 'newSheet' ? readingKinds : readingKinds.map(withoutDecimalPlacesDigits);
  let kinds = {
    ...importOfAFile.kinds,
    [columnIndex]: value2,
  };
  return withNoEffects({
    ...state,
    importOfAFile: {
      ...importOfAFile,
      kinds: kinds,
    },
  });
}
export function importDestinationFor(importOfAFile?: Dynamic, chosen?: Dynamic) {
  if (chosen.kind === 'newSheet') return NEW_SHEET_DESTINATION;
  let place = importPlacesLeft(importOfAFile).find(({ table: table }: Dynamic) => table.sheetId === chosen.sheetId);
  if (place === undefined) return null;
  let { destination: destination2, destinationQuestion: destinationQuestion } = importOfAFile.plan;
  let value = [
    importDestinationOf(importOfAFile),
    destination2,
    ...(destinationQuestion?.options ?? []).map((option?: Dynamic) => option.destination),
  ].flatMap((input?: Dynamic) => (input.kind === 'sheet' && input.sheetId === chosen.sheetId ? [input] : []));
  let { how: how } = chosen;
  let columnsInto = (input?: Dynamic) => how.kind !== 'mergeByKey' || (input[how.keyColumnIndex] ?? null) !== null;
  let destination =
    (
      [...value.slice(0, 1), ...value.filter((input?: Dynamic) => isSameJson(input.how, how)), ...value].find(
        (input?: Dynamic) => columnsInto(input.intoColumns),
      ) ?? value[0]
    )?.intoColumns ?? matchHeadingsToColumns(fileHeadingsOf(importOfAFile.table, importPlanWithByHand(importOfAFile)), place.table.columns);
  if (!columnsInto(destination)) return null;
  let { sheetId: sheetId, headerRowId: headerRowId } = place.table;
  return {
    kind: 'sheet',
    sheetId: sheetId,
    headerRowId: headerRowId,
    intoColumns: destination,
    how: how,
  };
}
export function chooseImportDestination(state: PageState, reads: WorkbookReads, choice?: Dynamic) {
  let importOfAFile = state.importOfAFile;
  if (importOfAFile === null || (importOfAFile.agent.kind === 'isAsked' && importOfAFile.agent.wish !== null)) return withNoEffects(state);
  let destination = importDestinationFor(importOfAFile, choice);
  if (destination === null) return withNoEffects(state);
  if (isSameJson(destination, importOfAFile.destinationChosen)) return withNoEffects(state);
  let nextImport = refreshImportPreview(
    {
      ...withStoodNotPointedAt(importOfAFile),
      destinationChosen: destination,
    },
    reads,
    importOfAFile,
  );
  return withNoEffects({
    ...state,
    importOfAFile: dropDestinationIfSheetGone(nextImport, reads),
  });
}
export function withImportPlacesGone(importOfAFile?: Dynamic, sheetIdsGone?: Dynamic) {
  let isOnSheetGone = (input?: Dynamic) => input?.kind === 'sheet' && sheetIdsGone.includes(input.sheetId);
  let { plan: plan } = importOfAFile;
  let isAskedAboutGone = plan.destinationQuestion?.options.some((option?: Dynamic) => isOnSheetGone(option.destination));
  return {
    ...importOfAFile,
    placesGone: [...importOfAFile.placesGone, ...sheetIdsGone],
    destinationChosen: isOnSheetGone(importOfAFile.destinationChosen) ? null : importOfAFile.destinationChosen,
    plan:
      !isOnSheetGone(plan.destination) && isAskedAboutGone !== true
        ? plan
        : {
            ...plan,
            destination: isOnSheetGone(plan.destination) ? NEW_SHEET_DESTINATION : plan.destination,
            whyThere: isOnSheetGone(plan.destination) ? null : plan.whyThere,
            destinationQuestion: isAskedAboutGone === true ? null : plan.destinationQuestion,
          },
  };
}
export function dropDestinationIfSheetGone(importOfAFile?: Dynamic, sheetIdsGone?: Dynamic) {
  let destination = importDestinationOf(importOfAFile);
  let { intoSheet: intoSheet } = importOfAFile;
  let value =
    intoSheet?.kind === 'refused' &&
    (intoSheet.refusal === 'unknownSheet' || intoSheet.refusal === 'unknownRow' || intoSheet.refusal === 'unknownColumn');
  return destination.kind === 'newSheet' || !value
    ? importOfAFile
    : refreshImportPreview(withImportPlacesGone(importOfAFile, [destination.sheetId]), sheetIdsGone, importOfAFile);
}
export function refreshImportNewSheet(importOfAFile: Dynamic, reads: WorkbookReads) {
  if (importOfAFile.newSheet === null) return importOfAFile;
  let newSheet = newSheetForImport(importOfAFile, reads, importOfAFile.newSheet.filledCellCount);
  return isSameJson(newSheet, importOfAFile.newSheet)
    ? importOfAFile
    : {
        ...importOfAFile,
        newSheet: newSheet,
      };
}
export function refreshImportOnWorkbookChange(state: PageState, reads: WorkbookReads) {
  if (state.importOfAFile === null) return withNoEffects(state);
  let importOfAFile = refreshImportNewSheet(state.importOfAFile, reads);
  let importBefore =
    importOfAFile === state.importOfAFile
      ? state
      : {
          ...state,
          importOfAFile: importOfAFile,
        };
  if (importOfAFile.places === null) return placeImportAndAskAgent(importBefore, importOfAFile, reads);
  if (importOfAFile.agent.kind === 'isAsked' && importOfAFile.agent.replyUnread !== null)
    return receiveImportAnswer(importBefore, reads, importOfAFile.agent.askId, importOfAFile.agent.replyUnread);
  let sheetIdsNow = new (Set as Dynamic)(reads.listSheets().map(({ sheetId: sheetId }: Dynamic) => sheetId));
  let placesLeft = importPlacesLeft(importOfAFile).flatMap(
    ({ table: table }: Dynamic) => (sheetIdsNow.has(table.sheetId) ? [] : [table.sheetId]),
  );
  if (placesLeft.length === 0 && importDestinationOf(importOfAFile).kind === 'newSheet') return withNoEffects(importBefore);
  let nextImport = refreshImportPreview(withImportPlacesGone(importOfAFile, placesLeft), reads, importOfAFile);
  return withNoEffects({
    ...importBefore,
    importOfAFile: dropDestinationIfSheetGone(nextImport, reads),
  });
}
export function sendImportWish(state: PageState, wish?: Dynamic) {
  let importOfAFile = state.importOfAFile;
  if (importOfAFile === null || wish.trim() === '') return withNoEffects(state);
  let request = importOfAFile.agent.kind !== 'isAsked' && importOfAFile.agent.kind !== 'isNotToBeHad';
  if (!importOfAFile.isPlanByAgent || !request) return withNoEffects(state);
  return askAgentAboutImport(state, importOfAFile, {
    asked: joinPrompts(
      askForImportPlan(importOfAFile.dataForAgent),
      askWithWish(
        planForAgent(importPlanWithByHand(importOfAFile), importOfAFile.answers, importOfAFile.places ?? [], importOfAFile.destinationChosen),
        wish.trim(),
        describeImportChoicesForAgent(importOfAFile),
      ),
    ),
    attempt: 1,
    wish: wish.trim(),
    isAskedAgain: false,
  });
}
export function askImportPlanAgain(state: PageState) {
  let importOfAFile = state.importOfAFile;
  let request = importOfAFile?.agent.kind === 'hasFailed' || importOfAFile?.agent.kind === 'wasStopped';
  if (importOfAFile === null || !request || importOfAFile.isPlanByAgent) return withNoEffects(state);
  let dataForAgent = askForImportPlan(importOfAFile.dataForAgent);
  return askAgentAboutImport(state, importOfAFile, {
    asked: dataForAgent,
    attempt: 1,
    wish: null,
    isAskedAgain: true,
  });
}
export const importPlanSoFar = (importOfAFile?: Dynamic) =>
  importOfAFile.soFar === null
    ? {
        plan: importPlanAsShown(importOfAFile),
        preview: importOfAFile.preview,
        isTableFound: true,
        columnsReadCount: importOfAFile.plan.columns.length,
        summary: importOfAFile.isPlanByAgent ? (importPlanAsShown(importOfAFile).summary ?? null) : null,
        isSummaryWhole: true,
        isAwaited: false,
      }
    : {
        ...importOfAFile.soFar,
        isAwaited: true,
      };
export const NO_STOOD_CHANGES: Dynamic = [];
export const NOTHING_STOOD = {
  stood: [],
  namesOfStood: {},
  isStoodPointedAt: false,
};
export const stoodByHandChanges = ({ agent: agent }: Dynamic) =>
  (agent.kind === 'hasChangedNothing' || agent.kind === 'hasPlanned') && agent.isStoodPointedAt ? agent.stood : NO_STOOD_CHANGES;
export const withStoodNotPointedAt = (importOfAFile?: Dynamic) =>
  importOfAFile.agent.kind === 'hasChangedNothing' || importOfAFile.agent.kind === 'hasPlanned'
    ? {
        ...importOfAFile,
        agent: {
          ...importOfAFile.agent,
          isStoodPointedAt: false,
        },
      }
    : importOfAFile;
export const whyNoAgentForImport = ({ agent: agent, isPlanByAgent: isPlanByAgent }: Dynamic) =>
  !isPlanByAgent && agent.kind === 'isNotToBeHad' && agent.leftUndone === null ? agent.why : null;
export const wasQuestionAskedBefore = ({ plansOfAgent: plansOfAgent }: Dynamic, { ask: ask }: Dynamic) =>
  plansOfAgent.some(({ questions: questions }: Dynamic) => questions.some((question?: Dynamic) => question.ask === ask));
export const isDestinationQuestionOpen = (importOfAFile?: Dynamic) =>
  importOfAFile.plan.destinationQuestion !== null && importOfAFile.destinationChosen === null;
export const openImportQuestionCount = (importOfAFile?: Dynamic) =>
  openImportQuestionIds(importOfAFile).length + (isDestinationQuestionOpen(importOfAFile) ? 1 : 0);
export const isImportPlanComing = ({ soFar: soFar }: Dynamic) => soFar !== null;
export const describeImportChoicesForAgent = (importOfAFile?: Dynamic) =>
  [
    ...chosenAnswersOf(importPlanWithByHand(importOfAFile), importOfAFile.answers).map(
      ({ question: { ask: input, options: input2 }, chosenIndex: chosenIndex }: Dynamic) =>
        `To "${input}" they answered "${input2[chosenIndex]?.label ?? ''}".`,
    ),
    ...(importOfAFile.destinationChosen === null ? [] : ['They chose the destination in that plan themselves.']),
  ].join(' ');
export const importQuestionExamples = (importOfAFile?: Dynamic, questionId?: Dynamic) =>
  importOfAFile.examples[importOfAFile.plan.questions.findIndex(({ id: question }: Dynamic) => question === questionId)] ?? [];
