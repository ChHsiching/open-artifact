//! WASM facade of `labels`, decoded by `whiteboard-core/src/arrows/labels.ts`.
//!
//! Encodings: a head is 0 `none`, 1 `arrow`, 2 (or anything else) `circle`;
//! a line is `[x1, y1, x2, y2, bent, hasElbow, …elbow points]`; end boxes
//! are 10 numbers `[has, x, y, w, h]` × 2; a placed label is
//! `[x, y, w, h, onLine, lineCount, (start, end)…]` (word ranges), or empty
//! when the route has fewer than two points (TypeScript throws).

use super::{flat, points};
use crate::labels::{self as l, Head, LineGeom, Measure, Placed};
use crate::routing::RouteBox;
use wasm_bindgen::prelude::*;

fn line(v: &[f64]) -> LineGeom {
    LineGeom { x1: v[0], y1: v[1], x2: v[2], y2: v[3], bent: v[4] != 0.0, elbow: if v[5] != 0.0 { Some(points(&v[6..])) } else { None } }
}

fn end_boxes(v: &[f64]) -> [Option<RouteBox>; 2] {
    let one = |at: usize| (v.len() >= at + 5 && v[at] != 0.0).then(|| RouteBox { x: v[at + 1], y: v[at + 2], w: v[at + 3], h: v[at + 4] });
    [one(0), one(5)]
}

fn placed(result: Result<Placed, l::EmptyRoute>) -> Vec<f64> {
    let Ok(p) = result else { return Vec::new() };
    let mut out = vec![p.x, p.y, p.w, p.h, if p.on_line { 1.0 } else { 0.0 }, p.lines.len() as f64];
    for (start, end) in p.lines {
        out.push(start as f64);
        out.push(end as f64);
    }
    out
}

fn measure(word_count: u32, widths: &[f64], space: f64) -> Measure {
    Measure { word_count: word_count as usize, widths: widths.to_vec(), space }
}

#[wasm_bindgen]
pub fn arrow_circle_center(tip_x: f64, tip_y: f64, from_x: f64, from_y: f64) -> Vec<f64> {
    l::arrow_circle_center(tip_x, tip_y, from_x, from_y).to_vec()
}

#[wasm_bindgen]
pub fn arrow_head_points(tip_x: f64, tip_y: f64, from_x: f64, from_y: f64) -> Vec<f64> {
    flat(&l::arrow_head_points(tip_x, tip_y, from_x, from_y))
}

#[wasm_bindgen]
pub fn arrow_end_cap_points(kind: u8, tip_x: f64, tip_y: f64, from_x: f64, from_y: f64) -> Vec<f64> {
    flat(&l::arrow_end_cap_points(Head::from_code(kind), tip_x, tip_y, from_x, from_y))
}

/// Lines as `(start, end, w)`.
#[wasm_bindgen]
pub fn wrap_label_words(word_count: u32, widths: &[f64], space: f64, max_width: f64) -> Vec<f64> {
    let mut out = Vec::new();
    for line in l::wrap_label_words(&measure(word_count, widths, space), max_width) {
        out.extend_from_slice(&[line.start as f64, line.end as f64, line.w]);
    }
    out
}

/// `elbow`: false for `placeArrowLabel` on a line that is not an elbow of
/// three or more points, true for `placeElbowArrowLabel`.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn place_arrow_label(line_values: &[f64], head_from: u8, head_to: u8, word_count: u32, widths: &[f64], space: f64, ends: &[f64], elbow: bool) -> Vec<f64> {
    let heads = [Head::from_code(head_from), Head::from_code(head_to)];
    let (line, measure, ends) = (line(line_values), measure(word_count, widths, space), end_boxes(ends));
    placed(if elbow { l::place_elbow_arrow_label(&line, heads, &measure, ends) } else { l::place_straight_arrow_label(&line, heads, &measure, ends) })
}
