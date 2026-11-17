//! Hit testing.
//!
//! Elements come as [`Hit`] records that TypeScript resolves once per
//! element (layout boxes, arrow lines, text boxes, section titles: the parts
//! that need the board, measures or text), so testing a point or a marquee
//! against a whole board is one call.

use crate::arrow_layout::{rotate_point_around, rotated_bounding_box};
use crate::js;
use crate::labels::{segment_intersects_box, ARROW_HEAD_LENGTH};
use crate::routing::{Pt, RouteBox as Box, Side};
use crate::shape_paths::{shape_edge_inset, Kind};

pub const CONTAINER_EDGE_HIT_WIDTH: f64 = 14.0;
const STICKER_OUTLINE_PX: f64 = 4.0;
const STICKER_OUTLINE_MAX: f64 = 8.0;
const DEFAULT_STICKER_SIZE: f64 = 48.0;
const TEXT_LINE_HEIGHT: f64 = 1.35;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShapeGeom {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub kind: Kind,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ArrowHit {
    pub ends: [Pt; 2],
    pub heads: [bool; 2],
    pub polyline: Vec<f64>,
    pub crossed: Vec<Box>,
    pub label: Option<Box>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Body {
    /// An unknown type (never hit).
    Other,
    /// An arrow that cannot be drawn (or tested without a board).
    NoLine,
    Arrow(ArrowHit),
    Sticker { x: f64, y: f64, w: f64, h: f64, no_pad: bool },
    /// Images, notes, text, tables and the like: their layout box.
    Box,
    Container { title: Option<Box>, title_text: Option<Box> },
    Shape { shape: ShapeGeom, hollow: bool, ellipse: bool, text: Option<Box> },
    Stroke { x: f64, y: f64, width: f64, points: Vec<f64> },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Hit {
    pub turn: f64,
    pub layout: Option<Box>,
    pub body: Body,
}

impl Hit {
    fn is_container(&self) -> bool {
        matches!(self.body, Body::Container { .. })
    }
    fn is_arrow(&self) -> bool {
        matches!(self.body, Body::Arrow(_) | Body::NoLine)
    }
}

pub fn point_in_box(b: &Box, x: f64, y: f64) -> bool {
    x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

pub fn distance_to_segment_sq(px: f64, py: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let length_sq = dx * dx + dy * dy;
    let t = if length_sq == 0.0 { 0.0 } else { js::min(1.0, js::max(0.0, ((px - x1) * dx + (py - y1) * dy) / length_sq)) };
    let offset_x = x1 + t * dx - px;
    let offset_y = y1 + t * dy - py;
    offset_x * offset_x + offset_y * offset_y
}

pub fn shape_outline_depth(shape: &ShapeGeom, x: f64, y: f64) -> f64 {
    let half_w = shape.w / 2.0;
    let half_h = shape.h / 2.0;
    let dx = x - (shape.x + half_w);
    let dy = y - (shape.y + half_h);
    let inset = |side: Side, offset: f64| shape_edge_inset(shape.kind, shape.w, shape.h, side, offset, 0.0);
    js::min_of([
        half_w + dx - inset(Side::Left, dy),
        half_w - dx - inset(Side::Right, dy),
        half_h + dy - inset(Side::Top, dx),
        half_h - dy - inset(Side::Bottom, dx),
    ])
}

/// `estimateTextBox` after the text is split: the UTF-16 length of each
/// word, line by line.
pub fn estimate_text_box(lines: &[Vec<f64>], px: f64, b: &Box, align_x: f64, align_y: f64) -> Box {
    let width_of = |length: f64| length * px * 0.55;
    let mut line_count = 0.0;
    let mut widest = 0.0;
    for words in lines {
        let mut line_width = 0.0;
        line_count += 1.0;
        for &length in words {
            if line_width > 0.0 && line_width + width_of(length + 1.0) > b.w {
                line_count += 1.0;
                line_width = 0.0;
            }
            line_width += width_of(if line_width > 0.0 { length + 1.0 } else { length });
            widest = js::max(widest, line_width);
        }
    }
    let w = js::min(widest, b.w);
    let h = js::min(line_count * px * TEXT_LINE_HEIGHT, b.h);
    Box { x: b.x + (b.w - w) * align_x, y: b.y + (b.h - h) * align_y, w, h }
}

pub fn outline_crosses_box(shape: &ShapeGeom, b: &Box) -> bool {
    let samples = |from: f64, to: f64| -> [f64; 9] { core::array::from_fn(|index| from + ((to - from) * index as f64) / 8.0) };
    let crosses = |values: &[f64], min: f64, max: f64| values.iter().any(|&v| v >= min && v <= max) || (values.iter().any(|&v| v < min) && values.iter().any(|&v| v > max));
    let outline_at = |side: Side, offset: f64| shape_edge_inset(shape.kind, shape.w, shape.h, side, offset, f64::NAN);
    let ys = samples(js::max(b.y, shape.y), js::min(b.y + b.h, shape.y + shape.h));
    let xs = samples(js::max(b.x, shape.x), js::min(b.x + b.w, shape.x + shape.w));
    let test_side_x = |outline: &dyn Fn(f64) -> f64, direction: f64| {
        let side_xs: Vec<f64> = ys.iter().map(|&y| outline(y - shape.y - shape.h / 2.0)).collect();
        crosses(&side_xs, b.x, b.x + b.w) && {
            let kept: Vec<f64> = side_xs.iter().enumerate().filter(|&(index, &x)| shape_outline_depth(shape, x + direction, ys[index]) > -0.5).map(|(_, &x)| x).collect();
            crosses(&kept, b.x, b.x + b.w)
        }
    };
    let test_side_y = |outline: &dyn Fn(f64) -> f64, direction: f64| {
        let side_ys: Vec<f64> = xs.iter().map(|&x| outline(x - shape.x - shape.w / 2.0)).collect();
        crosses(&side_ys, b.y, b.y + b.h) && {
            let kept: Vec<f64> = side_ys.iter().enumerate().filter(|&(index, &y)| shape_outline_depth(shape, xs[index], y + direction) > -0.5).map(|(_, &y)| y).collect();
            crosses(&kept, b.y, b.y + b.h)
        }
    };
    test_side_x(&|offset| shape.x + outline_at(Side::Left, offset), 1.0)
        || test_side_x(&|offset| shape.x + shape.w - outline_at(Side::Right, offset), -1.0)
        || test_side_y(&|offset| shape.y + outline_at(Side::Top, offset), 1.0)
        || test_side_y(&|offset| shape.y + shape.h - outline_at(Side::Bottom, offset), -1.0)
}

pub fn rotated_boxes_overlap(b: &Box, degrees: f64, other: &Box) -> bool {
    let radians = (degrees * core::f64::consts::PI) / 180.0;
    let cos = js::cos(radians);
    let sin = js::sin(radians);
    let cx = b.x + b.w / 2.0;
    let cy = b.y + b.h / 2.0;
    let corners: [Pt; 4] = [[-b.w / 2.0, -b.h / 2.0], [b.w / 2.0, -b.h / 2.0], [b.w / 2.0, b.h / 2.0], [-b.w / 2.0, b.h / 2.0]].map(|[dx, dy]| [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]);
    let other_corners: [Pt; 4] = [[other.x, other.y], [other.x + other.w, other.y], [other.x + other.w, other.y + other.h], [other.x, other.y + other.h]];
    for axis in [[1.0, 0.0], [0.0, 1.0], [cos, sin], [-sin, cos]] {
        let project = |points: &[Pt; 4]| {
            let (mut min, mut max) = (f64::INFINITY, f64::NEG_INFINITY);
            for p in points {
                let along = p[0] * axis[0] + p[1] * axis[1];
                min = js::min(min, along);
                max = js::max(max, along);
            }
            (min, max)
        };
        let (min_a, max_a) = project(&corners);
        let (min_b, max_b) = project(&other_corners);
        if max_a < min_b || max_b < min_a {
            return false;
        }
    }
    true
}

pub fn rotate_box_around(b: &Box, center: Pt, degrees: f64) -> Box {
    if degrees == 0.0 {
        return *b;
    }
    let c = rotate_point_around([b.x + b.w / 2.0, b.y + b.h / 2.0], center, degrees);
    Box { x: c[0] - b.w / 2.0, y: c[1] - b.h / 2.0, w: b.w, h: b.h }
}

/// Text boxes an arrow's line passes through. Each text box comes with
/// whether the arrow's `from` / `to` end may sit in it (the end is a point,
/// or that element).
pub fn text_boxes_crossed_by_arrow(ends: [Pt; 2], elbow: Option<&[Pt]>, polyline: &[f64], texts: &[(Box, [bool; 2])]) -> Vec<usize> {
    let (x0, y0, x1, y1) = match elbow {
        Some(points) => (
            js::min_of(points.iter().map(|p| p[0])),
            js::min_of(points.iter().map(|p| p[1])),
            js::max_of(points.iter().map(|p| p[0])),
            js::max_of(points.iter().map(|p| p[1])),
        ),
        None => (js::min(ends[0][0], ends[1][0]), js::min(ends[0][1], ends[1][1]), js::max(ends[0][0], ends[1][0]), js::max(ends[0][1], ends[1][1])),
    };
    let pad = |b: &Box| Box { x: b.x - 4.0, y: b.y - 2.0, w: b.w + 8.0, h: b.h + 4.0 };
    let mut crossed = Vec::new();
    for (index, (b, may_hold)) in texts.iter().enumerate() {
        if b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0 {
            continue;
        }
        if (may_hold[0] && point_in_box(b, ends[0][0], ends[0][1])) || (may_hold[1] && point_in_box(b, ends[1][0], ends[1][1])) {
            continue;
        }
        if point_in_box(&pad(b), ends[0][0], ends[0][1]) && point_in_box(&pad(b), ends[1][0], ends[1][1]) {
            continue;
        }
        let mut at = 0;
        while at + 3 < polyline.len() {
            let (sx1, sy1, sx2, sy2) = (polyline[at], polyline[at + 1], polyline[at + 2], polyline[at + 3]);
            at += 2;
            if js::max(sx1, sx2) <= b.x || js::min(sx1, sx2) >= b.x + b.w || js::max(sy1, sy2) <= b.y || js::min(sy1, sy2) >= b.y + b.h || !segment_intersects_box(sx1, sy1, sx2, sy2, b) {
                continue;
            }
            crossed.push(index);
            break;
        }
    }
    crossed
}

fn local_point(hit: &Hit, x: f64, y: f64) -> Pt {
    match hit.layout {
        Some(b) if hit.turn != 0.0 => rotate_point_around([x, y], [b.x + b.w / 2.0, b.y + b.h / 2.0], -hit.turn),
        _ => [x, y],
    }
}

fn title_hit(title: &Option<Box>, x: f64, y: f64, slop: f64) -> bool {
    title.is_some_and(|t| point_in_box(&Box { x: t.x - slop, y: t.y - slop, w: t.w + 2.0 * slop, h: t.h + slop }, x, y))
}

/// `hitTestElement`; `None` for an unknown type (TypeScript returns `undefined`).
pub fn hit_test_element(hit: &Hit, x: f64, y: f64, tolerance: f64) -> Option<bool> {
    let [x, y] = local_point(hit, x, y);
    Some(match &hit.body {
        Body::Other => return None,
        Body::NoLine => false,
        Body::Arrow(arrow) => {
            let reach = 3.0 + tolerance;
            let poly = &arrow.polyline;
            let mut at = 0;
            while at + 3 < poly.len() {
                if distance_to_segment_sq(x, y, poly[at], poly[at + 1], poly[at + 2], poly[at + 3]) > reach * reach {
                    at += 2;
                    continue;
                }
                let near_head = (0..2).any(|end| arrow.heads[end] && js::hypot2(x - arrow.ends[end][0], y - arrow.ends[end][1]) <= ARROW_HEAD_LENGTH);
                if near_head || !arrow.crossed.iter().any(|b| point_in_box(b, x, y)) {
                    return Some(true);
                }
                break;
            }
            arrow.label.is_some_and(|label| point_in_box(&label, x, y))
        }
        &Body::Sticker { x: sx, y: sy, w, h, no_pad } => {
            let pad = if no_pad { 0.0 } else { js::min(STICKER_OUTLINE_MAX, (STICKER_OUTLINE_PX * js::min(w, h)) / DEFAULT_STICKER_SIZE) };
            point_in_box(&Box { x: sx - pad, y: sy - pad, w: w + 2.0 * pad, h: h + 2.0 * pad }, x, y)
        }
        Body::Box => hit.layout.is_some_and(|b| point_in_box(&b, x, y)),
        Body::Container { title, .. } => {
            if title_hit(title, x, y, tolerance) {
                return Some(true);
            }
            let Some(b) = hit.layout else { return Some(false) };
            if !point_in_box(&b, x, y) {
                return Some(false);
            }
            let band = CONTAINER_EDGE_HIT_WIDTH + tolerance;
            y - b.y <= band || x - b.x <= band || b.x + b.w - x <= band || b.y + b.h - y <= band
        }
        Body::Shape { shape, hollow, ellipse, text } => {
            let half_w = shape.w / 2.0;
            let half_h = shape.h / 2.0;
            let dx = x - (shape.x + half_w);
            let dy = y - (shape.y + half_h);
            let inset = if *ellipse { -tolerance } else { 0.0 };
            let inside = if *ellipse {
                js::hypot2(dx / js::max(1.0, half_w - inset), dy / js::max(1.0, half_h - inset)) <= 1.0
            } else {
                dx.abs() <= half_w - inset && dy.abs() <= half_h - inset
            };
            if !inside {
                return Some(false);
            }
            if !hollow {
                return Some(true);
            }
            let depth = shape_outline_depth(shape, x, y);
            if depth < -tolerance {
                return Some(false);
            }
            depth <= CONTAINER_EDGE_HIT_WIDTH + tolerance
                || text.is_some_and(|t| point_in_box(&Box { x: t.x - tolerance, y: t.y - tolerance, w: t.w + 2.0 * tolerance, h: t.h + 2.0 * tolerance }, x, y))
        }
        Body::Stroke { x: sx, y: sy, width, points } => {
            let reach = width / 2.0 + tolerance;
            let reach_sq = reach * reach;
            let local_x = x - sx;
            let local_y = y - sy;
            if points.len() == 2 {
                let dx = local_x - points[0];
                let dy = local_y - points[1];
                return Some(dx * dx + dy * dy <= reach_sq);
            }
            let mut at = 0;
            while at + 3 < points.len() {
                if distance_to_segment_sq(local_x, local_y, points[at], points[at + 1], points[at + 2], points[at + 3]) <= reach_sq {
                    return Some(true);
                }
                at += 2;
            }
            false
        }
    })
}

fn hits(hit: &Hit, x: f64, y: f64, tolerance: f64) -> bool {
    hit_test_element(hit, x, y, tolerance) == Some(true)
}

fn label_hit(hit: Option<&Hit>, x: f64, y: f64) -> bool {
    matches!(hit.map(|h| &h.body), Some(Body::Arrow(ArrowHit { label: Some(label), .. })) if point_in_box(label, x, y))
}

/// `arrowLabelBeneath`: the index of the arrow below `index` whose label is under the point.
pub fn arrow_label_beneath(elements: &[Hit], index: usize, x: f64, y: f64, tolerance: f64) -> Option<usize> {
    if label_hit(elements.get(index), x, y) {
        return None;
    }
    for i in (0..index.min(elements.len())).rev() {
        let element = &elements[i];
        if element.is_container() {
            continue;
        }
        if label_hit(Some(element), x, y) {
            return Some(i);
        }
        if !element.is_arrow() && hits(element, x, y, tolerance) {
            return None;
        }
    }
    None
}

/// `topElementAt`: the index of the topmost element under the point.
pub fn top_element_at(elements: &[Hit], x: f64, y: f64, tolerance: f64) -> Option<usize> {
    for (index, element) in elements.iter().enumerate().rev() {
        if let Body::Container { title_text: Some(t), .. } = &element.body {
            if point_in_box(t, x, y) {
                return Some(index);
            }
        }
    }
    for (index, element) in elements.iter().enumerate().rev() {
        if element.is_container() {
            continue;
        }
        if hits(element, x, y, tolerance) {
            return Some(if element.is_arrow() { arrow_label_beneath(elements, index, x, y, tolerance).unwrap_or(index) } else { index });
        }
    }
    for (index, element) in elements.iter().enumerate().rev() {
        if let Body::Container { title, .. } = &element.body {
            if title_hit(title, x, y, tolerance) {
                return Some(index);
            }
        }
    }
    elements.iter().enumerate().rev().find(|(_, element)| element.is_container() && hits(element, x, y, tolerance)).map(|(index, _)| index)
}

/// `elementsInMarquee`: indexes of the elements a marquee touches, in
/// board order. `ids[i]` numbers element i's id; `ends[i]` numbers an
/// arrow's two element ends (`None` unless both ends name elements).
pub fn elements_in_marquee(elements: &[Hit], ids: &[u32], ends: &[Option<[u32; 2]>], marquee: &Box) -> Vec<usize> {
    let overlaps = |b: &Box| b.x < marquee.x + marquee.w && b.x + b.w > marquee.x && b.y < marquee.y + marquee.h && b.y + b.h > marquee.y;
    let mut hit_ids = std::collections::BTreeSet::new();
    for (index, element) in elements.iter().enumerate() {
        if element.is_arrow() {
            continue;
        }
        let Some(b) = element.layout else { continue };
        if let Body::Container { title, .. } = &element.body {
            let band = CONTAINER_EDGE_HIT_WIDTH;
            if title.is_some_and(|t| overlaps(&t))
                || overlaps(&Box { x: b.x, y: b.y, w: b.w, h: band })
                || overlaps(&Box { x: b.x, y: b.y, w: band, h: b.h })
                || overlaps(&Box { x: b.x + b.w - band, y: b.y, w: band, h: b.h })
                || overlaps(&Box { x: b.x, y: b.y + b.h - band, w: b.w, h: band })
            {
                hit_ids.insert(ids[index]);
            }
            continue;
        }
        let turn = element.turn;
        let hit = if turn == 0.0 { overlaps(&b) } else { rotated_boxes_overlap(&b, turn, marquee) };
        if !hit {
            continue;
        }
        let inside_hollow = match &element.body {
            Body::Shape { shape, hollow: true, text, .. } => {
                let local = if turn == 0.0 { *marquee } else { rotated_bounding_box(rotate_box_around(marquee, [b.x + b.w / 2.0, b.y + b.h / 2.0], -turn), -turn) };
                let corners_inside = [[local.x, local.y], [local.x + local.w, local.y], [local.x, local.y + local.h], [local.x + local.w, local.y + local.h]]
                    .iter()
                    .all(|c| shape_outline_depth(shape, c[0], c[1]) > CONTAINER_EDGE_HIT_WIDTH);
                let center_inside = shape_outline_depth(
                    shape,
                    js::min(js::max(b.x + b.w / 2.0, local.x), local.x + local.w),
                    js::min(js::max(b.y + b.h / 2.0, local.y), local.y + local.h),
                ) < 0.0;
                let touches_text = text.is_some_and(|t| t.x < local.x + local.w && t.x + t.w > local.x && t.y < local.y + local.h && t.y + t.h > local.y);
                (corners_inside || center_inside) && !outline_crosses_box(shape, &local) && !touches_text
            }
            _ => false,
        };
        if !inside_hollow {
            hit_ids.insert(ids[index]);
        }
    }
    (0..elements.len())
        .filter(|&index| {
            let element = &elements[index];
            if !element.is_arrow() {
                return hit_ids.contains(&ids[index]);
            }
            if ends.get(index).copied().flatten().is_some_and(|pair| pair.iter().all(|id| hit_ids.contains(id))) {
                return true;
            }
            let Body::Arrow(arrow) = &element.body else { return false };
            let poly = &arrow.polyline;
            let mut at = 0;
            while at + 3 < poly.len() {
                if segment_intersects_box(poly[at], poly[at + 1], poly[at + 2], poly[at + 3], marquee) {
                    return true;
                }
                at += 2;
            }
            false
        })
        .collect()
}
