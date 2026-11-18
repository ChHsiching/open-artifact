//! The table around a cell (`table_at`): the table in the block around it, or around the nearest cell showing
//! something when it shows nothing; carried down past where its header comes again, and up to a header further up
//! that it repeats; or a bigger table above whose header the rows over it repeat; widened over the merged ranges it
//! cuts; and only when it holds the cell.

use super::block::Rect;
use super::grid::{Grid, Kind};
use super::header::Certainty;
use super::rows::{width, Toward};
use super::runs::Table;

impl Grid<'_> {
    /// The table around a cell, or around the nearest cell showing something: left or right in its row, then up or
    /// down its column within eleven rows.
    pub(super) fn table_at(&self, row: usize, column: usize) -> Option<Table> {
        if self.content(row, column).is_some() || self.source(row, column) != (row, column) {
            return self.table_holding(row, column, (row, column));
        }
        let filled = self.filled_columns(row, 0, self.last_column);
        let left = filled.iter().rev().find(|&&c| c < column).map(|&c| (row, c));
        let right = filled.iter().find(|&&c| c > column).map(|&c| (row, c));
        let up = (1..=11).filter_map(|k| row.checked_sub(k)).find(|&r| self.content(r, column).is_some()).map(|r| (r, column));
        let down = (1..=11).map(|k| row.saturating_add(k)).find(|&r| self.content(r, column).is_some()).map(|r| (r, column));
        [left, right, up, down].into_iter().flatten().find_map(|(r, c)| self.table_holding(r, c, (row, column)))
    }

    /// The table found from a cell that holds another (or the same) cell.
    fn table_holding(&self, row: usize, column: usize, cell: (usize, usize)) -> Option<Table> {
        let table = self.table_from(row, column)?;
        let mut carried = self.carried_down(table.clone());
        let mut table = table;
        // A header the table's header repeats, further up: the table is the one under it.
        if table.header.is_some() {
            let first = self.first_of_repeated_headers(&table);
            if first != table {
                if let Some(down) = self.carried_down(first.clone()) {
                    if down.holds(row, column) {
                        carried = Some(down);
                        table = first;
                    }
                }
            }
        }
        // A bigger table above whose header the rows over this one repeat, or that reads as a header.
        let top = table.top();
        let sure = self.settled(table.clone()).header.is_some_and(|h| h.is_sure);
        let mut best = carried.as_ref().map_or(0, Table::records);
        let mut attempts = 8;
        let mut r = top;
        let lowest = top.saturating_sub(200);
        while lowest < r {
            r -= 1;
            let filled = self.filled_columns(r, 0, self.last_column);
            let (Some(&left), Some(&right)) = (filled.first(), filled.last()) else { continue };
            let matched = match table.header {
                Some(h) => {
                    let repeats = |header: (usize, usize), first: usize, last: usize| {
                        header.0 <= header.1
                            && (header.0..=header.1)
                                .any(|x| self.repeats(r, x, first, last) || self.repeats(x, r, first, last))
                    };
                    repeats((h.first, h.last), table.first_column, table.last_column)
                        || carried.as_ref().is_some_and(|t| {
                            t.header.is_some_and(|th| repeats((th.first, th.last), t.first_column, t.last_column))
                        })
                        || (!sure
                            && self.is_header_like(r, left, right)
                            && self
                                .header_score(r, left, right, r, table.to, false)
                                .is_some_and(|s| s.certainty != Certainty::Unsure))
                }
                None => self.is_header_like(r, left, right),
            };
            if !matched {
                continue;
            }
            if attempts == 0 {
                break;
            }
            attempts -= 1;
            let Some(&at) = filled.iter().find(|&&c| c >= table.first_column) else { continue };
            let from = if self.content(r.saturating_add(1), at).is_some() { r.saturating_add(1) } else { r };
            let Some(above) = self.table_from(from, at).and_then(|t| self.carried_down(t)) else { continue };
            let Some(h) = above.header else { continue };
            let holds = above.first_column <= column
                && column <= above.last_column
                && ((above.from <= row && row <= above.to) || (h.first <= row && row <= h.last));
            let records = above.records();
            if holds
                && above.first_column <= table.first_column
                && table.last_column <= above.last_column
                && records > best
            {
                carried = Some(above);
                best = records;
            }
        }
        let table = self.settled(carried?);
        let table = self.widened(table);
        table.holds(cell.0, cell.1).then_some(table)
    }

    /// The table in the block around a cell, joined above and below. A header-like last row of the block heads the
    /// block just below it when that block's table makes it its header; a table whose header lies above the block,
    /// is found again over the columns the header spans, when that keeps the header and the cell.
    fn table_from(&self, row: usize, column: usize) -> Option<Table> {
        let at = self.block_around(row, column)?;
        let table = self.table_in(at, row, true);
        let Some(header) = table.as_ref().and_then(|t| t.header) else {
            return self.headed_from_below(at, row).or(table);
        };
        let table = table?;
        if header.first >= at.top {
            return Some(table);
        }
        let Some(&first) = self.filled_columns(header.first, table.first_column, table.last_column).first() else {
            return Some(table);
        };
        let Some(spanned) = self.block_around(header.first, first) else { return Some(table) };
        if !(spanned.left < at.left || spanned.right > at.right) {
            return Some(table);
        }
        let wider = Rect { left: spanned.left.min(at.left), right: spanned.right.max(at.right), ..at };
        let Some(again) = self.table_in(wider, row, true) else { return Some(table) };
        let Some(h) = again.header else { return Some(table) };
        let keeps = h.first == header.first
            && again.first_column <= column
            && column <= again.last_column
            && ((again.from <= row && row <= again.to) || (header.first <= row && row <= h.last));
        Some(if keeps { again } else { table })
    }

    /// The table of the block just under a block whose last row (the row asked about) reads as a header, when that
    /// table's header holds the row.
    fn headed_from_below(&self, at: Rect, row: usize) -> Option<Table> {
        if row != at.bottom || !self.is_header_like(row, at.left, at.right) {
            return None;
        }
        let below = self.next_block(row, Toward::Down, at.left, at.right)?;
        if below.gap > 2 {
            return None;
        }
        let &first = self.filled_columns(below.first, at.left, at.right).first()?;
        let other = self.block_around(below.first, first)?;
        let wider = Rect { left: at.left.min(other.left), right: at.right.max(other.right), ..other };
        let table = self.table_in(wider, below.first, true)?;
        let h = table.header?;
        (h.first <= row && row <= h.last).then_some(table)
    }

    /// A table carried down past each place its header comes again, when the table there lies within its columns.
    fn carried_down(&self, table: Table) -> Option<Table> {
        let Some(h) = table.header else { return Some(table) };
        let (first, last) = (table.first_column, table.last_column);
        let mut to = table.to;
        loop {
            let Some(again) = self.header_again_below(to, h.first, h.last, first, last) else { break };
            let Some(next) = self.table_under(again, first, last) else { break };
            if next.from < again || next.to <= to || !self.lies_within(again, next.first_column, next.last_column, first, last) {
                break;
            }
            to = next.to;
        }
        if to == table.to {
            Some(table)
        } else {
            self.table(table.header, first, last, table.from, to)
        }
    }

    /// The first table above whose header a table's header repeats, and so on up: each next one up ends above the
    /// one under it, and its header comes again just under it, as the header of the one under it.
    fn first_of_repeated_headers(&self, table: &Table) -> Table {
        let mut current = table.clone();
        while let Some(h) = current.header {
            let (first, last) = (current.first_column, current.last_column);
            let lowest = h.first.saturating_sub(200);
            let Some(r) = (lowest..h.first).rev().find(|&r| self.echoes(r, h.first, h.last, first, last)) else { break };
            let Some(above) = self.table_under(r, first, last) else { break };
            let Some(ah) = above.header else { break };
            if !self.lies_within(h.last, first, last, above.first_column, above.last_column)
                || !(ah.first <= r && r <= ah.last)
                || above.to >= h.first
            {
                break;
            }
            match self.header_again_below(above.to, ah.first, ah.last, first, last) {
                Some(again) if h.first <= again && again <= h.last => current = above,
                _ => break,
            }
        }
        current
    }

    /// The first row of the eight under a row that is much like a header's rows, before a row filled across more than
    /// seven columns in ten; none when a label over it is not like the one over the header.
    fn header_again_below(&self, row: usize, top: usize, bottom: usize, first: usize, last: usize) -> Option<usize> {
        let end = self.last_row.min(row.saturating_add(8));
        let columns = width(first, last) as f64;
        let mut r = row.saturating_add(1);
        if r > end {
            return None;
        }
        loop {
            if self.echoes(r, top, bottom, first, last) {
                break;
            }
            if self.count(r, first, last) as f64 / columns > 0.7 || r >= end {
                return None;
            }
            r += 1;
        }
        let above = r - 1;
        if self.is_sparse_label(above, first, last) && !self.label_echoes_above(above, top, first, last) {
            return None;
        }
        Some(r)
    }

    /// The table (not joined above) in the block around the first cell showing something in the three rows under a
    /// row.
    fn table_under(&self, row: usize, first: usize, last: usize) -> Option<Table> {
        let (r, column) = (1..=3).map(|k| row.saturating_add(k)).find_map(|r| {
            self.filled_columns(r, first, last).first().map(|&c| (r, c))
        })?;
        let at = self.block_around(r, column)?;
        self.table_in(at, r, false)
    }

    /// Whether a row shows nothing from one column to the other outside the columns of another span.
    fn lies_within(&self, row: usize, first: usize, last: usize, from: usize, to: usize) -> bool {
        self.filled_columns(row, first, last).into_iter().all(|c| from <= c && c <= to)
    }

    /// A table with its header's sureness weighed: unsure when there are not two records or more in columns of
    /// values, when every row holds one kind and no column one kind in most rows, or when the row under the header
    /// shows nothing and the header is not marked (or shows something in one column only).
    pub(super) fn settled(&self, mut table: Table) -> Table {
        let (first, last, from, to) = (table.first_column, table.last_column, table.from, table.to);
        let values = first < last || self.commonest_kind(first, from, to, 200).0.is_value();
        let records = table.records();
        let Some(header) = table.header.as_mut() else { return table };
        if !(values && records > 1) {
            header.is_sure = false;
            return table;
        }
        let uniform = from > to
            || (from..=to).take(200).all(|r| {
                let columns = self.filled_columns(r, first, last);
                columns.first().map_or(true, |&c0| columns.iter().all(|&c| self.kind(r, c) == self.kind(r, c0)))
            });
        let mixed = uniform
            && (first..=last).all(|c| {
                let (kind, share) = self.commonest_kind(c, from, to, 200);
                kind == Kind::Nothing || share <= 0.5
            });
        if mixed {
            header.is_sure = false;
        } else if !self.row_has_any(header.last.saturating_add(1), first, last) {
            if !self.is_marked_row(header.last, first, last) {
                header.is_sure = false;
            } else {
                let filled = (first..=last).filter(|&c| self.column_has_any(c, from, to)).count();
                header.is_sure = header.is_sure && filled > 1;
            }
        }
        table
    }

    /// A table widened over each merged range across its rows that sticks out of its columns, when the table is one
    /// column wide or a row the range covers shows two cells or more across the wider columns.
    fn widened(&self, table: Table) -> Table {
        let top = table.top();
        let merges: Vec<_> = self.merges().filter(|m| m.right > m.left && m.top <= table.to && top <= m.bottom).copied().collect();
        let (mut first, mut last) = (table.first_column, table.last_column);
        loop {
            let (was_first, was_last) = (first, last);
            for m in &merges {
                if !(m.left <= last && first <= m.right && (m.left < first || last < m.right)) {
                    continue;
                }
                let (left, right) = (m.left.min(first), m.right.max(last));
                let takes = table.first_column == table.last_column || {
                    let (from, to) = (top.max(m.top), table.to.min(m.bottom));
                    from <= to && (from..=to).take(200).any(|r| self.count(r, left, right) >= 2)
                };
                if takes {
                    first = left;
                    last = right;
                }
            }
            if first == was_first && last == was_last {
                break;
            }
        }
        if first == table.first_column && last == table.last_column {
            return table;
        }
        let parts = self.table_once(table.header, first, last, table.from, table.to);
        parts.unwrap_or(table)
    }
}
