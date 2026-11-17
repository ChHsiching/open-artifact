//! WASM facade of `bend_drag`, decoded by `whiteboard-core/src/arrows/bend-drag.ts`.

use super::points;
use crate::bend_drag::{self as b, LabelBox};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn arrow_end_clearances(route: &[f64], auto: &[f64], head_from: bool, head_to: bool) -> Vec<f64> {
    b::arrow_end_clearances(&points(route), &points(auto), [head_from, head_to]).to_vec()
}

/// `label`: `[has, onLine, x, y, w, h]`; `line`: `[x1, y1, x2, y2, bent]`.
/// Handles as `[leg, x, y, level]`.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn arrow_leg_handles(elbow: &[f64], attached_from: bool, attached_to: bool, clear_from: f64, clear_to: f64, label: &[f64], reach: f64, zoom: f64, line: &[f64]) -> Vec<f64> {
    let label = (label[0] != 0.0).then(|| LabelBox { on_line: label[1] != 0.0, x: label[2], y: label[3], w: label[4], h: label[5] });
    let mut out = Vec::new();
    for h in b::arrow_leg_handles(&points(elbow), [attached_from, attached_to], [clear_from, clear_to], label, reach, zoom, [[line[0], line[1]], [line[2], line[3]]], line[4] != 0.0) {
        out.extend_from_slice(&[h.leg as f64, h.x, h.y, if h.level { 1.0 } else { 0.0 }]);
    }
    out
}
