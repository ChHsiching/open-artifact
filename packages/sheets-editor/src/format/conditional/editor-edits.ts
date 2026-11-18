import type { Dynamic } from '../../dynamic.ts';
import {
  areRangesOneSameColumn,
  firstColumnOfRule,
  doesConditionFitColumn,
  conditionForNewColumn,
  conditionWithOperator,
  operandForChoice,
  hasEmptyTextOperand,
  findColumnStats,
} from './conditions.ts';
import { areasOfRuleRanges } from './descriptions.ts';
import { areasOverlap } from '../../model/workbook.ts';
import { isInSpan } from '../../grid/geometry.ts';
import { tableColumnSummary, testedColumnSummary, numberConditionOperand, columnLabelOf } from './editor-view.ts';
import {
  updateRuleTest,
  orderScaleAnchors,
  isFormatNonEmpty,
  ruleWithEffectKind,
  removeRuleTest,
  RULE_FORMAT_PRESETS,
  withFormatColor,
  toggleFontStyle,
  withScalePointAnchor,
  withScalePointColor,
  withScaleMidpoint,
  testOfUnusedColumn,
  NEW_TEST_INDEX,
  withAddedTest,
  testedColumnOfRule,
} from './rule-edits.ts';
import { parseA1AreasAsSeen } from '../../model/a1-references.ts';
import { areasOfAllRanges } from '../../selection/several-ranges.ts';
import {
  conditionalFormatRuleById,
  ruleWithTestBeingAdded,
  withConditionalFormatsPane,
  queueRuleEditEffect,
  isSameRulesJson,
  tableOfRuleRange,
  conditionalFormatChangeEffect,
} from './pane-state.ts';
import { withNoEffects } from '../../state/transitions.ts';
import { askAgentForRulesFromWords } from './agent-rules.ts';
import type { PageState } from '../../state/initial-state.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export function testRetargeterForRanges(reads: WorkbookReads, sheetId?: Dynamic, newRule?: Dynamic, edited?: Dynamic) {
  if (areRangesOneSameColumn(newRule.ranges) || !areRangesOneSameColumn(edited.rule.ranges)) return null;
  let newAreas = areasOfRuleRanges(reads, sheetId, newRule.ranges);
  let oldAreas = areasOfRuleRanges(reads, sheetId, edited.rule.ranges);
  if (!newAreas.some((newArea?: Dynamic) => oldAreas.some((oldArea?: Dynamic) => areasOverlap(newArea, oldArea)))) return null;
  let filledColumns = (edited.table?.columns ?? []).filter(({ c: c, filled: filled }: Dynamic) => {
    let columnIndex = reads.columnIndexOf(sheetId, c) ?? -1;
    return (
      filled > 0 &&
      newAreas.some(
        ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) => isInSpan(columnIndex, leftColumnIndex, columnCount),
      )
    );
  });
  let testedColumn = tableColumnSummary(edited.table, firstColumnOfRule(edited.rule));
  return (test?: Dynamic) =>
    filledColumns.every((column?: Dynamic) => doesConditionFitColumn(test.condition, column, testedColumn))
      ? test
      : {
          ...test,
          tested: {
            kind: 'sameRowInColumn',
            c: testedColumn.c,
          },
        };
}
export function refitTestsToRanges(rule?: Dynamic, table?: Dynamic, edited?: Dynamic, retarget?: Dynamic) {
  let { effect: effect } = rule;
  if (effect.kind !== 'formatWhere') return rule;
  let refitted = effect.allOf.reduce(
    (effect2?: Dynamic, test?: Dynamic, testIndex?: Dynamic) =>
      updateRuleTest(effect2, testIndex, (test2?: Dynamic) => {
        if (test2.tested.kind === 'theCellItself' && retarget !== null) return retarget(test2);
        let condition = conditionForNewColumn(
          test2.condition,
          testedColumnSummary(rule, table, test2),
          testedColumnSummary(edited.rule, edited.table, test2),
        );
        return 'text' in condition && 'text' in test2.condition
          ? {
              ...test2,
              condition: {
                ...condition,
                text: test2.condition.text,
              },
            }
          : {
              ...test2,
              condition: condition,
            };
      }),
    effect,
  );
  return {
    ...rule,
    effect: refitted,
  };
}
export function rangesOfAreas(reads: WorkbookReads, sheetId?: Dynamic, areas?: Dynamic) {
  let [firstRange, ...otherRanges] = areas.flatMap((area?: Dynamic) => {
    let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = area;
    let topLeftCell = reads.cellIdAt(sheetId, topRowIndex, leftColumnIndex);
    let bottomRightCell = reads.cellIdAt(sheetId, topRowIndex + rowCount - 1, leftColumnIndex + columnCount - 1);
    return topLeftCell === null || bottomRightCell === null
      ? []
      : [
          {
            topLeft: {
              r: topLeftCell.rowId,
              c: topLeftCell.columnId,
            },
            bottomRight: {
              r: bottomRightCell.rowId,
              c: bottomRightCell.columnId,
            },
          },
        ];
  });
  let isEveryAreaInRange = otherRanges.length + 1 === areas.length;
  let isOverRangeLimit = areas.length > reads.limitsOfConditionalFormats().mostRangesInAConditionalFormat;
  return firstRange === undefined || !isEveryAreaInRange || isOverRangeLimit ? null : [firstRange, ...otherRanges];
}
export function rangesFromA1Text(reads: WorkbookReads, sheetId?: Dynamic, a1Text?: Dynamic) {
  let sheet = reads.listSheets().find((sheet2?: Dynamic) => sheet2.sheetId === sheetId);
  if (sheet === undefined) return null;
  let areas = a1Text.split(',').flatMap((part?: Dynamic) => parseA1AreasAsSeen(part, sheet) ?? [null]);
  return areas.includes(null)
    ? null
    : rangesOfAreas(
        reads,
        sheetId,
        areas.filter((area?: Dynamic) => area !== null),
      );
}
export function numberReadAs(reads: WorkbookReads, numberFormat?: Dynamic, text?: Dynamic) {
  let [reading] = reads.textsUnderAColumnReading(numberFormat, [text])?.read ?? [];
  return reading?.kind === 'fits' && reading.input.kind === 'number' ? reading.input.value : null;
}
export function numberTypedFor(reads: WorkbookReads, text?: Dynamic, columnKind?: Dynamic) {
  let decimals = {
    decimalSign: reads.decimalSign,
    decimalPlaces: 0,
  };
  let currencySymbol2 = /\p{Sc}/u.exec(text)?.[0];
  if (columnKind === 'percent' || text.includes('%'))
    return numberReadAs(
      reads,
      {
        kind: 'percent',
        ...decimals,
        numberAloneIs: 'percents',
      },
      text,
    );
  return currencySymbol2 === undefined
    ? numberReadAs(
        reads,
        {
          kind: 'number',
          ...decimals,
          groupsThousands: true,
        },
        text,
      )
    : numberReadAs(
        reads,
        {
          kind: 'currency',
          ...decimals,
          symbol: currencySymbol2,
        },
        text,
      );
}
export function wholeNumberIn(text?: Dynamic, least?: Dynamic, most: Dynamic = Number.MAX_SAFE_INTEGER) {
  let number = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
  return number !== null && number >= least && number <= most ? number : null;
}
export function conditionWithTypedField(condition: Dynamic, field: Dynamic, typed: Dynamic, { kind: kind }: Dynamic, reads: WorkbookReads) {
  if (field === 'text')
    return 'text' in condition && typed.trim() !== ''
      ? {
          ...condition,
          text: typed,
        }
      : null;
  if (field === 'count') {
    let number = wholeNumberIn(typed, 1);
    return 'count' in condition && number !== null
      ? {
          ...condition,
          count: Math.min(number, reads.limitsOfConditionalFormats().largestCountInACondition),
        }
      : null;
  }
  if (field !== 'operand' && field !== 'oneEnd' && field !== 'otherEnd') return null;
  let operand = numberConditionOperand(condition, field);
  if (operand?.kind === 'number') {
    let number = numberTypedFor(reads, typed, kind);
    return number === null
      ? null
      : withOperand(condition, field, {
          kind: 'number',
          number: number,
        });
  }
  let days = operand?.kind === 'daysFromToday' ? wholeNumberIn(typed, 1) : null;
  return operand?.kind !== 'daysFromToday' || days === null
    ? null
    : withOperand(condition, field, {
        ...operand,
        days: operand.days < 0 ? -days : days,
      });
}
export function ruleWithTypedField({ rule: rule, table: table, reads: reads, sheetId: sheetId }: Dynamic, field?: Dynamic, typed?: Dynamic) {
  let { effect: effect } = rule;
  if (field === 'cells') {
    let end = rangesFromA1Text(reads, sheetId, typed);
    return end === null
      ? null
      : {
          ...rule,
          ranges: end,
        };
  }
  if (field === 'lowest' || field === 'middle' || field === 'highest') {
    let end = effect.kind === 'colorScale' ? effect[field] : null;
    if (effect.kind !== 'colorScale' || end === null) return null;
    let { anchor: anchor } = end;
    let number = anchor.kind === 'number' ? numberTypedFor(reads, typed, tableColumnSummary(table, firstColumnOfRule(rule)).kind) : null;
    let percentile = anchor.kind === 'percentile' ? wholeNumberIn(typed, 0, 100) : null;
    let newAnchor =
      number !== null
        ? {
            kind: 'number',
            number: number,
          }
        : percentile !== null
          ? {
              kind: 'percentile',
              percentile: percentile,
            }
          : null;
    let scale =
      newAnchor === null
        ? null
        : orderScaleAnchors({
            ...effect,
            [field]: {
              ...end,
              anchor: newAnchor,
            },
          });
    return scale === null
      ? null
      : {
          ...rule,
          effect: scale,
        };
  }
  let [testIndexText = '', testField = ''] = field.split('.');
  let test = effect.kind === 'formatWhere' ? effect.allOf[Number(testIndexText)] : undefined;
  if (effect.kind !== 'formatWhere' || test === undefined) return null;
  let condition = conditionWithTypedField(test.condition, testField, typed, testedColumnSummary(rule, table, test), reads);
  return condition === null
    ? null
    : {
        ...rule,
        effect: updateRuleTest(
          effect,
          Number(testIndexText),
          (test2?: Dynamic) => ({
            ...test2,
            condition: condition,
          }),
        ),
      };
}
export function ruleAfterEditorAction(
  { rule: rule, table: table, reads: reads, sheetId: sheetId }: Dynamic,
  selection?: Dynamic,
  action?: Dynamic,
) {
  let { effect: effect } = rule;
  let ruleWhere =
    effect.kind === 'formatWhere'
      ? {
          ...rule,
          effect: effect,
        }
      : null;
  let withEffect = (effect2?: Dynamic) =>
    effect2 === null
      ? null
      : {
          ...rule,
          effect: effect2,
        };
  let changeTest = (testIndex?: Dynamic, change?: Dynamic) => {
    let test = ruleWhere?.effect.allOf[testIndex];
    if (ruleWhere === null || test === undefined) return null;
    let condition = change(test, testedColumnSummary(rule, table, test));
    return condition === null
      ? null
      : withEffect(
          updateRuleTest(
            ruleWhere.effect,
            testIndex,
            (test2?: Dynamic) => ({
              ...test2,
              condition: condition,
            }),
          ),
        );
  };
  let withFormat = (format?: Dynamic) =>
    ruleWhere === null || !isFormatNonEmpty(format)
      ? null
      : withEffect({
          ...ruleWhere.effect,
          format: format,
        });
  let changeScale = (change?: Dynamic) => (effect.kind === 'colorScale' ? withEffect(orderScaleAnchors(change(effect))) : null);
  switch (action.kind) {
    case 'chooseKindOfEffect':
      return table === null ? null : ruleWithEffectKind(rule, action.effect, table);
    case 'useSelection': {
      let value = rangesOfAreas(reads, sheetId, areasOfAllRanges(selection, reads));
      return value === null
        ? null
        : {
            ...rule,
            ranges: value,
          };
    }
    case 'chooseTested':
      return ruleWhere === null
        ? null
        : withEffect(
            updateRuleTest(ruleWhere.effect, action.test, (test?: Dynamic) => {
              let testWithTested = {
                ...test,
                tested: action.tested,
              };
              let oldColumn = testedColumnSummary(rule, table, test);
              let condition = conditionForNewColumn(test.condition, testedColumnSummary(rule, table, testWithTested), oldColumn);
              let columnIndex = reads.columnIndexOf(sheetId, oldColumn.c) ?? -1;
              return action.tested.kind === 'theCellItself' &&
                areasOfRuleRanges(reads, sheetId, rule.ranges).some(
                  ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) =>
                    isInSpan(columnIndex, leftColumnIndex, columnCount),
                ) &&
                'text' in condition &&
                'text' in test.condition
                ? {
                    ...testWithTested,
                    condition: {
                      ...condition,
                      text: test.condition.text,
                    },
                  }
                : {
                    ...testWithTested,
                    condition: condition,
                  };
            }),
          );
    case 'chooseCondition':
      return changeTest(
        action.test,
        ({ condition: condition }: Dynamic, column?: Dynamic) => conditionWithOperator(action.choice, condition, column),
      );
    case 'chooseOperand':
      return changeTest(action.test, ({ condition: condition }: Dynamic, column?: Dynamic) => {
        let operand = numberConditionOperand(condition, action.slot);
        let newOperand = operand === null || table === null ? null : operandForChoice(action.choice, operand, column, table);
        return newOperand === null ? null : withOperand(condition, action.slot, newOperand);
      });
    case 'chooseOperandColumn':
      return changeTest(
        action.test,
        ({ condition: condition }: Dynamic) =>
          withOperand(condition, action.slot, {
            kind: 'sameRowInColumn',
            c: action.c,
          }),
      );
    case 'chooseDay':
      return changeTest(action.test, ({ condition: condition }: Dynamic) => {
        let dayNumber = dayNumberOf(reads, action.day);
        return dayNumber === null
          ? null
          : withOperand(condition, action.slot, {
              kind: 'number',
              number: dayNumber,
            });
      });
    case 'chooseText':
      return changeTest(
        action.test,
        ({ condition: condition }: Dynamic) =>
          'text' in condition
            ? {
                ...condition,
                text: action.text,
              }
            : null,
      );
    case 'removeTest':
      return ruleWhere === null ? null : withEffect(removeRuleTest(ruleWhere.effect, action.test));
    case 'choosePreset':
      return withFormat(RULE_FORMAT_PRESETS.find(({ key: key }: Dynamic) => key === action.preset)?.format ?? {});
    case 'chooseColor':
      return ruleWhere === null ? null : withFormat(withFormatColor(ruleWhere.effect.format, action.property, action.color));
    case 'toggleStyle':
      return ruleWhere === null ? null : withFormat(toggleFontStyle(ruleWhere.effect.format, action.style));
    case 'chooseAnchor': {
      let { smallest: value, middle: middleValue, largest: largest } = tableColumnSummary(table, firstColumnOfRule(rule));
      let anchorValue =
        (
          {
            lowest: value,
            middle: middleValue,
            highest: largest,
          } as Dynamic
        )[action.stop] ?? 0;
      let withAnchorAt = (value2?: Dynamic) =>
        changeScale((scale?: Dynamic) => withScalePointAnchor(scale, action.stop, action.choice, value2));
      return withAnchorAt(anchorValue) ?? withAnchorAt(action.stop === 'lowest' ? anchorValue - 1 : anchorValue + 1);
    }
    case 'chooseStopDay': {
      let value = dayNumberOf(reads, action.day);
      return value === null ? null : changeScale((scale?: Dynamic) => withScalePointAnchor(scale, action.stop, 'number', value));
    }
    case 'chooseStopColor':
      return changeScale((scale?: Dynamic) => withScalePointColor(scale, action.stop, action.color));
    case 'setMiddleStop':
      return changeScale((scale?: Dynamic) => withScaleMidpoint(scale, action.isOn));
    case 'addTest':
    case 'pointAtSuggestion':
    case 'takeSuggestion':
    case 'showInPane':
    case 'askForMoreSuggestions':
    case 'previewRested':
    case 'typeWords':
    case 'restAfterWords':
    case 'takeReadAtOnce':
    case 'askAgent':
    case 'keepOffer':
    case 'editOffer':
    case 'discardOffer':
    case 'stepBack':
    case 'startRule':
    case 'editRule':
    case 'removeRule':
    case 'useSelectionFor':
    case 'moveRule':
    case 'leaveEditor':
    case 'type':
    case 'enterTyped':
    case 'dropTyped':
      return null;
  }
}
export function actInRuleEditor(state: PageState, reads: WorkbookReads, pane?: Dynamic, editor?: Dynamic, action?: Dynamic) {
  let { sheetId: sheetId } = pane;
  let { conditionalFormatId: conditionalFormatId, table: table, typed: typed, testBeingAdded: testBeingAdded } = editor;
  let savedRule = conditionalFormatRuleById(reads, sheetId, conditionalFormatId);
  let currentRule = savedRule === null ? null : ruleWithTestBeingAdded(savedRule, testBeingAdded);
  let withEditor = (editor2?: Dynamic, paneChanges: Dynamic = {}) =>
    withNoEffects(
      withConditionalFormatsPane(state, {
        ...pane,
        ...paneChanges,
        editor: editor2,
      }),
    );
  if (action.kind === 'leaveEditor' || currentRule === null)
    return withEditor(null, {
      offer: null,
    });
  if (action.kind === 'removeRule') {
    let state2 = {
      kind: 'removeConditionalFormat',
      sheetId: sheetId,
      conditionalFormatId: conditionalFormatId,
    };
    return {
      ...withEditor({
        ...editor,
        typed: null,
      }),
      effects: [
        queueRuleEditEffect(state2, {
          what: 'ruleRemoved',
          isSaved: false,
        }),
      ],
    };
  }
  if (action.kind === 'askAgent') return askAgentForRulesFromWords(state, reads, action.words, false);
  if (action.kind === 'discardOffer')
    return withEditor(editor, {
      offer: null,
    });
  let refusalsNotOf = (field?: Dynamic) => (editor.refused ?? []).filter((refusal?: Dynamic) => refusal.field !== field);
  if (action.kind === 'dropTyped')
    return withEditor({
      ...editor,
      typed: null,
      refused: refusalsNotOf(action.field),
    });
  let refitToRanges = (rule?: Dynamic, oldRule?: Dynamic) => {
    if (isSameRulesJson(rule.ranges, oldRule.ranges)) return rule;
    let oldTable = oldRule === currentRule ? table : tableOfRuleRange(reads, sheetId, oldRule);
    let retargetFrom = {
      rule: oldRule,
      table: oldTable,
    };
    let retarget = testRetargeterForRanges(reads, sheetId, rule, retargetFrom);
    let { effect: effect2 } = rule;
    let tableOfRule =
      retarget === null ||
      (effect2.kind === 'formatWhere' && effect2.allOf.some(({ tested: tested }: Dynamic) => tested.kind !== 'theCellItself'))
        ? tableOfRuleRange(reads, sheetId, rule)
        : null;
    return refitTestsToRanges(rule, tableOfRule, retargetFrom, retarget);
  };
  if (action.kind === 'type') {
    let value = typed?.field === action.field ? typed.ruleWithBox : null;
    let state2 = {
      rule: value ?? currentRule,
      table: table,
      reads: reads,
      sheetId: sheetId,
    };
    let value2 = action.field.endsWith('.text')
      ? Array.from<Dynamic>(action.text.replace(controlCharacterPattern, ''))
          .slice(0, reads.limitsOfConditionalFormats().longestTextOfAConditionInCharacters)
          .join('')
      : action.text;
    let typedRule = ruleWithTypedField(state2, action.field, value2);
    return withEditor({
      ...editor,
      refused: refusalsNotOf(action.field),
      typed: {
        field: action.field,
        text: value2,
        rule: typedRule === null ? null : refitToRanges(typedRule, state2.rule),
        ruleWithBox: value,
      },
    });
  }
  let chosenTest: Dynamic = null;
  let saveRule = (rule?: Dynamic, paneChanges: Dynamic = {}, notice: Dynamic = null) => {
    let done =
      rule === null || notice === null
        ? undefined
        : notice === 'scaleColorsNothing'
          ? {
              what: notice,
            }
          : {
              what: notice,
              column: columnLabelOf(reads, sheetId, tableColumnSummary(table, firstColumnOfRule(rule))),
            };
    let change = rule === null ? null : conditionalFormatChangeEffect(sheetId, conditionalFormatId, currentRule, rule, done);
    let keepsPicked =
      (rule === null || isSameRulesJson(rule.ranges, currentRule.ranges)) &&
      (editor.cellsPickedByPage !== 'movedToNumbers' || rule?.effect.kind !== 'formatWhere');
    return {
      ...withEditor(
        {
          ...editor,
          typed: null,
          ...(action.kind === 'removeTest' && {
            refused: (editor.refused ?? []).filter(({ field: field }: Dynamic) => !/^\d/.test(field)),
          }),
          testBeingAdded: chosenTest ?? (change === null ? testBeingAdded : null),
          cellsPickedByPage: keepsPicked ? editor.cellsPickedByPage : notice === 'movedToNumbers' ? notice : null,
        },
        paneChanges,
      ),
      effects: change === null ? [] : [change],
    };
  };
  if (action.kind === 'enterTyped' && typed !== null && typed.rule === null && typed.text.trim() !== '') {
    let { field: value, text: value2 } = typed;
    let items = [
      ...refusalsNotOf(value),
      {
        field: value,
        text: value2,
        over: currentRule,
      },
    ];
    return withEditor({
      ...editor,
      typed: null,
      refused: items,
    });
  }
  if (action.kind === 'enterTyped') return saveRule(typed?.rule ?? null);
  if (action.kind === 'keepOffer')
    return saveRule(pane.offer?.[0] ?? null, {
      offer: null,
    });
  let ruleShown = typed?.rule ?? typed?.ruleWithBox ?? currentRule;
  let ruleWhere =
    ruleShown.effect.kind === 'formatWhere'
      ? {
          ...ruleShown,
          effect: ruleShown.effect,
        }
      : null;
  if (action.kind === 'addTest') {
    let { mostTestsInAConditionalFormat: value } = reads.limitsOfConditionalFormats();
    return ruleWhere === null || table === null || testBeingAdded !== null || ruleWhere.effect.allOf.length >= value
      ? withNoEffects(state)
      : withEditor({
          ...editor,
          testBeingAdded: {
            tested: testOfUnusedColumn(ruleWhere, table),
            condition: null,
          },
        });
  }
  if ('test' in action && action.test === NEW_TEST_INDEX) {
    if (ruleWhere === null || testBeingAdded?.condition !== null) return withNoEffects(state);
    if (action.kind === 'chooseTested')
      return withEditor({
        ...editor,
        testBeingAdded: {
          ...testBeingAdded,
          tested: action.tested,
        },
      });
    if (action.kind === 'removeTest')
      return withEditor({
        ...editor,
        testBeingAdded: null,
      });
    if (action.kind !== 'chooseCondition') return withNoEffects(state);
    let state2 = {
      tested: testBeingAdded.tested,
      condition: {
        kind: 'isNotBlank',
      },
    };
    chosenTest = {
      ...state2,
      condition: conditionWithOperator(action.choice, state2.condition, testedColumnSummary(ruleShown, table, state2)),
    };
  }
  let editedRule =
    chosenTest !== null && ruleWhere !== null
      ? {
          ...ruleShown,
          effect: withAddedTest(ruleWhere.effect, chosenTest),
        }
      : ruleAfterEditorAction(
          {
            rule: ruleShown,
            table: table,
            reads: reads,
            sheetId: sheetId,
          },
          state,
          action,
        );
  if (editedRule === null) return withNoEffects(state);
  let refittedRule = refitToRanges(editedRule, ruleShown);
  let { effect: effect } = refittedRule;
  let emptyTextTestIndex =
    effect.kind === 'formatWhere' ? effect.allOf.findIndex(({ condition: condition }: Dynamic) => hasEmptyTextOperand(condition)) : -1;
  if (emptyTextTestIndex !== -1)
    return withEditor({
      ...editor,
      testBeingAdded: null,
      typed: {
        field: `${emptyTextTestIndex}.text`,
        text: '',
        rule: null,
        ruleWithBox: refittedRule,
      },
    });
  if (action.kind !== 'chooseKindOfEffect' || action.effect !== 'colorScale') return saveRule(refittedRule);
  let testedColumn = testedColumnOfRule(refittedRule);
  let colorsNothing = table !== null && findColumnStats(table, testedColumn)?.numbers === 0;
  return saveRule(
    refittedRule,
    {},
    testedColumn !== testedColumnOfRule(ruleShown) && !isSameRulesJson(refittedRule.ranges, ruleShown.ranges)
      ? 'movedToNumbers'
      : colorsNothing
        ? 'scaleColorsNothing'
        : null,
  );
}
export const dayNumberOf = (reads: WorkbookReads, text?: Dynamic) =>
  numberReadAs(
    reads,
    {
      kind: 'date',
      order: 'yearMonthDay',
      shownAs: 'yearMonthDay',
    },
    text,
  );
export const withOperand = (condition?: Dynamic, slot?: Dynamic, operand?: Dynamic) =>
  numberConditionOperand(condition, slot) === null
    ? condition
    : {
        ...condition,
        [slot]: operand,
      };
export const controlCharacterPattern = /\p{Cc}/gu;
