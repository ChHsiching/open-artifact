//! The cell tables as the page reads them (readCellTables, readCellTableAt, readCellTableDeclaredAs): a cell table
//! declared, or one guessed around a cell, with the table it holds. A cell table names its header's rows and its
//! columns, and may name its footer's rows; the table it holds widens to the columns showing something right of its
//! own along its header's last row, and its body runs from under the header down to its footer, or else down to the
//! last block of rows (blank rows between) the guess reads as more of it, short of the next cell table below.
//!
//! The declared ones are those the sheet shows, top down and then left to right, but for one whose header holds
//! nothing and shows nothing. Around a cell, a declared one holding the cell is read first; else the table guessed
//! around the cell gives one, its header the guess's, or else the first row of the block of rows holding the cell.

use std::collections::BTreeMap;

use serde_json::{json, Value as Json};

use super::super::live::Role;
use super::grid::Grid;
use super::runs::{HeaderRows, Run, Table};
use super::{columns_in_ids, table_in_ids};
use crate::workbook::layout::live_ends;
use crate::workbook::objects::{CellTable, RowsOfACellTable};
use crate::workbook::{Sheet, Workbook};

/// A cell table where it is now, by positions: its header's rows, its columns, and its footer's rows if it has any
/// left (each pair first to last).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Placed {
    header: (usize, usize),
    columns: (usize, usize),
    footer: Option<(usize, usize)>,
}

/// The rows and columns a cell table takes: from its header's first row to its footer's last (its header's last when
/// it has none), and its columns.
#[derive(Clone, Copy, Debug)]
struct Area {
    top: usize,
    bottom: usize,
    left: usize,
    right: usize,
}

impl Area {
    fn meets(&self, other: &Area) -> bool {
        other.top <= self.bottom && self.top <= other.bottom && other.left <= self.right && self.left <= other.right
    }
}

impl Placed {
    /// Where a cell table is now: none when its header's rows or its columns are all deleted, or its footer is not
    /// under its header (a footer all deleted is left out).
    fn of(workbook: &Workbook, sheet: &Sheet, t: &CellTable) -> Option<Placed> {
        let bases = &workbook.bases;
        let rows = |r: &RowsOfACellTable| live_ends(&sheet.rows, bases.parse(&r.first_row)?, bases.parse(&r.last_row)?);
        let header = rows(&t.header_rows)?;
        let columns = live_ends(&sheet.columns, bases.parse(&t.first_column)?, bases.parse(&t.last_column)?)?;
        let footer = t.footer_rows.as_ref().and_then(rows);
        if footer.is_some_and(|(first, _)| first <= header.1) {
            return None;
        }
        Some(Placed { header, columns, footer })
    }

    fn area(&self) -> Area {
        let (first, last) = self.header;
        let bottom = self.footer.map_or(last, |(_, last)| last);
        Area { top: first.min(bottom), bottom: first.max(bottom), left: self.columns.0, right: self.columns.1 }
    }

    /// The cell table by the ids of the rows and columns where it is.
    fn in_ids(&self, workbook: &Workbook, sheet: &Sheet) -> Option<CellTable> {
        let row = |r: usize| sheet.rows.line(r).map(|l| workbook.bases.text(l));
        let column = |c: usize| sheet.columns.line(c).map(|l| workbook.bases.text(l));
        let rows = |(first, last): (usize, usize)| Some(RowsOfACellTable { first_row: row(first)?, last_row: row(last)? });
        Some(CellTable {
            header_rows: rows(self.header)?,
            first_column: column(self.columns.0)?,
            last_column: column(self.columns.1)?,
            footer_rows: match self.footer {
                Some(footer) => Some(rows(footer)?),
                None => None,
            },
        })
    }
}

/// The table a cell table holds: its header's rows, whether the header is sure, its columns (widened), its body's
/// first and last rows, the row under its body (its footer's first, or the first of a cell table right below), and
/// whether the rows showing nothing in its body are told as spacers.
#[derive(Clone, Copy, Debug)]
struct Reading {
    header: (usize, usize),
    is_sure: bool,
    columns: (usize, usize),
    body: Option<(usize, usize)>,
    under: Option<usize>,
    tells_gaps: bool,
}

impl Reading {
    /// Whether a cell is in the table, its header to its body's last row or its footer's, whichever is lower.
    fn holds(&self, row: usize, column: usize, footer: Option<(usize, usize)>) -> bool {
        let (first, last) = self.header;
        let bottom = [Some(last), self.body.map(|b| b.1), footer.map(|f| f.1)].into_iter().flatten().max().unwrap_or(last);
        let (top, bottom) = (first.min(bottom), first.max(bottom));
        let (left, right) = (self.columns.0.min(self.columns.1), self.columns.0.max(self.columns.1));
        top <= row && row <= bottom && left <= column && column <= right
    }
}

/// A cell table the sheet declares: its id, as declared, and where it is.
struct Declared<'a> {
    id: &'a str,
    table: &'a CellTable,
    placed: Placed,
}

/// A sheet's cells as the guess reads them, with the cell tables it declares.
struct CellTables<'a> {
    workbook: &'a Workbook,
    sheet: &'a Sheet,
    grid: Grid<'a>,
    declared: Vec<Declared<'a>>,
}

impl<'a> CellTables<'a> {
    fn of(workbook: &'a Workbook, sheet: &'a Sheet) -> CellTables<'a> {
        let grid = Grid::of(workbook, sheet);
        let mut declared: Vec<Declared> = sheet
            .cell_tables
            .values()
            .filter_map(|(id, t)| Some(Declared { id, table: t, placed: Placed::of(workbook, sheet, t)? }))
            .collect();
        declared.sort_by_key(|d| (d.placed.header.0, d.placed.columns.0));
        let mut tables = CellTables { workbook, sheet, grid, declared: Vec::new() };
        for d in declared {
            let area = d.placed.area();
            if !tables.gives_way(&d.placed) && !tables.declared.iter().any(|other| other.placed.area().meets(&area)) {
                tables.declared.push(d);
            }
        }
        tables
    }

    /// Whether a cell table is not read: its header's rows hold no input in its columns (an empty text counts) and
    /// show nothing there (a merged range's top left neither).
    fn gives_way(&self, placed: &Placed) -> bool {
        let (top, bottom) = placed.header;
        let (left, right) = placed.columns;
        let (rows, columns) = (&self.sheet.rows, &self.sheet.columns);
        let holds = self.sheet.cells.keys().any(|&(r, c)| {
            rows.position(r).is_some_and(|r| top <= r && r <= bottom)
                && columns.position(c).is_some_and(|c| left <= c && c <= right)
        });
        !holds && self.grid.rows_showing(top, bottom, left, right).is_empty()
    }

    /// The table a cell table holds, the other declared ones (all but the one named) bounding it.
    fn reading(&self, placed: &Placed, except: Option<&str>) -> Reading {
        let grid = &self.grid;
        let others: Vec<Area> = self.declared.iter().filter(|d| Some(d.id) != except).map(|d| d.placed.area()).collect();
        let (first, last) = placed.header;
        let (left, mut right) = placed.columns;
        let area = placed.area();
        // The columns showing something right after its own along the header's last row widen it, up to the column
        // before the nearest cell table right of it beside its rows.
        let room = others
            .iter()
            .filter(|o| o.top <= area.bottom && area.top <= o.bottom && o.left > right)
            .map(|o| o.left)
            .min()
            .map_or(grid.last_column, |o| o.saturating_sub(1));
        if let Some(next) = right.checked_add(1).filter(|&next| next <= room) {
            if let Some(&(from, to)) = grid.columns_showing(last, next, room).first() {
                if from == next {
                    right = to;
                }
            }
        }
        let from = last.saturating_add(1);
        let reading = |body: Option<(usize, usize)>, under: Option<usize>, tells_gaps: bool| Reading {
            header: (first, last),
            is_sure: true,
            columns: (left, right),
            body: body.filter(|(from, to)| from <= to),
            under,
            tells_gaps,
        };
        if let Some((footer, _)) = placed.footer {
            return reading(footer.checked_sub(1).map(|to| (from, to)), Some(footer), true);
        }
        // The body ends above the nearest cell table below its header across its columns.
        let below = others.iter().filter(|o| o.left <= right && left <= o.right && o.top > last).map(|o| o.top).min();
        let bound = below.map_or(grid.last_row, |b| b.saturating_sub(1));
        let under = |to: usize| below.filter(|_| to == bound);
        let block = grid.block_end(from, bound, left, right);
        let after = block.map_or(from, |end| end.saturating_add(1)).saturating_add(1);
        if after > bound || grid.rows_showing(after, bound, left, right).is_empty() {
            return reading(block.map(|to| (from, to)), block.and_then(under), false);
        }
        // Rows show below a blank one: the body goes on to the end of what the guess around the header reads as its
        // records, and then to the end of the block of rows after them.
        let records_end = grid
            .columns_showing(last, left, right)
            .first()
            .and_then(|&(column, _)| grid.table_at(last, column))
            .filter(|guess| guess.from <= from && from <= guess.to)
            .and_then(|guess| last_kept(&guess.runs, from))
            .map(|run| bound.min(run.last));
        let to = match grid.block_end(records_end.map_or(from, |end| end.saturating_add(1)), bound, left, right) {
            Some(to) => Some(to),
            None => records_end
                .filter(|&end| from <= end)
                .and_then(|end| grid.rows_showing(from, end, left, right).last().map(|&(_, to)| to)),
        };
        match to {
            Some(to) => reading(Some((from, to)), under(to), true),
            None => reading(None, None, true),
        }
    }

    /// The rows showing nothing in a table's body, told as spacers.
    fn gaps(&self, reading: &Reading) -> Vec<(usize, usize)> {
        let Some((from, to)) = reading.body.filter(|_| reading.tells_gaps) else { return Vec::new() };
        let (left, right) = reading.columns;
        let mut gaps = Vec::new();
        let mut next = from;
        for (first, last) in self.grid.rows_showing(from, to, left, right).into_iter().chain([(to.saturating_add(1), to)]) {
            if next < first {
                gaps.push((next, first - 1));
            }
            next = last.saturating_add(1);
        }
        gaps
    }

    /// A cell table as the page reads it: its id (none for one guessed), as declared, where it is now, and the table
    /// it holds with its columns (none without a body).
    fn answer(&self, id: Option<&str>, cell_table: &CellTable, placed: &Placed, reading: &Reading) -> Json {
        let (workbook, sheet) = (self.workbook, self.sheet);
        let table = reading.body.map(|(from, to)| {
            let header = Some(HeaderRows { first: reading.header.0, last: reading.header.1, is_sure: reading.is_sure });
            let (first_column, last_column) = reading.columns;
            let spacers = self.gaps(reading).into_iter().map(|(first, last)| Run { first, last, role: Role::Spacer });
            let shown = Table { header, first_column, last_column, from, to, runs: spacers.collect() };
            let records = Table { runs: vec![Run { first: from, last: to, role: Role::Record }], ..shown.clone() };
            let columns = columns_in_ids(workbook, sheet, &self.grid, &records);
            json!({"table": table_in_ids(workbook, sheet, &shown, reading.under), "columns": columns})
        });
        json!({
            "cellTableId": id,
            "cellTable": cell_table,
            "liveCellTable": placed.in_ids(workbook, sheet),
            "table": table,
        })
    }

    /// The cell table made of a header's rows and a guessed table's columns, when it holds the cell and meets no
    /// declared one; with a footer from under the guessed body to the end of its own, when no gap lies between.
    fn guessed(&self, guess: &Table, header: HeaderRows, row: usize, column: usize) -> Option<Json> {
        let build = |footer: Option<(usize, usize)>| {
            let placed = Placed { header: (header.first, header.last), columns: (guess.first_column, guess.last_column), footer };
            let cell_table = placed.in_ids(self.workbook, self.sheet)?;
            Some((cell_table, placed, self.reading(&placed, None)))
        };
        let (mut cell_table, mut placed, mut reading) = build(None)?;
        let area = placed.area();
        if self.declared.iter().any(|d| d.placed.area().meets(&area)) {
            return None;
        }
        let footer_first = guess.to.saturating_add(1);
        let mut footer = None;
        if let Some((from, to)) = reading.body {
            if from < footer_first && footer_first <= to && self.gaps(&reading).iter().all(|g| g.1 < footer_first) {
                footer = Some((footer_first, to));
                (cell_table, placed, reading) = build(footer)?;
            }
        }
        reading.is_sure = header.is_sure;
        reading.holds(row, column, footer).then(|| self.answer(None, &cell_table, &placed, &reading))
    }
}

/// The last run, from the one reaching a row on, before a section, a subtotal or the header again that comes after a
/// spacer; spacers left out.
fn last_kept(runs: &[Run], from: usize) -> Option<Run> {
    let i = runs.iter().position(|r| r.last >= from)?;
    let mut spaced = runs[i].role == Role::Spacer;
    let mut kept = (!spaced).then_some(runs[i]);
    for &run in &runs[i + 1..] {
        if spaced && !matches!(run.role, Role::Record | Role::Spacer) {
            break;
        }
        if run.role != Role::Spacer {
            kept = Some(run);
        }
        spaced |= run.role == Role::Spacer;
    }
    kept
}

/// The cell tables a sheet declares where they are now, top down and then left to right (readTablesOfSheet): each
/// one's id, header rows, columns and footer rows.
pub(super) fn declared_places(workbook: &Workbook, sheet: &Sheet) -> Vec<(String, (usize, usize), (usize, usize), Option<(usize, usize)>)> {
    let mut declared: Vec<Declared> = sheet
        .cell_tables
        .values()
        .filter_map(|(id, t)| Some(Declared { id, table: t, placed: Placed::of(workbook, sheet, t)? }))
        .collect();
    declared.sort_by_key(|d| (d.placed.header.0, d.placed.columns.0));
    declared.into_iter().map(|d| (d.id.to_string(), d.placed.header, d.placed.columns, d.placed.footer)).collect()
}

/// Whether a person put something in a cell from one row to another and from one column to another.
pub(super) fn holds_input(sheet: &Sheet, (top, bottom): (usize, usize), (left, right): (usize, usize)) -> bool {
    let (rows, columns) = (&sheet.rows, &sheet.columns);
    sheet.cells.keys().any(|&(r, c)| {
        rows.position(r).is_some_and(|r| top <= r && r <= bottom) && columns.position(c).is_some_and(|c| left <= c && c <= right)
    })
}

/// The cell tables a sheet declares, as the page reads them.
pub(in super::super) fn cell_tables(workbook: &Workbook, sheet: &Sheet) -> Vec<Json> {
    let tables = CellTables::of(workbook, sheet);
    tables
        .declared
        .iter()
        .map(|d| tables.answer(Some(d.id), d.table, &d.placed, &tables.reading(&d.placed, Some(d.id))))
        .collect()
}

/// The cell table holding a cell: a declared one, or one guessed around it; null when there is none.
pub(in super::super) fn cell_table_at(workbook: &Workbook, sheet: &Sheet, row: usize, column: usize) -> Json {
    let tables = CellTables::of(workbook, sheet);
    for d in &tables.declared {
        let p = &d.placed;
        if p.header.0 > row || p.columns.0 > column || p.footer.is_some_and(|(_, last)| row > last) {
            continue;
        }
        let reading = tables.reading(p, Some(d.id));
        if reading.holds(row, column, p.footer) {
            return tables.answer(Some(d.id), d.table, p, &reading);
        }
    }
    let Some(guess) = tables.grid.table_at(row, column) else { return Json::Null };
    let header = guess.header.unwrap_or(HeaderRows { first: guess.from, last: guess.from, is_sure: false });
    if let Some(answer) = tables.guessed(&guess, header, row, column) {
        return answer;
    }
    // Else the header is the first row of the block of rows holding the cell, below the guess's header and the
    // declared cell tables above across its columns.
    let next = header.last.saturating_add(1);
    if row < next {
        return Json::Null;
    }
    let (left, right) = (guess.first_column, guess.last_column);
    let top = tables
        .declared
        .iter()
        .map(|d| d.placed.area())
        .filter(|a| a.left <= right && left <= a.right && a.bottom < row)
        .fold(next, |top, a| top.max(a.bottom + 1));
    match tables.grid.rows_showing(top, row, left, right).last() {
        Some(&(first, last)) if last == row && first != next => {
            let header = HeaderRows { first, last: first, is_sure: false };
            tables.guessed(&guess, header, row, column).unwrap_or(Json::Null)
        }
        _ => Json::Null,
    }
}

/// A cell table a sheet declares, as the suggestions of conditional formats read it: the rows and columns it takes
/// (top, left, bottom, right: its header's first row to its body's, its header's or its footer's last, whichever is
/// lower, across its columns widened), and its records when it has a body.
pub(in crate::session::reads) struct DeclaredTable {
    pub(in crate::session::reads) area: (usize, usize, usize, usize),
    pub(in crate::session::reads) records: Option<DeclaredRecords>,
}

/// The records of a declared cell table: its body's rows, its columns, how many of its rows are told as spacers,
/// and the names its columns have.
pub(in crate::session::reads) struct DeclaredRecords {
    pub(in crate::session::reads) rows: (usize, usize),
    pub(in crate::session::reads) columns: (usize, usize),
    pub(in crate::session::reads) gaps: usize,
    pub(in crate::session::reads) names: BTreeMap<usize, String>,
}

/// The cell tables a sheet declares, as the suggestions of conditional formats read them, in the order they are read.
pub(in crate::session::reads) fn declared_tables(workbook: &Workbook, sheet: &Sheet) -> Vec<DeclaredTable> {
    let tables = CellTables::of(workbook, sheet);
    let declared = tables.declared.iter().map(|d| {
        let reading = tables.reading(&d.placed, Some(d.id));
        let (first, last) = reading.header;
        let ends = [Some(last), reading.body.map(|b| b.1), d.placed.footer.map(|f| f.1)];
        let bottom = ends.into_iter().flatten().max().unwrap_or(last);
        let (left, right) = (reading.columns.0.min(reading.columns.1), reading.columns.0.max(reading.columns.1));
        let records = reading.body.map(|(from, to)| {
            let header = Some(HeaderRows { first, last, is_sure: reading.is_sure });
            let (first_column, last_column) = reading.columns;
            let runs = vec![Run { first: from, last: to, role: Role::Record }];
            let table = Table { header, first_column, last_column, from, to, runs };
            let names = tables.grid.columns(&table).into_iter().filter_map(|c| Some((c.column, c.name?))).collect();
            let gaps = tables.gaps(&reading).iter().fold(0usize, |n, &(a, b)| n.saturating_add(b - a + 1));
            DeclaredRecords { rows: (from, to), columns: reading.columns, gaps, names }
        });
        DeclaredTable { area: (first.min(bottom), left, first.max(bottom), right), records }
    });
    declared.collect()
}

/// The cell table a sheet would declare: null when it is not shown, or its header holds nothing and shows nothing.
pub(in super::super) fn cell_table_declared_as(workbook: &Workbook, sheet: &Sheet, t: &CellTable) -> Json {
    let tables = CellTables::of(workbook, sheet);
    match Placed::of(workbook, sheet, t) {
        Some(placed) if !tables.gives_way(&placed) => tables.answer(None, t, &placed, &tables.reading(&placed, None)),
        _ => Json::Null,
    }
}
