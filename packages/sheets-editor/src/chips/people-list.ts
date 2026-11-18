import { AGENT_NAME } from '../agent/agent-name.ts';
import type { Dynamic } from '../dynamic.ts';
import { withoutOtherRanges } from '../selection/several-ranges.ts';
import { clearPassingNotice, NAVIGATING_MODE, withNoEffects } from '../state/transitions.ts';
import {
  selectedArea,
  selectionAtCell,
  activeAnchorCell,
  isSameCell,
  areaOfPosition,
  moveActiveCellTo,
  isSameSelection,
} from '../selection/model.ts';
import { hasFilteredRowsIn } from '../tables/filtered-rows.ts';
import { settleSelectionSeen } from '../state/selection-seen.ts';
import { applyFormatCommand } from '../format/format-commands.ts';
import { withIfQueued, queueEdit, enterEntryEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { hasEntryLists } from '../editor/entry-looks.ts';
import { cleanEnteredCellText, normalizeLineBreaks } from '../format/shown-text.ts';
import { isMentionText, mentionQueryOf } from './people-typing.ts';
import { isFormulaText } from './dropdown-pane-edits.ts';
import { usersOfCell } from '../model/cell-values.ts';
import { closeDropdownList } from './dropdowns.ts';
import { leaveEntryEditing, commitEntry } from '../editor/commit-entry.ts';
import { startEntryEditing } from '../editor/start-entry.ts';
import { isPlainCellClick, isDropdownListOutOfPlace } from './dropdown-sync.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { openCardAtRow, dropUndrawableCard, listCardOfRow } from '../ui/list-cards.ts';
import { cellRefOf } from '../model/workbook.ts';
import { parseTsvCells } from '../clipboard/formats.ts';
import { dropdownAtCell } from './dropdown-options.ts';
import { doesCellTakeCalendar } from './calendar.ts';
import { isTimeCell } from '../editor/time-list.ts';
import { canTellAgentSelection } from '../agent/view-context.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function groupOfInsertOffer({ kind: kind }: Dynamic) {
  if (kind === 'askAgent') return 'agent';
  if (kind === 'calendar' || kind === 'day') return 'dates';
  return kind === 'checkbox' ? 'controls' : 'dropdowns';
}
export function isFoundByPeopleSearch(text?: Dynamic, searchedFor?: Dynamic) {
  let folded = foldForPeopleSearch(searchedFor);
  return [text, ...text.split(/\s+/)].some((word?: Dynamic) => foldForPeopleSearch(word).startsWith(folded));
}
export function selectionForAskingAgent(state: PageState, workbook: ReadsWithTextMeasurer, cellId?: Dynamic) {
  let navigating = {
    ...withoutOtherRanges(clearPassingNotice(state)),
    mode: NAVIGATING_MODE,
  };
  let area = selectedArea(navigating, workbook);
  return area === null || hasFilteredRowsIn(navigating, workbook, area)
    ? stateSelectingOnlyCell(state, workbook, cellId)
    : settleSelectionSeen(null, navigating, workbook);
}
export function takeInsertOffer(
  state: PageState,
  workbook: ReadsWithTextMeasurer,
  offer?: Dynamic,
  cellId?: Dynamic,
  cellAfter?: Dynamic,
  foundBy?: Dynamic,
  movesOn?: Dynamic,
) {
  if (offer.kind === 'askAgent')
    return {
      state: selectionForAskingAgent(state, workbook, cellId),
      effects: [
        {
          kind: 'dropWhatIsHeld',
        },
        {
          kind: 'askAgentAboutSelection',
        },
      ],
    };
  let stateAtCell = stateSelectingOnlyCell(state, workbook, cellId);
  let thenGoesOnTo = movesOn ? cellAfter : null;
  switch (offer.kind) {
    case 'newDropdown':
    case 'dropdownOfSet':
      return applyFormatCommand(stateAtCell, workbook, {
        dropdown: true,
        firstSet: offer.set,
        ...(offer.kind === 'dropdownOfSet'
          ? {
              isReadySetPicked: true,
            }
          : {
              setsByName: state.readySets ?? [],
            }),
        replacesFormulas: true,
        thenOpens: 'list',
        ...(thenGoesOnTo !== null && {
          thenGoesOnTo: thenGoesOnTo,
        }),
      });
    case 'checkbox': {
      let result = applyFormatCommand(stateAtCell, workbook, {
        checkbox: true,
      });
      let [firstEffect] = result.effects;
      return thenGoesOnTo !== null && firstEffect?.kind === 'queueEdit'
        ? {
            state: result.state,
            effects: [
              withIfQueued(firstEffect, {
                thenGoesOnTo: thenGoesOnTo,
              }),
            ],
          }
        : result;
    }
    case 'calendar':
      return applyFormatCommand(stateAtCell, workbook, {
        dateToPick: true,
        ...(thenGoesOnTo !== null && {
          thenGoesOnTo: thenGoesOnTo,
        }),
      });
    case 'day':
      return queueEdit(
        state,
        enterEntryEdit(cellId, {
          kind: 'day',
          day: offer.day,
        }),
        {
          ...IF_QUEUED_DEFAULTS,
          select: selectionAtCell(cellAfter),
          foundBy: foundBy,
          done: null,
        },
      );
  }
}
export function uniqueProfilesByUser(profiles?: Dynamic) {
  let byUserId = new (Map as Dynamic)();
  for (let profile of profiles as Dynamic) if (!byUserId.has(profile.userId)) byUserId.set(profile.userId, profile);
  return [...byUserId.values()];
}
export function peopleListRowsFor(peopleList?: Dynamic, typed?: Dynamic, heldByCell?: Dynamic) {
  let found = peopleFoundSoFar(peopleList);
  if (peopleList.isOfPeopleAlone)
    return found
      .filter((profile?: Dynamic) => !hasProfileOfUser(heldByCell, profile))
      .slice(0, MAX_PEOPLE_IN_PEOPLE_LIST)
      .map(
        (profile?: Dynamic) => ({
          kind: 'person',
          profile: profile,
          isHeldByCell: false,
        }),
      );
  let heldFirst = peopleList.searchedFor === '' ? peopleList.heldAsItOpened.slice(0, 1) : [];
  let rows = [
    ...[...heldFirst, ...found.filter((profile?: Dynamic) => !hasProfileOfUser(heldFirst, profile))].slice(0, MAX_PEOPLE_BESIDE_OFFERS).map(
      (profile?: Dynamic) => ({
        kind: 'person',
        profile: profile,
        isHeldByCell: hasProfileOfUser(heldByCell, profile),
      }),
    ),
    ...insertOffersMatching(peopleList.offers ?? [], peopleList.searchedFor).map(offerRowOf),
  ];
  return [
    ...PEOPLE_LIST_GROUP_ORDER.flatMap((group?: Dynamic) => rows.filter((row?: Dynamic) => groupOfPeopleListRow(row) === group)),
    ...(typed === null
      ? []
      : [
          {
            kind: 'keepAsText',
            text: typed,
          },
        ]),
  ];
}
export function indexOfPeopleListRowGoneTo(peopleList?: Dynamic, rows?: Dynamic) {
  let index = rows.findIndex(
    (row?: Dynamic) => (peopleList.wentTo === WENT_UNDER_AGENT ? row.kind === 'person' : peopleListRowKey(row) === peopleList.wentTo),
  );
  if (index !== -1) return index;
  if (peopleList.wentTo === WENT_UNDER_AGENT) return Math.min(1, rows.length - 1);
  if (peopleList.isOfPeopleAlone && peopleList.searchedFor === '') return -1;
  let isHighlightable = (row?: Dynamic) => {
    if (row.kind !== 'offer' || row.offer.kind === 'askAgent') return true;
    return peopleList.searchedFor !== '' && insertOfferLabelMatches(row.offer, peopleList.searchedFor);
  };
  return Math.max(rows.findIndex(isHighlightable), 0);
}
export function profilesWithChanges(profilesById?: Dynamic, profiles?: Dynamic) {
  let isKnownAsIs = (profile?: Dynamic) => {
    let known = profilesById.get(profile.userId);
    return (
      known !== undefined &&
      known.name === profile.name &&
      known.avatarUrl === profile.avatarUrl &&
      known.color === profile.color &&
      known.isViewer === profile.isViewer &&
      known.isGuest === profile.isGuest
    );
  };
  let changed = profiles.filter(
    (profile?: Dynamic) => !isKnownAsIs(profile) && (profile.name !== '' || !profilesById.has(profile.userId)),
  );
  if (changed.length === 0) return profilesById;
  return new (Map as Dynamic)([...profilesById, ...changed.map((profile?: Dynamic) => [profile.userId, profile])]);
}
export function peopleListAskOf(state: PageState, workbook: WorkbookReads, isAskedByTool: Dynamic = false) {
  let { mode: mode } = state;
  let cellId = activeAnchorCell(state, workbook);
  let isListOfPeopleHere = state.peopleList?.isOfPeopleAlone === true && isSameCell(state.peopleList.cellId, cellId);
  let wantsPeople =
    isPeopleCell(workbook, cellId) || isAskedByTool || (isListOfPeopleHere && (workbook.cellOf(cellId) === null || state.peopleList.isAskedByTool));
  if (mode.kind !== 'editing')
    return wantsPeople
      ? {
          typed: null,
          searchedFor: '',
          isOfPeopleAlone: true,
        }
      : null;
  if (mode.isExpanded === true || hasEntryLists(mode)) return null;
  let text = cleanEnteredCellText(mode.text);
  if (isMentionText(text))
    return {
      typed: text,
      searchedFor: mentionQueryOf(text),
      isOfPeopleAlone: isListOfPeopleHere,
    };
  return wantsPeople && mode.typingIn === 'cell' && (text.trim() !== '' || isListOfPeopleHere) && !isFormulaText(text)
    ? {
        typed: text,
        searchedFor: text.trim(),
        isOfPeopleAlone: true,
      }
    : null;
}
export function profileOfUser(profilesById: Dynamic, { userId: userId, label: label }: Dynamic) {
  let profile = profilesById.get(userId);
  return profile !== undefined && profile.name !== ''
    ? profile
    : {
        userId: userId,
        name: label,
        avatarUrl: '',
        color: null,
        isViewer: false,
        isGuest: false,
      };
}
export function peopleListRows(state: PageState, workbook: WorkbookReads) {
  let ask = peopleListAskOf(state, workbook);
  if (state.peopleList === null || ask === null) return null;
  let heldAsItOpened = state.peopleList.heldAsItOpened.map(
    ({ userId: userId, name: name }: Dynamic) =>
      profileOfUser(state.profilesById, {
        userId: userId,
        label: name,
      }),
  );
  return peopleListRowsFor(
    {
      ...state.peopleList,
      heldAsItOpened: heldAsItOpened,
    },
    ask.typed,
    profilesHeldByCell(state, workbook, activeAnchorCell(state, workbook)),
  );
}
export function withPeopleFound(state: PageState, workbook: WorkbookReads, found?: Dynamic) {
  let { peopleList: peopleList } = state;
  if (peopleList === null) return state;
  let rows = !peopleList.isOfPeopleAlone && peopleList.searchedFor === '' ? null : peopleListRows(state, workbook);
  if (rows === null)
    return {
      ...state,
      peopleList: {
        ...peopleList,
        found: found,
      },
    };
  let people = rows.flatMap((row?: Dynamic) => (row.kind === 'person' ? [row.profile] : []));
  let highlighted = rows[indexOfPeopleListRowGoneTo(peopleList, rows)];
  let chosen =
    highlighted?.kind === 'offer' && highlighted.offer.kind === 'askAgent'
      ? rows.find(({ kind: kind }: Dynamic) => kind === 'person')
      : highlighted;
  let peopleUpToChosen =
    chosen?.kind === 'person' && (isViewerOrInWorkbookTest(workbook)(chosen.profile) || peopleList.wentTo === peopleListRowKey(chosen))
      ? people.slice(0, people.indexOf(chosen.profile) + 1)
      : [];
  let peopleFirst = peopleList.isOfPeopleAlone ? people : peopleUpToChosen;
  let people2 = uniqueProfilesByUser([...peopleFirst, ...found.people, ...people]).map(
    (profile?: Dynamic) => state.profilesById.get(profile.userId) ?? profile,
  );
  return {
    ...state,
    peopleList: {
      ...peopleList,
      found: {
        ...found,
        people: people2,
      },
      wentTo:
        !peopleList.isOfPeopleAlone || peopleList.searchedFor === '' || highlighted === undefined ? peopleList.wentTo : peopleListRowKey(highlighted),
    },
  };
}
export function isEnterHeldInPeopleList(state: PageState, workbook: WorkbookReads, hasWaited?: Dynamic) {
  let { peopleList: peopleList } = state;
  let rows = peopleListRows(state, workbook);
  if (peopleList === null || rows === null) return false;
  if ((peopleList.wentTo !== null && peopleList.wentTo !== WENT_UNDER_AGENT) || !(isPeopleSearchUnderWay(peopleList) || hasWaited)) return false;
  let highlighted = rows[indexOfPeopleListRowGoneTo(peopleList, rows)];
  if (peopleList.wentTo === WENT_UNDER_AGENT) return highlighted?.kind !== 'person';
  return (
    (highlighted?.kind === 'keepAsText' ||
      (highlighted?.kind === 'offer' && (highlighted.offer.kind === 'day' || highlighted.offer.kind === 'checkbox'))) &&
    usersOfCell(workbook.cellOf(peopleList.cellId)).length > 0
  );
}
export function shouldWaitForPeopleOnEnter(state: PageState, workbook: WorkbookReads) {
  let { peopleList: peopleList } = state;
  let rows = peopleListRows(state, workbook);
  if (peopleList === null || rows === null || peopleList.isOfPeopleAlone) return false;
  if (!isPeopleSearchUnderWay(peopleList)) return false;
  let highlighted = rows[indexOfPeopleListRowGoneTo(peopleList, rows)];
  if (peopleList.wentTo === WENT_UNDER_AGENT) return highlighted?.kind !== 'person';
  return peopleList.wentTo === null && isPeopleSearchLongEnough(peopleList.searchedFor) && highlighted?.kind === 'keepAsText';
}
export function peopleListOffersAgent(state: PageState, workbook: WorkbookReads) {
  if (state.peopleList === null) return false;
  return (peopleListRows(state, workbook) ?? []).some((row?: Dynamic) => row.kind === 'offer' && row.offer.kind === 'askAgent');
}
export function stepOffUnderAgent(state: PageState, workbook: WorkbookReads) {
  let rows = peopleListRows(state, workbook);
  if (state.peopleList?.wentTo !== WENT_UNDER_AGENT || rows === null) return null;
  let highlighted = rows[indexOfPeopleListRowGoneTo(state.peopleList, rows)];
  if (highlighted === undefined || highlighted.kind === 'person') return null;
  return {
    ...state,
    peopleList: {
      ...state.peopleList,
      wentTo: peopleListRowKey(highlighted),
    },
  };
}
export function moveInPeopleList(state: PageState, workbook: WorkbookReads, step?: Dynamic, isDownByOne?: Dynamic) {
  let rows = peopleListRows(state, workbook);
  if (state.peopleList === null || rows === null) return state;
  let index = indexOfPeopleListRowGoneTo(state.peopleList, rows);
  let next = rows[step(index, rows.length) ?? -1];
  if (next === undefined) return state;
  let current = rows[index];
  let wentTo =
    isDownByOne &&
    current?.kind === 'offer' &&
    current.offer.kind === 'askAgent' &&
    rows[index + 1] === next &&
    next.kind !== 'person' &&
    isPeopleSearchUnderWay(state.peopleList)
      ? WENT_UNDER_AGENT
      : peopleListRowKey(next);
  return {
    ...state,
    peopleList: {
      ...state.peopleList,
      wentTo: wentTo,
      chipGoneTo: null,
    },
  };
}
export function refreshPeopleList(state: PageState, workbook: WorkbookReads, isAskedByTool: Dynamic = false) {
  let ask = peopleListAskOf(state, workbook, isAskedByTool);
  if (ask === null)
    return state.peopleList === null
      ? state
      : {
          ...state,
          peopleList: null,
        };
  let cellId = activeAnchorCell(state, workbook);
  let listOfCell = state.peopleList !== null && isSameCell(state.peopleList.cellId, cellId) ? state.peopleList : null;
  let namedProfiles = [...state.profilesById.values()].filter(({ name: name }: Dynamic) => name !== '');
  let isSearchNew = listOfCell?.searchedFor !== ask.searchedFor || listOfCell.isOfPeopleAlone !== ask.isOfPeopleAlone;
  let peopleToShow = () => {
    if (ask.isOfPeopleAlone) return namedProfiles;
    let foundBefore = listOfCell?.isOfPeopleAlone === false ? (listOfCell.found?.people ?? []) : [];
    return uniqueProfilesByUser([
      ...namedProfiles.filter((input?: Dynamic) => input.isViewer),
      ...foundBefore,
      ...namedProfiles.filter(isViewerOrInWorkbookTest(workbook)),
    ]).map((input?: Dynamic) => state.profilesById.get(input.userId) ?? input);
  };
  let waitsForSearch = !ask.isOfPeopleAlone && ask.searchedFor === '';
  let { scrollLeft: scrollLeft, scrollTop: scrollTop } = state;
  let peopleList = {
    cellId: cellId,
    searchedFor: ask.searchedFor,
    found: !isSearchNew
      ? listOfCell.found
      : waitsForSearch
        ? null
        : {
            searchedFor: '',
            people: peopleToShow(),
          },
    offers: ask.isOfPeopleAlone ? [] : null,
    card: null,
    wentTo: null,
    scrollAsItOpened: {
      scrollLeft: scrollLeft,
      scrollTop: scrollTop,
    },
    heldAsItOpened: profilesHeldByCell(state, workbook, cellId),
    isOfPeopleAlone: ask.isOfPeopleAlone,
    isAskedByTool: isAskedByTool || listOfCell?.isAskedByTool === true,
    chipGoneTo: null,
  };
  return {
    ...closeDropdownList(state),
    peopleList: peopleList,
    calendar: null,
  };
}
export function isAtSignTypedAlone(mode?: Dynamic) {
  if (mode.kind !== 'editing') return false;
  let text = cleanEnteredCellText(mode.text);
  return isMentionText(text) && mentionQueryOf(text) === '';
}
export function openPeopleListToAskPerson(state: PageState, workbook: ReadsWithTextMeasurer) {
  if (state.mode.kind === 'editing' && !isAtSignTypedAlone(state.mode)) return state;
  let navigating = state.mode.kind === 'editing' ? leaveEntryEditing(state) : state;
  let listState = refreshPeopleList(navigating, workbook, true);
  return refreshPeopleList(startEntryEditing(listState, workbook, '', 'cell'), workbook);
}
export function notePeopleListScroll(state: PageState, workbook: WorkbookReads) {
  let { peopleList: peopleList, scrollLeft: scrollLeft, scrollTop: scrollTop } = state;
  if (peopleList === null || peopleListRows(state, workbook) === null) return state;
  return {
    ...closeDropdownList(state),
    peopleList: {
      ...peopleList,
      scrollAsItOpened: {
        scrollLeft: scrollLeft,
        scrollTop: scrollTop,
      },
    },
    calendar: null,
  };
}
export function closePeopleListOnCellClick(before: Dynamic, result: Dynamic, action: Dynamic, workbook: WorkbookReads) {
  if (!isPlainCellClick(result, action)) return result;
  let { state: state } = result;
  let isOnSameCell = before.peopleList !== null && isSameCell(state.activeCell, before.activeCell);
  return withNoEffects(
    isOnSameCell
      ? {
          ...state,
          peopleList: null,
        }
      : refreshPeopleList(state, workbook),
  );
}
export function a1OfCellId(workbook: WorkbookReads, cellId?: Dynamic) {
  let position = workbook.positionOfCell(cellId);
  return position === null ? null : areaToA1AsStored(areaOfPosition(position), ownRowOrderOfSheet(workbook, cellId.sheetId));
}
export function peopleReplacedNews(name: Dynamic, workbook: WorkbookReads, cellId?: Dynamic, leastCount: Dynamic = 2) {
  let [count, a1] = [usersOfCell(workbook.cellOf(cellId)).length, a1OfCellId(workbook, cellId)];
  return count < leastCount || a1 === null
    ? null
    : {
        what: 'peopleReplaced',
        name: name,
        cell: a1,
        replacedCount: count,
        isSaved: false,
      };
}
export function takePeopleListRow(
  state: PageState,
  workbook: ReadsWithTextMeasurer,
  rowKey?: Dynamic,
  cellAfter?: Dynamic,
  foundBy?: Dynamic,
  movesOn?: Dynamic,
  hasWaitedForPeople: Dynamic = false,
) {
  let row = peopleListRows(state, workbook)?.find((row2?: Dynamic) => peopleListRowKey(row2) === rowKey);
  let closed = {
    ...state,
    peopleList: null,
  };
  let closedState = {
    ...closed,
    lastDone: null,
  };
  if (row === undefined) return withNoEffects(state);
  if (state.peopleList === null) return withNoEffects(closed);
  let { cellId: listCellId } = state.peopleList;
  if (row.kind === 'keepAsText') {
    let value = peopleReplacedNews(row.text, workbook, listCellId);
    return commitEntry(closedState, workbook, cellAfter, foundBy, value);
  }
  if (row.kind === 'offer') {
    let { offer: value } = row;
    if (value.kind !== 'several') return takeInsertOffer(closed, workbook, value, listCellId, cellAfter, foundBy, movesOn);
    let card = openCardAtRow(rowKey, value.offers.map(subOfferCardRow), foundBy);
    return withNoEffects(card === null ? state : peopleListCard.withCard(state, card));
  }
  if (state.peopleList.isOfPeopleAlone) return addPersonToCell(state, workbook, row.profile, movesOn ? cellAfter : null, foundBy);
  if (row.isHeldByCell) return withNoEffects(moveActiveCellTo(leaveEntryEditing(closed), workbook, cellAfter, foundBy));
  let { userId: userId, name: name } = row.profile;
  let a1 = a1OfCellId(workbook, listCellId);
  let added =
    hasWaitedForPeople && a1 !== null
      ? {
          what: 'personAdded',
          name: name,
          cell: a1,
          heldNowCount: 1,
        }
      : null;
  return queueEdit(
    closedState,
    enterEntryEdit(listCellId, {
      kind: 'user',
      userId: userId,
      name: name,
    }),
    {
      ...IF_QUEUED_DEFAULTS,
      select: selectionAtCell(cellAfter),
      foundBy: foundBy,
      done: peopleReplacedNews(name, workbook, listCellId, hasWaitedForPeople ? 1 : 2) ?? added,
    },
  );
}
export function addPersonToCell(
  state: PageState,
  workbook: WorkbookReads,
  { userId: userId, name: name }: Dynamic,
  cellAfter?: Dynamic,
  foundBy?: Dynamic,
) {
  if (state.peopleList === null) return withNoEffects(state);
  let { cellId: listCellId } = state.peopleList;
  let cell = workbook.cellOf(listCellId);
  let edit =
    cell === null
      ? enterEntryEdit(listCellId, {
          kind: 'user',
          userId: userId,
          name: name,
        })
      : {
          kind: 'addUserToCell',
          sheetId: listCellId.sheetId,
          cell: cellRefOf(listCellId),
          userId: userId,
          name: name,
        };
  let [heldCount, a1] = [usersOfCell(cell).length, a1OfCellId(workbook, listCellId)];
  let done =
    a1 === null
      ? null
      : cell !== null && heldCount === 0
        ? {
            what: 'contentsReplaced',
            name: name,
            cell: a1,
            isSaved: false,
          }
        : {
            what: 'personAdded',
            name: name,
            cell: a1,
            heldNowCount: heldCount + 1,
          };
  let stateWithoutDone = {
    ...state,
    lastDone: null,
  };
  if (cellAfter !== null)
    return queueEdit(
      {
        ...stateWithoutDone,
        peopleList: null,
      },
      edit,
      {
        ...IF_QUEUED_DEFAULTS,
        select: selectionAtCell(cellAfter),
        foundBy: foundBy,
        done: done,
      },
    );
  let peopleList = {
    ...state.peopleList,
    wentTo: null,
    chipGoneTo: null,
  };
  return queueEdit(
    {
      ...stateWithoutDone,
      peopleList: peopleList,
    },
    edit,
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      foundBy: foundBy,
      done: done,
      thenPeopleList: 'staysOpen',
    },
  );
}
export function removePersonFromCell(state: PageState, workbook: WorkbookReads, userId?: Dynamic, foundBy?: Dynamic) {
  if (state.peopleList === null || !state.peopleList.isOfPeopleAlone) return withNoEffects(state);
  let { cellId: listCellId } = state.peopleList;
  let users = usersOfCell(workbook.cellOf(listCellId));
  let chipGoneTo = chipGoneToInPeopleCell(state, workbook);
  let userToRemove = userId ?? chipGoneTo;
  let index = userToRemove === null ? users.length - 1 : users.findIndex((user?: Dynamic) => user.userId === userToRemove);
  let removed = users[index];
  if (removed === undefined) return withNoEffects(state);
  let nextChip = userId === null && chipGoneTo !== null ? (users[index - 1] ?? users[index + 1]) : undefined;
  let [{ name: name }, a1] = [profileOfUser(state.profilesById, removed), a1OfCellId(workbook, listCellId)];
  let done =
    a1 === null
      ? null
      : {
          what: 'personRemoved',
          name: name,
          cell: a1,
          heldNowCount: users.length - 1,
          isSaved: false,
        };
  return queueEdit(
    {
      ...state,
      lastDone: null,
      peopleList: {
        ...state.peopleList,
        chipGoneTo: nextChip?.userId ?? null,
      },
    },
    {
      kind: 'removeUserFromCell',
      sheetId: listCellId.sheetId,
      cell: cellRefOf(listCellId),
      userId: removed.userId,
    },
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      foundBy: foundBy,
      done: done,
      thenPeopleList: 'staysOpen',
      leavesEntryOpen: state.mode.kind === 'editing',
    },
  );
}
export function pasteIntoPeopleCell(
  state: PageState,
  workbook: ReadsWithTextMeasurer,
  { copiedCellsAsText: copiedCellsAsText, text: text, pastedTextIs: pastedTextIs }: Dynamic,
) {
  if (state.mode.kind !== 'navigating' || peopleChipsOfListCell(state, workbook) === null) return null;
  let [firstText, ...otherTexts] = parseTsvCells(text)
    .flat()
    .map((text2?: Dynamic) => text2.trim())
    .filter((text2?: Dynamic) => text2 !== '');
  if (copiedCellsAsText !== null || pastedTextIs !== 'asTyped' || otherTexts.length > 0) return null;
  if (firstText === undefined) return state;
  if (isFormulaText(firstText)) return null;
  return refreshPeopleList(startEntryEditing(state, workbook, normalizeLineBreaks(firstText), 'cell'), workbook);
}
export function chipGoneToInPeopleCell(state: PageState, workbook: WorkbookReads) {
  let chipGoneTo = state.peopleList?.chipGoneTo ?? null;
  return peopleChipsOfListCell(state, workbook)?.some(({ userId: userId }: Dynamic) => userId === chipGoneTo) === true ? chipGoneTo : null;
}
export function stepAmongPeopleChips(state: PageState, workbook: WorkbookReads, where?: Dynamic) {
  let chips = peopleChipsOfListCell(state, workbook) ?? [];
  let chipGoneTo = chipGoneToInPeopleCell(state, workbook);
  let index = chipGoneTo === null ? chips.length : chips.findIndex(({ userId: userId }: Dynamic) => userId === chipGoneTo);
  if (where === 'after' && index === chips.length)
    return {
      columnDelta: 1,
    };
  if (where === 'before' && index === 0)
    return {
      columnDelta: -1,
    };
  let nextIndex = (
    {
      before: index - 1,
      after: index + 1,
      first: 0,
      caret: chips.length,
    } as Dynamic
  )[where];
  return {
    chip: chips[nextIndex]?.userId ?? null,
  };
}
export function personInCellMatchingSearch(state: PageState, workbook: WorkbookReads) {
  let rows = peopleListRows(state, workbook);
  if (state.peopleList === null || rows === null || !isNoOneFound(state.peopleList, rows)) return null;
  let searchedFor = state.peopleList.searchedFor;
  return peopleChipsOfListCell(state, workbook)?.find(({ name: name }: Dynamic) => isFoundByPeopleSearch(name, searchedFor)) ?? null;
}
export function peopleChipsOfListCell(state: PageState, workbook: WorkbookReads) {
  return state.peopleList?.isOfPeopleAlone === true && peopleListRows(state, workbook) !== null
    ? profilesHeldByCell(state, workbook, state.peopleList.cellId)
    : null;
}
export function settlePeopleList(before: Dynamic, state: PageState, workbook: ReadsWithTextMeasurer) {
  let { peopleList: peopleList } = state;
  if (peopleList === null) return state;
  let isSameListCell = before.peopleList !== null && isSameCell(before.peopleList.cellId, peopleList.cellId);
  if (
    isSameCell(peopleList.cellId, activeAnchorCell(state, workbook)) &&
    (!isSameListCell || state.mode.kind === 'editing' || isSameSelection(before, state)) &&
    (state.mode.kind === 'editing' || peopleList.searchedFor === '') &&
    (isTypingInFormulaBar(state) || !isDropdownListOutOfPlace(state, workbook, peopleList.scrollAsItOpened)) &&
    state.menu === null &&
    state.dragging?.kind !== 'resizing' &&
    peopleListAskOf(state, workbook) !== null
  ) {
    let dropsCard = peopleListCard.isCardOfPointerAlone(state) && before.peopleList?.wentTo !== peopleList.wentTo;
    return dropUndrawableCard(peopleListCard, dropsCard ? peopleListCard.withCard(state, null) : state, workbook);
  }
  return peopleList.isOfPeopleAlone && state.mode.kind === 'editing' && isSameCell(peopleList.cellId, activeAnchorCell(state, workbook))
    ? leaveEntryEditing({
        ...state,
        peopleList: null,
      })
    : {
        ...state,
        peopleList: null,
      };
}
export function peopleListEffects(before: Dynamic, { state: state, effects: effects }: Dynamic, workbook: WorkbookReads) {
  let { peopleList: peopleList } = state;
  let isSameSearch =
    before.peopleList !== null &&
    peopleList !== null &&
    before.peopleList.searchedFor === peopleList.searchedFor &&
    before.peopleList.isOfPeopleAlone === peopleList.isOfPeopleAlone &&
    isSameCell(before.peopleList.cellId, peopleList.cellId);
  let askEffects = [
    ...(peopleList === null || peopleList.offers !== null
      ? []
      : [
          {
            kind: 'readOffersUnderAt',
          },
        ]),
    ...(peopleList === null || isSameSearch
      ? []
      : [
          {
            kind: 'findPeople',
            searchedFor: peopleList.searchedFor,
          },
        ]),
  ];
  if (state.peopleLookedUpAtChangeCount === state.workbookChangeCount)
    return {
      state: state,
      effects: [...effects, ...askEffects],
    };
  let userIds = workbook.userIds();
  return {
    state: {
      ...state,
      peopleLookedUpAtChangeCount: state.workbookChangeCount,
    },
    effects: [
      ...effects,
      ...askEffects,
      ...(userIds.length === 0
        ? []
        : [
            {
              kind: 'lookUpPeople',
              userIds: userIds,
            },
          ]),
    ],
  };
}
export const PEOPLE_LIST_GROUP_ORDER = ['agent', 'people', 'dates', 'dropdowns', 'controls'];
export const insertOfferKey = (offer?: Dynamic) =>
  offer.kind === 'day' ? offer.day : offer.kind === 'dropdownOfSet' ? offer.set.key : offer.kind;
export const foldForPeopleSearch = (text?: Dynamic) => text.toLowerCase().replaceAll('’', "'");
/** The agent's name as the host gives it (read when asked: it may change after this module loads). */
export const askAgentOfferLabel = () => AGENT_NAME;
export const insertOfferLabelMatches = (offer?: Dynamic, searchedFor?: Dynamic) =>
  isFoundByPeopleSearch(offer.kind === 'askAgent' ? askAgentOfferLabel() : offer.label, searchedFor);
export const insertOfferMatches = (offer?: Dynamic, searchedFor?: Dynamic) =>
  insertOfferLabelMatches(offer, searchedFor) || (offer.kind === 'dropdownOfSet' && isFoundByPeopleSearch(offer.alsoFoundBy, searchedFor));
export const insertOffersMatching = (offers?: Dynamic, searchedFor?: Dynamic) =>
  searchedFor === ''
    ? [...offers]
    : offers.flatMap((offer?: Dynamic) => {
        if (offer.kind === 'several') return insertOffersMatching(offer.offers, searchedFor);
        return insertOfferMatches(offer, searchedFor) ? [offer] : [];
      });
export const stateSelectingOnlyCell = (state: PageState, workbook: ReadsWithTextMeasurer, cellId?: Dynamic) =>
  settleSelectionSeen(
    null,
    {
      ...withoutOtherRanges(clearPassingNotice(state)),
      mode: NAVIGATING_MODE,
      ...selectionAtCell(cellId),
    },
    workbook,
  );
export const isPeopleSearchUnderWay = ({ searchedFor: searchedFor, found: found }: Dynamic) => found?.searchedFor !== searchedFor;
export const personMatchesPeopleSearch = (searchedFor: Dynamic, { name: name }: Dynamic) =>
  searchedFor !== '' && isFoundByPeopleSearch(name, searchedFor);
export const peopleFoundSoFar = (peopleList?: Dynamic) =>
  isPeopleSearchUnderWay(peopleList)
    ? (peopleList.found?.people ?? []).filter((profile?: Dynamic) => personMatchesPeopleSearch(peopleList.searchedFor, profile))
    : (peopleList.found?.people ?? []);
export const groupOfPeopleListRow = (row?: Dynamic) =>
  row.kind === 'person' ? 'people' : row.kind === 'offer' ? groupOfInsertOffer(row.offer) : null;
export const peopleListRowKey = (row?: Dynamic) =>
  row.kind === 'person' ? `person-${row.profile.userId}` : row.kind === 'offer' ? `offer-${insertOfferKey(row.offer)}` : row.kind;
export const offerRowOf = (offer?: Dynamic) => ({
  kind: 'offer',
  offer: offer,
});
export const hasProfileOfUser = (profiles: Dynamic, { userId: userId }: Dynamic) =>
  profiles.some((profile?: Dynamic) => profile.userId === userId);
export const isViewerOrInWorkbookTest = (workbook: WorkbookReads) => {
  let userIds = new (Set as Dynamic)(workbook.userIds());
  return ({ isViewer: isViewer, userId: userId }: Dynamic) => isViewer || userIds.has(userId);
};
export const MAX_PEOPLE_BESIDE_OFFERS = 4;
export const MAX_PEOPLE_IN_PEOPLE_LIST = 8;
export const subOffersOfRow = (rows?: Dynamic, rowKey?: Dynamic) => {
  let row = rows.find((row2?: Dynamic) => peopleListRowKey(row2) === rowKey);
  return row?.kind === 'offer' && row.offer.kind === 'several' ? row.offer.offers : [];
};
export const optionMarksOfOffer = (offer?: Dynamic) =>
  offer.kind === 'dropdownOfSet'
    ? offer.set.options.map(
        ({ label: label, color: color }: Dynamic) => ({
          key: label,
          color: color,
        }),
      )
    : [];
export const subOfferCardRow = (offer?: Dynamic) => ({
  key: peopleListRowKey(offerRowOf(offer)),
  label: offer.label,
  marks: optionMarksOfOffer(offer),
  isChosen: false,
});
export const drawnPeopleListCard = (peopleList?: Dynamic, rows?: Dynamic) =>
  listCardOfRow(peopleList.card, rows.map(peopleListRowKey), (rowKey?: Dynamic) => subOffersOfRow(rows, rowKey).map(subOfferCardRow));
export const WENT_UNDER_AGENT = 'underAgent';
export const peopleSearchStage = (peopleList?: Dynamic) => {
  if (peopleList.searchedFor === '') return 'none';
  return isPeopleSearchUnderWay(peopleList) ? 'underWay' : 'over';
};
export const isPeopleSearchLongEnough = (searchedFor?: Dynamic) => Array.from<Dynamic>(searchedFor.trim()).length >= 3;
export const isNoOneFound = (peopleList?: Dynamic, rows?: Dynamic) =>
  peopleList.searchedFor !== '' &&
  !isPeopleSearchUnderWay(peopleList) &&
  !rows.some((row?: Dynamic) => row.kind === 'person') &&
  (peopleList.isOfPeopleAlone || (peopleList.found?.people.length === 0 && isPeopleSearchLongEnough(peopleList.searchedFor)));
export const isPeopleCell = (workbook: WorkbookReads, cellId?: Dynamic) =>
  usersOfCell(workbook.cellOf(cellId)).length > 0 &&
  dropdownAtCell(workbook, cellId) === null &&
  !doesCellTakeCalendar(workbook, cellId) &&
  !isTimeCell(workbook, cellId);
export const profilesHeldByCell = ({ profilesById: profilesById }: Dynamic, workbook: WorkbookReads, cellId?: Dynamic) =>
  usersOfCell(workbook.cellOf(cellId)).map((user?: Dynamic) => profileOfUser(profilesById, user));
export const isPeopleCellEditedWithoutList = (state: PageState, workbook: WorkbookReads) =>
  state.peopleList === null && state.mode.kind === 'editing' && usersOfCell(workbook.cellOf(activeAnchorCell(state, workbook))).length > 0;
export const isAskAgentRowBusy = (rowKey: Dynamic, state: PageState, event?: Dynamic) =>
  rowKey ===
    peopleListRowKey(
      offerRowOf({
        kind: 'askAgent',
        label: '',
      }),
    ) &&
  !canTellAgentSelection(state, event) &&
  (event.wasEventHeld || state.entriesUnanswered.length > 0 || (state.saving !== 'saving' && state.saving !== 'allSaved'));
export const askPersonActions = (mode?: Dynamic) =>
  isAtSignTypedAlone(mode)
    ? [
        {
          kind: 'personAsked',
        },
      ]
    : [
        {
          kind: 'entryLeft',
        },
        {
          kind: 'personAsked',
        },
      ];
export const withPeopleChipGoneTo = (state: PageState, chipGoneTo?: Dynamic) =>
  state.peopleList === null
    ? state
    : {
        ...state,
        peopleList: {
          ...state.peopleList,
          chipGoneTo: chipGoneTo,
          wentTo: null,
        },
      };
export const isEntryAmongPeople = (state: PageState, workbook: WorkbookReads) =>
  isPeopleCell(workbook, activeAnchorCell(state, workbook)) || peopleChipsOfListCell(state, workbook) !== null;
export const isEntryInChipCell = (state: PageState, workbook: WorkbookReads) =>
  isEntryAmongPeople(state, workbook) || dropdownAtCell(workbook, activeAnchorCell(state, workbook)) !== null;
export const caretInEntryOutsideChips = (state: PageState, workbook: WorkbookReads, caretInEntry?: Dynamic) =>
  isEntryInChipCell(state, workbook) ? undefined : caretInEntry;
export const keepPeopleListOpen = (state: PageState, workbook: WorkbookReads) =>
  state.peopleList === null || state.peopleList.searchedFor === '' ? state : refreshPeopleList(state, workbook);
export const peopleListCard = {
  card: (state: PageState) => state.peopleList?.card ?? null,
  isCardOfPointerAlone: (state: PageState) => state.peopleList?.card?.wentTo === null,
  doKeysGoRound: () => true,
  withCard: (state: PageState, card?: Dynamic) =>
    state.peopleList === null
      ? state
      : {
          ...state,
          peopleList: {
            ...state.peopleList,
            card: card,
            wentTo: card === null || card.wentTo === null ? state.peopleList.wentTo : card.ofRow,
          },
        },
  rowsAt: (state: PageState, workbook: WorkbookReads, rowKey?: Dynamic) =>
    subOffersOfRow(peopleListRows(state, workbook) ?? [], rowKey).map(subOfferCardRow),
  drawn(state: PageState, workbook: WorkbookReads) {
    let rows = peopleListRows(state, workbook);
    return state.peopleList === null || rows === null ? null : drawnPeopleListCard(state.peopleList, rows);
  },
  take(state: PageState, workbook: ReadsWithTextMeasurer, key?: Dynamic, cellAfter?: Dynamic, foundBy?: Dynamic, movesOn?: Dynamic) {
    let { peopleList: peopleList } = state;
    let rows = peopleListRows(state, workbook);
    if (peopleList === null || peopleList.card === null || rows === null) return withNoEffects(state);
    let offer = subOffersOfRow(rows, peopleList.card.ofRow).find((offer2?: Dynamic) => subOfferCardRow(offer2).key === key);
    if (offer === undefined || offer.kind === 'several') return withNoEffects(state);
    let closedState = {
      ...state,
      peopleList: null,
    };
    return takeInsertOffer(closedState, workbook, offer, peopleList.cellId, cellAfter, foundBy, movesOn);
  },
};
export const withProfilesLearned = (state: PageState, profiles?: Dynamic) => {
  let profilesById = profilesWithChanges(state.profilesById, profiles);
  return profilesById === state.profilesById
    ? state
    : {
        ...state,
        profilesById: profilesById,
      };
};
export const isTypingInFormulaBar = ({ mode: mode }: Dynamic) => mode.kind === 'editing' && mode.typingIn === 'formulaBar';
