//! WASM facade of `routing`: flat number arrays in and out, decoded by
//! `whiteboard-core/src/arrows/routing.ts`.
//!
//! Encodings: a box is `[x, y, w, h]`, two boxes are 8 numbers (from, to);
//! points are `[x0, y0, x1, y1, …]`; a side is 0 top, 1 bottom, 2 left,
//! 3 right, and any other code means "none"; a bend axis is 0 `h`, 1 `v`.

use super::{boxes, flat, points, side};
use crate::routing::{self as r, BendAxis, BendsThrough, ElbowShape, Side};
use wasm_bindgen::prelude::*;

fn axis(code: u8) -> BendAxis {
    if code == 0 { BendAxis::H } else { BendAxis::V }
}

fn axis_code(axis: BendAxis) -> f64 {
    match axis {
        BendAxis::H => 0.0,
        BendAxis::V => 1.0,
    }
}

/// Each leg as 9 numbers: a.x, a.y, b.x, b.y, dx, dy, len, dir.x, dir.y.
#[wasm_bindgen]
pub fn route_segments(pts: &[f64]) -> Vec<f64> {
    let mut out = Vec::new();
    for s in r::route_segments(&points(pts)) {
        out.extend_from_slice(&[s.a[0], s.a[1], s.b[0], s.b[1], s.dx, s.dy, s.len, s.dir[0], s.dir[1]]);
    }
    out
}

/// -1 when the route is valid, else the problem code.
#[wasm_bindgen]
pub fn check_arrow_route(pts: &[f64], two_boxes: &[f64], from_side: u8, to_side: u8, extra_clearance: f64) -> i32 {
    let (from, to) = boxes(two_boxes);
    let (Some(from_side), Some(to_side)) = (Side::from_code(from_side), Side::from_code(to_side)) else {
        return -2;
    };
    r::check_arrow_route(&points(pts), &from, from_side, &to, to_side, extra_clearance).map_or(-1, |p| p as i32)
}

/// Empty when there is no route, else `[shape, hasJog, jog, …points]`.
#[wasm_bindgen]
pub fn plan_elbow_route(two_boxes: &[f64], from_side: u8, to_side: u8, jog: f64, offset_from: f64, offset_to: f64) -> Vec<f64> {
    let (from, to) = boxes(two_boxes);
    let (Some(from_side), Some(to_side)) = (Side::from_code(from_side), Side::from_code(to_side)) else {
        return Vec::new();
    };
    match r::plan_elbow_route(&from, from_side, &to, to_side, jog, [offset_from, offset_to]) {
        None => Vec::new(),
        Some(plan) => {
            let shape = match plan.shape {
                ElbowShape::Level => 0.0,
                ElbowShape::Z => 1.0,
                ElbowShape::U => 2.0,
                ElbowShape::Loop => 3.0,
                ElbowShape::Corner => 4.0,
                ElbowShape::Four => 5.0,
            };
            let mut out = vec![shape, if plan.jog.is_some() { 1.0 } else { 0.0 }, plan.jog.unwrap_or(0.0)];
            out.extend(flat(&plan.pts));
            out
        }
    }
}

/// `from * 4 + to`.
#[wasm_bindgen]
pub fn sides_for_bends(two_boxes: &[f64], first_axis: u8, bends: &[f64]) -> u8 {
    let (from, to) = boxes(two_boxes);
    let (a, b) = r::sides_for_bends(&from, &to, axis(first_axis), bends);
    a as u8 * 4 + b as u8
}

/// `[-1, …points]`, or `[problem]`.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn build_route_from_bends(two_boxes: &[f64], from_side: u8, to_side: u8, first_axis: u8, bends: &[f64], extra_clearance: f64, offset_from: f64, offset_to: f64) -> Vec<f64> {
    let (from, to) = boxes(two_boxes);
    match r::build_route_from_bends(&from, side(from_side), &to, side(to_side), axis(first_axis), bends, extra_clearance, [offset_from, offset_to]) {
        Ok(pts) => {
            let mut out = vec![-1.0];
            out.extend(flat(&pts));
            out
        }
        Err(problem) => vec![problem as u8 as f64],
    }
}

/// Empty for a single leg, else `[first, …at]`.
#[wasm_bindgen]
pub fn bends_from_route(pts: &[f64]) -> Vec<f64> {
    match r::bends_from_route(&points(pts)) {
        None => Vec::new(),
        Some(b) => {
            let mut out = vec![axis_code(b.first)];
            out.extend(b.at);
            out
        }
    }
}

#[wasm_bindgen]
pub fn align_nearby_route_points(pts: &[f64]) -> Vec<f64> {
    flat(&r::align_nearby_route_points(&points(pts)))
}

#[wasm_bindgen]
pub fn drop_collinear_points(pts: &[f64]) -> Vec<f64> {
    flat(&r::drop_collinear_points(&points(pts)))
}

/// `ends`: start.x, start.y, hasStartDir, startDir.x, startDir.y, end.x, end.y, hasEndDir, endDir.x, endDir.y.
#[wasm_bindgen]
pub fn elbow_path_through_points(ends: &[f64], through: &[f64]) -> Vec<f64> {
    let start_dir = (ends[2] != 0.0).then_some([ends[3], ends[4]]);
    let end_dir = (ends[7] != 0.0).then_some([ends[8], ends[9]]);
    flat(&r::elbow_path_through_points([ends[0], ends[1]], start_dir, &points(through), [ends[5], ends[6]], end_dir))
}

/// Empty: undefined; `[0]` straight; `[1, problem]`; `[2, first, …at]`.
#[wasm_bindgen]
pub fn bends_through_points(two_boxes: &[f64], from_side: u8, to_side: u8, pts: &[f64], max_bends: f64, tolerance: f64) -> Vec<f64> {
    let (from, to) = boxes(two_boxes);
    match r::bends_through_points(&from, side(from_side), &to, side(to_side), &points(pts), max_bends, tolerance) {
        None => Vec::new(),
        Some(BendsThrough::Straight) => vec![0.0],
        Some(BendsThrough::Problem(p)) => vec![1.0, p as u8 as f64],
        Some(BendsThrough::Bends(b)) => {
            let mut out = vec![2.0, axis_code(b.first)];
            out.extend(b.at);
            out
        }
    }
}

#[wasm_bindgen]
pub fn can_move_route_segment(pts: &[f64], index: usize, attached_from: bool, attached_to: bool, stub_from: f64, stub_to: f64) -> bool {
    r::can_move_route_segment(&points(pts), index, [attached_from, attached_to], [stub_from, stub_to])
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn move_route_segment(pts: &[f64], index: usize, target: f64, attached_from: bool, attached_to: bool, stub_from: f64, stub_to: f64) -> Vec<f64> {
    flat(&r::move_route_segment(&points(pts), index, target, [attached_from, attached_to], [stub_from, stub_to]))
}

/// Each corner as 8 numbers: corner, a, mid, b.
#[wasm_bindgen]
pub fn rounded_route_corners(pts: &[f64], attached_from: bool, attached_to: bool) -> Vec<f64> {
    let mut out = Vec::new();
    for c in r::rounded_route_corners(&points(pts), [attached_from, attached_to]) {
        out.extend_from_slice(&[c.corner[0], c.corner[1], c.a[0], c.a[1], c.mid[0], c.mid[1], c.b[0], c.b[1]]);
    }
    out
}

#[wasm_bindgen]
pub fn rounded_route_path(pts: &[f64], attached_from: bool, attached_to: bool) -> String {
    r::rounded_route_path(&points(pts), [attached_from, attached_to])
}

/// Empty when there is no leg, else a.x, a.y, b.x, b.y, len, level.
#[wasm_bindgen]
pub fn route_label_segment(pts: &[f64]) -> Vec<f64> {
    match r::route_label_segment(&points(pts)) {
        None => Vec::new(),
        Some(s) => vec![s.a[0], s.a[1], s.b[0], s.b[1], s.len, if s.level { 1.0 } else { 0.0 }, s.index as f64],
    }
}

#[wasm_bindgen]
pub fn side_facing_point(b: &[f64], x: f64, y: f64) -> u8 {
    r::side_facing_point(&super::route_box(b), [x, y]) as u8
}

#[wasm_bindgen]
pub fn boxes_overlap(two_boxes: &[f64]) -> bool {
    let (from, to) = boxes(two_boxes);
    r::boxes_overlap(&from, &to)
}
