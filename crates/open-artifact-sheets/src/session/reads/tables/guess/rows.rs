//! What the guess asks of a row or a column: whether a row reads like a header, a label, a section's title or the
//! header again; how alike two rows are; the next block of rows up or down; whether something stands beside a
//! block; the commonest kind of a column's values.

use std::collections::BTreeMap;

use super::grid::{Grid, Kind};

/// How many columns there are from one to the other (one, when they are the wrong way round).
pub(super) fn width(first: usize, last: usize) -> usize {
    last.saturating_sub(first).saturating_add(1)
}

/// A block of rows found up or down: its first and last rows, and how many empty rows lie between it and the row
/// it was looked for from.
#[derive(Clone, Copy, Debug)]
pub(super) struct Block {
    pub first: usize,
    pub last: usize,
    pub gap: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Toward {
    Up,
    Down,
}

impl Grid<'_> {
    /// Whether a row reads like a header from one column to the other: two cells at least (one in a single column),
    /// three in five filled, all texts or years, and when there are years the first a text.
    pub(super) fn is_header_like(&self, row: usize, first: usize, last: usize) -> bool {
        let columns = self.filled_columns(row, first, last);
        if columns.len() < if first == last { 1 } else { 2 } {
            return false;
        }
        if (columns.len() as f64) / (width(first, last) as f64) < 0.6 {
            return false;
        }
        let mut years = 0;
        for &c in &columns {
            match self.content(row, c) {
                Some(shown @ super::grid::Shown::Number(_)) => {
                    if !shown.is_year() {
                        return false;
                    }
                    years += 1;
                }
                Some(super::grid::Shown::Text(_)) => {}
                _ => return false,
            }
        }
        years == 0 || self.kind(row, columns[0]) == Kind::Text
    }

    /// A row's label: one or two texts, not formulas, in fewer cells than the columns, read as its first.
    pub(super) fn label_of(&self, row: usize, first: usize, last: usize) -> Option<String> {
        let columns = self.filled_columns(row, first, last);
        if columns.is_empty() || columns.len() > 2 || columns.len() >= width(first, last) {
            return None;
        }
        for &c in &columns {
            if self.kind(row, c) != Kind::Text || self.holds_formula(row, c) {
                return None;
            }
        }
        self.label(row, columns[0])
    }

    /// A row with a label and fewer than half its cells filled.
    pub(super) fn is_sparse_label(&self, row: usize, first: usize, last: usize) -> bool {
        let filled = self.count(row, first, last) as f64;
        filled / (width(first, last) as f64) < 0.5 && self.label_of(row, first, last).is_some()
    }

    /// Whether a row's label and the label of the row above a header begin alike: one starts the other.
    pub(super) fn label_echoes_above(&self, row: usize, header: usize, first: usize, last: usize) -> bool {
        let above = if header == 0 { None } else { self.label_of(header - 1, first, last) };
        match (above, self.label_of(row, first, last)) {
            (Some(a), Some(b)) => a.starts_with(&b) || b.starts_with(&a),
            _ => false,
        }
    }

    /// A section's title: a single text in a row of three columns or more.
    pub(super) fn is_section_title(&self, row: usize, first: usize, last: usize, columns: usize) -> bool {
        let filled = self.filled_columns(row, first, last);
        columns >= 3 && filled.len() == 1 && self.kind(row, filled[0]) == Kind::Text
    }

    /// Whether every cell a row shows from one column to the other looks like a header's (bold or filled).
    pub(super) fn is_marked_row(&self, row: usize, first: usize, last: usize) -> bool {
        self.filled_columns(row, first, last).into_iter().all(|c| self.shows_marked(row, c))
    }

    /// Whether a row shows something, and shows the same as another row wherever it does.
    pub(super) fn is_copy_of(&self, row: usize, other: usize, first: usize, last: usize) -> bool {
        let columns = self.filled_columns(row, first, last);
        !columns.is_empty() && columns.into_iter().all(|c| self.alike((row, c), (other, c)))
    }

    /// Whether a row is much like one of the rows from one to another: in half its columns or more, three in five of
    /// its cells show what the same column shows in one of them.
    pub(super) fn echoes(&self, row: usize, top: usize, bottom: usize, first: usize, last: usize) -> bool {
        let columns = self.filled_columns(row, first, last);
        if columns.is_empty() {
            return false;
        }
        let matched = columns.iter().filter(|&&c| top <= bottom && (top..=bottom).any(|r| self.alike((row, c), (r, c)))).count();
        let n = columns.len();
        if n == 1 || (n as f64) / (width(first, last) as f64) < 0.5 {
            return false;
        }
        (matched as f64) / (n as f64) >= 0.6
    }

    /// Whether a row repeats a header row: two cells or more, three in five alike, and the first alike; or, where a
    /// text is alike, values under it within five rows; or else both rows marked and the row under the first not.
    pub(super) fn repeats(&self, row: usize, header: usize, first: usize, last: usize) -> bool {
        let columns = self.filled_columns(row, first, last);
        let matched = columns.iter().filter(|&&c| self.alike((row, c), (header, c))).count();
        if columns.len() < 2 || (matched as f64) / (columns.len() as f64) < 0.6 {
            return false;
        }
        if self.alike((row, columns[0]), (header, columns[0])) {
            return true;
        }
        let (Some(next), Some(fifth)) = (row.checked_add(1), row.checked_add(5)) else { return self.marked_pair(row, header, first, last) };
        for &c in &columns {
            if !self.alike((row, c), (header, c)) || self.kind(row, c) != Kind::Text {
                continue;
            }
            if (next..=fifth).any(|r| self.kind(r, c).is_value()) {
                return true;
            }
        }
        self.marked_pair(row, header, first, last)
    }

    fn marked_pair(&self, row: usize, header: usize, first: usize, last: usize) -> bool {
        self.is_marked_row(row, first, last)
            && self.is_marked_row(header, first, last)
            && !self.is_marked_row(row.saturating_add(1), first, last)
    }

    /// The next block of rows up or down from a row, across ten empty rows at most: none when the next row shows
    /// something already.
    pub(super) fn next_block(&self, row: usize, toward: Toward, first: usize, last: usize) -> Option<Block> {
        let step = |r: usize| match toward {
            Toward::Up => r.checked_sub(1),
            Toward::Down => r.checked_add(1),
        };
        let mut r = step(row)?;
        if r > self.last_row {
            return None;
        }
        let mut gap = 0;
        loop {
            if self.row_has_any(r, first, last) {
                if gap == 0 {
                    return None;
                }
                let mut end = r;
                while let Some(next) = step(end) {
                    if next > self.last_row || !self.row_has_any(next, first, last) {
                        break;
                    }
                    end = next;
                }
                return Some(Block { first: end.min(r), last: end.max(r), gap });
            }
            if gap == 10 {
                return None;
            }
            r = step(r)?;
            gap += 1;
            if r > self.last_row {
                return None;
            }
        }
    }

    /// Whether something stands beside rows from top to bottom (in the column left or right of them) in two rows of
    /// five or more, of the first 200, and beside none of the rows from one to another.
    pub(super) fn is_beside(&self, top: usize, bottom: usize, first: usize, last: usize, from: usize, to: usize) -> bool {
        let sides = [first.checked_sub(1), last.checked_add(1)];
        let beside = |row: usize| {
            sides.iter().flatten().any(|&c| row <= self.last_row && c <= self.last_column && self.content(row, c).is_some())
        };
        let (count, rows) = if bottom < top {
            (0, 0)
        } else {
            ((top..=bottom).take(200).filter(|&r| beside(r)).count(), width(top, bottom).min(200))
        };
        if !((count as f64) / (rows as f64) > 0.4) {
            return false;
        }
        from > to || !(from..=to).take(200).any(beside)
    }

    /// The commonest kind of value in a column from one row to another (the first so many rows, empty or not):
    /// numbers, texts or booleans, a tie to the earlier kind, with the share it has; `Nothing` when there is none.
    pub(super) fn commonest_kind(&self, column: usize, from: usize, to: usize, limit: usize) -> (Kind, f64) {
        let mut counts: BTreeMap<Kind, usize> = BTreeMap::new();
        if from <= to {
            for row in (from..=to).take(limit) {
                let kind = self.kind(row, column);
                if !matches!(kind, Kind::Error | Kind::Nothing) {
                    *counts.entry(kind).or_default() += 1;
                }
            }
        }
        commonest(&counts)
    }
}

/// The kind counted most, with its share; `Nothing` when none is counted. Of kinds counted as often, the earlier
/// (booleans, then numbers, then texts): the counts are read from the last kind back, a later one kept on a tie.
pub(super) fn commonest(counts: &BTreeMap<Kind, usize>) -> (Kind, f64) {
    let total: usize = counts.values().sum();
    let mut best: Option<(Kind, usize)> = None;
    for (&kind, &n) in counts.iter().rev() {
        if best.map_or(true, |(_, m)| n >= m) {
            best = Some((kind, n));
        }
    }
    match best {
        None => (Kind::Nothing, 0.0),
        Some((kind, n)) => (kind, if total == 0 { 0.0 } else { n as f64 / total as f64 }),
    }
}
