//! The block of cells around a cell: grown while a row or column beside it shows something, split where an empty
//! column runs between two tables side by side, and joined with a block beyond an empty column when they read as
//! one table.

use super::grid::Grid;
use super::rows::width;

/// Rows and columns, each from first to last.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct Rect {
    pub top: usize,
    pub bottom: usize,
    pub left: usize,
    pub right: usize,
}

impl Grid<'_> {
    /// The rows and columns that show something within a rectangle, tight around them.
    pub(super) fn bounds(&self, within: Rect) -> Option<Rect> {
        if within.top > within.bottom {
            return None;
        }
        let mut found: Option<Rect> = None;
        for row in within.top..=within.bottom {
            let columns = self.filled_columns(row, within.left, within.right);
            let (Some(&first), Some(&last)) = (columns.first(), columns.last()) else { continue };
            found = Some(match found {
                None => Rect { top: row, bottom: row, left: first, right: last },
                Some(r) => Rect { top: r.top, bottom: row, left: r.left.min(first), right: r.right.max(last) },
            });
        }
        found
    }

    /// The block a cell is in: grown up, down, left and right while the row or column next to it shows something
    /// across it, then tight around what it shows.
    pub(super) fn grown(&self, row: usize, column: usize) -> Option<Rect> {
        let mut at = Rect { top: row, bottom: row, left: column, right: column };
        loop {
            let was = at;
            let mut top = was.top;
            while top > 0 && self.row_has_any(top - 1, was.left, was.right) {
                top -= 1;
            }
            let mut bottom = was.bottom;
            while self.row_has_any(bottom.saturating_add(1), was.left, was.right) {
                bottom = bottom.saturating_add(1);
            }
            let mut left = was.left;
            while left > 0 && self.column_has_any(left - 1, top, bottom) {
                left -= 1;
            }
            let mut right = was.right;
            while self.column_has_any(right.saturating_add(1), top, bottom) {
                right = right.saturating_add(1);
            }
            at = Rect { top, bottom, left, right };
            if at == was {
                break;
            }
        }
        self.bounds(at)
    }

    /// The table-sized block around a cell: its grown block split at an empty column with a header on each side,
    /// then joined with a block past an empty column on either side that reads as the same table (a narrow column
    /// between, or both headed and scoring as one header).
    pub(super) fn block_around(&self, row: usize, column: usize) -> Option<Rect> {
        let mut at = self.grown(row, column)?;
        'split: while at.left.saturating_add(1) < at.right {
            let rows = width(at.top, at.bottom).min(200) as f64;
            let columns = width(at.left, at.right) as f64;
            for k in at.left + 1..at.right {
                if k == column || !self.splits_at(at, k, rows, columns) {
                    continue;
                }
                let side = if column < k { Rect { right: k - 1, ..at } } else { Rect { left: k + 1, ..at } };
                match self.bounds(side) {
                    Some(side) => {
                        at = side;
                        continue 'split;
                    }
                    None => break 'split,
                }
            }
            break;
        }
        let (mut left, mut right) = (at.left, at.right);
        loop {
            let (was_left, was_right) = (left, right);
            for toward_right in [true, false] {
                let (gap, next) = if toward_right {
                    (right.saturating_add(1), right.saturating_add(2))
                } else if left >= 2 {
                    (left - 1, left - 2)
                } else {
                    continue;
                };
                if next > self.last_column || self.column_has_any(gap, at.top, at.bottom) {
                    continue;
                }
                let Some(beyond) = self.bounds(Rect { left: next, right: next, ..at }) else { continue };
                let Some(other) = self.grown(beyond.top, next) else { continue };
                let narrow_gap = self.is_narrow(gap)
                    && beyond.top.abs_diff(at.top) <= 1
                    && beyond.bottom.abs_diff(at.bottom) < 2;
                let joins = if other.top == at.top
                    && other.bottom == at.bottom
                    && at.top < at.bottom
                    && self.is_header_like(at.top, left, right)
                    && self.is_header_like(at.top, other.left, other.right)
                {
                    narrow_gap
                        || self.header_score(at.top, left, right, at.top, at.bottom, false).is_some_and(|s| s.value > 0.0)
                } else {
                    narrow_gap
                };
                if joins {
                    right = right.max(other.right);
                    left = left.min(other.left);
                }
            }
            if left == was_left && right == was_right {
                break;
            }
        }
        Some(Rect { left, right, ..at })
    }

    /// Whether an empty column splits a block in two tables: few rows show something in it, no merged range wide
    /// across the block covers it, the two sides end two rows apart or more, and a row near the top reads as a
    /// header on each side.
    fn splits_at(&self, at: Rect, k: usize, rows: f64, columns: f64) -> bool {
        let filled = if at.bottom < at.top {
            0
        } else {
            (at.top..=at.bottom)
                .take(200)
                .filter(|&r| r <= self.last_row && k <= self.last_column && self.content(r, k).is_some())
                .count()
        };
        if filled as f64 / rows > 0.4 {
            return false;
        }
        let (Some(left), Some(right)) = (
            self.bounds(Rect { right: k - 1, ..at }),
            self.bounds(Rect { left: k + 1, ..at }),
        ) else {
            return false;
        };
        let wide = |m: &&super::grid::Merge| {
            let w = width(m.left, m.right);
            w >= 2 && m.left <= k && k <= m.right && (w as f64) / columns >= 0.8
        };
        if self.merges().any(|m| wide(&m)) {
            return false;
        }
        if at.bottom <= at.top || left.bottom.abs_diff(right.bottom) < 2 {
            return false;
        }
        (at.top..at.bottom).take_while(|&r| r - at.top <= 59).any(|r| {
            let empty = !(r <= self.last_row && k <= self.last_column && self.content(r, k).is_some());
            empty && self.is_header_like(r, at.left, k - 1) && self.is_header_like(r, k + 1, at.right)
        })
    }
}
