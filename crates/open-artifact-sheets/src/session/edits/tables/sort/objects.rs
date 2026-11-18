//! What a sort does to what a sheet holds besides its cells. Groups of rows follow what the
//! rows hold, split where that parts; conditional formats, placements and widgets' ranges keep naming the places
//! they named. Each object that changes is set again, and its id has to be well formed.

use super::super::well_formed;
use super::Refused;
use crate::ids::{Axis, LineId};
use crate::workbook::layout::{live_ends, CellIds, EndsOfGroup, GroupPatch, GroupToSet, RangeIds};
use crate::workbook::load::Op;
use crate::workbook::objects::{ConditionalFormatPatch, ConditionalFormatToSet, PlacementToSet, ViewElement, ViewToSet};
use crate::workbook::{Sheet, Workbook};

/// How a sort moved what the rows from `top` hold: `order[k]` is the position of the row whose cells are now at
/// `top + k`. Sorting rows moves the rows themselves; sorting cells moves only what they hold.
pub(super) struct Moved<'a> {
    pub sheet: &'a Sheet,
    pub top: usize,
    pub order: &'a [usize],
    pub rows_move: bool,
    /// Where what each sorted row held goes.
    new_place: Vec<usize>,
    /// The positions from the first that changes to the last (what `moveRows` moves).
    block: Option<(usize, usize)>,
    /// The sheet's rows once moved, deleted ones among them (when the rows move).
    rows_after: Option<Axis>,
}

impl<'a> Moved<'a> {
    pub fn new(sheet: &'a Sheet, top: usize, order: &'a [usize], rows_move: bool) -> Moved<'a> {
        let mut new_place = vec![0; order.len()];
        for (k, &p) in order.iter().enumerate() {
            new_place[p - top] = top + k;
        }
        let changed = |(k, &p): (usize, &usize)| p != top + k;
        let first = order.iter().enumerate().position(changed);
        let last = order.iter().enumerate().rposition(changed);
        let block = first.zip(last).map(|(i, j)| (top + i, top + j));
        let rows_after = block.filter(|_| rows_move).map(|(i, j)| {
            let line = |&p: &usize| sheet.rows.line(p).expect("a live row");
            let lines: Vec<LineId> = order[i - top..=j - top].iter().map(line).collect();
            let mut rows = sheet.rows.clone();
            rows.move_lines(&[(lines, i.checked_sub(1).and_then(|p| sheet.rows.line(p)))]);
            rows
        });
        Moved { sheet, top, order, rows_move, new_place, block, rows_after }
    }

    fn sorts(&self, p: usize) -> bool {
        (self.top..self.top + self.order.len()).contains(&p)
    }

    /// Where what the row at `p` held is now.
    fn destination(&self, p: usize) -> usize {
        if self.sorts(p) { self.new_place[p - self.top] } else { p }
    }

    /// Whether the row at `p` holds something else now.
    fn changes(&self, p: usize) -> bool {
        self.sorts(p) && self.order[p - self.top] != p
    }

    /// The row at `p` once sorted.
    fn row_after(&self, p: usize) -> LineId {
        let p = if self.rows_move && self.sorts(p) { self.order[p - self.top] } else { p };
        self.sheet.rows.line(p).expect("a live row")
    }
}

/// The rows of each group that meets what moved, where what they held went: a group whose rows stay together gets
/// its new ends; one that parts keeps its id for its first piece and the others get new ones (`rgr_<code>.<n>`),
/// each as collapsed as it was. Sorting rows sets every group that has an end among the rows moved or lies within
/// them; sorting cells, those that change.
pub(super) fn groups(workbook: &Workbook, moved: &Moved, code: &str) -> Result<Option<Op>, Refused> {
    let (s, bases) = (moved.sheet, &workbook.bases);
    let mut out = Vec::new();
    let mut new_ids = 0;
    for (id, g) in s.row_groups.values() {
        let (Some(a), Some(b)) = (bases.parse(&g.ends.first), bases.parse(&g.ends.last)) else { continue };
        let Some((first, last)) = live_ends(&s.rows, a, b) else { continue };
        let mut places: Vec<usize> = (first..=last).map(|p| moved.destination(p)).collect();
        places.sort_unstable();
        let mut pieces: Vec<(usize, usize)> = Vec::new();
        for p in places {
            match pieces.last_mut() {
                Some(piece) if piece.1 + 1 == p => piece.1 = p,
                _ => pieces.push((p, p)),
            }
        }
        let counts = match moved.block {
            _ if !moved.rows_move => pieces != [(first, last)],
            // One holding every row moved, its ends outside them, is left as it is.
            Some((i, j)) => first <= j && i <= last && !(first < i && j < last),
            None => false,
        };
        if !counts {
            continue;
        }
        well_formed(id, "rgr")?;
        let ends = |(f, l): (usize, usize)| EndsOfGroup {
            first: bases.text(moved.row_after(f)),
            last: bases.text(moved.row_after(l)),
        };
        if let [piece] = pieces[..] {
            let group = GroupPatch { ends: Some(ends(piece)), is_collapsed: None };
            out.push(GroupToSet { group_id: id.clone(), group: Some(group) });
            continue;
        }
        for (k, piece) in pieces.into_iter().enumerate() {
            let group_id = if k == 0 {
                id.clone()
            } else {
                new_ids += 1;
                format!("rgr_{code}.{}", new_ids - 1)
            };
            let group = GroupPatch { ends: Some(ends(piece)), is_collapsed: Some(g.is_collapsed) };
            out.push(GroupToSet { group_id, group: Some(group) });
        }
    }
    Ok((!out.is_empty()).then(|| Op::SetRowGroups { sheet_id: s.id.clone(), groups: out }))
}

/// A range on the sorted sheet naming the places it named: each corner's row (snapped toward the other corner's
/// when deleted) becomes the row at that place now. `None` when it names the same places still: when rows move,
/// no corner (a deleted one snapped among the rows as moved) is at another place; when cells move, no corner's
/// place holds another row's cells.
fn range_kept(workbook: &Workbook, moved: &Moved, range: &RangeIds) -> Option<RangeIds> {
    let (s, bases) = (moved.sheet, &workbook.bases);
    let (a, b) = (bases.parse(&range.top_left.r)?, bases.parse(&range.bottom_right.r)?);
    let (pa, pb) = (s.rows.snap_toward(a, b)?, s.rows.snap_toward(b, a)?);
    let same = match &moved.rows_after {
        Some(rows) => rows.snap_toward(a, b) == Some(pa) && rows.snap_toward(b, a) == Some(pb),
        None => !moved.changes(pa) && !moved.changes(pb),
    };
    if same {
        return None;
    }
    let corner = |p: usize, c: &CellIds| CellIds { r: bases.text(moved.row_after(p)), c: c.c.clone() };
    Some(RangeIds { top_left: corner(pa, &range.top_left), bottom_right: corner(pb, &range.bottom_right) })
}

/// Ranges with those that change named again; `None` when none does.
fn ranges_kept(workbook: &Workbook, moved: &Moved, ranges: &[RangeIds]) -> Option<Vec<RangeIds>> {
    let kept: Vec<Option<RangeIds>> = ranges.iter().map(|r| range_kept(workbook, moved, r)).collect();
    kept.iter()
        .any(Option::is_some)
        .then(|| kept.into_iter().zip(ranges).map(|(k, r)| k.unwrap_or_else(|| r.clone())).collect())
}

pub(super) fn conditional_formats(workbook: &Workbook, moved: &Moved) -> Result<Option<Op>, Refused> {
    let s = moved.sheet;
    let mut out = Vec::new();
    for (id, cf) in s.conditional_formats.values() {
        let Some(ranges) = ranges_kept(workbook, moved, &cf.ranges) else { continue };
        well_formed(id, "cfm")?;
        let patch = ConditionalFormatPatch { ranges: Some(ranges), priority: None, effect: None };
        out.push(ConditionalFormatToSet { conditional_format_id: id.clone(), conditional_format: Some(patch) });
    }
    Ok((!out.is_empty()).then(|| Op::SetConditionalFormats { sheet_id: s.id.clone(), conditional_formats: out }))
}

/// Placements anchored at a row at another place now (a deleted one counting as the next row there is), or, when
/// cells move, at one that holds another's.
pub(super) fn placements(workbook: &Workbook, moved: &Moved) -> Result<Option<Op>, Refused> {
    let (s, bases) = (moved.sheet, &workbook.bases);
    let mut out = Vec::new();
    for (id, placement) in s.placements.values() {
        let Some(r) = bases.parse(&placement.top_left.r) else { continue };
        let Some(p) = s.rows.snap_forward(r) else { continue };
        let same = match &moved.rows_after {
            Some(rows) => rows.snap_forward(r) == Some(p),
            None => !moved.changes(p),
        };
        if same {
            continue;
        }
        well_formed(id, "plc")?;
        let mut placement = placement.clone();
        placement.top_left.r = bases.text(moved.row_after(p));
        out.push(PlacementToSet { placement_id: id.clone(), placement: Some(placement) });
    }
    Ok((!out.is_empty()).then(|| Op::SetPlacements { sheet_id: s.id.clone(), placements: out }))
}

/// Views whose widgets read ranges of the sorted sheet that change. A view with an element whose id is not well
/// formed is left as it is.
pub(super) fn views(workbook: &Workbook, moved: &Moved) -> Result<Option<Op>, Refused> {
    let mut out = Vec::new();
    for (id, view) in workbook.views.values() {
        let element_well_formed = |ViewElement::Widget { element_id, .. }: &ViewElement| {
            super::super::is_well_formed(element_id, "vel")
        };
        if !view.elements.iter().all(element_well_formed) {
            continue;
        }
        let mut view = view.clone();
        let mut changes = false;
        for ViewElement::Widget { inputs, .. } in &mut view.elements {
            for input in inputs {
                if workbook.sheet_index(&input.range.sheet_id) != workbook.sheet_index(&moved.sheet.id) {
                    continue;
                }
                let range = RangeIds {
                    top_left: input.range.top_left.clone(),
                    bottom_right: input.range.bottom_right.clone(),
                };
                if let Some(range) = range_kept(workbook, moved, &range) {
                    (input.range.top_left, input.range.bottom_right) = (range.top_left, range.bottom_right);
                    changes = true;
                }
            }
        }
        if changes {
            well_formed(id, "viw")?;
            out.push(ViewToSet { view_id: id.clone(), view: Some(view) });
        }
    }
    Ok((!out.is_empty()).then(|| Op::SetViews { views: out }))
}
