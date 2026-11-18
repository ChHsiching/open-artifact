//! The page's guess at the table around a cell (readTableAtCell): the block of cells around it, its header (the row
//! that best names columns of one kind of value), the blocks above and below that read as more of it, and the part
//! each row of its body plays; then its columns' names and kinds. The modules go from the sheet as the guess reads
//! it (`grid`) up to the table around a cell (`around`) and its columns (`columns`).

use serde_json::{json, Value as Json};

use super::live::Role;
use crate::workbook::{Sheet, Workbook};

mod around;
mod block;
mod cell_tables;
mod columns;
mod grid;
mod header;
mod profile;
mod recognize;
mod rows;
mod runs;
mod table;

pub(super) use cell_tables::{cell_table_at, cell_table_declared_as, cell_tables};
pub(in crate::session::reads) use cell_tables::{declared_tables, DeclaredRecords};
pub(super) use recognize::tables_of_sheet;
use grid::Grid;
use runs::Table;

/// The table guessed around a cell, with its columns: null when there is none.
pub(super) fn read_at(workbook: &Workbook, sheet: &Sheet, row: usize, column: usize) -> Json {
    let grid = Grid::of(workbook, sheet);
    let Some(table) = grid.table_at(row, column) else { return Json::Null };
    let columns = columns_in_ids(workbook, sheet, &grid, &table);
    // The row under the body, when it shows something across the table's columns.
    let under = table.to.saturating_add(1);
    let under = grid.row_has_any(under, table.first_column, table.last_column).then_some(under);
    json!({"table": table_in_ids(workbook, sheet, &table, under), "columns": columns})
}

/// A table's columns by ids, each with its name and kind.
fn columns_in_ids(workbook: &Workbook, sheet: &Sheet, grid: &Grid, table: &Table) -> Vec<Json> {
    let id = |c: usize| sheet.columns.line(c).map(|l| workbook.bases.text(l));
    grid.columns(table).into_iter().map(|c| json!({"c": id(c.column), "name": c.name, "kind": c.kind.name()})).collect()
}

/// A role as the page names it.
fn role_name(role: Role) -> &'static str {
    match role {
        Role::Record => "record",
        Role::Spacer => "spacer",
        Role::Section => "section",
        Role::Subtotal => "subtotal",
        Role::HeaderAgain => "headerAgain",
    }
}

/// A guessed table by ids, with the row under its body.
fn table_in_ids(workbook: &Workbook, sheet: &Sheet, table: &Table, under: Option<usize>) -> Json {
    let row = |r: usize| sheet.rows.line(r).map(|l| workbook.bases.text(l));
    let column = |c: usize| sheet.columns.line(c).map(|l| workbook.bases.text(l));
    let header = table.header.map(|h| json!({"firstRow": row(h.first), "lastRow": row(h.last), "isSure": h.is_sure}));
    let runs: Vec<Json> = table
        .runs
        .iter()
        .map(|r| json!({"firstRow": row(r.first), "lastRow": row(r.last), "role": role_name(r.role)}))
        .collect();
    json!({
        "sheetId": sheet.id,
        "header": header,
        "firstColumn": column(table.first_column),
        "lastColumn": column(table.last_column),
        "firstRowOfBody": row(table.from),
        "lastRowOfBody": row(table.to),
        "rowUnderTheBody": under.and_then(row),
        "runs": runs,
    })
}
