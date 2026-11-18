import type { Dynamic } from '../dynamic.ts';
import { dateToSerial, END_OF_DAY_FRACTION, serialToIsoDate } from '../model/date-serials.ts';
import { operatorOfCondition } from '../format/conditional/conditions.ts';
import { isSameJsonValue } from '../model/same-json.ts';
export function inputsOfFilterChoice(choice?: Dynamic, isDate?: Dynamic) {
  let numberInput = isDate ? 'day' : 'number';
  switch (choice) {
    case 'isBlank':
    case 'isNotBlank':
    case 'appearsMoreThanOnce':
    case 'isAnError':
    case 'isChecked':
    case 'isNotChecked':
      return [];
    case 'textIs':
    case 'textIsNot':
    case 'textContains':
    case 'textDoesNotContain':
    case 'textStartsWith':
    case 'textEndsWith':
      return ['text'];
    case 'isAmongTheLargest':
    case 'isAmongTheSmallest':
      return ['count'];
    case 'lessThan':
    case 'lessThanOrEqualTo':
    case 'equalTo':
    case 'notEqualTo':
    case 'greaterThanOrEqualTo':
    case 'greaterThan':
      return [numberInput];
    case 'numberIsBetween':
    case 'numberIsNotBetween':
      return [numberInput, numberInput];
  }
}
export function conditionFromFilterChoice(
  { choice: choice, first: first, second: second }: Dynamic,
  isDate: Dynamic,
  { numberTyped: numberTyped, mostCounted: mostCounted, longestText: longestText }: Dynamic,
) {
  let numberOfInput = (input?: Dynamic) => (!isDate ? numberTyped(input) : isIsoDateText(input) ? dateToSerial(input) : null);
  let endOfDay = isDate ? END_OF_DAY_FRACTION : 0;
  switch (choice) {
    case 'isBlank':
    case 'isNotBlank':
    case 'appearsMoreThanOnce':
    case 'isAnError':
      return {
        kind: choice,
      };
    case 'isChecked':
    case 'isNotChecked':
      return {
        kind: 'booleanIs',
        value: choice === 'isChecked',
      };
    case 'textIs':
    case 'textIsNot':
    case 'textContains':
    case 'textDoesNotContain':
    case 'textStartsWith':
    case 'textEndsWith': {
      let typed = Array.from<Dynamic>(first.replace(CONTROL_CHARACTERS_PATTERN, '').trim()).slice(0, longestText).join('');
      return typed === ''
        ? null
        : {
            kind: choice,
            text: typed,
          };
    }
    case 'isAmongTheLargest':
    case 'isAmongTheSmallest': {
      let typed = parseCountTyped(first, mostCounted);
      return typed === null
        ? null
        : {
            kind: choice,
            count: typed,
          };
    }
    case 'numberIsBetween':
    case 'numberIsNotBetween': {
      let [typed, otherTyped] = [numberOfInput(first), numberOfInput(second)];
      if (typed === null || otherTyped === null) return null;
      return {
        kind: choice,
        oneEnd: numberOperandOfInput(Math.min(typed, otherTyped)),
        otherEnd: numberOperandOfInput(Math.max(typed, otherTyped) + endOfDay),
      };
    }
    case 'equalTo':
    case 'notEqualTo': {
      let typed = numberOfInput(first);
      if (typed === null) return null;
      if (!isDate)
        return {
          kind: 'numberIs',
          comparison: choice,
          operand: numberOperandOfInput(typed),
        };
      return {
        kind: choice === 'equalTo' ? 'numberIsBetween' : 'numberIsNotBetween',
        oneEnd: numberOperandOfInput(typed),
        otherEnd: numberOperandOfInput(typed + endOfDay),
      };
    }
    case 'lessThan':
    case 'greaterThanOrEqualTo': {
      let typed = numberOfInput(first);
      return typed === null
        ? null
        : {
            kind: 'numberIs',
            comparison: choice,
            operand: numberOperandOfInput(typed),
          };
    }
    case 'lessThanOrEqualTo':
    case 'greaterThan': {
      let typed = numberOfInput(first);
      return typed === null
        ? null
        : {
            kind: 'numberIs',
            comparison: choice,
            operand: numberOperandOfInput(typed + endOfDay),
          };
    }
  }
}
export function isWholeDayRange(condition?: Dynamic) {
  if (condition.kind !== 'numberIsBetween' && condition.kind !== 'numberIsNotBetween') return false;
  let { oneEnd: oneEnd, otherEnd: otherEnd } = condition;
  return (
    oneEnd.kind === 'number' &&
    otherEnd.kind === 'number' &&
    Number.isInteger(oneEnd.number) &&
    otherEnd.number === oneEnd.number + END_OF_DAY_FRACTION
  );
}
export function filterChoiceFromCondition(condition?: Dynamic, isDate?: Dynamic, formatNumber?: Dynamic) {
  let inputOfOperand = (operand?: Dynamic) => {
    if (operand.kind !== 'number') return '';
    return isDate ? (serialToIsoDate(operand.number) ?? '') : formatNumber(operand.number);
  };
  let choice = operatorOfCondition(condition);
  switch (condition.kind) {
    case 'numberIs':
      return {
        choice: choice,
        first: inputOfOperand(condition.operand),
        second: '',
      };
    case 'numberIsBetween':
    case 'numberIsNotBetween': {
      let [first, second] = [inputOfOperand(condition.oneEnd), inputOfOperand(condition.otherEnd)];
      if (!isDate || !isWholeDayRange(condition))
        return {
          choice: choice,
          first: first,
          second: second,
        };
      return {
        choice: condition.kind === 'numberIsBetween' ? 'equalTo' : 'notEqualTo',
        first: first,
        second: '',
      };
    }
    case 'textIs':
    case 'textIsNot':
    case 'textContains':
    case 'textDoesNotContain':
    case 'textStartsWith':
    case 'textEndsWith':
      return {
        choice: choice,
        first: condition.text,
        second: '',
      };
    case 'isAmongTheLargest':
    case 'isAmongTheSmallest':
      return {
        choice: choice,
        first: String(condition.count),
        second: '',
      };
    case 'isBlank':
    case 'isNotBlank':
    case 'appearsMoreThanOnce':
    case 'isAnError':
    case 'booleanIs':
      return {
        choice: choice,
        first: '',
        second: '',
      };
  }
}
export function isConditionEditableAsChoice(condition?: Dynamic, isDate?: Dynamic) {
  let operands = operandsOfFilterCondition(condition);
  if (operands.some(({ kind: kind }: Dynamic) => kind !== 'number')) return false;
  if (!isDate || operands.length === 0) return true;
  let roundTripped = conditionFromFilterChoice(filterChoiceFromCondition(condition, true, String), true, LENIENT_FILTER_INPUT_LIMITS);
  return isSameJsonValue(roundTripped, condition);
}
export const CONTROL_CHARACTERS_PATTERN = /\p{Cc}/gu;
export const parseCountTyped = (typed?: Dynamic, mostCounted?: Dynamic) => {
  let count = /^\d+$/.test(typed.trim()) ? Number(typed) : 0;
  return count >= 1 && count <= mostCounted ? count : null;
};
export const isIsoDateText = (text?: Dynamic) => /^\d{4}-\d{2}-\d{2}$/.test(text);
export const numberOperandOfInput = (number?: Dynamic) => ({
  kind: 'number',
  number: number,
});
export const isFilterInputInvalid = (
  inputKind: Dynamic,
  typed: Dynamic,
  { numberTyped: numberTyped, mostCounted: mostCounted }: Dynamic,
) =>
  typed.trim() !== '' &&
  ((inputKind === 'number' && numberTyped(typed) === null) || (inputKind === 'count' && parseCountTyped(typed, mostCounted) === null));
export const operandsOfFilterCondition = (condition?: Dynamic) =>
  condition.kind === 'numberIs'
    ? [condition.operand]
    : condition.kind === 'numberIsBetween' || condition.kind === 'numberIsNotBetween'
      ? [condition.oneEnd, condition.otherEnd]
      : [];
export const LENIENT_FILTER_INPUT_LIMITS = {
  numberTyped: () => null,
  mostCounted: 1 / 0,
  longestText: 1 / 0,
};
