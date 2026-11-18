/**
 * Why the engine refuses, and why a synced session stops or faults. Every
 * refusal is answered `{"kind": "refused", "refusal": …}`.
 */

/** Why operations are refused (`load`, `apply`, and edits once worked out into operations). */
export type OpRefusal =
  | 'unreadableRequest'
  | 'unknownSheet'
  | 'unknownRow'
  | 'unknownColumn'
  | 'columnNamedTwice'
  | 'rowNamedTwice'
  | 'cellNamedTwice'
  | 'rowMovedTwice'
  | 'columnMovedTwice'
  | 'sheetMovedTwice'
  | 'movedAfterWhatIsMoved'
  | 'twoMovesToOnePlace'
  | 'idAlreadyHeld'
  /** Undeleting what a load deleted: the load did not keep it. */
  | 'deletedCellsNotLoaded'
  | 'numberNotFinite'
  /** `load`, `apply`, `undo` or `replay` on a session that syncs. */
  | 'syncInUse'
  | 'cellFormatSetTwice'
  | 'sheetSettingsSetTwice'
  | 'unknownDropdown'
  | 'dropdownSetTwice'
  | 'dropdownOptionIdInTwoDropdowns'
  | 'dropdownIdTaken'
  | 'dropdownOptionIdTaken'
  | 'dropdownInUse'
  | 'unknownGroup'
  | 'groupNamedTwice'
  | 'unknownConditionalFormat'
  | 'conditionalFormatNamedTwice'
  | 'viewNamedTwice'
  | 'viewInUse'
  | 'unknownView'
  | 'placementNamedTwice'
  | 'cellTableNamedTwice'
  | 'rangeAlreadyMerged'
  | 'rangeNotMerged'
  | 'unknownDropdownOption'
  | 'cellOfDropdownHoldsNoOption'
  | 'cellCoveredByMergedRange'
  | 'textTooLong'
  | 'formulaTooLong'
  | 'tooMuchThatNoCellShows'
  | 'idNotWellFormed'
  | 'editTooLarge'
  | 'tooManyCellsToEnterIn'
  | 'userIdNotWellFormed'
  | 'tooManyUsersInCell'
  | 'userLabelNotAllowed'
  | 'addressLinkedToTooLong'
  | 'addressLinkedToNotOfTheWeb'
  | 'richTextTooLarge'
  | 'rowNotNamedInTheWay';

/** Why a reverse (`undo`) or a step taken back is refused. */
export type TakeBackRefusal =
  /** The reverse does not apply to the workbook: it is not one. */
  | 'notAReverse'
  /** What the step did is no longer so. */
  | 'changedSince'
  /** Taking it back would give a sheet a name another sheet has. */
  | 'sheetNameTaken'
  | 'reverseNotAccepted'
  | 'tooMuchToTakeBack'
  | 'builtOnAnotherRevision'
  | 'stepToReverseNotMadeHere'
  | 'reverseOfStepNeverKnown'
  | 'noSheetLeft'
  | 'historyDoesNotMatch';

/** Why a request of syncing about an edit is refused, besides the operations' own refusals. */
export type QueueRefusal =
  /** The session has stopped (`nextStep.kind === 'stop'`). */
  | 'syncStopped'
  /** An edit queued or confirmed already has the op id. */
  | 'opIdInUse'
  /** Rows, columns or sheets moved (by a move or a sort) among other edits of one request. */
  | 'moveAmongSeveralEdits'
  /** The edit would leave the workbook holding more cells than it may (200 000). */
  | 'tooManyCells';

/**
 * Every refusal the engine is known to answer with. Edits and reads add
 * refusals of their own (`unknownSheet`, `sheetNameTaken`, `noCellsToSort`, …);
 * those are told as plain strings where their kinds are not listed here.
 */
export type Refusal = OpRefusal | TakeBackRefusal | QueueRefusal;

/** A refused request. */
export interface Refused<R extends string = string> {
  kind: 'refused';
  refusal: R;
}

/** Why a synced session stops: it takes no more edits, and its next step stays `stop`. */
export type StopReason =
  /** An edit or load page written in a format version the engine does not know (a newer one). */
  | 'unknownFormatVersion'
  /** A load page written in a format version the engine no longer reads. */
  | 'formatVersionNoLongerTaken'
  /** A load page whose operations cannot be read or applied. */
  | 'unreadableLoad';

/** What went wrong with another's edit: the workbook is loaded again (`fetchLoadPage`). */
export type Fault = 'streamedEditRefused' | 'streamedEditUnreadable';
