//! An edit of the page's too large to send whole is sent in parts: each part an edit of its
//! own (`<opId>.0`, `<opId>.1`, …, with the edit's opId as their `actionId`), taken back as one step.
//!
//! Sizes are of the operations as written (JSON, UTF-8). Cells set as a grid (32 or more, `workbook/grid.rs`) are
//! cut between parts cell by cell in the grid's order, each cell counting as the larger of its input as set and as it
//! was (its reverse), written bare; a part holds at most 10,234 of them. A grid piece counts as its grid
//! written (holes and all) and, besides, two bytes a row less one a run of rows, and a byte a column: found by
//! probing, exact for runs of rows, a few bytes off for scattered rows. Other operations count as written, however
//! long their reverse.
//!
//! - An edit is sent whole when it fits into one part.
//! - Else its operations are put into parts in order, each part under 120 KiB. The cells an operation sets are cut
//!   between parts cell by cell, and the formats it sets block by block, a block's rows cut into blocks under 30
//!   KiB first; any other operation goes whole into the part it fits in, or starts the next. A cell, a block or an
//!   operation too large for a part on its own refuses the edit (`editTooLarge`).
//! - Each part is taken back by what reverses it, applied after the parts before it (so a part's formats taken back
//!   are blocks of their own).

use serde::Serialize;

use crate::ids::split_id;
use crate::workbook::grid::{is_grid, Slot};
use crate::workbook::load::{CellToSet, CellsToFormat, Op};

/// The most cells set in a part.
const MOST_CELLS: usize = 10234;
/// What a grid piece counts besides its grid, rows and columns.
const GRID_EXTRA: usize = 59;
/// A part is smaller than this.
const PART: usize = 120 * 1024;
/// A block of formats cut into parts is smaller than this.
const BLOCK: usize = 30 * 1024;

/// The length of a thing as written, counted as it is written rather than kept.
fn written<T: Serialize>(x: &T) -> usize {
    struct Count(usize);
    impl std::io::Write for Count {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0 += bytes.len();
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut count = Count(0);
    serde_json::to_writer(&mut count, x).map_or(0, |()| count.0)
}

/// An operation as an edit sent in parts takes it: whole, or the pieces it is cut into, each with its size.
enum Cut {
    Whole(Op),
    Cells(String, Vec<(CellToSet, usize)>),
    Formats(String, Vec<(CellsToFormat, usize)>),
}

impl Cut {
    fn of(op: &Op, back: &Op) -> Cut {
        match (op, back) {
            (Op::SetCells { sheet_id, cells, listed: false }, Op::SetCells { cells: old, .. })
                if is_grid(cells) && cells.len() == old.len() =>
            {
                fn key(c: &CellToSet) -> (Option<(&str, u32)>, Option<(&str, u32)>) {
                    (split_id(&c.r), split_id(&c.c))
                }
                let mut sized: Vec<(CellToSet, usize)> = cells
                    .iter()
                    .zip(old)
                    .map(|(cell, was)| (cell.clone(), written(&Slot::Cell(&cell.input)).max(written(&Slot::Cell(&was.input)))))
                    .collect();
                sized.sort_by(|a, b| key(&a.0).cmp(&key(&b.0)));
                Cut::Cells(sheet_id.clone(), sized)
            }
            (Op::SetCellFormats { sheet_id, formats }, _) if !formats.is_empty() => {
                Cut::Formats(sheet_id.clone(), formats.iter().flat_map(blocks).collect())
            }
            _ => Cut::Whole(op.clone()),
        }
    }
}

/// A block of formats as it is cut: whole when under 30 KiB, else its rows in blocks under 30 KiB, in order.
fn blocks(block: &CellsToFormat) -> Vec<(CellsToFormat, usize)> {
    let size = written(block);
    if size < BLOCK || block.rows.len() < 2 {
        return vec![(block.clone(), size)];
    }
    let bare = CellsToFormat { rows: Vec::new(), columns: block.columns.clone(), format: block.format.clone() };
    let empty = written(&bare);
    let mut out = Vec::new();
    let mut open = (bare.clone(), empty);
    for run in &block.rows {
        let size = written(run);
        if !open.0.rows.is_empty() && open.1 + 1 + size >= BLOCK {
            out.push(std::mem::replace(&mut open, (bare.clone(), empty)));
        }
        open.1 += size + usize::from(!open.0.rows.is_empty());
        open.0.rows.push(run.clone());
    }
    out.push(open);
    out
}

/// An edit too large to send in parts (`editTooLarge`).
pub struct TooLarge;

/// The parts filled so far, the part being filled and its size.
struct Packing {
    parts: Vec<Vec<Op>>,
    part: Vec<Op>,
    filled: usize,
    /// Cells the part sets.
    cells: usize,
}

impl Packing {
    fn close(&mut self) {
        self.parts.push(std::mem::take(&mut self.part));
        self.filled = 2;
        self.cells = 0;
    }

    /// Cells set as a grid (in the grid's order, each with its size), as many as fit into each part in turn.
    fn grid(&mut self, sheet_id: &str, cells: Vec<(CellToSet, usize)>) -> Result<(), TooLarge> {
        let mut piece = GridPiece::new(sheet_id);
        for (cell, size) in cells {
            let comma = usize::from(!self.part.is_empty());
            let cost = piece.add(cell, size);
            let over = |cost: usize, packing: &Packing| packing.filled + comma + cost >= PART || packing.cells + 1 > MOST_CELLS;
            if over(cost, self) && !(self.part.is_empty() && piece.cells.len() == 1) {
                let cell = piece.cells.pop().expect("just added");
                if !piece.cells.is_empty() {
                    self.part.push(Op::SetCells { sheet_id: sheet_id.to_owned(), cells: piece.cells, listed: false });
                }
                self.close();
                piece = GridPiece::new(sheet_id);
                let cost = piece.add(cell, size);
                if over(cost, self) {
                    return Err(TooLarge);
                }
            } else if over(cost, self) {
                return Err(TooLarge);
            }
            self.cells += 1;
        }
        if !piece.cells.is_empty() {
            self.filled += usize::from(!self.part.is_empty()) + piece.cost();
            self.part.push(Op::SetCells { sheet_id: sheet_id.to_owned(), cells: piece.cells, listed: false });
        }
        Ok(())
    }

    /// An operation that is not cut: into the part being filled when it fits, else into the next.
    fn whole(&mut self, op: Op) -> Result<(), TooLarge> {
        let size = written(&op);
        if !self.part.is_empty() && self.filled + 1 + size >= PART {
            self.close();
        }
        if self.filled + size >= PART {
            return Err(TooLarge);
        }
        self.filled += size + usize::from(!self.part.is_empty());
        self.part.push(op);
        Ok(())
    }

    /// The pieces of an operation (`empty` the size of it with none), as many as fit into each part in turn.
    fn pieces<T>(&mut self, empty: usize, pieces: Vec<(T, usize)>, make: impl Fn(Vec<T>) -> Op) -> Result<(), TooLarge> {
        let mut open = Vec::new();
        for (piece, size) in pieces {
            let added = |part: &Vec<Op>, open: &Vec<T>| match open.is_empty() {
                true => usize::from(!part.is_empty()) + empty + size,
                false => 1 + size,
            };
            if self.filled + added(&self.part, &open) >= PART && !(self.part.is_empty() && open.is_empty()) {
                if !open.is_empty() {
                    self.part.push(make(std::mem::take(&mut open)));
                }
                self.close();
            }
            let added = added(&self.part, &open);
            if self.filled + added >= PART {
                return Err(TooLarge);
            }
            self.filled += added;
            open.push(piece);
        }
        if !open.is_empty() {
            self.part.push(make(open));
        }
        Ok(())
    }
}

/// The parts `ops` (with `reverse`, as `Workbook::apply` gives it) are sent in; `None` when the edit is sent whole.
pub fn of(ops: &[Op], reverse: &[Op]) -> Result<Option<Vec<Vec<Op>>>, TooLarge> {
    let n = ops.len();
    if reverse.len() != n {
        return Ok(None);
    }
    let mut packing = Packing { parts: Vec::new(), part: Vec::new(), filled: 2, cells: 0 };
    for (i, op) in ops.iter().enumerate() {
        match Cut::of(op, &reverse[n - 1 - i]) {
            Cut::Whole(op) => packing.whole(op)?,
            Cut::Cells(sheet_id, cells) => packing.grid(&sheet_id, cells)?,
            Cut::Formats(sheet_id, blocks) => {
                let empty = written(&Op::SetCellFormats { sheet_id: sheet_id.clone(), formats: Vec::new() });
                packing.pieces(empty, blocks, |formats| Op::SetCellFormats { sheet_id: sheet_id.clone(), formats })?;
            }
        }
    }
    if !packing.part.is_empty() {
        packing.close();
    }
    // An edit that fits into one part is sent whole.
    Ok((packing.parts.len() > 1).then_some(packing.parts))
}

fn digits(n: u32) -> usize {
    n.checked_ilog10().map_or(1, |d| d as usize + 1)
}

/// `[first,count]`.
fn run_size(first: u32, count: u32) -> usize {
    3 + digits(first) + digits(count)
}

/// `{"base":…,"runs":[…]}` with no runs.
fn line_size(base: &str) -> usize {
    "{\"base\":,\"runs\":[]}".len() + written(&base)
}

/// The size of lines as a grid writes them.
fn lines_size(lines: &[(String, Vec<[u32; 2]>)]) -> usize {
    let line = |(base, runs): &(String, Vec<[u32; 2]>)| {
        line_size(base) + runs.iter().map(|r| run_size(r[0], r[1])).sum::<usize>() + runs.len().saturating_sub(1)
    };
    2 + lines.iter().map(line).sum::<usize>() + lines.len().saturating_sub(1)
}

/// A piece of a grid being filled, in the grid's order, and what it counts.
struct GridPiece {
    /// The operation written with no rows, columns or inputs.
    head: usize,
    cells: Vec<CellToSet>,
    /// The sizes of the cells.
    bytes: usize,
    row_lines: Vec<(String, Vec<[u32; 2]>)>,
    rows_size: usize,
    rows: usize,
    row_runs: usize,
    columns: std::collections::BTreeSet<(String, u32)>,
    columns_size: usize,
}

impl GridPiece {
    fn new(sheet_id: &str) -> GridPiece {
        let head = "{\"kind\":\"setCells\",\"sheetId\":,\"grid\":{\"rows\":,\"columns\":,\"inputs\":}}".len() + written(&sheet_id);
        GridPiece {
            head,
            cells: Vec::new(),
            bytes: 0,
            row_lines: Vec::new(),
            rows_size: 2,
            rows: 0,
            row_runs: 0,
            columns: Default::default(),
            columns_size: 2,
        }
    }

    /// Adds a cell (after the ones before it in the grid's order), and answers what the piece then counts.
    fn add(&mut self, cell: CellToSet, size: usize) -> usize {
        let (base, n) = split_id(&cell.r).expect("a grid's row");
        let new_row = match self.row_lines.last_mut() {
            Some((b, runs)) if b == base => {
                let run = runs.last_mut().expect("a line has a run");
                if run[0] as u64 + run[1] as u64 - 1 == n as u64 {
                    false
                } else if run[0] as u64 + run[1] as u64 == n as u64 {
                    self.rows_size += digits(run[1] + 1) - digits(run[1]);
                    run[1] += 1;
                    true
                } else {
                    self.rows_size += 1 + run_size(n, 1);
                    runs.push([n, 1]);
                    self.row_runs += 1;
                    true
                }
            }
            _ => {
                self.rows_size += usize::from(!self.row_lines.is_empty()) + line_size(base) + run_size(n, 1);
                self.row_lines.push((base.to_owned(), vec![[n, 1]]));
                self.row_runs += 1;
                true
            }
        };
        self.rows += usize::from(new_row);
        let (cbase, cn) = split_id(&cell.c).expect("a grid's column");
        if self.columns.insert((cbase.to_owned(), cn)) {
            let ids: Vec<(&str, u32)> = self.columns.iter().map(|(b, n)| (b.as_str(), *n)).collect();
            self.columns_size = lines_size(&crate::workbook::grid::lines_written(&ids));
        }
        self.bytes += size;
        self.cells.push(cell);
        self.cost()
    }

    /// What the piece counts: its grid written, two bytes a row less one a run of rows, a byte a column, and more.
    fn cost(&self) -> usize {
        let (rows, columns, n) = (self.rows, self.columns.len(), self.cells.len());
        let inputs = match rows {
            0 => 2,
            _ => 2 + rows * 2 + rows * (columns - 1) + (rows - 1) + self.bytes + 2 * (rows * columns - n),
        };
        self.head + self.rows_size + self.columns_size + inputs + 2 * rows + columns + GRID_EXTRA - self.row_runs
    }
}
