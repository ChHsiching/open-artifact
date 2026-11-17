//! Snapping a dragged arrow end.

use crate::arrow_layout::{box_side_toward_point, rotate_point_around, rotated_bounding_box};
use crate::js;
use crate::routing::{Pt, RouteBox, Side};
use crate::shape_paths::{shape_edge_inset, Kind};

/// An element as far as end snapping cares.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SnapElem {
    /// 0 other, 1 container, 2 shape.
    pub ty: u8,
    pub kind: Kind,
    pub hollow: bool,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub turn: f64,
    /// Its layout box (`None` for stickers and unresolved elements).
    pub bounds: Option<RouteBox>,
}

pub const TYPE_CONTAINER: u8 = 1;
pub const TYPE_SHAPE: u8 = 2;

pub fn point_to_box_distance(b: &RouteBox, x: f64, y: f64) -> f64 {
    js::hypot2(js::max_of([b.x - x, 0.0, x - b.x - b.w]), js::max_of([b.y - y, 0.0, y - b.y - b.h]))
}

/// `side`: `None` for no side, `Some(None)` for a value that is not a side.
pub fn align_arrow_end_point(from: Pt, side: Option<Option<Side>>, x: f64, y: f64, snap_px: f64) -> Pt {
    let (dx, dy) = (x - from[0], y - from[1]);
    let within_snap = |offset: f64, along: f64| offset.abs() <= js::min(snap_px, along.abs() / 3.0);
    let horizontal = match side {
        None => dx.abs() > dy.abs(),
        Some(Some(Side::Right)) => dx > 0.0,
        Some(Some(Side::Left)) => dx < 0.0,
        Some(_) => false,
    };
    let vertical = match side {
        None => !horizontal,
        Some(Some(Side::Bottom)) => dy > 0.0,
        Some(Some(Side::Top)) => dy < 0.0,
        Some(_) => false,
    };
    if horizontal && within_snap(dy, dx) {
        [x, from[1]]
    } else if vertical && within_snap(dx, dy) {
        [from[0], y]
    } else {
        [x, y]
    }
}

fn is_box_distance_kind(kind: Kind) -> bool {
    matches!(kind, Kind::Cloud | Kind::Parallelogram | Kind::Person)
}

pub fn arrow_end_distance_to_element(element: &SnapElem, bounds: &RouteBox, x: f64, y: f64, reach: f64) -> f64 {
    let outside = point_to_box_distance(bounds, x, y);
    if element.ty != TYPE_SHAPE || outside > reach || (element.kind != Kind::Ellipse && !element.hollow) {
        return outside;
    }
    let (half_w, half_h) = (element.w / 2.0, element.h / 2.0);
    let (dx, dy) = (x - element.x - half_w, y - element.y - half_h);
    let side_inset = |side: Side, offset: f64| shape_edge_inset(element.kind, element.w, element.h, side, offset, 0.0);
    let inside_gap = || {
        js::max_of([
            0.0,
            side_inset(Side::Left, dy) - half_w - dx,
            side_inset(Side::Right, dy) - half_w + dx,
            side_inset(Side::Top, dx) - half_h - dy,
            side_inset(Side::Bottom, dx) - half_h + dy,
        ])
    };
    if is_box_distance_kind(element.kind) {
        return if outside > 0.0 { outside } else { js::min(inside_gap(), f64::from_bits(1)) };
    }
    if element.kind != Kind::Ellipse {
        return inside_gap();
    }
    let outside_ellipse = |pad: f64| js::hypot2(dx / (half_w + pad), dy / (half_h + pad)) > 1.0;
    if !outside_ellipse(0.0) {
        return 0.0;
    }
    if outside_ellipse(reach) {
        return f64::INFINITY;
    }
    let (mut lo, mut hi) = (0.0, reach);
    for _ in 0..12 {
        let mid = (lo + hi) / 2.0;
        if outside_ellipse(mid) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    hi
}

/// The element (index) nearest to `x, y` within `reach` an arrow end can
/// attach to, and the side facing the point.
pub fn find_arrow_end_target(elements: &[SnapElem], x: f64, y: f64, reach: f64) -> Option<(usize, Side)> {
    let mut best: Option<(usize, f64)> = None;
    for (index, element) in elements.iter().enumerate() {
        let Some(bounds) = element.bounds else { continue };
        let local = if element.turn != 0.0 { rotate_point_around([x, y], [bounds.x + bounds.w / 2.0, bounds.y + bounds.h / 2.0], -element.turn) } else { [x, y] };
        let distance = arrow_end_distance_to_element(element, &bounds, local[0], local[1], reach);
        if distance == 0.0 || distance > reach {
            continue;
        }
        if let Some((best_index, best_distance)) = best {
            if distance > best_distance || (distance == best_distance && element.ty == TYPE_CONTAINER && elements[best_index].ty != TYPE_CONTAINER) {
                continue;
            }
        }
        best = Some((index, distance));
    }
    best.map(|(index, _)| {
        let element = &elements[index];
        (index, box_side_toward_point(&rotated_bounding_box(element.bounds.unwrap_or(RouteBox { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }), element.turn), x, y))
    })
}
