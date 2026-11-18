//! Format versions: which version of the operations' format an edit is written in. Every recorded edit carries the
//! version it needs (`v`), the newest of its operations' (a feature's operations are first readable in the version
//! that brought it); an edit streamed from the server must carry exactly that one, and a load page one the module
//! still reads.

use super::formats::Leaf;
use super::load::Op;
use super::Input;
use crate::formula::Reference;

/// The first version, and the oldest still read.
pub const OLDEST: u32 = 17;
/// The newest version.
pub const NEWEST: u32 = 39;

/// Whether the module reads a version: 17, 20 to 30, 32 to 34 and 36 to 39 (the others were never released).
pub fn is_known(v: u32) -> bool {
    matches!(v, 17 | 20..=30 | 32..=34 | 36..=39)
}

/// The version an edit of these operations is written in.
pub fn of_ops(ops: &[Op]) -> u32 {
    ops.iter().map(of_op).max().unwrap_or(OLDEST)
}

fn of_op(op: &Op) -> u32 {
    match op {
        // Cells written as a grid came in 39.
        Op::SetCells { cells, listed: false, .. } if super::grid::is_grid(cells) => 39,
        Op::SetCells { cells, .. } => cells.iter().filter_map(|c| c.input.as_ref()).map(of_input).max().unwrap_or(OLDEST),
        Op::SetCellFormats { formats, .. } => formats
            .iter()
            .flat_map(|f| super::formats::read_format(&f.format).unwrap_or_default())
            .map(|(leaf, value)| match leaf {
                Leaf::CellControl if value.get("kind").and_then(|k| k.as_str()) == Some("checkbox") => 21,
                Leaf::Vertical | Leaf::Wrap => 23,
                _ => OLDEST,
            })
            .max()
            .unwrap_or(OLDEST),
        Op::SetSheetSettings { sheets } => sheets
            .iter()
            .map(|s| if s.settings.are_gridlines_hidden.is_some() { 29 } else { 20 })
            .max()
            .unwrap_or(20),
        Op::Reseed { .. } => 24,
        Op::SetTimeZone { .. } | Op::AdoptTimeZone { .. } => 25,
        Op::MoveSheets { .. } => 26,
        Op::SetRowGroups { .. } | Op::SetColumnGroups { .. } => 27,
        Op::SetConditionalFormats { .. } => 28,
        // A placement set off from its anchor cell came in 33.
        Op::SetPlacements { placements, .. }
            if placements.iter().flat_map(|p| &p.placement).any(|p| p.offset_from_anchor_cell.is_some()) =>
        {
            33
        }
        Op::SetViews { .. } | Op::SetPlacements { .. } => 30,
        Op::SetLocale { .. } => 32,
        Op::SetCellTables { .. } => 36,
        _ => OLDEST,
    }
}

fn of_input(input: &Input) -> u32 {
    match input {
        Input::Formula { formula } => formula
            .references
            .iter()
            .map(|r| match r {
                Reference::Columns { .. } | Reference::Rows { .. } => 34,
                _ => OLDEST,
            })
            .max()
            .unwrap_or(OLDEST),
        Input::Users { .. } => 22,
        // Lines of lists came in 38.
        Input::RichText { paragraphs } if paragraphs.iter().any(|p| p.list != super::rich::List::None) => 38,
        Input::RichText { .. } => 37,
        _ => OLDEST,
    }
}
