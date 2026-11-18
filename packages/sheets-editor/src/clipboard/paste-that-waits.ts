import type { Dynamic } from '../dynamic.ts';
import { withNoEffects } from '../state/transitions.ts';
import { pasteIntoSelection } from '../state/copy-paste.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { areaOfPosition, isSameSelection } from '../selection/model.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { withCalendarShut } from '../chips/calendar.ts';
import { closeDropdownList } from '../chips/dropdowns.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
export function settlePasteThatWaits(state: PageState, reads: WorkbookReads, { nth: nth, isToBePasted: isToBePasted }: Dynamic) {
  let pasteThatWaits = state.pasteThatWaits;
  if (pasteThatWaits?.nth !== nth) return withNoEffects(state);
  let stateFreed = {
    ...state,
    pasteThatWaits: null,
  };
  return isToBePasted ? pasteIntoSelection(stateFreed, reads, pasteThatWaits.chosen, pasteThatWaits.toBeShown) : withNoEffects(stateFreed);
}
export function unseenPiecesMatching(runs?: Dynamic, pattern?: Dynamic, spelled?: Dynamic) {
  let matches = runs.flatMap(
    ({ index: index, run: run }: Dynamic) =>
      Array.from<Dynamic, Dynamic>(
        run.matchAll(pattern),
        (match?: Dynamic) => ({
          from: index + match.index,
          characters: match[0],
        }),
      ),
  );
  return matches[0] === undefined
    ? []
    : [unseenPiece(matches[0].from, matches.map(({ characters: characters }: Dynamic) => characters).join(''), spelled)];
}
export function sortPiecesByFrom(pieces?: Dynamic) {
  pieces.sort((pieceA?: Dynamic, pieceB?: Dynamic) => pieceA.from - pieceB.from);
  return pieces;
}
export function piecesOfUnseenRun({ index: index, run: run }: Dynamic) {
  let sameCharacterRuns = [...run.matchAll(SAME_CHARACTER_RUN_PATTERN)];
  if (sameCharacterRuns.length <= MAX_UNSEEN_PIECES_IN_RUN && run.search(TAG_CHARACTERS_PATTERN) === -1)
    return sameCharacterRuns.map((sameRun?: Dynamic) => unseenPiece(index + sameRun.index, sameRun[0]));
  let spelled = spellTagCharacters(run).replaceAll(/^¦|¦$/g, '');
  return piecesOfTagRuns(
    [
      {
        index: index,
        run: run,
      },
    ],
    /[^“”¦ ]/.test(spelled) ? spelled : null,
  );
}
export function splitSeenAndUnseen(text?: Dynamic) {
  let unseenRuns = unseenRunsIn(text, UNSEEN_RUN_PATTERN);
  let unseenPieces = unseenRuns.flatMap(piecesOfUnseenRun);
  if (unseenPieces.length > MAX_UNSEEN_PIECES) {
    let shownText = text.replaceAll(
      UNSEEN_OR_MARK_RUN_PATTERN,
      (run?: Dynamic, index?: Dynamic) =>
        isPlainSpacingRun(
          {
            index: index,
            run: run,
          },
          text,
        )
          ? run
          : spellTagCharacters(run),
    );
    return [
      ...piecesOfTagRuns(unseenRunsIn(text, UNSEEN_OR_MARK_RUN_PATTERN), null),
      {
        from: 0,
        seen: shownText,
      },
    ];
  }
  let seenPieces = [0, ...unseenRuns.map(({ index: index, run: run }: Dynamic) => index + run.length)].map(
    (from?: Dynamic, nth?: Dynamic) => ({
      from: from,
      seen: text.slice(from, unseenRuns[nth]?.index),
    }),
  );
  return sortPiecesByFrom([...seenPieces.filter((piece?: Dynamic) => piece.seen !== ''), ...unseenPieces]);
}
export function shownPasteThatWaits({ pasteThatWaits: pasteThatWaits }: Dynamic, reads: WorkbookReads) {
  if (pasteThatWaits === null) return null;
  let cached = shownPasteThatWaitsCache.get(pasteThatWaits);
  if (cached?.reads === reads) return cached.shown;
  let { sheetId: sheetId, toBeShown: toBeShown, nth: nth } = pasteThatWaits;
  let rows = toBeShown.map(({ r: rowId, c: columnId, written: written }: Dynamic, index?: Dynamic) => {
    let position = reads.positionOfCell({
      sheetId: sheetId,
      rowId: rowId,
      columnId: columnId,
    });
    return {
      key: `${index} ${rowId} ${columnId}`,
      address: position === null ? null : areaToA1AsStored(areaOfPosition(position), ownRowOrderOfSheet(reads, sheetId)),
      written: cached?.shown.rows[index]?.written ?? splitSeenAndUnseen(written),
    };
  });
  let shown = {
    nth: nth,
    rows: rows,
  };
  shownPasteThatWaitsCache.set(pasteThatWaits, {
    reads: reads,
    shown: shown,
  });
  return shown;
}
export const holdPasteThatWaits = (state: PageState, paste?: Dynamic) => ({
  ...withCalendarShut(closeDropdownList(state)),
  peopleList: null,
  lastDone: null,
  notice: null,
  pasteThatWaits: {
    ...paste,
    nth: state.changesAskedFor,
  },
});
export const dropStalePasteThatWaits = (before: Dynamic, state: PageState) =>
  state.pasteThatWaits !== null &&
  state.pasteThatWaits === before.pasteThatWaits &&
  (state.sheetId !== before.sheetId || !isSameSelection(before, state))
    ? {
        ...state,
        pasteThatWaits: null,
      }
    : state;
export const UNSEEN_RUN_PATTERN = /(?:[ \t\n\p{Zs}\p{C}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800]|\p{M}{5,})+/gu;
export const UNSEEN_OR_MARK_RUN_PATTERN = /(?:[ \t\n\p{Zs}\p{C}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800“”¦]|\p{M}{5,})+/gu;
export const PLAIN_SPACING_PATTERN = /^(?: |\n{1,2} {0,16})$/;
export const NOT_SPACE_OR_LINE_PATTERN = /[^ \n]/u;
export const SAME_CHARACTER_RUN_PATTERN = /(.)\1*/gsu;
export const MAX_UNSEEN_PIECES_IN_RUN = 4;
export const MAX_UNSEEN_PIECES = 20;
export const TAG_CHARACTERS_PATTERN = /[\u{E0020}-\u{E007E}]+/gu;
export const NOT_TAG_CHARACTERS_PATTERN = /[^\u{E0020}-\u{E007E}]+/gu;
export const TAG_CHARACTER_OFFSET = 917504;
export const isPlainSpacingRun = ({ index: index, run: run }: Dynamic, text?: Dynamic) =>
  PLAIN_SPACING_PATTERN.test(run) && index > 0 && index + run.length < text.length;
export const unseenPiece = (from?: Dynamic, characters?: Dynamic, spelled: Dynamic = null) => ({
  from: from,
  unseen: {
    codePoint: (NOT_SPACE_OR_LINE_PATTERN.exec(characters)?.[0] ?? characters).codePointAt(0) ?? 0,
    count: characters.match(/./gsu)?.length ?? 0,
    spelled: spelled,
  },
});
export const spellTagCharacters = (text?: Dynamic) =>
  text
    .replaceAll(NOT_TAG_CHARACTERS_PATTERN, '¦')
    .replaceAll(
      TAG_CHARACTERS_PATTERN,
      (tagRun?: Dynamic) =>
        `“${tagRun.replaceAll(/./gsu, (character?: Dynamic) => String.fromCodePoint((character.codePointAt(0) ?? 0) - TAG_CHARACTER_OFFSET))}”`,
    )
    .replaceAll('”¦“', '¦')
    .replaceAll(/[¦ ]{2,}/g, ' ');
export const piecesOfTagRuns = (runs?: Dynamic, spelled?: Dynamic) =>
  sortPiecesByFrom([...unseenPiecesMatching(runs, TAG_CHARACTERS_PATTERN, spelled), ...unseenPiecesMatching(runs, NOT_TAG_CHARACTERS_PATTERN, null)]);
export const unseenRunsIn = (text?: Dynamic, pattern?: Dynamic) =>
  Array.from<Dynamic, Dynamic>(
    text.matchAll(pattern),
    ({ 0: run, index: index }: Dynamic) => ({
      index: index,
      run: run,
    }),
  ).filter((run?: Dynamic) => !isPlainSpacingRun(run, text));
export const shownPasteThatWaitsCache = new (WeakMap as Dynamic)();
