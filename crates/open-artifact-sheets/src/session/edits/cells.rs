//! Typing into cells: entering a value or a formula, pasting texts, clearing cells, and the people a cell names.
//!
//! Kinds: enter, enterInCells, enterTextWithLooksInCells, pasteTexts, pasteRowsOfTexts, clearCells, addUserToCell,
//! removeUserFromCell, setListLineChecked.
//!
//! Each is read and worked out by `typing.rs` and its modules (`typing/in_cells.rs` for a block of cells,
//! `typing/looks.rs` for text with looks, `typing/people.rs` for people). A text entered into a block changes the
//! block as a whole (`placeChanged`), even where its cells come to what they held; rows of texts pasted change where
//! they land, not the rows and columns the sheet grows by.

use serde_json::{json, Value as Json};

use super::{Context, Made, Refused};
use crate::session::place::Place;
use crate::typing::{self, Pasted};
use crate::workbook::Workbook;

pub enum Edit {
    /// One cell given a text, a day, a dropdown's option or a person.
    Enter(Json),
    /// One text entered into a block of cells.
    EnterInCells(Json),
    /// Text with looks entered into a block of cells.
    EnterTextWithLooksInCells(Json),
    /// Texts pasted into cells, perhaps first shown to the person.
    PasteTexts(Json),
    /// Rows of texts pasted from a block's first cell on.
    PasteRowsOfTexts(Json),
    /// A block of cells emptied.
    ClearCells(Json),
    /// A person added to the people a cell names, or taken away.
    People(Json),
    /// A checkbox line of a cell's list ticked or unticked.
    ListLine(Json),
}

pub fn read(edit: Json) -> Option<Edit> {
    let make = match edit.get("kind")?.as_str()? {
        "enter" if typing::reads(&edit) => Edit::Enter,
        "pasteTexts" if typing::reads(&edit) => Edit::PasteTexts,
        "enterInCells" if typing::reads(&edit) => Edit::EnterInCells,
        "pasteRowsOfTexts" if typing::reads(&edit) => Edit::PasteRowsOfTexts,
        "clearCells" if typing::reads(&edit) => Edit::ClearCells,
        "enterTextWithLooksInCells" if typing::reads(&edit) => Edit::EnterTextWithLooksInCells,
        "addUserToCell" | "removeUserFromCell" if typing::reads(&edit) => Edit::People,
        "setListLineChecked" if typing::reads(&edit) => Edit::ListLine,
        _ => return None,
    };
    Some(make(edit))
}

/// The edit's sheet id (`cells` or `selected` names it for a block).
fn block_sheet(edit: &Json) -> &str {
    edit["cells"]["sheetId"].as_str().unwrap_or_default()
}

/// What a paste answers.
fn pasted(pasted: Pasted) -> Result<Made, Refused> {
    match pasted {
        Pasted::Ops(ops) => Ok(Made::ops(ops)),
        Pasted::ToBeShownFirst(texts) => {
            Err(Refused::Answer(json!({"kind": "toBeShownFirst", "textThatNoCellShows": texts})))
        }
    }
}

pub fn make(workbook: &Workbook, edit: Edit, context: &Context) -> Result<Made, Refused> {
    let made = match edit {
        Edit::Enter(edit) => Made::ops(typing::enter(workbook, &edit)?),
        Edit::PasteTexts(edit) => pasted(typing::paste_texts_shown(workbook, &edit, context.shown_to_the_person)?)?,
        Edit::EnterInCells(edit) => {
            let (ops, (top, left, bottom, right)) = typing::enter_in_cells(workbook, &edit)?;
            Made { ops, place: Some(Place::cells(block_sheet(&edit), top, left, bottom, right)) }
        }
        Edit::EnterTextWithLooksInCells(edit) => {
            let (ops, (top, left, bottom, right)) = typing::enter_text_with_looks_in_cells(workbook, &edit)?;
            Made { ops, place: Some(Place::cells(block_sheet(&edit), top, left, bottom, right)) }
        }
        Edit::PasteRowsOfTexts(edit) => {
            let (paste, corners) =
                typing::paste_rows_of_texts(workbook, &edit, context.code, context.shown_to_the_person)?;
            let mut made = pasted(paste)?;
            if let Some((top, left, bottom, right)) = corners {
                let sheet_id = edit["selected"]["sheetId"].as_str().unwrap_or_default();
                made.place = Some(Place::cells(sheet_id, top, left, bottom, right));
            }
            made
        }
        Edit::ClearCells(edit) => Made::ops(typing::clear_cells(workbook, &edit)?),
        Edit::People(edit) => Made::ops(typing::change_people(workbook, &edit)?),
        Edit::ListLine(edit) => Made::ops(typing::set_list_line_checked(workbook, &edit)?),
    };
    // What was typed into a cell with a dropdown that is none of its options is read as in any cell, then checked.
    super::options_kept(workbook, made)
}
