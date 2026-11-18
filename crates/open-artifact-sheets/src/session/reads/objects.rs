//! Conditional formats, dropdowns and views, as the page and the agent read them: conditional formats written by
//! address and back (`conditional_formats`), the cells a dropdown is given and what giving one would change, and
//! the views with the values their widgets read (`views`).
//!
//! A sheet's cells are named by their ids here, as elsewhere, and must be live: a deleted row or column is
//! `unknownRow` or `unknownColumn`, the row first.

use hashbrown::HashSet;

use serde::Deserialize;
use serde_json::{json, Value as Json};

use crate::formula::column_letters;
use crate::session::edits::objects::dropdowns;
use crate::session::edits::objects::{LONGEST_DROPDOWN_OPTION, MOST_OPTIONS_IN_A_DROPDOWN};
use crate::workbook::formats::Leaf;
use crate::workbook::layout::CellIds;
use crate::workbook::{Sheet, Workbook};

mod conditional_formats;
pub(super) mod views;

pub const KINDS: &[&str] = &["readConditionalFormatSuggestions", "readConditionalFormatsInIds", "readConditionalFormatsByAddress", "readConditionalFormatsAsAgentIsTold", "readDropdownOptionsToOffer", "readCellsThatADropdownWouldClear", "readCellsOfTheDropdownAt", "readViews", "readInputsOfView"];

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Request {
    ReadConditionalFormatSuggestions { cells: Area },
    #[serde(rename_all = "camelCase")]
    ReadConditionalFormatsInIds { sheet_id: String, written: Json },
    #[serde(rename_all = "camelCase")]
    ReadConditionalFormatsByAddress { sheet_id: String, rules: Vec<conditional_formats::RuleInIds> },
    ReadConditionalFormatsAsAgentIsTold { cells: Area },
    #[serde(rename_all = "camelCase")]
    ReadDropdownOptionsToOffer { sheet_id: String, one_corner: CellIds, other_corner: CellIds },
    ReadCellsThatADropdownWouldClear { cells: Area, dropdown: DropdownToPointAt },
    #[serde(rename_all = "camelCase")]
    ReadCellsOfTheDropdownAt { sheet_id: String, cell: CellIds },
    ReadViews {},
    #[serde(rename_all = "camelCase")]
    ReadInputsOfView { view_id: String },
}

/// Cells of a sheet from one corner to the other.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Area {
    sheet_id: String,
    one_corner: CellIds,
    other_corner: CellIds,
}

/// The dropdown a block of cells would be given: a new one with these labels, or one the sheet holds.
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum DropdownToPointAt {
    New { labels: Vec<String> },
    #[serde(rename_all = "camelCase")]
    Held { dropdown_id: String },
}

/// What a read comes to: its answer, or the refusal's name.
type Answer = Result<Json, &'static str>;

pub fn answer(workbook: &Workbook, request: &Json) -> String {
    answer_at(workbook, request, None)
}

/// Whether a request reads the session's clock: the suggestions for dates, and today as the agent is told it.
pub fn reads_the_clock(request: &Json) -> bool {
    let kind = request.get("kind").and_then(Json::as_str);
    kind == Some("readConditionalFormatSuggestions") || kind == Some("readConditionalFormatsAsAgentIsTold")
}

/// A request answered, `now` the session's clock reading in the workbook's time zone (none: no reading counts).
pub fn answer_at(workbook: &Workbook, request: &Json, now: Option<f64>) -> String {
    let Ok(request) = serde_json::from_value::<Request>(request.clone()) else { return super::unreadable() };
    let answer = match request {
        Request::ReadConditionalFormatSuggestions { cells } => conditional_formats::suggestions(workbook, &cells, now),
        Request::ReadConditionalFormatsInIds { sheet_id, written } => {
            conditional_formats::in_ids(workbook, &sheet_id, &written)
        }
        Request::ReadConditionalFormatsByAddress { sheet_id, rules } => {
            conditional_formats::by_address(workbook, &sheet_id, &rules)
        }
        Request::ReadConditionalFormatsAsAgentIsTold { cells } => {
            conditional_formats::as_agent_is_told(workbook, &cells, now)
        }
        Request::ReadDropdownOptionsToOffer { sheet_id, one_corner, other_corner } => {
            options_to_offer(workbook, &Area { sheet_id, one_corner, other_corner })
        }
        Request::ReadCellsThatADropdownWouldClear { cells, dropdown } => would_clear(workbook, &cells, &dropdown),
        Request::ReadCellsOfTheDropdownAt { sheet_id, cell } => cells_of_dropdown(workbook, &sheet_id, &cell),
        Request::ReadViews {} => Ok(views::views(workbook)),
        Request::ReadInputsOfView { view_id } => views::inputs_of_view(workbook, &view_id),
    };
    match answer {
        Ok(answer) => answer.to_string(),
        Err(refusal) => json!({"kind": "refused", "refusal": refusal}).to_string(),
    }
}

/// The sheet with this id (not a deleted one).
fn sheet_of<'a>(workbook: &'a Workbook, sheet_id: &str) -> Result<&'a Sheet, &'static str> {
    workbook.sheet_index(sheet_id).map(|i| &workbook.sheets[i]).ok_or("unknownSheet")
}

/// A live cell's position: its row, then its column.
fn live_cell(workbook: &Workbook, sheet: &Sheet, cell: &CellIds) -> Result<(usize, usize), &'static str> {
    let row = workbook.bases.parse(&cell.r).and_then(|l| sheet.rows.position(l)).ok_or("unknownRow")?;
    let column = workbook.bases.parse(&cell.c).and_then(|l| sheet.columns.position(l)).ok_or("unknownColumn")?;
    Ok((row, column))
}

/// An area's sheet and the positions of its rows and columns, in order: one corner read before the other.
fn area_of<'a>(workbook: &'a Workbook, area: &Area) -> Result<(&'a Sheet, Vec<usize>, Vec<usize>), &'static str> {
    let sheet = sheet_of(workbook, &area.sheet_id)?;
    let (r1, c1) = live_cell(workbook, sheet, &area.one_corner)?;
    let (r2, c2) = live_cell(workbook, sheet, &area.other_corner)?;
    Ok((sheet, (r1.min(r2)..=r1.max(r2)).collect(), (c1.min(c2)..=c1.max(c2)).collect()))
}

/// A cell's address, `C7`, from its position.
fn address((row, column): (usize, usize)) -> String {
    format!("{}{}", column_letters(column), row + 1)
}

/// A range's address from its corners' positions: `A1:B2`, or `A1` for a single cell.
fn range_address(top_left: (usize, usize), bottom_right: (usize, usize)) -> String {
    if top_left == bottom_right {
        address(top_left)
    } else {
        format!("{}:{}", address(top_left), address(bottom_right))
    }
}

/// The labels the dropdown editor offers for a block of cells: what its cells show, row by row (formulas, empty
/// texts and what could not be a label left out), each once whatever its capitals, the first so many.
fn options_to_offer(workbook: &Workbook, area: &Area) -> Answer {
    let (sheet, rows, columns) = area_of(workbook, area)?;
    let mut seen = HashSet::new();
    let mut options = Vec::new();
    'cells: for &r in &rows {
        for &c in &columns {
            let at = dropdowns::lines(sheet, (r, c));
            let Some(cell) = sheet.cells.get(&at) else { continue };
            let Some(label) = dropdowns::shown_text(workbook, sheet, at, cell) else { continue };
            let fits = !label.is_empty()
                && label.chars().count() <= LONGEST_DROPDOWN_OPTION
                && !label.chars().any(char::is_control);
            if fits && seen.insert(label.to_lowercase()) {
                options.push(json!({"label": label}));
                if options.len() == MOST_OPTIONS_IN_A_DROPDOWN {
                    break 'cells;
                }
            }
        }
    }
    Ok(json!({"kind": "dropdownOptionsToOffer", "options": options}))
}

/// How many cells of a block giving it a dropdown would clear: its formulas, and the values none of the dropdown's
/// labels match.
fn would_clear(workbook: &Workbook, area: &Area, dropdown: &DropdownToPointAt) -> Answer {
    let (sheet, rows, columns) = area_of(workbook, area)?;
    let (labels, held): (Vec<&str>, Option<&str>) = match dropdown {
        DropdownToPointAt::New { labels } => (labels.iter().map(String::as_str).collect(), None),
        DropdownToPointAt::Held { dropdown_id } => {
            let (_, options) = sheet.dropdowns.get(dropdown_id.as_str()).ok_or("unknownDropdown")?;
            (options.iter().map(|o| o.label.as_str()).collect(), Some(dropdown_id.as_str()))
        }
    };
    let (formulas, others) = dropdowns::would_clear(workbook, sheet, (&rows, &columns), &labels, held);
    Ok(json!({"kind": "cellsThatADropdownWouldClear", "formulas": formulas, "others": others}))
}

/// The cells given the dropdown a cell is given, as stretches down a column: column by column, from the top.
fn cells_of_dropdown(workbook: &Workbook, sheet_id: &str, cell: &CellIds) -> Answer {
    let sheet = sheet_of(workbook, sheet_id)?;
    let at = live_cell(workbook, sheet, cell)?;
    let dropdown_id = dropdowns::dropdown_of(sheet, dropdowns::lines(sheet, at)).ok_or("unknownDropdown")?;
    let mut given: Vec<(usize, usize)> = sheet
        .formats
        .iter()
        .filter(|(leaf, _, control)| {
            *leaf == Leaf::CellControl && control.get("dropdownId").and_then(Json::as_str) == Some(dropdown_id)
        })
        .filter_map(|(_, (r, c), _)| Some((sheet.columns.position(c)?, sheet.rows.position(r)?)))
        .collect();
    given.sort_unstable();
    // Each stretch: its column, its top and bottom rows.
    let mut stretches: Vec<(usize, usize, usize)> = Vec::new();
    for (column, row) in given {
        match stretches.last_mut() {
            Some((c, _, bottom)) if *c == column && *bottom + 1 == row => *bottom = row,
            _ => stretches.push((column, row, row)),
        }
    }
    let index = stretches.iter().position(|&(c, top, bottom)| c == at.1 && (top..=bottom).contains(&at.0));
    let ids = |row: usize, column: usize| {
        let (r, c) = dropdowns::lines(sheet, (row, column));
        json!({"r": workbook.bases.text(r), "c": workbook.bases.text(c)})
    };
    let stretches: Vec<Json> = stretches
        .iter()
        .map(|&(c, top, bottom)| {
            json!({"range": range_address((top, c), (bottom, c)), "top": ids(top, c), "bottom": ids(bottom, c)})
        })
        .collect();
    Ok(json!({
        "kind": "cellsOfDropdown",
        "dropdownId": dropdown_id,
        "stretches": stretches,
        "indexOfTheStretchWithTheCell": index,
    }))
}
