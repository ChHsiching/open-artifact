//! Copied cells as text: what `readCellsToCopy` gives the page to put on the clipboard (`copiedCellsAsText`), and
//! what `pasteCopiedCells` and `pasteValuesOfCopiedCells` read back. The text is JSON:
//!
//! ```text
//! {"version":3,"topRowPosition":4,"leftColumnPosition":1,"rowCount":2,"columnCount":3,
//!  "cells":[{"row":0,"column":0,"input":{"kind":"number","value":1.5}},
//!           {"row":1,"column":2,"input":{"kind":"formula","text":"=B5+$C$1"}}],
//!  "formats":[{"rows":[{"first":0,"count":2}],"columns":[{"first":0,"count":1}],"format":{"font":{"bold":true}}}],
//!  "blankRowsLeftOut":true}
//! ```
//!
//! Rows and columns are counted from the copied area's top left (`topRowPosition`, `leftColumnPosition` are where
//! that was on its sheet, which a formula's relative references move from). A formula is its text as it read in
//! en-US. `blankRowsLeftOut` and `blankColumnsLeftOut` are there (as `true`) when empty rows or columns at the end of
//! the sheet were left out of the copy.

use serde::{Deserialize, Serialize};
use serde_json::Value as Json;

use crate::typing::{are_kept_people, is_kept_person, is_kept_rich_text};
use crate::workbook::formats::read_format;
use crate::workbook::rich::{Paragraph, Person};

/// The version of the text this writes and reads.
pub const VERSION: u32 = 3;

/// The copied cells, as the text has them.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CopiedCells {
    pub version: u32,
    pub top_row_position: u32,
    pub left_column_position: u32,
    pub row_count: u64,
    pub column_count: u64,
    pub cells: Vec<CopiedCell>,
    pub formats: Vec<CopiedFormat>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blank_rows_left_out: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blank_columns_left_out: Option<bool>,
}

/// What pasting only the values of copied cells pastes (`values`).
pub enum CopiedValues {
    /// Formulas wait to be worked out: no values yet.
    NotWritten,
    /// Every cell copied is its own value.
    WrittenAsTheCopiedCells,
    /// A copy of the same cells whose cells are the values of the formulas and of the options copied, and whose
    /// formats are number formats alone.
    WrittenBesideTheCopiedCells(CopiedCells),
}

/// One copied cell, by its row and column in the copy.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CopiedCell {
    pub row: u32,
    pub column: u32,
    pub input: CopiedInput,
}

/// What a copied cell holds: a formula as its text, an option of a dropdown with its label as it was.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum CopiedInput {
    Number { value: f64 },
    Text { value: String },
    Boolean { value: bool },
    Formula { text: String },
    #[serde(rename_all = "camelCase")]
    DropdownOption { option_id: String, label: String },
    /// A person, people and text with looks, as a cell holds them.
    #[serde(rename_all = "camelCase")]
    User { user_id: String, label: String },
    Users { users: Vec<Person> },
    RichText { paragraphs: Vec<Paragraph> },
    /// A formula of another program, its references by offsets from its cell (`=R[-1]C`), and what the cell holds
    /// where the formula doesn't read: never written (`pasteCellsOfAnotherProgram`).
    #[serde(skip)]
    FormulaByOffsets { text: String, otherwise: Option<Box<CopiedInput>> },
}

/// Rows or columns of the copy: `count` of them from `first`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Span {
    pub first: u32,
    pub count: u32,
}

/// A format the copied cells in some rows and columns have, as a workbook's cell formats are written.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CopiedFormat {
    pub rows: Vec<Span>,
    pub columns: Vec<Span>,
    pub format: Json,
}

impl CopiedCells {
    /// The copy as text.
    pub fn text(&self) -> String {
        serde_json::to_string(self).expect("copied cells serialize")
    }

    /// The copy a text is, when it reads as one (else the paste is refused, `unreadableCopiedCells`): of
    /// this version, from a place on a sheet (`topRowPosition` up to row 1048576, `leftColumnPosition` up to column
    /// XFD), at least one row and one column, its cells inside it, row by row, each once; a text not empty and of at
    /// most 32767 bytes, a formula `=` and more, a dropdown's option with a label, people and text with looks as a
    /// cell keeps them (a label as a name gives it, two to 40 people, links to the web); each
    /// format one that reads, setting something, on runs of rows and of columns inside the copy, in order and
    /// apart.
    pub fn read(text: &str) -> Option<CopiedCells> {
        let copy: CopiedCells = serde_json::from_str(text).ok()?;
        let fits = copy.version == VERSION
            && copy.top_row_position < 1_048_576
            && copy.left_column_position < 16_384
            && copy.row_count >= 1
            && copy.column_count >= 1;
        if !fits {
            return None;
        }
        let mut last: Option<(u32, u32)> = None;
        for cell in &copy.cells {
            let place = (cell.row, cell.column);
            if cell.row as u64 >= copy.row_count || cell.column as u64 >= copy.column_count || last >= Some(place) {
                return None;
            }
            last = Some(place);
            let reads = match &cell.input {
                CopiedInput::Number { .. } | CopiedInput::Boolean { .. } => true,
                CopiedInput::Text { value } => !value.is_empty() && value.len() <= LONGEST_TEXT,
                CopiedInput::Formula { text } => text.starts_with('=') && text.len() > 1,
                CopiedInput::DropdownOption { label, .. } => !label.is_empty(),
                CopiedInput::User { user_id, label } => {
                    is_kept_person(&Person { user_id: user_id.clone(), label: label.clone() })
                }
                CopiedInput::Users { users } => are_kept_people(users),
                CopiedInput::RichText { paragraphs } => is_kept_rich_text(paragraphs),
                CopiedInput::FormulaByOffsets { .. } => false,
            };
            if !reads {
                return None;
            }
        }
        let spans_fit = |spans: &[Span], count: u64| {
            let mut end = 0;
            spans.iter().all(|span| {
                let (first, past) = (span.first as u64, span.first as u64 + span.count as u64);
                let fits = span.count >= 1 && first >= end && past <= count;
                end = past;
                fits
            })
        };
        for format in &copy.formats {
            let sets = read_format(&format.format).is_some_and(|leaves| !leaves.is_empty());
            if !sets || !spans_fit(&format.rows, copy.row_count) || !spans_fit(&format.columns, copy.column_count) {
                return None;
            }
        }
        Some(copy)
    }
}

/// The most bytes a copied text may have.
const LONGEST_TEXT: usize = 32767;
