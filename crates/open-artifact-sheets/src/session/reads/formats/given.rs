//! The formats conditional formats give (`readFormatsGiven`): what each cell is given, the color scales with the
//! numbers their stops come to, and how many cells and rows each conditional format matches. The page asks as if
//! some rules were written (`asIf`), each added or in place of one of the sheet's.
//!
//! The conditional formats apply in order: the rules added, as written, then the sheet's by priority (the smallest
//! first, then by id), a rule in place of one in its place. Each part of a format (the fill, bold, italic,
//! underline, strikethrough, the font's color)
//! is given by the first that gives it; a color scale takes the fill of the cells of its that hold a number, and
//! tells its stops instead. The cells of a rule are those of its ranges now (each once); a test reads the cell
//! itself, or the one in the same row of a column; values are those the sheet shows, an array's spilled in.

use std::collections::{BTreeMap, BTreeSet};
use hashbrown::HashMap;

use serde::Deserialize;
use serde_json::{json, Value as Json};

use crate::session::edits::objects::{
    condition_within_limits, MOST_RANGES_IN_A_CONDITIONAL_FORMAT, MOST_TESTS_IN_A_CONDITIONAL_FORMAT,
};
use crate::session::reads::tables::values::SheetValues;
use crate::value::{number_text, Value};
use crate::workbook::formats::{blocks, Leaf};
use crate::workbook::layout::{written, RangeIds};
use crate::workbook::objects::{
    CellCondition, Comparison, Effect, FormatOfACondition, HighestAnchor, LowestAnchor, MiddleAnchor, NumberOperand,
    Test, TestedCell,
};
use crate::workbook::{Sheet, Workbook};

/// A rule as if added first, perhaps in place of a conditional format of the sheet.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AsIf {
    ranges: Vec<RangeIds>,
    effect: Effect,
    #[serde(deserialize_with = "written::maybe_null")]
    in_place_of: Option<String>,
}

/// A rule to apply: its ranges and what it does.
struct Rule<'a> {
    ranges: &'a [RangeIds],
    effect: &'a Effect,
}

pub fn formats_given<'a>(
    workbook: &'a Workbook,
    sheet_id: &str,
    as_if: &'a [AsIf],
    now: Option<f64>,
) -> Result<Json, &'static str> {
    if !as_if.iter().all(|a| !a.ranges.is_empty() && a.effect.is_readable()) {
        return Err("unreadableRequest");
    }
    let sheet = &workbook.sheets[workbook.sheet_index(sheet_id).ok_or("unknownSheet")?];
    let mut in_place_of: Vec<&str> = Vec::new();
    for rule in as_if {
        check(workbook, sheet, rule)?;
        if let Some(id) = &rule.in_place_of {
            if !sheet.conditional_formats.contains_key(id) {
                return Err("unknownConditionalFormat");
            }
            if in_place_of.contains(&id.as_str()) {
                return Err("conditionalFormatNamedTwice");
            }
            in_place_of.push(id);
        }
    }
    // The rules added go first; one in place of a conditional format of the sheet takes its place.
    let rule = |a: &'a AsIf| Rule { ranges: &a.ranges, effect: &a.effect };
    let mut rules: Vec<Rule> = as_if.iter().filter(|a| a.in_place_of.is_none()).map(rule).collect();
    let mut sheets: Vec<_> = sheet.conditional_formats.iter().collect();
    sheets.sort_by(|a, b| (a.1 .1.priority, a.0).cmp(&(b.1 .1.priority, b.0)));
    rules.extend(sheets.into_iter().map(|(key, (_, f))| {
        match as_if.iter().find(|a| a.in_place_of.as_ref() == Some(key)) {
            Some(a) => rule(a),
            None => Rule { ranges: &f.ranges, effect: &f.effect },
        }
    }));
    Ok(Giving::new(workbook, sheet, now).answer(&rules))
}

/// A rule as if added against the limits and the sheet: not too many ranges or tests, conditions within limits;
/// the rows of its ranges, then their columns, then the columns its tests name, each one the sheet has had.
fn check(workbook: &Workbook, sheet: &Sheet, rule: &AsIf) -> Result<(), &'static str> {
    if rule.ranges.len() > MOST_RANGES_IN_A_CONDITIONAL_FORMAT {
        return Err("tooManyRangesInConditionalFormat");
    }
    if let Effect::FormatWhere { all_of, .. } = &rule.effect {
        if all_of.len() > MOST_TESTS_IN_A_CONDITIONAL_FORMAT {
            return Err("tooManyTestsInConditionalFormat");
        }
        for test in all_of {
            condition_within_limits(&test.condition)?;
        }
    }
    let known = |axis: &crate::ids::Axis, id: &str| workbook.bases.parse(id).is_some_and(|l| axis.knows(l));
    if !rule.ranges.iter().all(|r| known(&sheet.rows, &r.top_left.r) && known(&sheet.rows, &r.bottom_right.r)) {
        return Err("unknownRow");
    }
    if !rule.ranges.iter().all(|r| known(&sheet.columns, &r.top_left.c) && known(&sheet.columns, &r.bottom_right.c)) {
        return Err("unknownColumn");
    }
    if !rule.effect.columns().into_iter().all(|c| known(&sheet.columns, c)) {
        return Err("unknownColumn");
    }
    Ok(())
}

/// What a cell holds that duplicates are found by: a number by its value, a text whatever its case, a truth value.
#[derive(PartialEq, Eq, Hash)]
enum Held {
    Number(u64),
    Text(String),
    Boolean(bool),
}

/// What a test reads of the cells it tests, beyond each cell: the threshold of a largest or smallest so many, the
/// values held more than once.
enum Among {
    Nothing,
    Threshold(Option<f64>),
    Repeated(HashMap<Held, usize>),
}

/// The formats being given: the values of the sheet, and what each part of each cell is given (`None`: a color
/// scale's fill).
struct Giving<'a> {
    workbook: &'a Workbook,
    sheet: &'a Sheet,
    values: SheetValues,
    /// The first day a test of days from today counts from (none: no clock reading).
    today: Option<f64>,
    given: BTreeMap<(usize, usize, Leaf), Option<Json>>,
}

impl<'a> Giving<'a> {
    fn new(workbook: &'a Workbook, sheet: &'a Sheet, now: Option<f64>) -> Giving<'a> {
        let values = SheetValues::of(workbook, sheet);
        Giving { workbook, sheet, values, today: now.map(f64::floor), given: BTreeMap::new() }
    }

    fn answer(mut self, rules: &[Rule]) -> Json {
        let mut scales = Vec::new();
        let mut matches = Vec::new();
        for rule in rules {
            let cells = self.cells(rule.ranges);
            match rule.effect {
                Effect::FormatWhere { all_of, format } => {
                    let matched = self.matched(&cells, all_of);
                    let rows: BTreeSet<usize> = matched.iter().map(|&(r, _)| r).collect();
                    matches.push(json!({"cells": matched.len(), "rows": rows.len()}));
                    let leaves = leaves(format);
                    for &(r, c) in &matched {
                        for (leaf, value) in &leaves {
                            self.given.entry((r, c, *leaf)).or_insert_with(|| Some(value.clone()));
                        }
                    }
                }
                Effect::ColorScale { lowest, middle, highest } => {
                    matches.push(Json::Null);
                    let numbered: Vec<((usize, usize), f64)> = cells
                        .iter()
                        .filter_map(|&(r, c)| match self.values.get(r, c) {
                            Value::Number(n) => Some(((r, c), *n)),
                            _ => None,
                        })
                        .collect();
                    if numbered.is_empty() {
                        continue;
                    }
                    for &((r, c), _) in &numbered {
                        self.given.entry((r, c, Leaf::FillColor)).or_insert(None);
                    }
                    let mut numbers: Vec<f64> = numbered.iter().map(|&(_, n)| n).collect();
                    numbers.sort_by(f64::total_cmp);
                    let low = match lowest.anchor {
                        LowestAnchor::SmallestNumber {} => numbers[0],
                        LowestAnchor::Number { number } => number,
                        LowestAnchor::Percentile { percentile } => percentile_of(&numbers, percentile),
                    };
                    let mut stops = vec![(low, &lowest.color)];
                    if let Some(middle) = middle {
                        let at = match middle.anchor {
                            MiddleAnchor::Number { number } => number,
                            MiddleAnchor::Percentile { percentile } => percentile_of(&numbers, percentile),
                        };
                        stops.push((at, &middle.color));
                    }
                    let high = match highest.anchor {
                        HighestAnchor::LargestNumber {} => numbers[numbers.len() - 1],
                        HighestAnchor::Number { number } => number,
                        HighestAnchor::Percentile { percentile } => percentile_of(&numbers, percentile),
                    };
                    stops.push((high, &highest.color));
                    // Each stop at least where the one before it is.
                    for i in 1..stops.len() {
                        stops[i].0 = stops[i].0.max(stops[i - 1].0);
                    }
                    let bases = &self.workbook.bases;
                    let ranges: Vec<RangeIds> = rule.ranges.iter().filter_map(|r| self.sheet.live_range(bases, r)).collect();
                    let stops: Vec<Json> = stops.into_iter().map(|(at, color)| json!({"at": at, "color": color})).collect();
                    scales.push(json!({"ranges": ranges, "stops": stops}));
                }
            }
        }
        let (sheet, bases) = (self.sheet, &self.workbook.bases);
        let given: Vec<(Leaf, _, &Json)> = self
            .given
            .iter()
            .filter_map(|(&(r, c, leaf), value)| {
                let at = (sheet.rows.line(r).expect("a live row"), sheet.columns.line(c).expect("a live column"));
                Some((leaf, at, value.as_ref()?))
            })
            .collect();
        let formats: Vec<Json> = blocks(bases, given.into_iter())
            .into_iter()
            .map(|(rows, columns, format)| json!({"rows": rows, "columns": columns, "format": format}))
            .collect();
        json!({"kind": "formatsGiven", "notWorkedOut": null, "formats": formats, "colorScales": scales, "matches": matches})
    }

    /// The cells for which every test holds, of those a rule's ranges take.
    fn matched(&self, cells: &BTreeSet<(usize, usize)>, all_of: &[Test]) -> Vec<(usize, usize)> {
        let mut matched: Vec<(usize, usize)> = cells.iter().copied().collect();
        for test in all_of {
            let tested = self.tested_column(&test.tested);
            let at = |&(r, c): &(usize, usize)| tested.map(|t| (r, t.unwrap_or(c)));
            let among = self.among(&test.condition, cells.iter().filter_map(at).collect());
            matched.retain(|cell| at(cell).is_some_and(|(r, c)| self.holds(&test.condition, r, c, &among)));
        }
        matched
    }

    /// The cells of ranges now, each once: (row, column).
    fn cells(&self, ranges: &[RangeIds]) -> BTreeSet<(usize, usize)> {
        let mut cells = BTreeSet::new();
        for (t, b, l, r) in ranges.iter().filter_map(|range| self.sheet.live_box(&self.workbook.bases, range)) {
            for row in t..=b {
                cells.extend((l..=r).map(|column| (row, column)));
            }
        }
        cells
    }

    /// The column a test reads in each row: the cell's own (`Some(None)`), another's, or none (it is deleted).
    fn tested_column(&self, tested: &TestedCell) -> Option<Option<usize>> {
        match tested {
            TestedCell::TheCellItself {} => Some(None),
            TestedCell::SameRowInColumn { c } => self.column(c).map(Some),
        }
    }

    fn column(&self, id: &str) -> Option<usize> {
        self.workbook.bases.parse(id).and_then(|l| self.sheet.columns.position(l))
    }

    /// What a condition reads of all the cells tested (each once).
    fn among(&self, condition: &CellCondition, tested: BTreeSet<(usize, usize)>) -> Among {
        match condition {
            CellCondition::IsAmongTheLargest { count } | CellCondition::IsAmongTheSmallest { count } => {
                let mut numbers: Vec<f64> = tested
                    .iter()
                    .filter_map(|&(r, c)| match self.values.get(r, c) {
                        Value::Number(n) => Some(*n),
                        _ => None,
                    })
                    .collect();
                if matches!(condition, CellCondition::IsAmongTheLargest { .. }) {
                    numbers.sort_by(|a, b| b.total_cmp(a));
                } else {
                    numbers.sort_by(f64::total_cmp);
                }
                let k = (count.get() as usize).min(numbers.len());
                Among::Threshold(k.checked_sub(1).map(|i| numbers[i]))
            }
            CellCondition::AppearsMoreThanOnce {} => {
                let mut times = HashMap::new();
                for &(r, c) in &tested {
                    if let Some(held) = held(self.values.get(r, c)) {
                        *times.entry(held).or_insert(0) += 1;
                    }
                }
                Among::Repeated(times)
            }
            _ => Among::Nothing,
        }
    }

    /// Whether a condition holds for the cell tested.
    fn holds(&self, condition: &CellCondition, r: usize, c: usize, among: &Among) -> bool {
        let value = self.values.get(r, c);
        let number = match value {
            Value::Number(n) => Some(*n),
            _ => None,
        };
        let text = || text_of(value).map(|t| small(&t));
        match condition {
            CellCondition::IsBlank {} => is_blank(value),
            CellCondition::IsNotBlank {} => !is_blank(value),
            CellCondition::NumberIs { comparison, operand } => match (number, self.operand(operand, r)) {
                (Some(x), Some(y)) => compare(*comparison, x, y),
                _ => false,
            },
            CellCondition::NumberIsBetween { one_end, other_end } | CellCondition::NumberIsNotBetween { one_end, other_end } => {
                let (Some(x), Some(a), Some(b)) = (number, self.operand(one_end, r), self.operand(other_end, r)) else {
                    return false;
                };
                let between = a.min(b) <= x && x <= a.max(b);
                between == matches!(condition, CellCondition::NumberIsBetween { .. })
            }
            CellCondition::TextIs { text: t } => text().is_some_and(|x| x == small(t)),
            CellCondition::TextIsNot { text: t } => text().is_some_and(|x| x != small(t)),
            CellCondition::TextContains { text: t } => text().is_some_and(|x| x.contains(&small(t))),
            CellCondition::TextDoesNotContain { text: t } => text().is_some_and(|x| !x.contains(&small(t))),
            CellCondition::TextStartsWith { text: t } => text().is_some_and(|x| x.starts_with(&small(t))),
            CellCondition::TextEndsWith { text: t } => text().is_some_and(|x| x.ends_with(&small(t))),
            CellCondition::BooleanIs { value: v } => matches!(value, Value::Boolean(b) if b == v),
            CellCondition::IsAmongTheLargest { .. } => match (number, among) {
                (Some(x), Among::Threshold(Some(t))) => x >= *t,
                _ => false,
            },
            CellCondition::IsAmongTheSmallest { .. } => match (number, among) {
                (Some(x), Among::Threshold(Some(t))) => x <= *t,
                _ => false,
            },
            CellCondition::AppearsMoreThanOnce {} => match (held(value), among) {
                (Some(h), Among::Repeated(times)) => times.get(&h).is_some_and(|&n| n > 1),
                _ => false,
            },
            CellCondition::IsAnError {} => value.is_error(),
        }
    }

    /// The number an operand comes to in a row: none for a cell that holds no number, a column deleted, or days
    /// from today with no clock reading.
    fn operand(&self, operand: &NumberOperand, r: usize) -> Option<f64> {
        match operand {
            NumberOperand::Number { number } => Some(*number),
            NumberOperand::DaysFromToday { days } => self.today.map(|today| today + *days as f64),
            NumberOperand::SameRowInColumn { c } => match self.values.get(r, self.column(c)?) {
                Value::Number(n) => Some(*n),
                _ => None,
            },
        }
    }
}

/// Rules matched as the formats given match them, against the values a sheet shows now.
pub(in crate::session::reads) struct Matching<'a>(Giving<'a>);

impl<'a> Matching<'a> {
    pub(in crate::session::reads) fn new(workbook: &'a Workbook, sheet: &'a Sheet, now: Option<f64>) -> Matching<'a> {
        Matching(Giving::new(workbook, sheet, now))
    }

    /// The cells of some ranges for which every test holds.
    pub(in crate::session::reads) fn matched(&self, ranges: &[RangeIds], all_of: &[Test]) -> Vec<(usize, usize)> {
        self.0.matched(&self.0.cells(ranges), all_of)
    }
}

/// The parts of the cell format a format of a condition gives, as the cell format writes them.
fn leaves(format: &FormatOfACondition) -> Vec<(Leaf, Json)> {
    let mut out = Vec::new();
    if let Some(fill) = &format.fill_color {
        out.push((Leaf::FillColor, fill.0.clone()));
    }
    if let Some(font) = &format.font {
        let flags = [(Leaf::Bold, font.bold), (Leaf::Italic, font.italic), (Leaf::Strikethrough, font.strikethrough)];
        out.extend(flags.into_iter().filter_map(|(leaf, on)| on.map(|on| (leaf, json!(on)))));
        if let Some(underline) = &font.underline {
            out.push((Leaf::Underline, json!(underline)));
        }
        if let Some(color) = &font.color {
            out.push((Leaf::FontColor, color.0.clone()));
        }
    }
    out
}

/// An empty cell, or one that shows an empty text.
fn is_blank(value: &Value) -> bool {
    match value {
        Value::Blank => true,
        Value::Text(t) => t.is_empty(),
        _ => false,
    }
}

/// A cell as text to the tests of texts: none for an error.
fn text_of(value: &Value) -> Option<String> {
    match value {
        Value::Blank => Some(String::new()),
        Value::Number(n) => Some(number_text(*n)),
        Value::Text(t) => Some(t.to_string()),
        Value::Boolean(b) => Some(if *b { "TRUE" } else { "FALSE" }.to_owned()),
        Value::Error(_) => None,
    }
}

/// A text in small letters, each character on its own: a final capital sigma is a sigma, not a final sigma.
pub(crate) fn small(text: &str) -> String {
    text.chars().flat_map(char::to_lowercase).collect()
}

/// What duplicates are found by: none for an empty cell, an empty text or an error.
fn held(value: &Value) -> Option<Held> {
    match value {
        Value::Number(n) => Some(Held::Number(if *n == 0.0 { 0 } else { n.to_bits() })),
        Value::Text(t) if !t.is_empty() => Some(Held::Text(small(t))),
        Value::Boolean(b) => Some(Held::Boolean(*b)),
        _ => None,
    }
}

fn compare(comparison: Comparison, x: f64, y: f64) -> bool {
    match comparison {
        Comparison::EqualTo => x == y,
        Comparison::NotEqualTo => x != y,
        Comparison::GreaterThan => x > y,
        Comparison::GreaterThanOrEqualTo => x >= y,
        Comparison::LessThan => x < y,
        Comparison::LessThanOrEqualTo => x <= y,
    }
}

/// The number a percentile of the way through sorted numbers (as PERCENTILE.INC finds it).
fn percentile_of(sorted: &[f64], percentile: f64) -> f64 {
    let h = percentile / 100.0 * (sorted.len() - 1) as f64;
    let low = h.floor();
    let i = low as usize;
    if i + 1 >= sorted.len() {
        return sorted[sorted.len() - 1];
    }
    sorted[i] + (h - low) * (sorted[i + 1] - sorted[i])
}
