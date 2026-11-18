//! A table as the page names it by ids (`TableInIds`, what readTableAtCell answers and the filter reads are given),
//! and where it lies now: its columns, and its body's rows from the first under the header to the last.
//!
//! The ids must be the sheet's (`unknownRow`, `unknownColumn`), deleted or not. A header row deleted leaves the
//! table without the header the filter was made for (`headerOfFilteredTableIsGone`, when all its rows are). The
//! body starts under the header (or at its first row, when the table has no header) and ends at its last row, or
//! just above the row under it when one is named; with none named, it goes on down while the next row has something
//! in the table's columns. A deleted row is where it was: a first row, at the next row not deleted; a last row, at
//! the row before; a body whose rows are all deleted is gone, or with a header, starts empty under it. A body with
//! no row left is `filteredTableIsGone`.

use serde::Deserialize;

use super::values::SheetValues;
use crate::ids::{Axis, LineId};
use crate::workbook::layout::{live_ends, merged_boxes, written};
use crate::workbook::{Sheet, Workbook};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TableInIds {
    pub sheet_id: String,
    #[serde(deserialize_with = "written::maybe_null")]
    pub header: Option<HeaderInIds>,
    pub first_column: String,
    pub last_column: String,
    pub first_row_of_body: String,
    pub last_row_of_body: String,
    #[serde(deserialize_with = "written::maybe_null")]
    pub row_under_the_body: Option<String>,
    pub runs: Vec<RunInIds>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HeaderInIds {
    pub first_row: String,
    pub last_row: String,
    /// Read for the request's shape: no answer depends on it.
    #[allow(dead_code)]
    pub is_sure: bool,
}

/// Rows of the body that play a part: a record, a spacer between them, a section's title, a subtotal, or the
/// header again.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RunInIds {
    pub first_row: String,
    pub last_row: String,
    pub role: Role,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Role {
    Record,
    Spacer,
    Section,
    Subtotal,
    HeaderAgain,
}

/// A table where it lies now, by positions.
pub(crate) struct LiveTable<'a> {
    pub sheet: &'a Sheet,
    /// The first and last columns.
    pub columns: (usize, usize),
    /// The first and last rows of the body.
    pub body: (usize, usize),
    /// Each row of the body's part: a section's title, a subtotal or the header again, from the run that names it so
    /// and starts first (records and spacers are what their rows show).
    pub roles: Vec<Option<Role>>,
}

/// The sheet a table is on (`unknownSheet`).
pub(crate) fn sheet_of<'a>(workbook: &'a Workbook, table: &TableInIds) -> Result<&'a Sheet, &'static str> {
    workbook.sheet_index(&table.sheet_id).map(|i| &workbook.sheets[i]).ok_or("unknownSheet")
}

/// A line the axis has had, deleted or not.
fn known(workbook: &Workbook, axis: &Axis, id: &str, refusal: &'static str) -> Result<LineId, &'static str> {
    workbook.bases.parse(id).filter(|&l| axis.knows(l)).ok_or(refusal)
}

/// Where a line is, or the next line not deleted after it (the axis's end when there is none).
fn at_or_after(axis: &Axis, line: LineId) -> usize {
    axis.snap_forward(line).unwrap_or(axis.len())
}

/// Where a line is, or the line not deleted before it (-1 when there is none).
fn at_or_before(axis: &Axis, line: LineId) -> isize {
    match axis.position(line) {
        Some(p) => p as isize,
        None => at_or_after(axis, line) as isize - 1,
    }
}

/// Two lines in the axis's order.
fn in_order(axis: &Axis, a: LineId, b: LineId) -> (LineId, LineId) {
    if axis.index(a) <= axis.index(b) {
        (a, b)
    } else {
        (b, a)
    }
}

/// Where a table lies now.
pub(crate) fn live<'a>(
    workbook: &Workbook,
    sheet: &'a Sheet,
    values: &SheetValues,
    table: &TableInIds,
) -> Result<LiveTable<'a>, &'static str> {
    let rows = &sheet.rows;
    let header = match &table.header {
        Some(h) => {
            let first = known(workbook, rows, &h.first_row, "unknownRow")?;
            Some((first, known(workbook, rows, &h.last_row, "unknownRow")?))
        }
        None => None,
    };
    let first_row = known(workbook, rows, &table.first_row_of_body, "unknownRow")?;
    let last_row = known(workbook, rows, &table.last_row_of_body, "unknownRow")?;
    let under = match &table.row_under_the_body {
        Some(r) => Some(known(workbook, rows, r, "unknownRow")?),
        None => None,
    };
    let mut runs = Vec::new();
    for run in &table.runs {
        let a = known(workbook, rows, &run.first_row, "unknownRow")?;
        let b = known(workbook, rows, &run.last_row, "unknownRow")?;
        runs.push((in_order(rows, a, b), run.role));
    }
    let first_column = known(workbook, &sheet.columns, &table.first_column, "unknownColumn")?;
    let last_column = known(workbook, &sheet.columns, &table.last_column, "unknownColumn")?;
    let header_end = match header {
        Some((a, b)) => Some(live_ends(rows, a, b).ok_or("headerOfFilteredTableIsGone")?.1),
        None => None,
    };
    let columns = live_ends(&sheet.columns, first_column, last_column).ok_or("filteredTableIsGone")?;
    let ends = live_ends(rows, first_row, last_row);
    // The body's first row, and its last before the row under it or the rows below that show something: none when
    // its rows are all deleted, but for a header's, under which the body starts empty.
    let (first, last) = match header_end {
        Some(h) => {
            let last = ends.map_or(h, |(_, b)| b);
            if h > last {
                return Err("filteredTableIsGone");
            }
            (h as isize + 1, Some(last as isize))
        }
        None => match ends {
            Some((a, b)) => (a as isize, Some(b as isize)),
            None => (at_or_after(rows, in_order(rows, first_row, last_row).0) as isize, None),
        },
    };
    let last = match under {
        Some(u) => last.unwrap_or(-1).max(at_or_after(rows, u) as isize - 1),
        None => {
            let mut last = last.ok_or("filteredTableIsGone")?;
            let merged = merged_boxes(&workbook.bases, sheet);
            while last + 1 < rows.len() as isize && values.row_shows(&merged, last as usize + 1, columns) {
                last += 1;
            }
            last
        }
    };
    if first > last {
        return Err("filteredTableIsGone");
    }
    let body = (first as usize, last as usize);
    let mut roles = vec![None; body.1 - body.0 + 1];
    runs.sort_by_key(|((a, _), _)| at_or_after(rows, *a));
    for ((a, b), role) in runs {
        if matches!(role, Role::Record | Role::Spacer) {
            continue;
        }
        let (a, b) = (at_or_after(rows, a) as isize, at_or_before(rows, b));
        for r in a.max(first)..=b.min(last) {
            roles[(r - first) as usize].get_or_insert(role);
        }
    }
    Ok(LiveTable { sheet, columns, body, roles })
}
