//! The header of a block: which of its rows that read like a header scores best over the rows under it, and how
//! sure that is.

use std::collections::BTreeSet;

use super::grid::{Grid, Kind, Shown};
use super::rows::width;

/// How sure a header is: not, fairly, or enough that nothing above or below it need be looked at.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Certainty {
    Unsure,
    Sure,
    Certain,
}

/// A row's score as a header over the rows under it.
#[derive(Clone, Copy, Debug)]
pub(super) struct Score {
    pub value: f64,
    pub certainty: Certainty,
    /// Whether texts head columns of numbers or booleans.
    pub typed: bool,
}

/// The header found in a block, and where its body ends.
#[derive(Clone, Copy, Debug)]
pub(super) struct Header {
    /// The header row and its score; none when no row scores.
    pub found: Option<(usize, Score)>,
    /// The header row, or the block's top when there is none.
    pub top: usize,
    /// The body's last row.
    pub end: usize,
    /// Whether the body ends above the block's bottom, where the header comes again.
    pub ends_early: bool,
}

impl Header {
    pub(super) fn row(&self) -> Option<usize> {
        self.found.map(|(row, _)| row)
    }

    pub(super) fn score(&self) -> Option<Score> {
        self.found.map(|(_, score)| score)
    }
}

impl Grid<'_> {
    /// How well a row heads the rows under it to `end`: columns of one kind of value, texts naming columns of
    /// numbers or booleans, a marked header over an unmarked body, few header texts found again in their column.
    /// None when it does not head them.
    pub(super) fn header_score(&self, row: usize, first: usize, last: usize, top: usize, end: usize, repeated: bool) -> Option<Score> {
        let header_columns = self.filled_columns(row, first, last);
        if first > last {
            return None;
        }
        let body_top = row.saturating_add(1);
        let body = || (body_top..=end).take(200);
        let (mut value_columns, mut shares, mut with_values, mut named, mut found_again) = (0usize, 0.0, 0usize, 0usize, 0usize);
        let mut typed: Vec<(usize, Kind)> = Vec::new();
        for c in first..=last {
            let (kind, share) = self.commonest_kind(c, body_top, end, 200);
            if kind == Kind::Nothing {
                continue;
            }
            if kind.is_value() {
                value_columns += 1;
            }
            shares += share;
            with_values += 1;
            let Some(head) = self.content(row, c) else { continue };
            if body_top <= end && body().any(|r| self.own(r, c).is_some_and(|v| v.is_like(head))) {
                found_again += 1;
            }
            if kind.is_value() && matches!(head, Shown::Text(_)) {
                typed.push((c, kind));
            }
            named += 1;
        }
        if named == 0 || with_values == 0 || body_top > end {
            return None;
        }
        let first_body_row = body().find(|&r| !self.filled_columns(r, first, last).is_empty())?;
        // A single number in the header heads a column of years more often than not.
        let numbers: Vec<usize> = header_columns.iter().copied().filter(|&c| self.kind(row, c) == Kind::Number).collect();
        if let [year] = numbers[..] {
            if !body().any(|r| self.own(r, year).is_some()) {
                return None;
            }
            let years = body().filter(|&r| self.own(r, year).is_some_and(Shown::is_year)).count();
            let cells = body().filter(|&r| self.own(r, year).is_some()).count();
            if cells != 0 && years as f64 / cells as f64 > 0.5 {
                return None;
            }
        }
        let marked = |r: usize, columns: &[usize]| columns.iter().filter(|&&c| self.shows_marked(r, c)).count() as f64;
        let mut header_marked = false;
        if !header_columns.is_empty() && marked(row, &header_columns) / header_columns.len() as f64 > 0.7 {
            let body_columns = self.filled_columns(first_body_row, first, last);
            header_marked = body_columns.is_empty() || marked(first_body_row, &body_columns) / (body_columns.len() as f64) < 0.5;
        }
        let names: BTreeSet<String> = typed.iter().filter_map(|&(c, _)| self.label(row, c)).collect();
        let mut certainty = Certainty::Certain;
        if names.len() == 1 {
            let labels: Vec<String> = header_columns.iter().filter_map(|&c| self.label(row, c)).collect();
            let same = labels.iter().filter(|l| names.contains(*l)).count();
            if same >= 2 && !header_marked && same < labels.len() {
                certainty = Certainty::Sure;
            }
        }
        let mut typed_count = typed.len();
        let share_found_again = found_again as f64 / named as f64;
        let heads = if header_marked
            || repeated
            || (typed_count > 1 && typed_count == value_columns && names.len() == value_columns)
        {
            header_marked || share_found_again < 0.34 || typed_count != 0
        } else {
            // The kinds a header names, found again just above it: the header is one row of a bigger one.
            let above = typed.iter().any(|&(c, kind)| (top..row).rev().take(10).any(|r| self.kind(r, c) == kind));
            if !above {
                share_found_again < 0.34 || typed_count != 0
            } else if typed_count == named {
                false
            } else {
                typed_count = 0;
                share_found_again < 0.34
            }
        };
        if !heads {
            return None;
        }
        let value = (if header_marked { 0.6 } else { 0.0 })
            + ((shares + shares) / with_values as f64 + (typed_count as f64 / named as f64) * 0.8)
            + (header_columns.len() as f64 / width(first, last) as f64) * 0.6
            + share_found_again * -1.2;
        if !(value >= 0.0) {
            return None;
        }
        let kept = if share_found_again >= 0.5 { Certainty::Unsure } else { certainty };
        let certainty = if header_marked || typed_count != 0 { kept } else { Certainty::Unsure };
        Some(Score { value, certainty, typed: typed_count != 0 })
    }

    /// The best header among a block's first 60 rows that read like one, with its body: down to the block's bottom,
    /// or to just above where it comes again (less section titles and a label row at the end). Asked about a row, a
    /// header counts only when its body holds the row, or, before any has scored, it is under the row.
    pub(super) fn find_header(&self, top: usize, bottom: usize, first: usize, last: usize, asked: Option<usize>) -> Header {
        let candidates: Vec<usize> = (top..top.max(bottom))
            .take_while(|r| r - top <= 59)
            .filter(|&r| self.is_header_like(r, first, last))
            .collect();
        let columns = width(first, last);
        let span = last.saturating_sub(first);
        let mut best: Option<(usize, Score, usize)> = None;
        for &row in &candidates {
            let repeated = candidates.iter().take_while(|&&c| c < row).any(|&c| self.repeats(row, c, first, last));
            let mut end = bottom;
            if let Some(&again) = candidates.iter().find(|&&c| c > row && self.repeats(c, row, first, last)) {
                end = again - 1;
                if end > row {
                    let mut trimmed = true;
                    while self.is_section_title(end, first, last, columns) {
                        end -= 1;
                        if end <= row {
                            trimmed = false;
                            break;
                        }
                    }
                    if trimmed {
                        let label = if self.is_sparse_label(end, first, last) {
                            span > 2
                        } else {
                            self.label_echoes_above(end, row, first, last) && span >= 3
                        };
                        if label {
                            end -= 1;
                        }
                    }
                }
            }
            if end <= row {
                continue;
            }
            if let Some(asked) = asked {
                if !((row <= asked && asked <= end) || (asked < row && best.is_none())) {
                    continue;
                }
            }
            let Some(score) = self.header_score(row, first, last, top, end, repeated) else { continue };
            if score.certainty == Certainty::Unsure && !repeated && row > top {
                // A row of the same kinds as the row above it is one more row of a body.
                let columns = self.filled_columns(row, first, last);
                if columns.iter().all(|&c| self.kind(row - 1, c) == self.kind(row, c)) {
                    continue;
                }
            }
            if best.map_or(true, |(_, b, _)| score.value > b.value + 1e-9) {
                best = Some((row, score, end));
            }
        }
        let none = Header { found: None, top, end: bottom, ends_early: false };
        let Some((row, score, end)) = best else { return none };
        if asked.is_some_and(|asked| asked < row) && score.certainty == Certainty::Unsure {
            return none;
        }
        Header { found: Some((row, score)), top: row, end, ends_early: end < bottom }
    }
}
