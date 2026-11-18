//! What the rows of a block hold, column by column (`Profile`): how many cells show something, of which kinds, how
//! many of their texts come twice in the row, which texts. Two blocks read as one table when their profiles agree.

use std::collections::{BTreeMap, BTreeSet};

use super::grid::{Grid, Kind, Shown};
use super::rows::commonest;

/// One column of a profile.
#[derive(Clone, Debug, Default)]
pub(super) struct Column {
    /// Rows where the column shows something.
    pub count: usize,
    /// How many of them show numbers, texts or booleans (errors count only in `count`).
    pub kinds: BTreeMap<Kind, usize>,
    /// Rows where the column's text is shown twice or more in the row.
    pub repeats: usize,
    /// The texts the column shows, as labels.
    pub distinct: BTreeSet<String>,
}

impl Column {
    /// The kind the column shows most.
    pub(super) fn commonest(&self) -> Kind {
        commonest(&self.kinds).0
    }

    /// A column showing one text in every row, each time twice or more in the row, above or below a column of
    /// numbers or booleans: a label repeated across, not a header.
    pub(super) fn repeats_one_label_over(&self, other: &Column) -> bool {
        self.count == self.repeats && self.distinct.len() == 1 && other.commonest().is_value()
    }

    /// Two columns of texts sharing one at least.
    pub(super) fn shares_texts_with(&self, other: &Column) -> bool {
        self.commonest() == Kind::Text && other.commonest() == Kind::Text && !self.distinct.is_disjoint(&other.distinct)
    }

    /// Whether the column shows something in half the rows or more.
    pub(super) fn is_dense(&self, rows: usize) -> bool {
        rows != 0 && self.count as f64 / rows as f64 >= 0.5
    }
}

/// The rows of a block that show something (section titles left out), column by column.
#[derive(Clone, Debug)]
pub(super) struct Profile {
    pub columns: Vec<Column>,
    /// The median count of cells showing something in the rows looked at, empty ones too.
    pub median: usize,
    /// How many rows the profile holds.
    pub rows: usize,
    /// Whether every cell the first row shows looks like a header's.
    pub first_row_marked: bool,
}

impl Profile {
    /// One profile for two blocks: counts added, texts joined while the first holds 200 or fewer.
    pub(super) fn merge(&mut self, other: Profile) {
        self.rows = self.rows.saturating_add(other.rows);
        for (a, b) in self.columns.iter_mut().zip(other.columns) {
            a.count = a.count.saturating_add(b.count);
            a.repeats = a.repeats.saturating_add(b.repeats);
            for (kind, n) in b.kinds {
                let k = a.kinds.entry(kind).or_default();
                *k = k.saturating_add(n);
            }
            if a.distinct.len() <= 199 && !b.distinct.is_empty() {
                if a.distinct.is_empty() {
                    a.distinct = b.distinct;
                } else {
                    a.distinct.extend(b.distinct);
                }
            }
        }
    }
}

impl Grid<'_> {
    /// The profile of the first 200 rows from one to another, from one column to the other; none when no row
    /// shows something there but a section's title. Section titles are told by the median count of cells shown,
    /// worked out here unless given.
    pub(super) fn profile(&self, from: usize, to: usize, first: usize, last: usize, median: Option<usize>) -> Option<Profile> {
        let median = median.unwrap_or_else(|| {
            if from > to {
                return 0;
            }
            let mut counts: Vec<usize> = (from..=to).take(200).map(|r| self.count(r, first, last)).collect();
            counts.sort_unstable();
            counts.get(counts.len() / 2).copied().unwrap_or(0)
        });
        let rows: Vec<usize> = if from > to {
            Vec::new()
        } else {
            (from..=to)
                .take(200)
                .filter(|&r| self.row_has_any(r, first, last) && !self.is_section_title(r, first, last, median))
                .collect()
        };
        let &first_row = rows.first()?;
        let mut columns = vec![Column::default(); if first <= last { last - first + 1 } else { 0 }];
        for &row in &rows {
            let mut labels: Vec<(usize, String)> = Vec::new();
            for (i, column) in columns.iter_mut().enumerate() {
                let Some(shown) = self.content(row, first + i) else { continue };
                column.count = column.count.saturating_add(1);
                let kind = match shown {
                    Shown::Number(_) => Kind::Number,
                    Shown::Boolean(_) => Kind::Boolean,
                    Shown::Text(_) => {
                        labels.push((i, shown.label()));
                        Kind::Text
                    }
                    Shown::Error(_) => continue,
                };
                *column.kinds.entry(kind).or_default() += 1;
            }
            let mut times: BTreeMap<&str, usize> = BTreeMap::new();
            for (_, label) in &labels {
                *times.entry(label.as_str()).or_default() += 1;
            }
            let twice: BTreeSet<String> = times.into_iter().filter(|&(_, n)| n > 1).map(|(l, _)| l.to_string()).collect();
            for (i, label) in labels {
                if twice.contains(&label) {
                    columns[i].repeats += 1;
                }
                columns[i].distinct.insert(label);
            }
        }
        let first_row_marked = self.filled_columns(first_row, first, last).into_iter().all(|c| self.is_marked(first_row, c));
        Some(Profile { columns, median, rows: rows.len(), first_row_marked })
    }
}
