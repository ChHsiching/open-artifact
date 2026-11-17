//! WASM facade of `snapping`, decoded by `whiteboard-core/src/snapping.ts`.
//!
//! Encodings: a rect is `[x, y, w, h]`; guides are `[axis, pos, kind]` each
//! (axis 0 x, 1 y; kind 0 edge, 1 center; 2 for anything else); edges are
//! `[x, y]` codes (0 left/top, 1 right/bottom, 2 null, 3 anything else);
//! limits are `[minW, minH, maxW, maxH]`. A snap comes back as
//! `[dx, dy, …guide indexes]`, a rect as `[x, y, w, h]`.

use crate::snapping::{self as s, Guide, Rect, Snap};
use wasm_bindgen::prelude::*;

fn rect(v: &[f64]) -> Rect {
    Rect { x: v[0], y: v[1], w: v[2], h: v[3] }
}

fn guides(v: &[f64]) -> Vec<Guide> {
    v.chunks_exact(3).map(|g| Guide { axis: g[0] as u8, pos: g[1], kind: g[2] as u8 }).collect()
}

fn snap(result: Snap) -> Vec<f64> {
    let mut out = vec![result.dx, result.dy];
    out.extend(result.guides.into_iter().map(|i| i as f64));
    out
}

fn out_rect(r: Rect) -> Vec<f64> {
    vec![r.x, r.y, r.w, r.h]
}

#[wasm_bindgen]
pub fn snap_rect_to_guides(r: &[f64], g: &[f64], threshold: f64, snap_x: bool, snap_y: bool) -> Vec<f64> {
    snap(s::snap_rect_to_guides(rect(r), &guides(g), threshold, [snap_x, snap_y]))
}

/// `held` 0 x, 1 y, 2 none.
#[wasm_bindgen]
pub fn snap_rect_to_guides_straight(r: &[f64], g: &[f64], threshold: f64, held: u8) -> Vec<f64> {
    snap(s::snap_rect_to_guides_straight(rect(r), &guides(g), threshold, held))
}

#[wasm_bindgen]
pub fn snap_resize_edges_to_guides(r: &[f64], edge_x: u8, edge_y: u8, dx: f64, dy: f64, g: &[f64], threshold: f64) -> Vec<f64> {
    snap(s::snap_resize_edges_to_guides(rect(r), [edge_x, edge_y], dx, dy, &guides(g), threshold))
}

#[wasm_bindgen]
pub fn guides_touching_edges(r: &[f64], edge_x: u8, edge_y: u8, g: &[f64]) -> Vec<u32> {
    s::guides_touching_edges(rect(r), [edge_x, edge_y], &guides(g)).into_iter().map(|i| i as u32).collect()
}

/// `mode` 0 free, 1 keeping the aspect ratio.
#[wasm_bindgen]
pub fn resize_rect(r: &[f64], edge_x: u8, edge_y: u8, dx: f64, dy: f64, limits: &[f64], mode: u8) -> Vec<f64> {
    let (min, max) = ([limits[0], limits[1]], [limits[2], limits[3]]);
    out_rect(if mode == 0 {
        s::resize_rect_from_edges(rect(r), [edge_x, edge_y], dx, dy, min, max)
    } else {
        s::resize_rect_keeping_aspect(rect(r), [edge_x, edge_y], dx, dy, min, max)
    })
}

#[wasm_bindgen]
pub fn snap_rotation_degrees(degrees: f64, coarse: bool) -> f64 {
    s::snap_rotation_degrees(degrees, coarse)
}

#[allow(clippy::too_many_arguments)]
#[wasm_bindgen]
pub fn resize_rotated_rect(r: &[f64], rotation: f64, edge_x: u8, edge_y: u8, dx: f64, dy: f64, limits: &[f64], keep_aspect: bool) -> Vec<f64> {
    out_rect(s::resize_rotated_rect(rect(r), rotation, [edge_x, edge_y], dx, dy, [limits[0], limits[1]], [limits[2], limits[3]], keep_aspect))
}
