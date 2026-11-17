//! Free space on a board: the occupied pieces of arrows and
//! drawings, a multi-level grid index of occupied rectangles, candidate
//! spots around a target, and the ranked search for free spots.
//!
//! The index keeps the original's counters (`checks`, `entries`, `looked`)
//! and its per-cell cache, which only a coarse add clears, so diagnostics
//! read the same numbers.

use crate::js;
use crate::routing::Pt;
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

pub const ITEM_GAP: f64 = 24.0;
pub const FREE_SPACE_MAX_RING_STEPS: f64 = 40.0;
pub const FREE_SPACE_FINE_STEPS: f64 = 96.0;
pub const FREE_SPACE_NEAR_MARGIN: f64 = 384.0;
pub const STROKE_BOX_MIN_POINTS: f64 = 8.0;
pub const STROKE_BOX_MAX_BOXES: f64 = 24.0;
pub const ARROW_BOX_SEGMENT_LENGTH: f64 = 64.0;
pub const ARROW_BOX_MAX_SEGMENTS: f64 = 32.0;
pub const ARROW_BOX_PAD: f64 = 4.0;
pub const OCCUPANCY_CELL_SIZE: f64 = 128.0;
pub const OCCUPANCY_MAX_CELLS: f64 = 256.0;
pub const OCCUPANCY_LEVEL_FACTOR: f64 = 16.0;

/// `placementRectGap`.
pub fn rect_gap(a: Rect, b: Rect) -> f64 {
    js::max_of([b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h), 0.0])
}

/// `placementRectsOverlap`.
#[inline]
pub fn rects_overlap(a: Rect, b: Rect, margin: f64) -> bool {
    a.x < b.x + b.w + margin && a.x + a.w + margin > b.x && a.y < b.y + b.h + margin && a.y + a.h + margin > b.y
}

/// `placementRectInside`.
#[inline]
pub fn rect_inside(inner: Rect, outer: Rect) -> bool {
    inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

/// `placementRectCenter`.
#[inline]
pub fn rect_center(r: Rect) -> Pt {
    [r.x + r.w / 2.0, r.y + r.h / 2.0]
}

/* ------------------------------------------------------------------------ */
/* Occupied pieces                                                          */
/* ------------------------------------------------------------------------ */

/// The padded pieces a measured arrow line takes: its elbow legs, or the
/// straight line cut into pieces of about 64 units.
pub fn arrow_pieces(x1: f64, y1: f64, x2: f64, y2: f64, elbow: Option<&[Pt]>, out: &mut Vec<Rect>) {
    let at = |fraction: f64| -> Pt { [x1 + (x2 - x1) * fraction, y1 + (y2 - y1) * fraction] };
    let pieces = js::max(1.0, js::min(ARROW_BOX_MAX_SEGMENTS, (js::hypot2(x2 - x1, y2 - y1) / ARROW_BOX_SEGMENT_LENGTH).ceil()));
    let points: Vec<Pt> = match elbow {
        Some(elbow) => elbow.to_vec(),
        // `Array.from({ length: NaN + 1 })` is empty.
        None if pieces.is_nan() => Vec::new(),
        None => (0..=pieces as usize).map(|index| at(index as f64 / pieces)).collect(),
    };
    for pair in points.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        out.push(Rect {
            x: js::min(a[0], b[0]) - ARROW_BOX_PAD,
            y: js::min(a[1], b[1]) - ARROW_BOX_PAD,
            w: (a[0] - b[0]).abs() + 2.0 * ARROW_BOX_PAD,
            h: (a[1] - b[1]).abs() + 2.0 * ARROW_BOX_PAD,
        });
    }
}

/// The boxes a drawing takes: its points in runs, each padded by half the
/// stroke width.
pub fn stroke_runs(x: f64, y: f64, width: f64, points: &[f64], out: &mut Vec<Rect>) {
    let len = points.len();
    let run = js::max(STROKE_BOX_MIN_POINTS, (len as f64 / 2.0 / STROKE_BOX_MAX_BOXES).ceil()) as usize;
    let mut index = 0;
    while index + 1 < len {
        let slice = &points[index..(index + 2 * run + 2).min(len)];
        let (mut min_x, mut min_y, mut max_x, mut max_y) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
        let mut point = 0;
        while point + 1 < slice.len() {
            min_x = js::min(min_x, slice[point]);
            max_x = js::max(max_x, slice[point]);
            min_y = js::min(min_y, slice[point + 1]);
            max_y = js::max(max_y, slice[point + 1]);
            point += 2;
        }
        out.push(Rect {
            x: x + min_x - width / 2.0,
            y: y + min_y - width / 2.0,
            w: max_x - min_x + width,
            h: max_y - min_y + width,
        });
        index += 2 * run;
    }
}

/* ------------------------------------------------------------------------ */
/* Occupancy index                                                          */
/* ------------------------------------------------------------------------ */

type Key = (u64, u64);

/// The cell key `String(cx) + ':' + String(cy)`: equal for equal numbers,
/// with -0 and 0 (and every NaN) the same.
fn cell_key(cx: f64, cy: f64) -> Key {
    let norm = |v: f64| if v == 0.0 { 0.0 } else if v.is_nan() { f64::NAN } else { v };
    (norm(cx).to_bits(), norm(cy).to_bits())
}

fn cell_range(r: Rect, pad: f64, size: f64) -> [f64; 4] {
    [((r.x - pad) / size).floor(), ((r.y - pad) / size).floor(), ((r.x + r.w + pad) / size).floor(), ((r.y + r.h + pad) / size).floor()]
}

/// `createOccupancyIndex`: a rectangle goes in the finest level where it
/// covers at most 256 cells; non-finite ones are checked against everything.
#[derive(Default)]
pub struct OccupancyIndex {
    all: Vec<Rect>,
    levels: Vec<Option<BTreeMap<Key, Vec<usize>>>>,
    oversized: Vec<usize>,
    cell_cache: BTreeMap<Key, Vec<usize>>,
    pub checks: f64,
    pub entries: f64,
    pub looked: f64,
}

impl OccupancyIndex {
    pub fn new(rects: impl IntoIterator<Item = Rect>) -> Self {
        let mut index = Self::default();
        for rect in rects {
            index.add(rect);
        }
        index
    }

    pub fn add(&mut self, rect: Rect) {
        let id = self.all.len();
        self.all.push(rect);
        let mut level = 0usize;
        let mut cell_size = OCCUPANCY_CELL_SIZE;
        loop {
            let [x0, y0, x1, y1] = cell_range(rect, 0.0, cell_size);
            if !(x0 + y0 + x1 + y1).is_finite() {
                self.oversized.push(id);
                break;
            }
            if (x1 - x0 + 1.0) * (y1 - y0 + 1.0) > OCCUPANCY_MAX_CELLS {
                level += 1;
                cell_size *= OCCUPANCY_LEVEL_FACTOR;
                continue;
            }
            if self.levels.len() <= level {
                self.levels.resize_with(level + 1, || None);
            }
            let cells = self.levels[level].get_or_insert_with(BTreeMap::new);
            let mut cx = x0;
            while cx <= x1 {
                let mut cy = y0;
                while cy <= y1 {
                    self.entries += 1.0;
                    cells.entry(cell_key(cx, cy)).or_default().push(id);
                    cy += 1.0;
                }
                cx += 1.0;
            }
            if level == 0 {
                return;
            }
            break;
        }
        self.cell_cache.clear();
    }

    /// Fills the cache entry of a fine cell with the oversized and coarse
    /// rectangles near it.
    fn fill_cell(&mut self, cx: f64, cy: f64, key: Key) {
        if self.cell_cache.contains_key(&key) {
            return;
        }
        let cell = Rect { x: cx * OCCUPANCY_CELL_SIZE, y: cy * OCCUPANCY_CELL_SIZE, w: OCCUPANCY_CELL_SIZE, h: OCCUPANCY_CELL_SIZE };
        let mut found = Vec::new();
        for &id in &self.oversized {
            self.checks += 1.0;
            if rects_overlap(cell, self.all[id], ITEM_GAP) {
                found.push(id);
            }
        }
        let mut cell_size = OCCUPANCY_LEVEL_FACTOR;
        for level in 1..self.levels.len() {
            if let Some(bucket) = self.levels[level].as_ref().and_then(|cells| cells.get(&cell_key((cx / cell_size).floor(), (cy / cell_size).floor()))) {
                for &id in bucket {
                    self.checks += 1.0;
                    if rects_overlap(cell, self.all[id], ITEM_GAP) {
                        found.push(id);
                    }
                }
            }
            cell_size *= OCCUPANCY_LEVEL_FACTOR;
        }
        self.cell_cache.insert(key, found);
    }

    /// True when `rect` overlaps (or comes within `margin` of) an indexed rectangle.
    pub fn hits(&mut self, rect: Rect, margin: f64) -> bool {
        let [x0, y0, x1, y1] = cell_range(rect, margin, OCCUPANCY_CELL_SIZE);
        if (x1 - x0 + 1.0) * (y1 - y0 + 1.0) > self.all.len() as f64 {
            for index in 0..self.all.len() {
                self.checks += 1.0;
                if rects_overlap(rect, self.all[index], margin) {
                    return true;
                }
            }
            return false;
        }
        let coarse = !self.oversized.is_empty() || self.levels.len() > 1;
        let mut cx = x0;
        while cx <= x1 {
            let mut cy = y0;
            while cy <= y1 {
                let key = cell_key(cx, cy);
                self.looked += 1.0;
                if let Some(Some(cells)) = self.levels.first() {
                    if let Some(bucket) = cells.get(&key) {
                        for &id in bucket {
                            self.checks += 1.0;
                            if rects_overlap(rect, self.all[id], margin) {
                                return true;
                            }
                        }
                    }
                }
                if coarse {
                    self.fill_cell(cx, cy, key);
                    for &id in &self.cell_cache[&key] {
                        self.checks += 1.0;
                        if rects_overlap(rect, self.all[id], margin) {
                            return true;
                        }
                    }
                }
                cy += 1.0;
            }
            cx += 1.0;
        }
        false
    }
}

/* ------------------------------------------------------------------------ */
/* Free spots                                                               */
/* ------------------------------------------------------------------------ */

/// The parts of a `FreeSpaceRequest` the search reads; `reach` is already
/// defaulted.
#[derive(Clone, Copy, Debug)]
pub struct Request {
    pub area: Rect,
    pub near: Option<Rect>,
    pub reach: f64,
    pub prefer: Option<Rect>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Candidate {
    pub x: f64,
    pub y: f64,
    pub fine: bool,
}

/// `freeSpaceCandidates`: coarse spots (beside nearby items, the preferred
/// corner, rings around the center) then the fine grid.
pub fn free_space_candidates(request: &Request, size_w: f64, size_h: f64, items: &[Rect]) -> Vec<Candidate> {
    let area = request.area;
    let center = rect_center(request.near.unwrap_or(area));
    let reach = request.reach;
    let radius = match request.near {
        Some(near) if reach.is_finite() => reach + js::hypot2(near.w, near.h) / 2.0 + js::hypot2(size_w, size_h) / 2.0,
        _ => {
            js::hypot2(area.w, area.h)
                + match request.near {
                    Some(_) => {
                        let area_center = rect_center(area);
                        js::hypot2(area_center[0] - center[0], area_center[1] - center[1])
                    }
                    None => 0.0,
                }
        }
    };
    let grid = match request.near {
        Some(near) => Rect {
            x: near.x - size_w - FREE_SPACE_NEAR_MARGIN,
            y: near.y - size_h - FREE_SPACE_NEAR_MARGIN,
            w: near.w + size_w + 2.0 * FREE_SPACE_NEAR_MARGIN,
            h: near.h + size_h + 2.0 * FREE_SPACE_NEAR_MARGIN,
        },
        None => Rect { x: area.x, y: area.y, w: js::max(0.0, area.w - size_w), h: js::max(0.0, area.h - size_h) },
    };
    let step = js::max(ITEM_GAP, (js::max(grid.w, grid.h) / FREE_SPACE_FINE_STEPS).ceil());
    let mut fine = Vec::new();
    let mut x = grid.x;
    while x <= grid.x + grid.w {
        let mut y = grid.y;
        while y <= grid.y + grid.h {
            fine.push(Candidate { x, y, fine: true });
            y += step;
        }
        x += step;
    }
    let size_reach = js::hypot2(size_w, size_h);
    let mut spots = Vec::new();
    let mut beside = |item: Rect| {
        let c = rect_center(item);
        if js::hypot2(c[0] - center[0], c[1] - center[1]) <= radius + js::hypot2(item.w, item.h) + size_reach {
            spots.push(Candidate { x: item.x + item.w + ITEM_GAP, y: item.y, fine: false });
            spots.push(Candidate { x: item.x - ITEM_GAP - size_w, y: item.y, fine: false });
            spots.push(Candidate { x: item.x, y: item.y + item.h + ITEM_GAP, fine: false });
            spots.push(Candidate { x: item.x, y: item.y - ITEM_GAP - size_h, fine: false });
        }
    };
    if let Some(near) = request.near {
        beside(near);
    }
    for &item in items {
        beside(item);
    }
    if let Some(prefer) = request.prefer {
        spots.push(Candidate { x: prefer.x + ITEM_GAP, y: prefer.y + 2.0 * ITEM_GAP, fine: false });
    }
    let step_x = size_w + ITEM_GAP;
    let step_y = size_h + ITEM_GAP;
    let rings_x = js::min(FREE_SPACE_MAX_RING_STEPS, (radius / step_x).ceil());
    let rings_y = js::min(FREE_SPACE_MAX_RING_STEPS, (radius / step_y).ceil());
    let mut column = -rings_x;
    while column <= rings_x {
        let mut row = -rings_y;
        while row <= rings_y {
            spots.push(Candidate { x: center[0] - size_w / 2.0 + column * step_x, y: center[1] - size_h / 2.0 + row * step_y, fine: false });
            row += 1.0;
        }
        column += 1.0;
    }
    spots.extend(fine);
    spots
}

/// A found spot (its `fine` flag is kept on the rectangles the caller takes).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Spot {
    pub rect: Rect,
    pub fine: bool,
}

/// `findFreeSpots` over a prebuilt occupancy: one spot per size, in order.
/// Unless `dry`, each found spot is appended to `items` and added to the
/// index before the next size is placed.
pub fn find_free_spots(index: &mut OccupancyIndex, items: &mut Vec<Rect>, sections: &[Rect], sizes: &[(f64, f64)], request: &Request, dry: bool) -> Vec<Option<Spot>> {
    let anchor = request.near.unwrap_or(request.area);
    let center = rect_center(anchor);
    let mut placed = Vec::with_capacity(sizes.len());
    for &(size_w, size_h) in sizes {
        let (w, h) = (size_w.ceil(), size_h.ceil());
        let candidates = free_space_candidates(request, w, h, items);
        let side_rank = |r: Rect| -> f64 {
            if r.y + r.h <= anchor.y {
                3.0
            } else if r.x + r.w <= anchor.x {
                2.0
            } else if r.x >= anchor.x + anchor.w {
                0.0
            } else {
                1.0
            }
        };
        // (spot, away, side rank)
        let mut ranked: Vec<(Spot, f64, f64)> = candidates
            .into_iter()
            .map(|c| Spot { rect: Rect { x: js::round(c.x), y: js::round(c.y), w, h }, fine: c.fine })
            .filter(|spot| request.near.is_none_or(|near| rect_gap(spot.rect, near) <= request.reach))
            .map(|spot| {
                let c = rect_center(spot.rect);
                (spot, js::round(js::hypot2(c[0] - center[0], c[1] - center[1]) / ITEM_GAP), side_rank(spot.rect))
            })
            .collect();
        js::sort_by(&mut ranked, |(a, away_a, rank_a), (b, away_b, rank_b)| {
            let away = away_a - away_b;
            if js::truthy(away) {
                return away;
            }
            let fine = a.fine as u8 as f64 - b.fine as u8 as f64;
            if js::truthy(fine) {
                return fine;
            }
            let rank = rank_a - rank_b;
            if js::truthy(rank) {
                return rank;
            }
            let dy = a.rect.y - b.rect.y;
            if js::truthy(dy) {
                return dy;
            }
            a.rect.x - b.rect.x
        });
        let spots: Vec<Spot> = ranked.into_iter().map(|(spot, _, _)| spot).collect();

        let is_preferred = |spot: &Spot| request.prefer.is_some_and(|prefer| rect_inside(spot.rect, prefer));
        let crosses_section = |spot: &Spot| !is_preferred(spot) && sections.iter().any(|&section| rects_overlap(spot.rect, section, 0.0));
        let inside_area = |spot: &Spot| rect_inside(spot.rect, request.area);
        let always = |_: &Spot| true;

        let near_spots: Vec<usize> = match request.near {
            None => Vec::new(),
            Some(near) => {
                let band = js::max(w, h) + ITEM_GAP;
                let mut list: Vec<usize> = (0..spots.len()).filter(|&i| rect_gap(spots[i].rect, near) <= FREE_SPACE_NEAR_MARGIN).collect();
                js::sort_by(&mut list, |&a, &b| {
                    let outside = (!inside_area(&spots[a])) as u8 as f64 - (!inside_area(&spots[b])) as u8 as f64;
                    if js::truthy(outside) {
                        return outside;
                    }
                    (rect_gap(spots[a].rect, near) / band).floor() - (rect_gap(spots[b].rect, near) / band).floor()
                });
                list
            }
        };
        let all: Vec<usize> = (0..spots.len()).collect();

        let mut free: Vec<Option<bool>> = vec![None; spots.len()];
        let mut is_free = |i: usize, index: &mut OccupancyIndex| -> bool {
            *free[i].get_or_insert_with(|| !index.hits(spots[i].rect, ITEM_GAP))
        };
        let mut find_first = |list: &[usize], test: &dyn Fn(&Spot) -> bool, extra: &dyn Fn(&Spot) -> bool, index: &mut OccupancyIndex| -> Option<usize> {
            list.iter().copied().find(|&i| test(&spots[i]) && is_free(i, index) && extra(&spots[i]))
        };
        let not_crossing = |spot: &Spot| !crosses_section(spot);
        let found = find_first(&near_spots, &is_preferred, &always, index)
            .or_else(|| find_first(&all, &|spot| inside_area(spot) && is_preferred(spot), &always, index))
            .or_else(|| find_first(&all, &is_preferred, &always, index))
            .or_else(|| find_first(&near_spots, &always, &not_crossing, index))
            .or_else(|| find_first(&all, &inside_area, &not_crossing, index))
            .or_else(|| find_first(&all, &always, &not_crossing, index))
            .or_else(|| find_first(&all, &inside_area, &always, index))
            .or_else(|| find_first(&all, &always, &always, index));
        let Some(found) = found else {
            placed.push(None);
            continue;
        };
        let spot = spots[found];
        if !dry {
            items.push(spot.rect);
            index.add(spot.rect);
        }
        placed.push(Some(spot));
    }
    placed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }

    #[test]
    fn index_levels_and_counters() {
        let mut index = OccupancyIndex::new([r(0.0, 0.0, 10.0, 10.0), r(-1e6, 5000.0, 2e6, 1.0)]);
        assert!(index.hits(r(20.0, 0.0, 5.0, 5.0), 24.0));
        assert!(!index.hits(r(100.0, 100.0, 5.0, 5.0), 24.0));
        assert!(index.hits(r(9000.0, 4990.0, 5.0, 5.0), 24.0));
        assert!(index.looked > 0.0 && index.checks > 0.0);
        // A non-finite rectangle is checked against everything.
        index.add(r(f64::NAN, 0.0, 1.0, 1.0));
        assert_eq!(index.oversized.len(), 1);
    }

    #[test]
    fn cell_keys_merge_signed_zeros() {
        assert_eq!(cell_key(-0.0, 0.0), cell_key(0.0, -0.0));
        assert_eq!(cell_key(f64::NAN, 1.0), cell_key(-f64::NAN, 1.0));
    }

    #[test]
    fn finds_spot_beside_note() {
        let note = r(0.0, 0.0, 160.0, 160.0);
        let mut index = OccupancyIndex::new([note]);
        let mut items = vec![note];
        let request = Request { area: r(-400.0, -400.0, 1200.0, 1200.0), near: Some(note), reach: 600.0, prefer: None };
        let spots = find_free_spots(&mut index, &mut items, &[], &[(160.0, 160.0), (160.0, 160.0)], &request, false);
        assert_eq!(spots[0].map(|s| (s.rect.x, s.rect.y)), Some((184.0, 0.0)));
        assert!(spots[1].is_some());
        assert_eq!(items.len(), 3);
    }

    #[test]
    fn stroke_runs_cover_points() {
        let mut out = Vec::new();
        stroke_runs(10.0, 20.0, 4.0, &[0.0, 0.0, 10.0, 5.0], &mut out);
        assert_eq!(out, vec![r(8.0, 18.0, 14.0, 9.0)]);
        let mut out = Vec::new();
        arrow_pieces(0.0, 0.0, 128.0, 0.0, None, &mut out);
        assert_eq!(out.len(), 2);
    }
}
