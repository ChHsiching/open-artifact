//! The geometry of dragging an elbow arrow's legs; the drag itself combines
//! board lookups and stays in TypeScript.

use crate::js;
use crate::labels::{ARROW_HEAD_LENGTH, ARROW_LABEL_HEIGHT};
use crate::routing::{can_move_route_segment, Pt, MIN_ARROW_END_LEG};

/// `ARROW_HEAD_CLEARANCE` of `routing.ts`.
pub const ARROW_HEAD_CLEARANCE: f64 = 10.0;

fn end_leg(points: &[Pt], end: usize) -> f64 {
    let n = points.len();
    let pair = if end == 0 { (points.first(), points.get(1)) } else { (points.last(), if n >= 2 { points.get(n - 2) } else { None }) };
    match pair {
        (Some(tip), Some(next)) => js::hypot2(next[0] - tip[0], next[1] - tip[1]),
        _ => f64::INFINITY,
    }
}

/// `arrowEndClearances` given the route, the automatic route and which ends have a head.
pub fn arrow_end_clearances(route: &[Pt], auto: &[Pt], has_head: [bool; 2]) -> [f64; 2] {
    let clearance = |end: usize| {
        if !has_head[end] {
            MIN_ARROW_END_LEG
        } else {
            js::max(MIN_ARROW_END_LEG, js::min_of([ARROW_HEAD_LENGTH + ARROW_HEAD_CLEARANCE, end_leg(route, end), end_leg(auto, end)]))
        }
    };
    [clearance(0), clearance(1)]
}

/// A label box as `arrowLegHandles` sees it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LabelBox {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub on_line: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LegHandle {
    pub leg: usize,
    pub x: f64,
    pub y: f64,
    pub level: bool,
}

/// `arrowLegHandles` for an elbow `elbow`, its ends `ends` (`x1, y1`,
/// `x2, y2`), `reach` already divided by the zoom.
#[allow(clippy::too_many_arguments)]
pub fn arrow_leg_handles(elbow: &[Pt], attached: [bool; 2], clearances: [f64; 2], label: Option<LabelBox>, reach: f64, zoom: f64, ends: [Pt; 2], bent: bool) -> Vec<LegHandle> {
    let label_center = label.filter(|l| l.on_line).map(|l| [l.x + l.w / 2.0, l.y + l.h / 2.0]);
    let mut out = Vec::new();
    for index in 0..elbow.len().saturating_sub(1) {
        let (start, end) = (elbow[index], elbow[index + 1]);
        if !can_move_route_segment(elbow, index, attached, clearances) {
            continue;
        }
        let raw = js::hypot2(end[0] - start[0], end[1] - start[1]);
        let length = if js::truthy(raw) { raw } else { 1.0 };
        let level = (end[0] - start[0]).abs() >= (end[1] - start[1]).abs();
        let middle = [(start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0];
        let last_leg = elbow.len() > 2 && index == elbow.len() - 2;
        let label_shift = match (label, label_center) {
            (Some(l), Some(center)) if js::hypot2(middle[0] - center[0], middle[1] - center[1]) < 0.5 => {
                (if last_leg { -1.0 } else { 1.0 }) * js::max(0.0, js::min(length / 2.0 - 4.0, (if level { l.w } else { ARROW_LABEL_HEIGHT }) / 2.0 + 18.0))
            }
            _ => 0.0,
        };
        let end_shift = if elbow.len() > 2 && (index == 0 || last_leg) && length / 2.0 < reach && reach <= length - 10.0 / zoom {
            if index == 0 { reach - length / 2.0 } else { length / 2.0 - reach }
        } else {
            0.0
        };
        let shift = if end_shift == 0.0 { label_shift } else { js::sign(end_shift) * js::max(label_shift.abs(), end_shift.abs()) };
        let at = [middle[0] + ((end[0] - start[0]) / length) * shift, middle[1] + ((end[1] - start[1]) / length) * shift];
        let near_end = ends.iter().any(|e| js::hypot2(at[0] - e[0], at[1] - e[1]) < reach - 1e-6);
        if near_end && !bent {
            continue;
        }
        out.push(LegHandle { leg: index, x: at[0], y: at[1], level });
    }
    out
}
