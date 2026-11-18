//! The blocks of a sheet's content: its pieces (the merged ranges whose top left shows
//! something, then each row's runs of cells side by side), cut apart wherever a blank row or column runs between
//! them, again and again.

use super::sheet::{Rect, Sheet};

/// A block: the range around its pieces, and the pieces.
#[derive(Clone, Debug)]
pub(super) struct Block {
    pub area: Rect,
    pub pieces: Vec<Rect>,
}

impl Sheet<'_> {
    /// The pieces the sheet's content is made of: the merged ranges whose top left shows something, by their top row,
    /// then each row's runs of cells side by side, top down.
    pub(super) fn pieces(&self) -> Vec<Rect> {
        let mut out: Vec<Rect> = self.merges_by_top.values().flatten().copied().collect();
        for (&row, cells) in &self.cells {
            let mut run: Option<(usize, usize)> = None;
            for cell in cells {
                let column = cell.column;
                run = match run {
                    Some((start, end)) if end.saturating_add(1) == column => Some((start, column)),
                    Some((start, end)) => {
                        out.push(Rect { top: row, left: start.min(end), bottom: row, right: start.max(end) });
                        Some((column, column))
                    }
                    None => Some((column, column)),
                };
            }
            if let Some((start, end)) = run {
                out.push(Rect { top: row, left: start.min(end), bottom: row, right: start.max(end) });
            }
        }
        out
    }
}

/// Pieces cut into blocks: grouped by rows, each group by columns, a group that parts by columns cut again.
pub(super) fn blocks(pieces: Vec<Rect>) -> Vec<Block> {
    let mut out = Vec::new();
    let mut stack = vec![pieces];
    while let Some(group) = stack.pop() {
        for by_rows in cluster(group, |r| (r.top, r.bottom)) {
            let by_columns = cluster(by_rows, |r| (r.left, r.right));
            if by_columns.len() <= 1 {
                for g in by_columns {
                    let Some(first) = g.first() else { continue };
                    let mut area = *first;
                    for r in &g[1..] {
                        area.bottom = area.bottom.max(r.bottom);
                        area.left = area.left.min(r.left);
                        area.top = area.top.min(r.top);
                        area.right = area.right.max(r.right);
                    }
                    out.push(Block { area, pieces: g });
                }
            } else {
                stack.extend(by_columns);
            }
        }
    }
    out
}

/// Ranges in groups along one axis: sorted by their span on it, a gap of one line or more starting a group.
fn cluster(mut rects: Vec<Rect>, key: impl Fn(&Rect) -> (usize, usize)) -> Vec<Vec<Rect>> {
    rects.sort_by_key(|r| key(r));
    let mut groups: Vec<Vec<Rect>> = Vec::new();
    let mut reach = 0usize;
    for r in rects {
        let (lo, hi) = key(&r);
        match groups.last_mut() {
            Some(group) if lo <= reach.saturating_add(1) => group.push(r),
            _ => groups.push(vec![r]),
        }
        reach = reach.max(hi);
    }
    groups
}
