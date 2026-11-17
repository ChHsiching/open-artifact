//! WASM facade of `free_space`, encoded by `whiteboard-core/src/layout.ts`.
//!
//! Rectangles are `[x, y, w, h]`; a request is 15 numbers `[area×4,
//! hasNear, near×4, reach, hasPrefer, prefer×4]`.

use super::points;
use crate::free_space::{self as f, Rect, Request};
use wasm_bindgen::prelude::*;

fn rect(v: &[f64]) -> Rect {
    Rect { x: v[0], y: v[1], w: v[2], h: v[3] }
}

fn rects(v: &[f64]) -> Vec<Rect> {
    v.chunks_exact(4).map(rect).collect()
}

fn request(v: &[f64]) -> Request {
    Request {
        area: rect(&v[0..4]),
        near: (v[4] != 0.0).then(|| rect(&v[5..9])),
        reach: v[9],
        prefer: (v[10] != 0.0).then(|| rect(&v[11..15])),
    }
}

fn push_rect(out: &mut Vec<f64>, r: Rect) {
    out.extend_from_slice(&[r.x, r.y, r.w, r.h]);
}

/// The occupancy index (`createOccupancyIndex`), held across calls.
#[wasm_bindgen]
pub struct OccupancyGrid {
    inner: f::OccupancyIndex,
}

#[wasm_bindgen]
impl OccupancyGrid {
    /// An index over `[x, y, w, h]*`, added in order.
    #[wasm_bindgen(constructor)]
    pub fn new(rects_flat: &[f64]) -> OccupancyGrid {
        OccupancyGrid { inner: f::OccupancyIndex::new(rects(rects_flat)) }
    }

    pub fn add(&mut self, x: f64, y: f64, w: f64, h: f64) {
        self.inner.add(Rect { x, y, w, h });
    }

    pub fn hits(&mut self, x: f64, y: f64, w: f64, h: f64, margin: f64) -> bool {
        self.inner.hits(Rect { x, y, w, h }, margin)
    }

    pub fn checks(&self) -> f64 {
        self.inner.checks
    }

    pub fn entries(&self) -> f64 {
        self.inner.entries
    }

    pub fn looked(&self) -> f64 {
        self.inner.looked
    }
}

/// `freeSpaceCandidates` → `[x, y, fine]*`.
#[wasm_bindgen]
pub fn free_space_candidates(request_flat: &[f64], size_w: f64, size_h: f64, items: &[f64]) -> Vec<f64> {
    let candidates = f::free_space_candidates(&request(request_flat), size_w, size_h, &rects(items));
    let mut out = Vec::with_capacity(candidates.len() * 3);
    for c in candidates {
        out.extend_from_slice(&[c.x, c.y, c.fine as u8 as f64]);
    }
    out
}

/// `findFreeSpots` over `grid` with the board's item boxes and section
/// rectangles; sizes are `[w, h]*`. Per size `[found, x, y, w, h, fine]`.
/// Unless `dry`, found spots are added to the grid.
#[wasm_bindgen]
pub fn find_free_spots(grid: &mut OccupancyGrid, items: &[f64], sections: &[f64], sizes: &[f64], request_flat: &[f64], dry: bool) -> Vec<f64> {
    let mut items = rects(items);
    let sizes: Vec<(f64, f64)> = sizes.chunks_exact(2).map(|s| (s[0], s[1])).collect();
    let spots = f::find_free_spots(&mut grid.inner, &mut items, &rects(sections), &sizes, &request(request_flat), dry);
    let mut out = Vec::with_capacity(spots.len() * 6);
    for spot in spots {
        match spot {
            Some(spot) => {
                out.push(1.0);
                push_rect(&mut out, spot.rect);
                out.push(spot.fine as u8 as f64);
            }
            None => out.extend_from_slice(&[0.0; 6]),
        }
    }
    out
}

/// The occupied pieces of arrows and drawings. Records: arrow `[0, x1, y1,
/// x2, y2, elbowCount (-1 for none), elbow…]`, drawing `[1, x, y, width,
/// count, points…]`. Per record `[n, rect×4…]`.
#[wasm_bindgen]
pub fn occupied_pieces(records: &[f64]) -> Vec<f64> {
    let mut out = Vec::new();
    let mut pieces = Vec::new();
    let mut at = 0;
    while at < records.len() {
        pieces.clear();
        if records[at] == 0.0 {
            let v = &records[at + 1..];
            let count = v[4];
            if count < 0.0 {
                f::arrow_pieces(v[0], v[1], v[2], v[3], None, &mut pieces);
                at += 6;
            } else {
                let n = count as usize;
                let elbow = points(&v[5..5 + n * 2]);
                f::arrow_pieces(v[0], v[1], v[2], v[3], Some(&elbow), &mut pieces);
                at += 6 + n * 2;
            }
        } else {
            let v = &records[at + 1..];
            let n = v[3] as usize;
            f::stroke_runs(v[0], v[1], v[2], &v[4..4 + n], &mut pieces);
            at += 5 + n;
        }
        out.push(pieces.len() as f64);
        for &piece in &pieces {
            push_rect(&mut out, piece);
        }
    }
    out
}
