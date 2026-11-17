//! WASM facade of `end_snap`, decoded by `whiteboard-core/src/arrows/end-snap.ts`.
//!
//! An element is 13 numbers: `[type (0 other, 1 container, 2 shape), kind,
//! hollow, x, y, w, h, turn, hasBounds, bx, by, bw, bh]`.

use super::route_box;
use crate::end_snap::{self as e, SnapElem};
use crate::routing::Side;
use crate::shape_paths::Kind;
use wasm_bindgen::prelude::*;

const STRIDE: usize = 13;

fn elem(v: &[f64]) -> SnapElem {
    SnapElem {
        ty: v[0] as u8,
        kind: Kind::from_code(v[1] as u8),
        hollow: v[2] != 0.0,
        x: v[3],
        y: v[4],
        w: v[5],
        h: v[6],
        turn: v[7],
        bounds: (v[8] != 0.0).then(|| route_box(&v[9..13])),
    }
}

#[wasm_bindgen]
pub fn point_to_box_distance(b: &[f64], x: f64, y: f64) -> f64 {
    e::point_to_box_distance(&route_box(b), x, y)
}

/// `side`: 0–3 a side, 255 none, anything else a value that is not a side.
#[wasm_bindgen]
pub fn align_arrow_end_point(from_x: f64, from_y: f64, side: u8, x: f64, y: f64, snap_px: f64) -> Vec<f64> {
    let side = if side == 255 { None } else { Some(Side::from_code(side)) };
    e::align_arrow_end_point([from_x, from_y], side, x, y, snap_px).to_vec()
}

#[wasm_bindgen]
pub fn arrow_end_distance_to_element(element: &[f64], bounds: &[f64], x: f64, y: f64, reach: f64) -> f64 {
    e::arrow_end_distance_to_element(&elem(element), &route_box(bounds), x, y, reach)
}

/// `[index, side]`, or empty when nothing is within reach.
#[wasm_bindgen]
pub fn find_arrow_end_target(elements: &[f64], x: f64, y: f64, reach: f64) -> Vec<f64> {
    let elements: Vec<SnapElem> = elements.chunks_exact(STRIDE).map(elem).collect();
    e::find_arrow_end_target(&elements, x, y, reach).map_or_else(Vec::new, |(index, side)| vec![index as f64, side as u8 as f64])
}
