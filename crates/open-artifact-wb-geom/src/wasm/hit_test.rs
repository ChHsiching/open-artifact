//! WASM facade of `hit_test`, encoded by `whiteboard-core/src/hit-test.ts`.
//!
//! Elements are records `[length, body, turn, hasLayout, x, y, w, h, …]`
//! (the length counts the whole record), the body code and its numbers:
//! 0 other, 1 arrow without a line, 2 arrow `[x1, y1, x2, y2, headFrom,
//! headTo, hasLabel, label×4, crossedCount, polylineLength, crossed×4…,
//! polyline…]`, 3 sticker `[x, y, w, h, noPad]`, 4 box, 5 section
//! `[hasTitle, title×4, hasTitleText, titleText×4]`, 6 shape `[x, y, w, h,
//! kind, hollow, ellipse, hasText, text×4]`, 7 stroke `[x, y, width,
//! count, points…]`.

use super::{points, route_box};
use crate::hit_test::{self as h, ArrowHit, Body, Hit, ShapeGeom};
use crate::routing::RouteBox;
use crate::shape_paths::Kind;
use wasm_bindgen::prelude::*;

fn opt_box(v: &[f64]) -> Option<RouteBox> {
    (v[0] != 0.0).then(|| route_box(&v[1..5]))
}

fn record(v: &[f64]) -> Hit {
    let p = &v[8..];
    let body = match v[1] as u8 {
        1 => Body::NoLine,
        2 => {
            let crossed_count = p[11] as usize;
            let poly_len = p[12] as usize;
            let crossed_at = 13;
            let poly_at = crossed_at + crossed_count * 4;
            Body::Arrow(ArrowHit {
                ends: [[p[0], p[1]], [p[2], p[3]]],
                heads: [p[4] != 0.0, p[5] != 0.0],
                label: opt_box(&p[6..11]),
                crossed: p[crossed_at..poly_at].chunks_exact(4).map(route_box).collect(),
                polyline: p[poly_at..poly_at + poly_len].to_vec(),
            })
        }
        3 => Body::Sticker { x: p[0], y: p[1], w: p[2], h: p[3], no_pad: p[4] != 0.0 },
        4 => Body::Box,
        5 => Body::Container { title: opt_box(&p[0..5]), title_text: opt_box(&p[5..10]) },
        6 => Body::Shape {
            shape: ShapeGeom { x: p[0], y: p[1], w: p[2], h: p[3], kind: Kind::from_code(p[4] as u8) },
            hollow: p[5] != 0.0,
            ellipse: p[6] != 0.0,
            text: opt_box(&p[7..12]),
        },
        7 => Body::Stroke { x: p[0], y: p[1], width: p[2], points: p[4..4 + p[3] as usize].to_vec() },
        _ => Body::Other,
    };
    Hit { turn: v[2], layout: opt_box(&v[3..8]), body }
}

fn records(v: &[f64]) -> Vec<Hit> {
    let mut out = Vec::new();
    let mut at = 0;
    while at < v.len() {
        let length = v[at] as usize;
        out.push(record(&v[at..at + length]));
        at += length;
    }
    out
}

/// 1 hit, 0 missed, -1 `undefined` (an unknown type).
#[wasm_bindgen]
pub fn hit_test_element(rec: &[f64], x: f64, y: f64, tolerance: f64) -> i8 {
    h::hit_test_element(&record(rec), x, y, tolerance).map_or(-1, i8::from)
}

/// The index of the topmost element under the point, or -1.
#[wasm_bindgen]
pub fn top_element_at(recs: &[f64], x: f64, y: f64, tolerance: f64) -> i32 {
    h::top_element_at(&records(recs), x, y, tolerance).map_or(-1, |index| index as i32)
}

#[wasm_bindgen]
pub fn arrow_label_beneath(recs: &[f64], index: u32, x: f64, y: f64, tolerance: f64) -> i32 {
    h::arrow_label_beneath(&records(recs), index as usize, x, y, tolerance).map_or(-1, |found| found as i32)
}

/// `ends`: two id numbers per element, -1 unless both ends name elements.
#[wasm_bindgen]
pub fn elements_in_marquee(recs: &[f64], ids: &[u32], ends: &[f64], marquee: &[f64]) -> Vec<u32> {
    let ends: Vec<Option<[u32; 2]>> = ends.chunks_exact(2).map(|pair| (pair[0] >= 0.0).then(|| [pair[0] as u32, pair[1] as u32])).collect();
    h::elements_in_marquee(&records(recs), ids, &ends, &route_box(marquee)).into_iter().map(|index| index as u32).collect()
}

#[wasm_bindgen]
pub fn distance_to_segment_sq(px: f64, py: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    h::distance_to_segment_sq(px, py, x1, y1, x2, y2)
}

#[wasm_bindgen]
pub fn segment_intersects_box(x1: f64, y1: f64, x2: f64, y2: f64, b: &[f64]) -> bool {
    crate::labels::segment_intersects_box(x1, y1, x2, y2, &route_box(b))
}

/// `shape`: `[x, y, w, h]`.
#[wasm_bindgen]
pub fn shape_outline_depth(kind: u8, shape: &[f64], x: f64, y: f64) -> f64 {
    h::shape_outline_depth(&ShapeGeom { x: shape[0], y: shape[1], w: shape[2], h: shape[3], kind: Kind::from_code(kind) }, x, y)
}

#[wasm_bindgen]
pub fn outline_crosses_box(kind: u8, shape: &[f64], b: &[f64]) -> bool {
    h::outline_crosses_box(&ShapeGeom { x: shape[0], y: shape[1], w: shape[2], h: shape[3], kind: Kind::from_code(kind) }, &route_box(b))
}

/// `lines`: `[wordCount, …lengths]` per line.
#[wasm_bindgen]
pub fn estimate_text_box(lines: &[f64], px: f64, b: &[f64], align_x: f64, align_y: f64) -> Vec<f64> {
    let mut decoded = Vec::new();
    let mut at = 0;
    while at < lines.len() {
        let count = lines[at] as usize;
        decoded.push(lines[at + 1..at + 1 + count].to_vec());
        at += 1 + count;
    }
    let r = h::estimate_text_box(&decoded, px, &route_box(b), align_x, align_y);
    vec![r.x, r.y, r.w, r.h]
}

#[wasm_bindgen]
pub fn rotated_boxes_overlap(b: &[f64], degrees: f64, other: &[f64]) -> bool {
    h::rotated_boxes_overlap(&route_box(b), degrees, &route_box(other))
}

/// `line`: `[x1, y1, x2, y2]`; `elbow` empty for a straight line (with
/// `has_elbow` false); `texts`: `[x, y, w, h, fromMayHold, toMayHold]` each.
#[wasm_bindgen]
pub fn text_boxes_crossed_by_arrow(line: &[f64], has_elbow: bool, elbow: &[f64], polyline: &[f64], texts: &[f64]) -> Vec<u32> {
    let texts: Vec<(RouteBox, [bool; 2])> = texts.chunks_exact(6).map(|t| (route_box(t), [t[4] != 0.0, t[5] != 0.0])).collect();
    let elbow = points(elbow);
    h::text_boxes_crossed_by_arrow([[line[0], line[1]], [line[2], line[3]]], has_elbow.then_some(&elbow[..]), polyline, &texts).into_iter().map(|index| index as u32).collect()
}
