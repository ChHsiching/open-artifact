//! Conditional formats: adding some, changing one's ranges or effect, moving one before another, removing one.
//!
//! A sheet's conditional formats apply in order of priority (the smallest first, then by id). Priorities are kept
//! 65536 apart: new ones go first, below the smallest; one moved goes halfway between its new neighbours. When there
//! is no room left (a priority would leave `i32`, or fall on a neighbour's), every one is numbered afresh, 0, 65536,
//! …, and the operation sets the priorities that changed.

use serde::Deserialize;

use super::{around, cell_ids, live_column, live_row, sheet_of, Made, Refused};
use crate::workbook::layout::RangeIds;
use crate::workbook::load::Op;
use crate::workbook::objects::{ConditionalFormatPatch, ConditionalFormatToSet, Effect};
use crate::workbook::{Sheet, Workbook};

/// The room left between two priorities.
const STEP: i64 = 65536;

/// A conditional format to add: the ranges it formats and what it does.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rule {
    pub ranges: Vec<RangeIds>,
    pub effect: Effect,
}

impl Rule {
    pub fn is_readable(&self) -> bool {
        !self.ranges.is_empty() && self.effect.is_readable()
    }
}

/// A range's corners, each of a row and a column not deleted, as the box between them: (top, bottom, left, right).
fn live_box(workbook: &Workbook, sheet: &Sheet, range: &RangeIds) -> Result<(usize, usize, usize, usize), Refused> {
    let (a, b) = (&range.top_left, &range.bottom_right);
    let (ar, ac) = (live_row(workbook, sheet, &a.r)?, live_column(workbook, sheet, &a.c)?);
    let (br, bc) = (live_row(workbook, sheet, &b.r)?, live_column(workbook, sheet, &b.c)?);
    Ok((ar.min(br), ar.max(br), ac.min(bc), ac.max(bc)))
}

/// What an effect and ranges come to on the sheet: the columns the effect names must be there, then the ranges'
/// corners; the ranges are written with their corners in order.
fn written_ranges(
    workbook: &Workbook,
    sheet: &Sheet,
    effect: Option<&Effect>,
    ranges: &[RangeIds],
) -> Result<(Vec<RangeIds>, Vec<(usize, usize, usize, usize)>), Refused> {
    for column in effect.iter().flat_map(|e| e.columns()) {
        live_column(workbook, sheet, column)?;
    }
    let boxes = ranges.iter().map(|r| live_box(workbook, sheet, r)).collect::<Result<Vec<_>, _>>()?;
    let ranges = boxes
        .iter()
        .map(|&(t, b, l, r)| RangeIds {
            top_left: cell_ids(workbook, sheet, (t, l)),
            bottom_right: cell_ids(workbook, sheet, (b, r)),
        })
        .collect();
    Ok((ranges, boxes))
}

/// The sheet's conditional formats in the order they apply: id and priority.
fn in_order(sheet: &Sheet) -> Vec<(&str, i32)> {
    let mut all: Vec<(&str, i32)> =
        sheet.conditional_formats.values().map(|(id, f)| (id.as_str(), f.priority)).collect();
    all.sort_by(|a, b| (a.1, a.0).cmp(&(b.1, b.0)));
    all
}

/// A conditional format given a priority alone.
fn priority_of(id: &str, priority: i64) -> ConditionalFormatToSet {
    let patch = ConditionalFormatPatch { priority: Some(priority as i32), ..Default::default() };
    ConditionalFormatToSet { conditional_format_id: id.to_owned(), conditional_format: Some(patch) }
}

/// The conditional formats numbered afresh in this order, those whose priority changes.
fn renumbered<'a>(order: impl Iterator<Item = (&'a str, i32)>, from: i64) -> Vec<ConditionalFormatToSet> {
    order
        .enumerate()
        .filter_map(|(k, (id, old))| {
            let priority = (from + k as i64) * STEP;
            (priority != old as i64).then(|| priority_of(id, priority))
        })
        .collect()
}

pub fn add(workbook: &Workbook, sheet_id: String, rules: Vec<Rule>, code: &str) -> Result<Made, Refused> {
    let sheet = sheet_of(workbook, &sheet_id)?;
    let mut written = Vec::with_capacity(rules.len());
    for rule in &rules {
        written.push(written_ranges(workbook, sheet, Some(&rule.effect), &rule.ranges)?);
    }
    let n = rules.len() as i64;
    let order = in_order(sheet);
    // New ones go first, below the smallest.
    let first = order.first().map_or(0, |&(_, p)| p as i64 - n * STEP);
    let renumber = first < i32::MIN as i64;
    let first = if renumber { 0 } else { first };
    let place = around(&sheet_id, written.iter().flat_map(|(_, boxes)| boxes));
    let mut set: Vec<ConditionalFormatToSet> = rules
        .into_iter()
        .zip(written)
        .enumerate()
        .map(|(k, (rule, (ranges, _)))| {
            let patch = ConditionalFormatPatch {
                ranges: Some(ranges),
                priority: Some((first + k as i64 * STEP) as i32),
                effect: Some(rule.effect),
            };
            ConditionalFormatToSet { conditional_format_id: format!("cfm_{code}.{k}"), conditional_format: Some(patch) }
        })
        .collect();
    if renumber {
        set.extend(renumbered(order.into_iter(), n));
    }
    let op = Op::SetConditionalFormats { sheet_id, conditional_formats: set };
    Ok(Made { ops: vec![op], place: Some(place) })
}

pub fn change(
    workbook: &Workbook,
    sheet_id: String,
    id: String,
    ranges: Option<Vec<RangeIds>>,
    effect: Option<Effect>,
) -> Result<Made, Refused> {
    let sheet = sheet_of(workbook, &sheet_id)?;
    let Some((_, old)) = sheet.conditional_formats.get(&id) else {
        return Err(Refused::Because("unknownConditionalFormat"));
    };
    let (ranges, _) = written_ranges(workbook, sheet, effect.as_ref(), ranges.as_deref().unwrap_or_default())?;
    // No ranges written are none to change (an edit's ranges are never none).
    let ranges = (!ranges.is_empty() && ranges != old.ranges).then_some(ranges);
    let effect = effect.filter(|e| *e != old.effect);
    if ranges.is_none() && effect.is_none() {
        return Ok(Made::nothing());
    }
    let patch = ConditionalFormatPatch { ranges, priority: None, effect };
    let set = vec![ConditionalFormatToSet { conditional_format_id: id, conditional_format: Some(patch) }];
    Ok(Made::ops(vec![Op::SetConditionalFormats { sheet_id, conditional_formats: set }]))
}

/// Moves a conditional format to apply just before another (`None`: last).
pub fn move_before(workbook: &Workbook, sheet_id: String, id: String, before: Option<String>) -> Result<Made, Refused> {
    let sheet = sheet_of(workbook, &sheet_id)?;
    let unknown = Refused::Because("unknownConditionalFormat");
    if !sheet.conditional_formats.contains_key(&id) {
        return Err(unknown);
    }
    if before.as_ref().is_some_and(|b| !sheet.conditional_formats.contains_key(b)) {
        return Err(unknown);
    }
    if before.as_deref() == Some(id.as_str()) {
        return Ok(Made::nothing());
    }
    let mut order = in_order(sheet);
    let from = order.iter().position(|(i, _)| *i == id).expect("the conditional format is there");
    let moved = order.remove(from);
    let to = match &before {
        Some(b) => order.iter().position(|(i, _)| i == b).expect("the conditional format is there"),
        None => order.len(),
    };
    if to == from {
        return Ok(Made::nothing());
    }
    let previous = to.checked_sub(1).map(|i| order[i].1 as i64);
    let next = order.get(to).map(|&(_, p)| p as i64);
    let priority = match (previous, next) {
        (Some(a), Some(b)) => (a + b).div_euclid(2),
        (None, Some(b)) => b - STEP,
        (Some(a), None) => a + STEP,
        (None, None) => return Ok(Made::nothing()),
    };
    let fits = previous.is_none_or(|a| priority > a)
        && next.is_none_or(|b| priority < b)
        && (i32::MIN as i64..=i32::MAX as i64).contains(&priority);
    order.insert(to, moved);
    let set = if fits { vec![priority_of(moved.0, priority)] } else { renumbered(order.into_iter(), 0) };
    Ok(Made::ops(vec![Op::SetConditionalFormats { sheet_id, conditional_formats: set }]))
}

pub fn remove(workbook: &Workbook, sheet_id: String, id: String) -> Result<Made, Refused> {
    let sheet = sheet_of(workbook, &sheet_id)?;
    if !sheet.conditional_formats.contains_key(&id) {
        return Err(Refused::Because("unknownConditionalFormat"));
    }
    let set = vec![ConditionalFormatToSet { conditional_format_id: id, conditional_format: None }];
    Ok(Made::ops(vec![Op::SetConditionalFormats { sheet_id, conditional_formats: set }]))
}
