//! The server's reads of a workbook's history, on a direct session at the newest revision (the server's history
//! session: every edit kept applied with `apply`, in order).
//!
//! - `editsThatTakeBackAllSince {edits}` takes back every edit since a revision (restoring it), `editsThatUndo
//!   {edits}` the edits picked (in revision order). Each edit is given with the reverse applying it answered. The
//!   answer is the edits the page then queues (`queueEditsThatTakeBack`): the reverses, last edit first, in edits of
//!   their own of at most 64 operations and 120 KiB, built on the revision now.
//!   - All since: an edit and the next that takes it back exactly (its operations the other's reverse) cancel out, an
//!     undo and its redo nested inside another pair too; what is left is taken back as it is, whatever changed since.
//!   - Undo: each edit is taken back as `undo {ops, reverse}` would, last first: what its operations did must still
//!     be so (`changedSince`, looked at for the whole edit as the page's undo does), and its reverse one
//!     (`notAReverse`).
//!   - An edit taken back whose reverse names an id not well formed or is over 64 operations, or that or its own
//!     reverse over 240 KiB, or (all since) whose reverse would leave lines in the way of others or a second cell
//!     table on a sheet: `reverseNotAccepted`. So is a workbook left without a sheet, a sheet without a row or a
//!     column (unless it had none before, or was not there), or two sheets of one name: each edit queued is looked
//!     at so, with what it shows, and a run of them that fails is split until the edit that fails is found. Over 512
//!     edits to queue: `tooMuchToTakeBack`.
//! - `historyOfACell {sheetId, cell, edits}` and `historyOfARow {sheetId, r, edits}`: the edits (all of them, as
//!   recorded) that changed what a cell holds, or a cell of the row (in a column not deleted), newest first, with what
//!   it held after (nothing when emptied), at most 50 (`areEarlierLeftOut` when there are more). The edits are read
//!   from the newest back, only as far as the 51st change: what an edit set is set by its operations alone (the
//!   reverses are not read). They must be one an edit for each revision, readable as recorded, and the newest that
//!   sets a cell must set what it holds now (and a cell no edit sets must hold nothing): `historyDoesNotMatch`
//!   otherwise.

use std::collections::BTreeMap;
use hashbrown::HashMap;
use std::ops::Range;

use serde::Deserialize;
use serde_json::{json, Value as Json};

use super::history::{self, NotTaken};
use crate::ids::LineId;
use crate::workbook::layout::CellIds;
use crate::workbook::load::Op;
use crate::workbook::{version, Cell, Input, Sheet, Workbook};

/// The most operations an edit to queue holds.
const OPS_IN_AN_EDIT: usize = 64;
/// The most bytes of operations an edit to queue holds.
const BYTES_IN_AN_EDIT: usize = 120 * 1024;
/// The most bytes of an edit's reverse taken back, and of that one's own reverse.
const BYTES_TAKEN_BACK: usize = 240 * 1024;
/// The most edits a take-back queues.
const EDITS_TO_QUEUE: usize = 512;
/// The most changes a history tells.
const CHANGES_TOLD: usize = 50;

/// An edit as the server keeps it: its operations, and the reverse applying them answered.
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Kept {
    pub ops: Vec<Op>,
    pub reverse: Vec<Op>,
}

impl Kept {
    pub fn is_well_formed(&self) -> bool {
        self.ops.iter().chain(&self.reverse).all(Op::is_well_formed)
    }
}

/// Which edits a take-back takes back.
pub enum Taking {
    /// Every edit since a revision: the workbook as it was then.
    AllSince,
    /// The edits picked.
    Undo,
}

fn refused(refusal: &str) -> String {
    json!({"kind": "refused", "refusal": refusal}).to_string()
}

fn size(ops: &[Op]) -> usize {
    serde_json::to_string(ops).map_or(usize::MAX, |s| s.len())
}

/// Whether an edit's reverse taken back (`taken`), whose own reverse is `again`, can be queued: the ids it names well
/// formed (as `queueEditsThatTakeBack` will have them), and not too large.
fn fits(taken: &[Op], again: &[Op]) -> bool {
    taken.len() <= OPS_IN_AN_EDIT
        && size(taken) <= BYTES_TAKEN_BACK
        && size(again) <= BYTES_TAKEN_BACK
        && super::new_ids::are_well_formed(taken)
}

/// Whether the reverses taken back leave nothing hidden under a merged range, once all are taken back: no cell but the
/// top-left of a range they merge (still merged then) holds something, and no cell they give something is under a
/// merged range but its top-left. (A range merged so and unmerged again by an earlier edit's reverse is no matter,
/// nor one that hid something all along.)
fn hides_nothing(after: &Workbook, taken: &[Vec<Op>]) -> bool {
    let sheet_of = |sheet_id: &String| after.sheet_index(sheet_id).map(|i| &after.sheets[i]);
    let at = |sheet: &Sheet, row: LineId, column: LineId| {
        Some((sheet.rows.position(row)?, sheet.columns.position(column)?))
    };
    let hidden = |(r, c): (usize, usize), (top, bottom, left, right): (usize, usize, usize, usize)| {
        (r, c) != (top, left) && (top..=bottom).contains(&r) && (left..=right).contains(&c)
    };
    taken.iter().flatten().all(|op| match op {
        Op::MergeCells { sheet_id, ranges } => {
            let Some(sheet) = sheet_of(sheet_id) else { return true };
            ranges.iter().filter(|range| sheet.merged_ranges.contains(range)).all(|range| {
                let Some(merged) = sheet.live_box(&after.bases, range) else { return true };
                sheet.cells.keys().all(|&(row, column)| at(sheet, row, column).is_none_or(|cell| !hidden(cell, merged)))
            })
        }
        Op::SetCells { sheet_id, cells, .. } => {
            let Some(sheet) = sheet_of(sheet_id) else { return true };
            let merged = crate::workbook::layout::merged_boxes(&after.bases, sheet);
            cells.iter().filter(|set| set.input.is_some()).all(|set| {
                let (Some(row), Some(column)) = (after.bases.parse(&set.r), after.bases.parse(&set.c)) else {
                    return true;
                };
                if !sheet.cells.contains_key(&(row, column)) {
                    return true;
                }
                at(sheet, row, column).is_none_or(|cell| merged.iter().all(|&m| !hidden(cell, m)))
            })
        }
        _ => true,
    })
}

/// Whether a workbook is one the edits taken back (from `before`) may leave: a sheet at least, each with a row and a
/// column (unless it had none before, or was not there), and no two sheets of one name, whatever its case.
fn is_whole(before: &Workbook, workbook: &Workbook) -> bool {
    let mut names = hashbrown::HashSet::new();
    let has_lines = |s: &Sheet| s.rows.len() > 0 && s.columns.len() > 0;
    let had_lines = |s: &Sheet| before.sheet_index(&s.id).is_some_and(|i| has_lines(&before.sheets[i]));
    !workbook.sheets.is_empty()
        && workbook.sheets.iter().all(|s| (has_lines(s) || !had_lines(s)) && names.insert(s.name.to_lowercase()))
}

/// The edits that take back `edits` (`editsThatTakeBackAllSince`, `editsThatUndo`), as answered.
pub fn edits_that_take_back(workbook: &Workbook, edits: &[Kept], taking: Taking) -> String {
    let mut after = workbook.clone();
    // Each edit's reverse taken back, last edit first.
    let mut taken: Vec<Vec<Op>> = Vec::new();
    match taking {
        Taking::AllSince => {
            let mut left: Vec<&Kept> = Vec::new();
            for edit in edits {
                // The edits it takes back exactly: its operations the reverses of the last ones left, last first.
                let mut reverses: Vec<Op> = Vec::new();
                let mut cancelled = 0;
                for (k, before) in left.iter().rev().enumerate() {
                    reverses.extend(before.reverse.iter().cloned());
                    if reverses.len() > edit.ops.len() {
                        break;
                    }
                    if reverses.len() == edit.ops.len() && super::same_ops(&edit.ops, &reverses) {
                        cancelled = k + 1;
                        break;
                    }
                }
                if cancelled > 0 {
                    left.truncate(left.len() - cancelled);
                } else {
                    left.push(edit);
                }
            }
            for edit in left.iter().rev() {
                if edit.ops.is_empty() || edit.reverse.is_empty() {
                    continue;
                }
                if history::lines_in_the_way(&after, &edit.reverse) {
                    return refused("reverseNotAccepted");
                }
                let sets_groups = |op: &Op| matches!(op, Op::SetRowGroups { .. } | Op::SetColumnGroups { .. });
                let before = edit.reverse.iter().any(sets_groups).then(|| after.clone());
                let Ok(again) = after.apply(&edit.reverse) else { return refused("reverseNotAccepted") };
                let nest = before.is_none_or(|before| history::groups_still_nest(&before, &after, &edit.reverse));
                if !nest || !fits(&edit.reverse, &again) {
                    return refused("reverseNotAccepted");
                }
                taken.push(edit.reverse.clone());
            }
        }
        Taking::Undo => {
            // What was done changed since, or a reverse is none, before an edit that cannot be queued.
            let mut fit = true;
            for edit in edits.iter().rev() {
                // What the edit did, all of it looked at before any is taken back.
                if !history::edit_holds(&after, &edit.ops) {
                    return refused("changedSince");
                }
                let (mut back, mut again) = (Vec::new(), Vec::new());
                // The browser's zone adopted stays: the reverse paired with adopting it is left out.
                for (op, reverse) in edit.ops.iter().rev().zip(&edit.reverse) {
                    if matches!(op, Op::AdoptTimeZone { .. }) {
                        continue;
                    }
                    match history::put_back(&mut after, std::slice::from_ref(reverse)) {
                        Ok(made) => again.extend(made),
                        Err(NotTaken::NotAReverse) => return refused("notAReverse"),
                        Err(_) => return refused("changedSince"),
                    }
                    back.push(reverse.clone());
                }
                if back.is_empty() {
                    continue;
                }
                fit &= fits(&back, &again);
                taken.push(back);
            }
            if !fit {
                return refused("reverseNotAccepted");
            }
        }
    }
    // Into edits to queue: whole reverses, as many as fit.
    let mut groups: Vec<Range<usize>> = Vec::new();
    let (mut ops_in_last, mut bytes_in_last) = (0, 0);
    for (i, ops) in taken.iter().enumerate() {
        let bytes = size(ops);
        let joins = ops_in_last + ops.len() <= OPS_IN_AN_EDIT && bytes_in_last + bytes - 1 <= BYTES_IN_AN_EDIT;
        match groups.last_mut() {
            Some(last) if joins => {
                last.end = i + 1;
                ops_in_last += ops.len();
                bytes_in_last += bytes - 1;
            }
            _ => {
                groups.push(i..i + 1);
                (ops_in_last, bytes_in_last) = (ops.len(), bytes);
            }
        }
        if groups.len() > EDITS_TO_QUEUE {
            return refused("tooMuchToTakeBack");
        }
    }
    // Each must leave the workbook whole and hide nothing under what it merges, once the ones before it are applied;
    // one that does not is split in two (the first half the smaller), down to single edits, which are refused. (Nothing
    // to take back is answered as it is, whatever the workbook.)
    let mut queued: Vec<Vec<Op>> = Vec::new();
    let leaves_well =
        |next: &Workbook, range: &Range<usize>| is_whole(workbook, next) && hides_nothing(next, &taken[range.clone()]);
    if let [only] = groups.as_slice() {
        // One edit to queue leaves the workbook as taking back left it.
        if leaves_well(&after, only) {
            queued.push(taken.concat());
            groups.clear();
        }
    }
    let mut state = workbook.clone();
    for group in groups {
        let mut ranges = vec![group];
        while let Some(range) = ranges.pop() {
            let ops = taken[range.clone()].concat();
            let mut next = state.clone();
            if next.apply(&ops).is_ok() && leaves_well(&next, &range) {
                queued.push(ops);
                state = next;
            } else if range.len() == 1 {
                return refused("reverseNotAccepted");
            } else {
                let middle = range.start + range.len() / 2;
                ranges.push(middle..range.end);
                ranges.push(range.start..middle);
            }
        }
    }
    if queued.len() > EDITS_TO_QUEUE {
        return refused("tooMuchToTakeBack");
    }
    // Each built on the revision the ones before it make.
    let edits: Vec<Json> = (workbook.revision..)
        .zip(queued)
        .map(|(base, ops)| json!({"v": version::of_ops(&ops), "base": base, "ops": ops}))
        .collect();
    json!({"kind": "editsThatTakeBack", "edits": edits}).to_string()
}

/// What a history is of: a cell, or a row.
pub enum Of {
    Cell(CellIds),
    Row(String),
}

/// The operations of an edit as recorded, when readable: its version one the session reads and the one they are
/// written in. Other fields than the version, the revision built on and the operations are not looked at.
fn recorded_ops(edit: &Json) -> Option<Vec<Op>> {
    #[derive(Deserialize)]
    struct Recorded {
        v: u32,
        #[allow(dead_code)]
        base: u64,
        ops: Vec<Op>,
    }
    let Recorded { v, ops, .. } = Recorded::deserialize(edit).ok()?;
    let readable =
        v >= version::OLDEST && version::is_known(v) && !ops.is_empty() && ops.iter().all(Op::is_well_formed);
    (readable && version::of_ops(&ops) == v).then_some(ops)
}

/// A cell watched: what it holds now, and the oldest edit read that sets it, with what it set (the cell after it),
/// whose change is not known until an older one is read, or the start.
struct Watched {
    column: LineId,
    now: Option<Input>,
    later: Option<(usize, Option<Input>)>,
}

/// The history of a cell or a row (`historyOfACell`, `historyOfARow`), as answered.
pub fn history_of(workbook: &Workbook, sheet_id: &str, of: Of, edits: &[Json]) -> String {
    let Some(s) = workbook.sheet_index(sheet_id) else { return refused("unknownSheet") };
    let (sheet, bases) = (&workbook.sheets[s], &workbook.bases);
    let r = match &of {
        Of::Cell(cell) => &cell.r,
        Of::Row(r) => r,
    };
    let Some(row) = bases.parse(r).filter(|&l| sheet.rows.position(l).is_some()) else { return refused("unknownRow") };
    let columns: Vec<LineId> = match &of {
        Of::Cell(cell) => match bases.parse(&cell.c).filter(|&l| sheet.columns.position(l).is_some()) {
            Some(column) => vec![column],
            None => return refused("unknownColumn"),
        },
        Of::Row(_) => (0..sheet.columns.len()).filter_map(|p| sheet.columns.line(p)).collect(),
    };
    if edits.len() as u64 != workbook.revision {
        return refused("historyDoesNotMatch");
    }
    let held = |column: LineId| sheet.cells.get(&(row, column)).map(|cell| cell.input.clone());
    let mut watched: Vec<Watched> =
        columns.iter().map(|&column| Watched { column, now: held(column), later: None }).collect();
    let at: HashMap<LineId, usize> = columns.iter().enumerate().map(|(i, &c)| (c, i)).collect();
    // Edits read whose change is not known yet (by how many cells), and the changes known, by edit.
    let mut unknown: BTreeMap<usize, usize> = BTreeMap::new();
    let mut changes: BTreeMap<usize, Vec<(usize, Option<Input>)>> = BTreeMap::new();
    let mut is_cut = false;
    for k in (0..edits.len()).rev() {
        let Some(ops) = recorded_ops(&edits[k]) else { return refused("historyDoesNotMatch") };
        // What the edit leaves in the cells watched: the last it sets them to.
        let mut set: BTreeMap<usize, Option<Input>> = BTreeMap::new();
        for op in &ops {
            let Op::SetCells { sheet_id: id, cells, .. } = op else { continue };
            if id != sheet_id {
                continue;
            }
            for cell in cells {
                if bases.parse(&cell.r) != Some(row) {
                    continue;
                }
                if let Some(&i) = bases.parse(&cell.c).and_then(|c| at.get(&c)) {
                    set.insert(i, cell.input.clone());
                }
            }
        }
        for (i, value) in set {
            let cell = &mut watched[i];
            match cell.later.take() {
                // The newest edit that sets the cell sets what it holds now.
                None if value != cell.now => return refused("historyDoesNotMatch"),
                None => {}
                Some((j, after)) => {
                    if after != value {
                        changes.entry(j).or_default().push((i, after));
                    }
                    if let Some(n) = unknown.get_mut(&j) {
                        *n -= 1;
                        if *n == 0 {
                            unknown.remove(&j);
                        }
                    }
                }
            }
            cell.later = Some((k, value));
            *unknown.entry(k).or_default() += 1;
        }
        // The newest changes are known once every edit after the oldest of them is.
        let known = match unknown.keys().next_back() {
            Some(&newest) => changes.range(newest + 1..).count(),
            None => changes.len(),
        };
        if known > CHANGES_TOLD {
            is_cut = true;
            break;
        }
    }
    if !is_cut {
        for (i, cell) in watched.iter().enumerate() {
            match &cell.later {
                Some((j, after)) if after.is_some() => changes.entry(*j).or_default().push((i, after.clone())),
                Some(_) => {}
                None if cell.now.is_some() => return refused("historyDoesNotMatch"),
                None => {}
            }
        }
    }
    let locale = crate::locale::find(&workbook.locale).unwrap_or_else(crate::locale::en_us);
    let content = |column: LineId, input: &Option<Input>| -> Option<Json> {
        let cell = Cell::new(input.clone()?);
        serde_json::to_value(workbook.cell_contents(s, (row, column), &cell, locale, false)).ok()
    };
    let are_earlier_left_out = is_cut || changes.len() > CHANGES_TOLD;
    let changes: Vec<Json> = changes
        .into_iter()
        .rev()
        .take(CHANGES_TOLD)
        .map(|(j, mut cells)| {
            cells.sort_by_key(|(i, _)| *i);
            let revision = j as u64 + 1;
            match &of {
                Of::Cell(_) => {
                    let (i, input) = &cells[0];
                    match content(watched[*i].column, input) {
                        Some(content) => json!({"revision": revision, "content": content}),
                        None => json!({"revision": revision}),
                    }
                }
                Of::Row(_) => {
                    let cells: Vec<Json> = cells
                        .iter()
                        .map(|(i, input)| {
                            let column = watched[*i].column;
                            match content(column, input) {
                                Some(content) => json!({"c": bases.text(column), "content": content}),
                                None => json!({"c": bases.text(column)}),
                            }
                        })
                        .collect();
                    json!({"revision": revision, "cells": cells})
                }
            }
        })
        .collect();
    let kind = match of {
        Of::Cell(_) => "historyOfACell",
        Of::Row(_) => "historyOfARow",
    };
    json!({"kind": kind, "changes": changes, "areEarlierLeftOut": are_earlier_left_out}).to_string()
}
