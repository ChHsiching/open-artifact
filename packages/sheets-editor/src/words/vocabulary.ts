import type { Dynamic } from '../dynamic.ts';
import { NUMBER_COMPARISON_PHRASES, NUMBER_TRAILING_COMPARISON_PHRASES, LARGEST_SMALLEST_PHRASES } from './numbers-values.ts';
import { TEXT_TEST_PHRASES, CELL_TEST_PHRASES } from './conditions-values.ts';
import {
  PAST_PHRASES,
  DATE_COMPARISON_PHRASES,
  DATE_TRAILING_COMPARISON_PHRASES,
  AGE_COMPARISON_PHRASES,
  RELATIVE_PERIOD_WORDS,
  DAYS_IN_UNIT,
  RELATIVE_DAY_WORDS,
  MONTH_NAMES,
  MONTHS_IN_PERIOD,
} from './dates-values.ts';
export const wordsOfPhrases = (...phraseLists: Dynamic[]) =>
  phraseLists.flatMap((phrases?: Dynamic) => phrases.flatMap(([words]: Dynamic) => words));
export const NUMBER_CONDITION_WORDS = new (Set as Dynamic)([
  ...wordsOfPhrases(NUMBER_COMPARISON_PHRASES, NUMBER_TRAILING_COMPARISON_PHRASES, LARGEST_SMALLEST_PHRASES),
  ...'between from to'.split(' '),
]);
export const LARGEST_SMALLEST_WORDS = new (Set as Dynamic)(wordsOfPhrases(LARGEST_SMALLEST_PHRASES));
export const TEXT_TEST_WORDS = new (Set as Dynamic)(wordsOfPhrases(TEXT_TEST_PHRASES, CELL_TEST_PHRASES));
export const DATE_CONDITION_WORDS = new (Set as Dynamic)([
  ...wordsOfPhrases(PAST_PHRASES, DATE_COMPARISON_PHRASES, DATE_TRAILING_COMPARISON_PHRASES, AGE_COMPARISON_PHRASES),
  ...'older ago'.split(' '),
  ...RELATIVE_PERIOD_WORDS.keys(),
  ...DAYS_IN_UNIT.keys(),
  ...RELATIVE_DAY_WORDS.keys(),
  ...MONTH_NAMES.flatMap((month?: Dynamic) => [month, month.slice(0, 3)]),
  ...MONTHS_IN_PERIOD.keys(),
  ...'sept between from to in within the on'.split(' '),
]);
export const MOST_CHARACTERS_OF_WORDS = 200;
export const SORT_BY_PHRASES = [['ordered', 'by'], ['sorted', 'by'], ['order', 'by'], ['sort', 'by'], ['by']];
export const SORT_VERBS = new (Set as Dynamic)(['sort', 'sorted', 'order', 'ordered']);
export const NO_WITHOUT_WORDS = new (Set as Dynamic)(['no', 'without']);
export const NEGATING_WORDS = new (Set as Dynamic)([...NO_WITHOUT_WORDS, 'not', 'hide', 'except', 'excluding', 'isnt', 'arent']);
export const EXCLUDE_VERBS = new (Set as Dynamic)(['exclude', 'skip', 'ignore', 'omit']);
export const HIDING_WORDS = new (Set as Dynamic)(['hide', 'except', 'excluding', 'leave', ...EXCLUDE_VERBS]);
export const WORDS_NOT_TAKEN_AS_VALUES = new (Set as Dynamic)([...EXCLUDE_VERBS, 'but', 'assigned', 'set']);
export const HAVING_WORDS = new (Set as Dynamic)(['with', 'has', 'have', 'having']);
export const CHECKED_RULE_WORDS = new (Set as Dynamic)(['yes', 'true', 'checked', 'ticked']);
export const UNCHECKED_WORDS = new (Set as Dynamic)(['no', 'false', 'unchecked', 'unticked', 'empty', 'blank']);
export const NOT_VERBS = new (Set as Dynamic)(['not', 'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent']);
export const LINKING_VERBS = new (Set as Dynamic)(['is', 'are', 'was', 'were', 'has', 'have', 'been', 'still', 'already']);
export const FIRST_PERSON_WORDS = new (Set as Dynamic)(['my', 'mine', 'me']);
export const UNASSIGNED_PHRASES = [['no', 'one'], ['noone'], ['nobody'], ['unassigned'], ['not', 'assigned'], ['no', 'ones'], ['nobodys']];
export const IS_HAS_WORDS = new (Set as Dynamic)(['is', 'are', 'has', 'have', 'having']);
export const POSSESSIVE_ONES_WORDS = new (Set as Dynamic)(['ones', 'nobodys']);
export const SHOW_VERBS = new (Set as Dynamic)(['show', 'give', 'tell']);
export const LIST_JOINERS = new (Set as Dynamic)(['and', 'or', 'plus', ',']);
export const SORT_KEY_JOINERS = new (Set as Dynamic)(['and', 'then', ',']);
export const EQUALS_WORDS = new (Set as Dynamic)(['is', 'are', 'say', 'says', 'equals']);
export const ALL_WORDS = new (Set as Dynamic)(['all', 'every', 'everything']);
export const ANYONE_WORDS = new (Set as Dynamic)(['anything', 'anyone', 'everyone']);
export const BLANK_WORDS = new (Set as Dynamic)(['blank', 'blanks', 'empty', 'none', 'nothing', 'missing', 'unset']);
export const FILLED_WORDS = new (Set as Dynamic)(['filled', 'set', 'any', 'anything']);
export const SET_STATE_WORDS = new (Set as Dynamic)(['missing', 'unset', 'set']);
export const EMPTY_WORDS = new (Set as Dynamic)(['blank', 'empty', 'missing']);
export const WORDS_AFTER_COLUMN_NAME = new (Set as Dynamic)([
  ...EQUALS_WORDS,
  ...NEGATING_WORDS,
  ...BLANK_WORDS,
  ...FILLED_WORDS,
  ...FIRST_PERSON_WORDS,
]);
export const ROW_NOUNS = new (Set as Dynamic)('rows row items item records record entries entry'.split(' '));
export const VAGUE_NOUNS = new (Set as Dynamic)(['things', 'thing', 'stuff', 'ones']);
export const RECORD_NOUNS = new (Set as Dynamic)([...ROW_NOUNS, ...VAGUE_NOUNS]);
export const FILTER_FILLER_WORDS = new (Set as Dynamic)(
  [...SHOW_VERBS, ...EQUALS_WORDS, ...RECORD_NOUNS].concat('only just the a an that which in of for to please column'.split(' ')),
);
export const TABLE_SUBJECT_NOUNS = new (Set as Dynamic)(
  'deal deals candidate candidates applicant applicants application applications people person'
    .split(' ')
    .concat('cost costs expense expenses orders customer customers project projects bug bugs'.split(' ')),
);
export const YET_WORD = 'yet';
export const QUESTION_FILLER_WORDS = new (Set as Dynamic)([
  ...'where whose who what filter filtered find list display see those'.split(' '),
  ...'still currently thats whats um uh oh ok okay'.split(' '),
  YET_WORD,
  ...TABLE_SUBJECT_NOUNS,
]);
export const TASK_NOUNS = new (Set as Dynamic)(['task', 'tasks', 'issue', 'issues', 'ticket', 'tickets']);
export const SORT_DIRECTION_PHRASES = [
  [['ascending'], 'ascending'],
  [['asc'], 'ascending'],
  [['a', 'to', 'z'], 'ascending'],
  [['descending'], 'descending'],
  [['desc'], 'descending'],
  [['reversed'], 'descending'],
  [['z', 'to', 'a'], 'descending'],
];
export const SUPERLATIVE_DIRECTIONS = new (Map as Dynamic)([
  ...['smallest', 'lowest', 'least', 'fewest', 'cheapest', 'shortest', 'earliest', 'oldest', 'soonest'].map(
    (word?: Dynamic) => [word, 'ascending'],
  ),
  ...['largest', 'biggest', 'highest', 'most', 'longest', 'latest', 'newest'].map((word?: Dynamic) => [word, 'descending']),
]);
export const DATE_SUPERLATIVES = new (Set as Dynamic)(['earliest', 'soonest', 'latest', 'newest', 'oldest']);
export const AGE_SUPERLATIVES = new (Set as Dynamic)(['newest', 'oldest']);
export const NON_COLUMN_SUPERLATIVES = new (Set as Dynamic)(['cheapest', 'longest', 'shortest']);
export const ON_TOP_PHRASES = [['first'], ['on', 'top'], ['on', 'the', 'top'], ['at', 'the', 'top']];
export const RANGE_DIRECTION_PHRASES = [
  ...['high to low', 'highest to lowest', 'largest to smallest', 'biggest to smallest', 'newest to oldest', 'latest to earliest'].map(
    (phrase?: Dynamic) => [phrase.split(' '), 'descending'],
  ),
  ...['low to high', 'lowest to highest', 'smallest to largest', 'smallest to biggest', 'oldest to newest', 'earliest to latest'].map(
    (phrase?: Dynamic) => [phrase.split(' '), 'ascending'],
  ),
];
export const MOST_DAYS_FROM_TODAY_FOR_DATES = 92;
export const DUE_WORDS = new (Set as Dynamic)(['due', 'deadline']);
export const RANK_WORDS = new (Set as Dynamic)('priority prio sev severity rank ranking place position tier'.split(' '));
export const COMMAND_WORDS = new (Set as Dynamic)(
  SORT_BY_PHRASES.flat().concat(
    [...SUPERLATIVE_DIRECTIONS.keys()],
    'first',
    SORT_DIRECTION_PHRASES.flatMap(([words]: Dynamic) => words),
  ),
);
for (let value of [NEGATING_WORDS, HAVING_WORDS, FIRST_PERSON_WORDS, LIST_JOINERS, SORT_KEY_JOINERS, ALL_WORDS, FILTER_FILLER_WORDS] as Dynamic)
  for (let value2 of value as Dynamic) COMMAND_WORDS.add(value2);
