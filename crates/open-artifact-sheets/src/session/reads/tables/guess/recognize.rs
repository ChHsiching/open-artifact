//! The tables a sheet's cells make, as they are recognized (readTablesOfSheet): the cell tables it declares,
//! then the blocks of its content (cut apart by blank rows and columns), each read as a table with a header over its
//! records when one proves itself, or else assumed one with the reason it is not recognized.

use serde_json::{json, Value as Json};

use super::grid::Grid;
use crate::workbook::{Sheet as WorkbookSheet, Workbook};

mod blocks;
mod body;
mod check;
mod driver;
mod header;
mod sheet;

use sheet::Sheet;

/// Why a table is assumed rather than recognized, in this order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub(super) enum Reason {
    OneColumn,
    NoHeadings,
    ColumnWithoutAHeading,
    TwoColumnsOfOneName,
    MergedCellsAmongRecords,
    RowUnderTheTotal,
    SumOfSomeRecords,
    SumRunsOverHeadings,
    FewerThanTwoRecords,
    LabelsPastABlankColumn,
    HeadingComesAgain,
    MayBeLabelsAndValues,
    NothingProvesTheHeader,
}

impl Reason {
    fn name(self) -> &'static str {
        match self {
            Reason::OneColumn => "oneColumn",
            Reason::NoHeadings => "noHeadings",
            Reason::ColumnWithoutAHeading => "columnWithoutAHeading",
            Reason::TwoColumnsOfOneName => "twoColumnsOfOneName",
            Reason::MergedCellsAmongRecords => "mergedCellsAmongRecords",
            Reason::RowUnderTheTotal => "rowUnderTheTotal",
            Reason::SumOfSomeRecords => "sumOfSomeRecords",
            Reason::SumRunsOverHeadings => "sumRunsOverHeadings",
            Reason::FewerThanTwoRecords => "fewerThanTwoRecords",
            Reason::LabelsPastABlankColumn => "labelsPastABlankColumn",
            Reason::HeadingComesAgain => "headingComesAgain",
            Reason::MayBeLabelsAndValues => "mayBeLabelsAndValues",
            Reason::NothingProvesTheHeader => "nothingProvesTheHeader",
        }
    }
}

/// What a table is taken from.
#[derive(Clone, Debug)]
pub(super) enum Basis {
    Recognized,
    Assumed(Reason),
    Declared(String),
}

/// The part a run of a table's body plays, in this order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub(super) enum Role {
    Record,
    SectionLabel,
    Subtotal,
    Blank,
}

impl Role {
    fn name(self) -> &'static str {
        match self {
            Role::Record => "record",
            Role::SectionLabel => "sectionLabel",
            Role::Subtotal => "subtotal",
            Role::Blank => "blank",
        }
    }
}

/// A run of a table's body: its first and last rows and its part.
#[derive(Clone, Copy, Debug)]
pub(super) struct Run {
    pub first: usize,
    pub last: usize,
    pub role: Role,
}

/// Adds a run to a body: one of the part of the last run lengthens it.
pub(super) fn push_run(runs: &mut Vec<Run>, first: usize, last: usize, role: Role) {
    if let Some(prev) = runs.last_mut() {
        if prev.role == role {
            prev.last = last;
            return;
        }
    }
    runs.push(Run { first, last, role });
}

/// A table found in a sheet, by positions.
#[derive(Clone, Debug)]
pub(super) struct Found {
    pub header: (usize, usize),
    pub columns: (usize, usize),
    pub body: Vec<Run>,
    pub footer: Option<(usize, usize)>,
    pub basis: Basis,
}

impl Found {
    /// The range a table takes: its header's first row to its footer's last, or else its body's, or else its
    /// header's.
    fn area(&self) -> sheet::Rect {
        let bottom = match (self.footer, self.body.last()) {
            (Some((_, last)), _) => last,
            (None, Some(run)) => run.last,
            (None, None) => self.header.1,
        };
        let (first, last) = self.columns;
        sheet::Rect { top: bottom.min(self.header.0), left: last.min(first), bottom: bottom.max(self.header.0), right: last.max(first) }
    }
}

/// The tables of a sheet, as the page reads them.
pub(in super::super) fn tables_of_sheet(workbook: &Workbook, sheet: &WorkbookSheet) -> Vec<Json> {
    let grid = Grid::of(workbook, sheet);
    let reading = Sheet::of(&grid);
    let found = reading.tables(sheet);
    found.iter().filter_map(|t| in_ids(workbook, sheet, &grid, t)).collect()
}

/// A table by the ids of its rows and columns, with its columns' names and kinds; none when a row or column it
/// names is gone.
fn in_ids(workbook: &Workbook, sheet: &WorkbookSheet, grid: &Grid, t: &Found) -> Option<Json> {
    let row = |r: usize| sheet.rows.line(r).map(|l| workbook.bases.text(l));
    let column = |c: usize| sheet.columns.line(c).map(|l| workbook.bases.text(l));
    let records: Vec<(usize, usize)> = t.body.iter().filter(|r| r.role == Role::Record).map(|r| (r.first, r.last)).collect();
    let columns = grid.recognized_columns(t.header, t.columns.0, t.columns.1, &records);
    let (h1, h2, c1, c2) = (row(t.header.0)?, row(t.header.1)?, column(t.columns.0)?, column(t.columns.1)?);
    let columns = columns
        .into_iter()
        .map(|c| Some(json!({"c": column(c.column)?, "name": c.name, "kind": c.kind.name()})))
        .collect::<Option<Vec<Json>>>()?;
    let body = t
        .body
        .iter()
        .map(|r| Some(json!({"firstRow": row(r.first)?, "lastRow": row(r.last)?, "role": r.role.name()})))
        .collect::<Option<Vec<Json>>>()?;
    let footer = match t.footer {
        Some((first, last)) => json!({"firstRow": row(first)?, "lastRow": row(last)?}),
        None => Json::Null,
    };
    let basis = match &t.basis {
        Basis::Recognized => json!({"kind": "recognized"}),
        Basis::Assumed(reason) => json!({"kind": "assumed", "whyNotRecognized": reason.name()}),
        Basis::Declared(id) => json!({"kind": "declared", "cellTableId": id}),
    };
    Some(json!({
        "basis": basis,
        "headerRows": {"firstRow": h1, "lastRow": h2},
        "firstColumn": c1,
        "lastColumn": c2,
        "columns": columns,
        "body": body,
        "footerRows": footer,
    }))
}

