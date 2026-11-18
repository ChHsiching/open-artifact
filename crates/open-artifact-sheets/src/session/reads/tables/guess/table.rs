//! The table a block holds (`table_in`): its header, raised a row over a header of numbers; then, asked to, the
//! blocks above it taken in while they read as more of the table (header rows, or rows like its body), and the blocks
//! below it while they read as more of the body; then the header's rows, grown over the rows a merged range or a
//! label above it joins, and down a row of units under it.

use std::collections::BTreeSet;

use super::block::Rect;
use super::grid::{Grid, Kind};
use super::header::Certainty;
use super::profile::{Column, Profile};
use super::rows::{width, Toward};
use super::runs::{HeaderRows, Table};

/// The header as the guess has it so far: its row, how sure it is, whether its texts name columns of values (none
/// when there is no header), and the table's top.
#[derive(Clone, Copy, Debug)]
struct Guessed {
    row: usize,
    certainty: Certainty,
    typed: Option<bool>,
    top: usize,
}

impl Grid<'_> {
    /// The table in a block, asked about a row of it; joined with the blocks above and below that read as more of
    /// it when `join` is set (below only, when not). None when its body holds no record.
    pub(super) fn table_in(&self, at: Rect, asked: usize, join: bool) -> Option<Table> {
        let (first, last) = (at.left, at.right);
        let columns = width(first, last);
        let mut found = self.find_header(at.top, at.bottom, first, last, Some(asked));
        // A header over a row naming only columns of numbers, under a row naming more, is that row.
        if let Some((row, score)) = found.found {
            if row >= 1 && row - 1 >= at.top && self.is_header_like(row - 1, first, last) {
                let named = self.count(row, first, last);
                if named != 0
                    && named < self.count(row - 1, first, last)
                    && self
                        .filled_columns(row, first, last)
                        .into_iter()
                        .all(|c| self.commonest_kind(c, row.saturating_add(1), found.end, 200).0 == Kind::Number)
                {
                    found.found = Some((row - 1, score));
                    found.top = row - 1;
                }
            }
        }
        let score = found.score();
        let mut guessed = Guessed {
            row: found.row().unwrap_or(found.top),
            certainty: score.map_or(Certainty::Unsure, |s| s.certainty),
            typed: score.map(|s| s.typed),
            top: found.top,
        };
        // The body's profile, from the header found first, and joined with each block taken in.
        let body_from = found.row().map_or(found.top, |r| r.saturating_add(1));
        let mut body: Option<Profile> = None;
        let mut unsure = false;
        if join && !(guessed.typed.is_some() && guessed.certainty == Certainty::Certain) {
            let mut headed = guessed.typed.is_some();
            // The columns left empty by headerless blocks taken in.
            let mut empty: BTreeSet<usize> = BTreeSet::new();
            // The guess before the first headerless block taken in, gone back to unless a header above covers it.
            let mut before: Option<(Guessed, bool)> = None;
            'up: loop {
                let mut previous: Option<Vec<(Kind, bool)>> = None;
                loop {
                    let Some(block) = self.next_block(guessed.top, Toward::Up, first, last) else { break 'up };
                    let beside = self.is_beside(block.first, block.last, first, last, found.top, found.end);
                    if beside
                        && ((first != 0 && self.content(block.last, first - 1).is_some())
                            || self.count(block.last, first, last) != columns)
                    {
                        break 'up;
                    }
                    let signature = (block.first == block.last && block.gap < 3).then(|| self.signature(block.first, first, last));
                    // One more row of the header: a single row marked as the one under it, or a row that heads the
                    // block above the table.
                    let taken = if guessed.typed.is_some() && previous.is_some() && signature == previous {
                        Some((guessed.certainty, guessed.typed))
                    } else if signature.is_none() && block.gap > 2 {
                        None
                    } else {
                        self.heads_above(block.first, block.last, first, last, guessed, found.end)
                    };
                    if let Some((certainty, typed)) = taken {
                        if empty.is_subset(&self.relative_columns(block.last, first, last)) {
                            before = None;
                        }
                        headed = true;
                        previous = signature;
                        guessed = Guessed { row: block.last, certainty, typed, top: block.last };
                        if certainty == Certainty::Certain {
                            break 'up;
                        }
                        continue;
                    }
                    // Or a block like the body, with a header of its own or not.
                    let above = self.find_header(block.first, block.last, first, last, Some(block.last));
                    if beside || above.end != block.last {
                        break 'up;
                    }
                    let (fills, from) = match above.row() {
                        None if block.gap >= 3 => (BTreeSet::new(), above.top),
                        None => ((0..columns).collect(), above.top),
                        Some(row) => (self.relative_columns(row, first, last), row.saturating_add(1)),
                    };
                    let was_unsure = unsure;
                    if body.is_none() {
                        body = self.profile(body_from, found.end, first, last, None);
                    }
                    let Some(lower) = body.as_mut() else { break 'up };
                    let Some(upper) = self.profile(from, block.last, first, last, Some(lower.median)) else { break 'up };
                    let mut heads_values = || {
                        above.row().is_some_and(|row| {
                            self.header_score(row, first, last, row, found.end, false)
                                .is_some_and(|s| s.typed && s.certainty != Certainty::Unsure)
                        })
                    };
                    let Some(joined_unsure) = joins(&upper, lower, &fills, block.gap, headed, &mut heads_values) else {
                        break 'up;
                    };
                    unsure |= joined_unsure;
                    lower.merge(upper);
                    match above.found {
                        None => {
                            if block.gap < 3 {
                                empty.extend((0..columns).filter(|&i| !self.column_has_any(first + i, from, block.last)));
                            }
                            if (headed || !empty.is_empty()) && before.is_none() {
                                before = Some((guessed, was_unsure));
                            }
                            guessed.top = block.first;
                            guessed.typed = None;
                            headed = false;
                            continue 'up;
                        }
                        Some((row, score)) => {
                            unsure |= headed && guessed.certainty != Certainty::Unsure;
                            guessed.certainty = score.certainty;
                            guessed.row = row;
                            guessed.top = if score.certainty != Certainty::Unsure { row } else { block.first };
                            if empty.is_subset(&fills) {
                                before = None;
                            }
                            headed = true;
                            guessed.typed = Some(score.typed);
                            if score.certainty == Certainty::Certain {
                                break 'up;
                            }
                            continue 'up;
                        }
                    }
                }
            }
            if let Some((was, was_unsure)) = before {
                body = None;
                unsure = was_unsure;
                guessed = was;
            }
        }
        let mut to = found.end;
        if !found.ends_early {
            let named = match guessed.typed {
                Some(_) => self.relative_columns(guessed.row, first, last),
                None => BTreeSet::new(),
            };
            let mut heads_values: Option<bool> = None;
            loop {
                let Some(block) = self.next_block(to, Toward::Down, first, last) else { break };
                if self.is_beside(block.first, block.last, first, last, found.top, found.end) {
                    break;
                }
                let below = self.find_header(block.first, block.last, first, last, None);
                if let Some((row, score)) = below.found {
                    let again = guessed.typed.is_some() && self.repeats(row, guessed.row, first, last);
                    if score.certainty == Certainty::Certain || again {
                        break;
                    }
                }
                if body.is_none() {
                    body = self.profile(body_from, found.end, first, last, None);
                }
                let Some(upper) = body.as_mut() else { break };
                let Some(lower) = self.profile(block.first, block.last, first, last, Some(upper.median)) else { break };
                let mut heads = || {
                    *heads_values.get_or_insert_with(|| {
                        guessed.typed.is_some()
                            && self
                                .header_score(guessed.row, first, last, guessed.row, block.last, false)
                                .is_some_and(|s| s.typed && s.certainty != Certainty::Unsure)
                    })
                };
                let Some(joined_unsure) = joins(upper, &lower, &named, block.gap, below.found.is_some(), &mut heads) else {
                    break;
                };
                // A short block of short rows does not make the guess unsure.
                let big = block.last - block.first > 2
                    || upper.rows <= 2
                    || (block.first..=block.last).any(|r| self.count(r, first, last) >= upper.median);
                unsure |= joined_unsure && big;
                upper.merge(lower);
                unsure |= below.score().is_some_and(|s| s.certainty != Certainty::Unsure);
                to = block.last;
            }
        }
        let Some(_) = guessed.typed else { return self.table(None, first, last, guessed.top, to) };
        let header = HeaderRows {
            first: self.header_top(guessed.row, first, last),
            last: self.header_bottom(guessed.row, first, last, to),
            is_sure: guessed.certainty != Certainty::Unsure && !unsure,
        };
        self.table(Some(header), first, last, header.last.saturating_add(1), to)
    }

    /// What each cell of a row shows, by kind, and whether it is marked.
    fn signature(&self, row: usize, first: usize, last: usize) -> Vec<(Kind, bool)> {
        (first..=last).map(|c| (self.kind(row, c), self.shows_marked(row, c))).collect()
    }

    /// The columns a row shows something in, counted from the first.
    fn relative_columns(&self, row: usize, first: usize, last: usize) -> BTreeSet<usize> {
        self.filled_columns(row, first, last).into_iter().map(|c| c - first).collect()
    }

    /// Whether the last row of a block above a table heads it, the rows above it in the block sparse: how sure, and
    /// whether its texts name columns of values. A row heading two columns or fewer is unsure, and must name values
    /// when the table has a header already.
    fn heads_above(&self, top: usize, row: usize, first: usize, last: usize, guessed: Guessed, end: usize) -> Option<(Certainty, Option<bool>)> {
        if !self.is_header_like(row, first, last) {
            return None;
        }
        let columns = width(first, last) as f64;
        if (top..row).rev().take(10).any(|r| self.count(r, first, last) as f64 / columns >= 0.6) {
            return None;
        }
        if self.count(row, first, last) < self.count(guessed.top, first, last) {
            return None;
        }
        let score = self.header_score(row, first, last, top, end, false)?;
        let wide = last.saturating_sub(first) > 1;
        let certainty = match (guessed.typed, score.typed) {
            (Some(_), false) if !wide => return None,
            (Some(_), false) => Certainty::Unsure,
            _ if wide => score.certainty,
            _ => Certainty::Unsure,
        };
        Some((certainty, Some(score.typed)))
    }

    /// The header's first row: up over each row a merged range starts in (narrower than the table) or a header cell's
    /// merged range covers, while the row shows something.
    fn header_top(&self, header: usize, first: usize, last: usize) -> usize {
        let columns = width(first, last) as f64;
        let mut row = header;
        while row > 0 {
            let up = row - 1;
            let starts = self.merges().any(|m| {
                let w = width(m.left, m.right);
                m.top == up && w >= 2 && first <= m.left && m.left <= last && (w as f64) / columns < 0.8
            });
            let covers = first <= last && (first..=last).any(|c| self.source(header, c).0 <= up);
            if !(starts || covers) || !self.row_has_any(up, first, last) {
                break;
            }
            row = up;
        }
        row
    }

    /// The header's last row: the lowest bottom of the short merged ranges across the header row when there are two
    /// or more, or else the row under it when it names the units of columns of numbers.
    fn header_bottom(&self, header: usize, first: usize, last: usize, end: usize) -> usize {
        let bottoms: Vec<usize> = self
            .merges()
            .filter(|m| m.top <= header && header < m.bottom && first <= m.left && m.left <= last && m.bottom - m.top <= 3)
            .map(|m| m.bottom)
            .collect();
        if bottoms.len() >= 2 {
            return bottoms.into_iter().max().unwrap_or(header);
        }
        let next = header.saturating_add(1);
        if self.names_units(next, first, last, end) {
            next
        } else {
            header
        }
    }

    /// Whether a row under a header names the units of the columns of numbers under it: texts only, its own, in
    /// three of five such columns or more and in no other, each under a cell of the header.
    pub(super) fn names_units(&self, row: usize, first: usize, last: usize, end: usize) -> bool {
        if row == 0 || row >= end {
            return false;
        }
        let own: Vec<usize> =
            self.filled_columns(row, first, last).into_iter().filter(|&c| self.source(row, c).0 == row).collect();
        if own.is_empty() || own.iter().any(|&c| self.kind(row, c) != Kind::Text) {
            return false;
        }
        let numbers: BTreeSet<usize> = if first > last {
            BTreeSet::new()
        } else {
            (first..=last).filter(|&c| self.commonest_kind(c, row.saturating_add(1), end, 200).0 == Kind::Number).collect()
        };
        if numbers.is_empty() {
            return false;
        }
        let over = own.iter().filter(|c| numbers.contains(c)).count();
        if (over as f64) / (numbers.len() as f64) < 0.6 {
            return false;
        }
        own.iter().all(|&c| numbers.contains(&c) && first <= c && c <= last && self.content(row - 1, c).is_some())
    }
}

/// Whether rows next to a body read as more of it, from what their columns hold: `upper` above `lower`, `gap` empty
/// rows between, `empty` the columns left empty above or named by the header (by place in the table), whether the
/// lower rows have a header of their own, and (asked when it matters) whether the upper rows' header names columns of
/// values. None when they don't; or whether the guess is unsure of it.
fn joins(upper: &Profile, lower: &Profile, empty: &BTreeSet<usize>, gap: usize, lower_headed: bool, heads_values: &mut dyn FnMut() -> bool) -> Option<bool> {
    let pairs: Vec<(&Column, &Column)> = upper.columns.iter().zip(&lower.columns).collect();
    let columns = pairs.len();
    let both = |(u, l): &(&Column, &Column)| u.count != 0 && l.count != 0;
    let label = |(u, l): &(&Column, &Column)| u.repeats_one_label_over(l) || l.repeats_one_label_over(u);
    // The kinds of the columns both show values in, but for a label repeated across.
    let kinds: Vec<(Kind, Kind)> = pairs
        .iter()
        .filter(|p| both(p) && !label(p))
        .map(|(u, l)| (u.commonest(), l.commonest()))
        .filter(|&(u, l)| u != Kind::Nothing && l != Kind::Nothing)
        .collect();
    let labels = pairs.iter().any(|p| both(p) && label(p));
    let fills_empty = pairs.iter().enumerate().any(|(i, (u, l))| l.count != 0 && u.count == 0 && empty.contains(&i));
    let first_alike = kinds.first().is_some_and(|(u, l)| u == l);
    let same_values = kinds.iter().any(|(u, l)| u.is_value() && u == l);
    let alike = kinds.iter().filter(|(u, l)| u == l).count();
    let unlike = kinds.len() - alike;
    // A single row over a body may differ from it in a column or two.
    let mut single = false;
    if gap <= 2 && upper.rows == 1 && lower.rows > 1 {
        let mostly_alike = first_alike && alike > unlike;
        if same_values {
            single = unlike != 0;
            if !mostly_alike && unlike != 0 {
                return None;
            }
        } else if unlike != 0 {
            single = true;
            if !(mostly_alike && !lower_headed) {
                return None;
            }
        }
    } else if unlike != 0 {
        return None;
    }
    let shared = pairs.iter().filter(|p| both(p)).count();
    if columns > 2 && shared < 2 {
        return None;
    }
    let dense_upper: Vec<bool> = upper.columns.iter().map(|c| c.is_dense(upper.rows)).collect();
    let dense_lower: Vec<bool> = lower.columns.iter().map(|c| c.is_dense(lower.rows)).collect();
    let dense = dense_upper.iter().filter(|&&d| d).count();
    let dense_over = (0..columns).filter(|&i| dense_upper[i] && lower.columns[i].count != 0).count();
    // The first column most upper rows show something in, empty below.
    let mut first_alone = false;
    if let Some(i) = dense_upper.iter().position(|&d| d) {
        if lower.columns[i].count == 0 {
            first_alone = true;
            if dense_over.saturating_add(1) < dense {
                return None;
            }
        }
    }
    let unsure = labels || single || first_alone;
    let many = dense > 1;
    if same_values {
        let share = dense_over as f64 / (if many { dense } else { 1 }) as f64;
        let needed = if gap < 3 {
            if columns < 3 {
                0.5
            } else {
                0.6
            }
        } else {
            0.8
        };
        let dense_either = (0..columns).filter(|&i| dense_upper[i] || dense_lower[i]).count();
        if !(share >= needed) {
            return None;
        }
        return Some(unsure || (shared as f64 / dense_either.max(1) as f64) < 0.8);
    }
    let texts = pairs.iter().filter(|(u, l)| u.shares_texts_with(l)).count();
    let upper_only = (0..columns).any(|i| dense_upper[i] && !dense_lower[i]);
    let lower_only = (0..columns)
        .any(|i| !(upper.columns[i].count == 0 && empty.contains(&i)) && !dense_upper[i] && dense_lower[i]);
    // Whether the rows must share texts or have their header name values; then whether that is not enough.
    let (check_header, refused) = if !lower_only && upper_only {
        if gap >= 3 {
            return None;
        }
        (texts == 0, texts < 2)
    } else {
        let refused = lower_only || (fills_empty && lower_headed && texts == 0);
        if texts != 0 {
            (false, refused)
        } else if gap < 3 {
            (true, refused)
        } else {
            return None;
        }
    };
    if check_header {
        if lower.first_row_marked {
            return None;
        }
        if !many && !heads_values() {
            return None;
        }
    }
    if refused {
        return None;
    }
    Some(fills_empty || unsure || upper_only)
}
