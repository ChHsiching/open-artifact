//! WASM facade of `shape_paths` and `ink`, decoded by
//! `whiteboard-core/src/shape-paths.ts` and `ink.ts`.
//!
//! Encodings: a kind is its `Kind` code (unknown kinds are 0, `rect`); a
//! command list is flat `[code, …args]` with 0 `M x y`, 1 `L x y`,
//! 2 `C x1 y1 x2 y2 x y`, 3 `Z`; seeds are UTF-16 code units.

use super::{commands, flat, flat_commands, points, side};
use crate::ink::{self, InkPolyline, InkPressure, ValueNoise};
use crate::routing::Side;
use crate::shape_paths::{self as sp, Kind, SeededRandom};
use wasm_bindgen::prelude::*;

/// Outline parts: 0 database, 1 queue, 2 document, 3 cloud, 4 person, 5 person head, 6 person body.
#[wasm_bindgen]
pub fn shape_path_part(part: u8, width: f64, height: f64) -> Vec<f64> {
    flat_commands(&match part {
        0 => sp::database_path(width, height),
        1 => sp::queue_path(width, height),
        2 => sp::document_path(width, height),
        3 => sp::cloud_path(width, height),
        4 => sp::curved_shape_path(Kind::Person, width, height),
        5 => sp::person_head_path(width, height),
        _ => sp::person_body_path(width, height),
    })
}

#[wasm_bindgen]
pub fn shape_outline_commands(kind: u8, width: f64, height: f64) -> Vec<f64> {
    flat_commands(&sp::shape_outline_commands(Kind::from_code(kind), width, height))
}

#[wasm_bindgen]
pub fn polygon_shape_points(kind: u8, width: f64, height: f64) -> Vec<f64> {
    flat(&sp::polygon_shape_points(Kind::from_code(kind), width, height))
}

/// Segments as `[x1, y1, x2, y2, …]`.
#[wasm_bindgen]
pub fn walk_path_segments(cmds: &[f64]) -> Vec<f64> {
    let mut out = Vec::new();
    sp::walk_path_segments(&commands(cmds), |a, b, c, d| out.extend_from_slice(&[a, b, c, d]));
    out
}

/// Segments as `[x1, y1, x2, y2, …]`; empty for kinds that are not curved.
#[wasm_bindgen]
pub fn curved_shape_line_segments(kind: u8, width: f64, height: f64) -> Vec<f64> {
    sp::curved_shape_line_segments(Kind::from_code(kind), width, height).map_or_else(Vec::new, |lines| lines.concat())
}

#[wasm_bindgen]
pub fn shape_edge_inset_at_line(cmds: &[f64], width: f64, height: f64, side_code: u8, line_offset: f64) -> f64 {
    sp::shape_edge_inset_at_line(&commands(cmds), width, height, side(side_code).unwrap_or(Side::Top), line_offset)
}

#[wasm_bindgen]
pub fn curved_shape_edge_inset(kind: u8, width: f64, height: f64, side_code: u8, line_offset: f64, fallback: f64) -> f64 {
    sp::curved_shape_edge_inset(Kind::from_code(kind), width, height, side(side_code).unwrap_or(Side::Top), line_offset, fallback)
}

#[wasm_bindgen]
pub fn rounded_corner_inset(radius: f64, half_span: f64, offset: f64) -> f64 {
    sp::rounded_corner_inset(radius, half_span, offset)
}

#[wasm_bindgen]
pub fn shape_edge_inset(kind: u8, width: f64, height: f64, side_code: u8, offset: f64, fallback: f64) -> f64 {
    sp::shape_edge_inset(Kind::from_code(kind), width, height, side(side_code).unwrap_or(Side::Top), offset, fallback)
}

#[wasm_bindgen]
pub fn shape_path_data(kind: u8, width: f64, height: f64) -> String {
    sp::shape_path_data(Kind::from_code(kind), width, height)
}

#[wasm_bindgen]
pub fn rounded_polygon_path_data(kind: u8, width: f64, height: f64, rounded: bool) -> String {
    sp::rounded_polygon_path_data(Kind::from_code(kind), width, height, rounded)
}

#[wasm_bindgen]
pub fn cylinder_cap_path_data(kind: u8, width: f64, height: f64) -> Option<String> {
    sp::cylinder_cap_path_data(Kind::from_code(kind), width, height)
}

#[wasm_bindgen]
pub fn shape_text_insets(kind: u8, width: f64, height: f64) -> Vec<f64> {
    sp::shape_text_insets(Kind::from_code(kind), width, height).to_vec()
}

#[wasm_bindgen]
pub fn seeded_random_state(seed: &[u16]) -> u32 {
    SeededRandom::seed_state(seed)
}

/// The `draw`-th value (0-based) of a generator seeded with `state`.
#[wasm_bindgen]
pub fn seeded_random_value(state: u32, draw: f64) -> f64 {
    let draws = (draw as u64 as u32).wrapping_add(1);
    SeededRandom::value_of(state.wrapping_add(draws.wrapping_mul(1831565813)))
}

/// Polylines as `[count, …(closed, pointCount, …points, cornerCount, …corners)]`.
#[wasm_bindgen]
pub fn ink_flatten_path(cmds: &[f64], step: f64) -> Vec<f64> {
    let polylines = ink::flatten_path_to_polylines(&commands(cmds), step);
    let mut out = vec![polylines.len() as f64];
    for polyline in polylines {
        out.push(if polyline.closed { 1.0 } else { 0.0 });
        out.push(polyline.pts.len() as f64);
        out.extend(flat(&polyline.pts));
        out.push(polyline.corners.len() as f64);
        out.extend(polyline.corners.iter().map(|&c| c as f64));
    }
    out
}

#[wasm_bindgen]
pub fn ink_value_noise(count: f64, values: &[f64], x: f64) -> f64 {
    ValueNoise::from_values(count, values.to_vec()).eval(x)
}

/// `which` 0: press, 1: stray.
#[wasm_bindgen]
pub fn ink_pressure(length: f64, strength: f64, seed: &[u16], which: u8, at: f64) -> f64 {
    let pressure = InkPressure::new(length, strength, seed);
    if which == 0 { pressure.press(at) } else { pressure.stray(at) }
}

#[wasm_bindgen]
pub fn ink_side_path(pts: &[f64]) -> String {
    let mut out = String::new();
    ink::ink_side_path_into(&mut out, &points(pts));
    out
}

#[wasm_bindgen]
pub fn closed_ink_loop_path(pts: &[f64]) -> String {
    let mut out = String::new();
    ink::closed_ink_loop_path_into(&mut out, &points(pts));
    out
}

#[wasm_bindgen]
pub fn ink_corner_blob(x: f64, y: f64, size: f64) -> String {
    let mut out = String::new();
    ink::ink_corner_blob_into(&mut out, [x, y], size);
    out
}

#[wasm_bindgen]
pub fn ink_polyline_outline(pts: &[f64], corners: &[u32], closed: bool, strength: f64, seed: &[u16]) -> String {
    let polyline = InkPolyline { pts: points(pts), corners: corners.iter().map(|&c| c as usize).collect(), closed };
    let mut out = String::new();
    ink::ink_polyline_outline_into(&mut out, &polyline, strength, seed);
    out
}

#[wasm_bindgen]
pub fn hand_drawn_shape_outline(kind: u8, width: f64, height: f64, seed: &[u16]) -> String {
    ink::hand_drawn_shape_outline(Kind::from_code(kind), width, height, seed)
}

/// Many outlines at once: `shapes` is `[kind, w, h]` per shape, `seeds` the
/// UTF-16 seeds concatenated with `seed_lengths` giving each one's length.
/// Returns the path data joined with `\n` (path data never contains one).
#[wasm_bindgen]
pub fn hand_drawn_shape_outlines(shapes: &[f64], seeds: &[u16], seed_lengths: &[u32]) -> String {
    let mut out = String::new();
    let mut offset = 0usize;
    for (index, shape) in shapes.chunks_exact(3).enumerate() {
        let length = seed_lengths[index] as usize;
        if index > 0 {
            out.push('\n');
        }
        out.push_str(&ink::hand_drawn_shape_outline(Kind::from_code(shape[0] as u8), shape[1], shape[2], &seeds[offset..offset + length]));
        offset += length;
    }
    out
}


/// `[x, y, …relative points]`.
#[wasm_bindgen]
pub fn normalize_stroke_points(pts: &[f64]) -> Vec<f64> {
    let (x, y, relative) = ink::normalize_stroke_points(pts);
    let mut out = Vec::with_capacity(relative.len() + 2);
    out.push(x);
    out.push(y);
    out.extend(relative);
    out
}

#[wasm_bindgen]
pub fn stroke_bounds(x: f64, y: f64, pts: &[f64], width: f64) -> Vec<f64> {
    ink::stroke_bounds(x, y, pts, width).to_vec()
}
