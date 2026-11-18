//! Text with looks typed into a block of cells (`enterTextWithLooksInCells`): paragraphs of runs, each bold,
//! italic, underlined or struck through, and perhaps a link.
//!
//! The text is first put the way a cell keeps it: a line break in a run starts a new paragraph, a line of the same
//! list, empty runs go (an empty paragraph stays), a run's marks are each named once and in order, an empty link is
//! none, runs next to each other that look alike are one, and lines of lists lie as deep as a cell keeps them.
//!
//! Text that reads as text loses a `'` first, as typed (a run that was only the mark goes with it). Then a mark on all
//! of the text is the cell's look instead: each cell typed into is made bold or not, italic or not, underlined or not
//! and struck through or not as the text is all over (none, with no runs but line breaks; an empty text leaves the
//! looks be). What is left rich (a mark, a link, or with some text, a line of a list) is kept as text with looks when the text reads as text: its links
//! all at most 2048 bytes long (`addressLinkedToTooLong`), then all to the web (`http://` or `https://` in any case,
//! else `addressLinkedToNotOfTheWeb`), then up to 252 runs and paragraphs that are not empty (`richTextTooLarge`).
//! Otherwise the text is typed as plain text, a formula as `enterInCells` enters it, its links dropped unread. Into a
//! dropdown's cell, the text, rich or not, is the option it names, as a typed text is.
//!
//! The cells take the text as `enterInCells` gives it: each cell no merged range covers, leaving out the cells that
//! come to what they hold. Their looks change even so. A block merged ranges cover all of changes nothing, its
//! links unread.

use hashbrown::HashMap;

use serde::Deserialize;
use serde_json::{json, Value};

use super::in_cells::{are_readable, block_of, is_covered, merged_boxes, place_at, CellBlock};
use super::in_cells::are_too_many_to_enter_in;
use super::reading::{self, Reading};
use super::{change_of, check_length, dropdown_change, formula, locales_of, ops_of};
use super::{workbook_locale, CellAt, Change, How};
use crate::ids::LineId;
use crate::workbook::formats::{blocks, Leaf};
use crate::workbook::load::{CellsToFormat, Op, Refusal};
use crate::workbook::rich::{self, List, Mark, Paragraph, Run};
use crate::workbook::{Input, Workbook};

/// The most bytes a link may have.
const LONGEST_LINK: usize = 2048;
/// The most runs and paragraphs that are not empty text with looks may have.
const MOST_RICH_PARTS: usize = 252;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TextWithLooks {
    paragraphs: Vec<Paragraph>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum LooksEdit {
    #[serde(rename_all = "camelCase")]
    EnterTextWithLooksInCells { cells: CellBlock, typed_in: CellAt, text_with_looks: TextWithLooks },
}

/// Whether an `enterTextWithLooksInCells` edit reads.
pub fn reads(edit: &Value) -> bool {
    let Ok(LooksEdit::EnterTextWithLooksInCells { cells, .. }) = LooksEdit::deserialize(edit) else {
        return false;
    };
    are_readable(&cells.rows)
}

/// Text with looks put the way a cell keeps it.
fn kept(paragraphs: Vec<Paragraph>) -> Vec<Paragraph> {
    let mut out: Vec<Paragraph> = Vec::new();
    for paragraph in paragraphs {
        out.push(Paragraph { list: paragraph.list, runs: Vec::new() });
        for run in paragraph.runs {
            let mut marks = run.marks;
            marks.sort();
            marks.dedup();
            let link = run.link.filter(|link| !link.is_empty());
            for (i, piece) in run.text.split('\n').enumerate() {
                if i > 0 {
                    out.push(Paragraph { list: paragraph.list, runs: Vec::new() });
                }
                if piece.is_empty() {
                    continue;
                }
                let runs = &mut out.last_mut().expect("a paragraph").runs;
                match runs.last_mut() {
                    Some(last) if last.marks == marks && last.link == link => last.text.push_str(piece),
                    _ => runs.push(Run { text: piece.to_owned(), marks: marks.clone(), link: link.clone() }),
                }
            }
        }
    }
    rich::kept_levels(&mut out);
    out
}

/// Whether text with looks is as a cell keeps it: put that way already, its links to the web and not too long.
pub fn is_kept_rich_text(paragraphs: &[Paragraph]) -> bool {
    rich::fault(paragraphs).is_none() && check_links(paragraphs).is_ok()
}

/// Refuses a link that is too long, whichever it is, or else one not to the web.
fn check_links(paragraphs: &[Paragraph]) -> Result<(), Refusal> {
    let links = || paragraphs.iter().flat_map(|p| &p.runs).filter_map(|run| run.link.as_deref());
    if links().any(|link| link.len() > LONGEST_LINK) {
        return Err(Refusal::AddressLinkedToTooLong);
    }
    let of_the_web = |link: &str| {
        let lower = link.to_ascii_lowercase();
        lower.starts_with("http://") || lower.starts_with("https://")
    };
    if !links().all(of_the_web) {
        return Err(Refusal::AddressLinkedToNotOfTheWeb);
    }
    Ok(())
}

/// The value of a mark's leaf in a cell's font: whether the text has it all over.
fn font_value(mark: Mark, all_over: bool) -> Value {
    match (mark, all_over) {
        (Mark::Underline, true) => json!("single"),
        (Mark::Underline, false) => json!("none"),
        (_, all_over) => json!(all_over),
    }
}

/// Text with looks as it is typed: put the way a cell keeps it, its `'` gone when it reads as text (the run that was
/// only the mark with it), and the marks on all of it taken off the runs, for the cells to take instead.
struct Typed {
    paragraphs: Vec<Paragraph>,
    plain: String,
    reads_as: Reading,
    all_over: Vec<Mark>,
}

fn typed(workbook: &Workbook, paragraphs: Vec<Paragraph>) -> Typed {
    let mut paragraphs = kept(paragraphs);
    let plain = rich::plain_text(&paragraphs);
    let locale = workbook_locale(workbook);
    let reads_as = reading::read(&plain, locales_of(workbook, locale), true);
    if let Reading::Text(text) = &reads_as {
        if text.len() < plain.len() {
            let first = paragraphs.iter_mut().find(|p| !p.runs.is_empty()).expect("a run");
            first.runs[0].text.remove(0);
            if first.runs[0].text.is_empty() {
                first.runs.remove(0);
            }
        }
    }
    let has_runs = paragraphs.iter().any(|p| !p.runs.is_empty());
    let all_over: Vec<Mark> = Mark::ALL
        .into_iter()
        .filter(|m| has_runs && paragraphs.iter().flat_map(|p| &p.runs).all(|run| run.marks.contains(m)))
        .collect();
    for run in paragraphs.iter_mut().flat_map(|p| &mut p.runs) {
        run.marks.retain(|m| !all_over.contains(m));
    }
    Typed { paragraphs, plain, reads_as, all_over }
}

/// The text of text with looks as a cell keeps it, line breaks between its paragraphs: what `enter` types into a
/// cell a merged range covers, to see whether it would change what the cell holds.
pub(super) fn plain_of(paragraphs: &[Paragraph]) -> String {
    rich::plain_text(&kept(paragraphs.to_vec()))
}

/// The operations of an `enterTextWithLooksInCells` edit, and the block's corners (top, left, bottom, right), or
/// the refusal.
pub fn enter_text_with_looks_in_cells(
    workbook: &Workbook,
    edit: &Value,
) -> Result<(Vec<Op>, (usize, usize, usize, usize)), Refusal> {
    let LooksEdit::EnterTextWithLooksInCells { cells, typed_in, text_with_looks } =
        LooksEdit::deserialize(edit).map_err(|_| Refusal::UnreadableRequest)?;
    let block = block_of(workbook, &cells)?;
    let s = block.s;
    let sheet = &workbook.sheets[s];
    let typed_r = workbook.bases.parse(&typed_in.r).and_then(|l| sheet.rows.position(l)).ok_or(Refusal::UnknownRow)?;
    let typed_c =
        workbook.bases.parse(&typed_in.c).and_then(|l| sheet.columns.position(l)).ok_or(Refusal::UnknownColumn)?;
    // The text counts as its paragraphs joined by line breaks, and the link of each run with text besides.
    let paragraphs = &text_with_looks.paragraphs;
    let runs = paragraphs.iter().flat_map(|p| &p.runs).filter(|r| !r.text.is_empty());
    let bytes = runs.map(|r| r.text.len() + r.link.as_ref().map_or(0, String::len)).sum::<usize>()
        + paragraphs.len().saturating_sub(1);
    if are_too_many_to_enter_in(block.count(), bytes) {
        return Err(Refusal::TooManyCellsToEnterIn);
    }
    let corners = (
        block.rows.first().copied().unwrap_or(0),
        block.left,
        block.rows.last().copied().unwrap_or(0),
        block.right,
    );
    let text = typed(workbook, text_with_looks.paragraphs);
    // The cells no merged range covers take the text; a block they cover all of changes nothing, its links unread.
    let boxes = merged_boxes(workbook, sheet);
    let cells: Vec<((LineId, LineId), (i64, i64))> = block
        .positions()
        .filter(|&at| !is_covered(&boxes, at))
        .map(|(r, c)| (place_at(sheet, (r, c)), (r as i64 - typed_r as i64, c as i64 - typed_c as i64)))
        .collect();
    if cells.is_empty() {
        return Ok((Vec::new(), corners));
    }
    Ok((ops_of_looks(workbook, s, &cells, text)?, corners))
}

/// The operations of text with looks typed into one cell by `enter` (a `textWithLooks` entry): as
/// `enterTextWithLooksInCells` gives them for the cell alone, which takes the text even when a merged range covers it
/// (`enter` has refused it before then, unless the text, typed, would leave what the cell holds as it is).
pub(super) fn enter_in_cell(
    workbook: &Workbook,
    s: usize,
    place: (LineId, LineId),
    paragraphs: Vec<Paragraph>,
) -> Result<Vec<Op>, Refusal> {
    ops_of_looks(workbook, s, &[(place, (0, 0))], typed(workbook, paragraphs))
}

/// The operations that give cells text with looks, each cell with how far it is from the cell typed into (rows,
/// columns), by which a formula shifts.
fn ops_of_looks(
    workbook: &Workbook,
    s: usize,
    cells: &[((LineId, LineId), (i64, i64))],
    text: Typed,
) -> Result<Vec<Op>, Refusal> {
    let Typed { paragraphs, plain, reads_as, all_over } = text;
    let sheet = &workbook.sheets[s];
    let locale = workbook_locale(workbook);
    // Text with looks, when what is left is rich and the text reads as text: a mark, a link, or with some text, a line
    // of a list.
    let has_runs = paragraphs.iter().any(|p| !p.runs.is_empty());
    let is_rich = paragraphs.iter().flat_map(|p| &p.runs).any(|run| !run.marks.is_empty() || run.link.is_some())
        || (has_runs && paragraphs.iter().any(|p| p.list != List::None));
    let mut with_looks = None;
    if is_rich && matches!(reads_as, Reading::Text(_)) {
        check_links(&paragraphs)?;
        let parts = paragraphs.iter().map(|p| p.runs.len() + usize::from(!p.runs.is_empty())).sum::<usize>();
        if parts > MOST_RICH_PARTS {
            return Err(Refusal::RichTextTooLarge);
        }
        with_looks = Some(Input::RichText { paragraphs: paragraphs.clone() });
    }
    let is_formula = matches!(reads_as, Reading::Formula(_));
    let mut order = Vec::new();
    let mut changes: HashMap<(LineId, LineId), Change> = HashMap::new();
    let mut looks: Vec<(Leaf, (LineId, LineId), Value)> = Vec::new();
    for &(place, (down, right)) in cells {
        let change = match &with_looks {
            Some(input) => {
                check_length(workbook, s, &plain, locale, How::Entered)?;
                let rich = || Change { input: Some(input.clone()), pattern: None };
                dropdown_change(workbook, s, place, &plain, locale, How::Entered).unwrap_or_else(rich)
            }
            None => {
                let text = if is_formula { formula::shifted(&plain, down, right) } else { plain.clone() };
                check_length(workbook, s, &text, locale, How::Entered)?;
                change_of(workbook, s, place, &text, locale, How::Entered)
            }
        };
        if change.pattern.is_some() || change.input.as_ref() != sheet.cells.get(&place).map(|cell| &cell.input) {
            order.push(place);
            changes.insert(place, change);
        }
        // A cell underlined otherwise (double) has the underline already.
        if !plain.is_empty() {
            for mark in Mark::ALL {
                let on = all_over.contains(&mark);
                let had = sheet.formats.value(Leaf::of_mark(mark), place);
                if had != font_value(mark, on) && (mark != Mark::Underline || (had != font_value(mark, false)) != on) {
                    looks.push((Leaf::of_mark(mark), place, font_value(mark, on)));
                }
            }
        }
    }
    let mut ops = if order.is_empty() { Vec::new() } else { ops_of(workbook, sheet, &order, &changes) };
    if !looks.is_empty() {
        let formats = blocks(&workbook.bases, looks.iter().map(|(leaf, place, value)| (*leaf, *place, value)))
            .into_iter()
            .map(|(rows, columns, format)| CellsToFormat { rows, columns, format })
            .collect();
        ops.push(Op::SetCellFormats { sheet_id: sheet.id.clone(), formats });
    }
    Ok(ops)
}
