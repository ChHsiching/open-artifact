//! Snapping and resizing math.
//!
//! Guides are referred to by index, so the caller can hand back its own
//! guide objects.

use crate::js;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// A guide's axis: 0 `x`, 1 `y`, anything else matches neither.
/// A guide's kind: 0 `edge`, 1 `center`, anything else matches neither.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Guide {
    pub axis: u8,
    pub pos: f64,
    pub kind: u8,
}

/// A dragged edge: 0 left/top, 1 right/bottom, 2 none (`null`), 3 anything else.
pub type Edge = u8;
pub const EDGE_START: Edge = 0;
pub const EDGE_END: Edge = 1;
pub const EDGE_NONE: Edge = 2;

#[derive(Clone, Debug, PartialEq)]
pub struct Snap {
    pub dx: f64,
    pub dy: f64,
    /// Indexes of the matched guides, x first.
    pub guides: Vec<usize>,
}

pub fn snap_rect_to_guides(rect: Rect, guides: &[Guide], threshold: f64, axes: [bool; 2]) -> Snap {
    let mut result = Snap { dx: 0.0, dy: 0.0, guides: Vec::new() };
    for axis in 0..2u8 {
        if !axes[axis as usize] {
            continue;
        }
        let (start, size) = if axis == 0 { (rect.x, rect.w) } else { (rect.y, rect.h) };
        let anchors = [(0u8, start), (1u8, start + size / 2.0), (0u8, start + size)];
        let mut best: Option<(f64, f64, usize)> = None;
        for (index, guide) in guides.iter().enumerate() {
            if guide.axis != axis || !guide.pos.is_finite() {
                continue;
            }
            for &(kind, at) in &anchors {
                if kind != guide.kind {
                    continue;
                }
                let delta = guide.pos - at;
                let dist = delta.abs();
                if !(dist <= threshold) {
                    continue;
                }
                let better = match best {
                    None => true,
                    Some((_, best_dist, best_index)) => dist < best_dist || (dist == best_dist && guide.kind == 1 && guides[best_index].kind != 1),
                };
                if better {
                    best = Some((delta, dist, index));
                }
            }
        }
        let Some((adjust, _, index)) = best else { continue };
        if axis == 0 {
            result.dx = adjust;
        } else {
            result.dy = adjust;
        }
        result.guides.push(index);
    }
    result
}

pub const STRAIGHT_HELD_TOLERANCE: f64 = 0.01;

/// `snapRectToGuidesStraight`; `held` is 0 `x`, 1 `y`, anything else none.
pub fn snap_rect_to_guides_straight(rect: Rect, guides: &[Guide], threshold: f64, held: u8) -> Snap {
    if held > 1 {
        return snap_rect_to_guides(rect, guides, threshold, [true, true]);
    }
    let mut snapped = snap_rect_to_guides(rect, guides, threshold, [held != 0, held != 1]);
    let kept = snap_rect_to_guides(rect, guides, STRAIGHT_HELD_TOLERANCE, [held == 0, held == 1]);
    snapped.guides.extend(kept.guides);
    snapped
}

fn edge_position(rect: Rect, axis: u8, edge: Edge) -> f64 {
    if axis == 0 {
        if edge == EDGE_START { rect.x } else { rect.x + rect.w }
    } else if edge == EDGE_START {
        rect.y
    } else {
        rect.y + rect.h
    }
}

pub fn snap_resize_edges_to_guides(rect: Rect, edges: [Edge; 2], dx: f64, dy: f64, guides: &[Guide], threshold: f64) -> Snap {
    let mut result = Snap { dx, dy, guides: Vec::new() };
    for axis in 0..2u8 {
        let edge = edges[axis as usize];
        if edge == EDGE_NONE {
            continue;
        }
        let delta = if axis == 0 { dx } else { dy };
        let position = edge_position(rect, axis, edge) + delta;
        let mut best: Option<(f64, f64, usize)> = None;
        for (index, guide) in guides.iter().enumerate() {
            if guide.axis != axis || guide.kind != 0 || !guide.pos.is_finite() {
                continue;
            }
            let adjust = guide.pos - position;
            let dist = adjust.abs();
            if !(dist <= threshold) {
                continue;
            }
            if best.is_none_or(|(_, best_dist, _)| dist < best_dist) {
                best = Some((adjust, dist, index));
            }
        }
        let Some((adjust, _, index)) = best else { continue };
        if axis == 0 {
            result.dx = delta + adjust;
        } else {
            result.dy = delta + adjust;
        }
        result.guides.push(index);
    }
    result
}

/// Indexes of the guides the dragged edges sit on (within half a unit).
/// A guide whose axis is not `x` is checked against the vertical edge.
pub fn guides_touching_edges(rect: Rect, edges: [Edge; 2], guides: &[Guide]) -> Vec<usize> {
    let mut out = Vec::new();
    for (index, guide) in guides.iter().enumerate() {
        let axis = if guide.axis == 0 { 0 } else { 1 };
        let edge = edges[axis as usize];
        if edge == EDGE_NONE {
            continue;
        }
        if (edge_position(rect, axis, edge) - guide.pos).abs() <= 0.5 {
            out.push(index);
        }
    }
    out
}

pub fn resize_rect_from_edges(rect: Rect, edges: [Edge; 2], dx: f64, dy: f64, min: [f64; 2], max: [f64; 2]) -> Rect {
    let Rect { mut x, mut y, mut w, mut h } = rect;
    if edges[0] != EDGE_NONE {
        w = js::max(min[0], js::min(rect.w + if edges[0] == EDGE_END { dx } else { -dx }, max[0]));
        if edges[0] == EDGE_START {
            x = rect.x + (rect.w - w);
        }
    }
    if edges[1] != EDGE_NONE {
        h = js::max(min[1], js::min(rect.h + if edges[1] == EDGE_END { dy } else { -dy }, max[1]));
        if edges[1] == EDGE_START {
            y = rect.y + (rect.h - h);
        }
    }
    Rect { x, y, w, h }
}

pub fn resize_rect_keeping_aspect(rect: Rect, edges: [Edge; 2], dx: f64, dy: f64, min: [f64; 2], max: [f64; 2]) -> Rect {
    let free = resize_rect_from_edges(rect, edges, dx, dy, [0.0, 0.0], [f64::INFINITY, f64::INFINITY]);
    let scale_x = free.w / rect.w;
    let scale_y = free.h / rect.h;
    let mut scale = if (scale_x - 1.0).abs() >= (scale_y - 1.0).abs() { scale_x } else { scale_y };
    scale = js::min(js::min(scale, max[0] / rect.w), max[1] / rect.h);
    scale = js::max(js::max(scale, min[0] / rect.w), min[1] / rect.h);
    let w = rect.w * scale;
    let h = rect.h * scale;
    Rect {
        x: if edges[0] == EDGE_START { rect.x + rect.w - w } else { rect.x },
        y: if edges[1] == EDGE_START { rect.y + rect.h - h } else { rect.y },
        w,
        h,
    }
}

/// JavaScript `%` on numbers (`fmod`, sign of the dividend).
#[inline]
fn rem(a: f64, b: f64) -> f64 {
    a % b
}

pub fn snap_rotation_degrees(degrees: f64, coarse: bool) -> f64 {
    let mut snapped = if coarse { js::round(degrees / 15.0) * 15.0 } else { js::round(degrees) };
    let right = js::round(degrees / 90.0) * 90.0;
    if !coarse && (degrees - right).abs() <= 3.0 {
        snapped = right;
    }
    snapped = rem(rem(snapped, 360.0) + 360.0, 360.0);
    if snapped > 180.0 { snapped - 360.0 } else { snapped }
}

#[allow(clippy::too_many_arguments)]
pub fn resize_rotated_rect(rect: Rect, rotation: f64, edges: [Edge; 2], dx: f64, dy: f64, min: [f64; 2], max: [f64; 2], keep_aspect: bool) -> Rect {
    let radians = (rotation * core::f64::consts::PI) / 180.0;
    let cos = js::cos(radians);
    let sin = js::sin(radians);
    let local_dx = dx * cos + dy * sin;
    let local_dy = -dx * sin + dy * cos;
    let resized = if keep_aspect {
        resize_rect_keeping_aspect(rect, edges, local_dx, local_dy, min, max)
    } else {
        resize_rect_from_edges(rect, edges, local_dx, local_dy, min, max)
    };
    if rotation == 0.0 || rotation.is_nan() {
        return resized;
    }
    let sign = |edge: Edge| if edge == EDGE_START { 1.0 } else if edge == EDGE_END { -1.0 } else { 0.0 };
    let (sign_x, sign_y) = (sign(edges[0]), sign(edges[1]));
    let old_half_x = (sign_x * rect.w) / 2.0;
    let old_half_y = (sign_y * rect.h) / 2.0;
    let new_half_x = (sign_x * resized.w) / 2.0;
    let new_half_y = (sign_y * resized.h) / 2.0;
    let center_x = rect.x + rect.w / 2.0;
    let center_y = rect.y + rect.h / 2.0;
    let next_x = center_x + (old_half_x - new_half_x) * cos - (old_half_y - new_half_y) * sin;
    let next_y = center_y + (old_half_x - new_half_x) * sin + (old_half_y - new_half_y) * cos;
    Rect { x: next_x - resized.w / 2.0, y: next_y - resized.h / 2.0, w: resized.w, h: resized.h }
}
