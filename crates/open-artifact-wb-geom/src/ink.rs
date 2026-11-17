//! Ink: hand-drawn outlines as
//! filled ribbons with seeded pen pressure, and pen stroke paths.

use crate::js;
use crate::routing::Pt;
use crate::shape_paths::{Cmd, Kind, SeededRandom, seed_with_index, shape_outline_commands};

pub const INK_TAPER_LENGTH: f64 = 12.0;
pub const INK_FLATNESS: f64 = 0.1;
pub const INK_CORNER_ANGLE: f64 = 0.05;
pub const INK_NOISE_BASE_LENGTH: f64 = 48.0;

/// A flattened outline piece.
#[derive(Clone, Debug, PartialEq)]
pub struct InkPolyline {
    pub pts: Vec<Pt>,
    pub corners: Vec<usize>,
    pub closed: bool,
}

pub fn ink_half_width(pressure: f64) -> f64 {
    0.27 + 0.853 * pressure
}

fn sub(a: Pt, b: Pt) -> Pt {
    [a[0] - b[0], a[1] - b[1]]
}

fn distance(a: Pt, b: Pt) -> f64 {
    js::hypot2(a[0] - b[0], a[1] - b[1])
}

fn midpoint(a: Pt, b: Pt) -> Pt {
    [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0]
}

pub fn ink_turn_angle(a: Pt, b: Pt) -> f64 {
    js::atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]).abs()
}

fn push_ink_number(out: &mut String, value: f64) {
    js::push_number(out, js::round(value * 100.0) / 100.0);
}

/// `formatInkPoint`.
pub fn push_ink_point(out: &mut String, point: Pt) {
    push_ink_number(out, point[0]);
    out.push(' ');
    push_ink_number(out, point[1]);
}

fn flatten_cubic_into(p0: Pt, p1: Pt, p2: Pt, p3: Pt, max_step: f64, out: &mut Vec<Pt>) {
    let length = (distance(p0, p1) + distance(p1, p2) + distance(p2, p3) + distance(p0, p3)) / 2.0;
    if length < 0.1
        || (length <= max_step && length * (ink_turn_angle(sub(p1, p0), sub(p2, p1)) + ink_turn_angle(sub(p2, p1), sub(p3, p2))) <= 8.0 * INK_FLATNESS)
    {
        out.push(p3);
        return;
    }
    let m01 = midpoint(p0, p1);
    let m12 = midpoint(p1, p2);
    let m23 = midpoint(p2, p3);
    let m012 = midpoint(m01, m12);
    let m123 = midpoint(m12, m23);
    let middle = midpoint(m012, m123);
    flatten_cubic_into(p0, m01, m012, middle, max_step, out);
    flatten_cubic_into(middle, m123, m23, p3, max_step, out);
}

/// Flattens outline commands into polylines with points at most `step`
/// apart, noting sharp corners; pieces with fewer than three points are dropped.
pub fn flatten_path_to_polylines(path: &[Cmd], step: f64) -> Vec<InkPolyline> {
    let mut polylines: Vec<InkPolyline> = Vec::new();
    let mut first_direction: Option<Pt> = None;
    let mut last_direction: Option<Pt> = None;
    for command in path {
        if let Cmd::M(x, y) = *command {
            polylines.push(InkPolyline { pts: vec![[x, y]], corners: Vec::new(), closed: false });
            first_direction = None;
            last_direction = None;
            continue;
        }
        let Some(last) = polylines.last_mut() else { continue };
        let (Some(&last_point), Some(&first_point)) = (last.pts.last(), last.pts.first()) else { continue };
        let end: Pt = match *command {
            Cmd::C(c) => [c[4], c[5]],
            Cmd::L(x, y) => [x, y],
            _ => first_point,
        };
        if distance(last_point, end) > 0.0001 {
            let toward = if let Cmd::C(c) = *command { [c[0], c[1]] } else { end };
            let direction = sub(toward, last_point);
            if let Some(previous) = last_direction
                && ink_turn_angle(previous, direction) > INK_CORNER_ANGLE
            {
                last.corners.push(last.pts.len() - 1);
            }
            first_direction = first_direction.or(Some(direction));
            let from = if let Cmd::C(c) = *command { [c[2], c[3]] } else { last_point };
            last_direction = Some(sub(end, from));
            if let Cmd::C(c) = *command {
                flatten_cubic_into(last_point, [c[0], c[1]], [c[2], c[3]], end, step, &mut last.pts);
            } else {
                let pieces = (distance(last_point, end) / step).ceil();
                let mut count = 1.0;
                while count <= pieces {
                    last.pts.push([
                        last_point[0] + ((end[0] - last_point[0]) * count) / pieces,
                        last_point[1] + ((end[1] - last_point[1]) * count) / pieces,
                    ]);
                    count += 1.0;
                }
            }
        }
        if let Cmd::Z = *command {
            last.pts.pop();
            last.closed = true;
            if let (Some(first), Some(previous)) = (first_direction, last_direction)
                && ink_turn_angle(previous, first) > INK_CORNER_ANGLE
            {
                last.corners.insert(0, 0);
            }
        }
    }
    polylines.retain(|polyline| polyline.pts.len() > 2);
    polylines
}

pub fn smoothstep(edge0: f64, edge1: f64, x: f64) -> f64 {
    let t = js::max(0.0, js::min(1.0, (x - edge0) / (edge1 - edge0)));
    t * t * (3.0 - 2.0 * t)
}

/// `ToLength` of an array length argument.
fn to_length(count: f64) -> usize {
    if count.is_nan() || count <= 0.0 { 0 } else { count.trunc().min(1e9) as usize }
}

/// Periodic 1-D value noise over [0, 1) with `count` knots.
#[derive(Clone, Debug)]
pub struct ValueNoise {
    values: Vec<f64>,
    count: f64,
}

impl ValueNoise {
    pub fn new(count: f64, mut random: impl FnMut() -> f64) -> Self {
        let values = (0..to_length(count)).map(|_| random()).collect();
        ValueNoise { values, count }
    }

    pub fn from_values(count: f64, values: Vec<f64>) -> Self {
        ValueNoise { values, count }
    }

    fn at(&self, index: f64) -> f64 {
        let i = index % self.count;
        if i >= 0.0 && i.fract() == 0.0 && (i as usize) < self.values.len() {
            // `values[-0]` is `values[0]`.
            self.values[i as usize]
        } else {
            0.0
        }
    }

    pub fn eval(&self, x: f64) -> f64 {
        let scaled = (x - x.floor()) * self.count;
        let base = scaled.floor();
        self.at(base) + (self.at(base + 1.0) - self.at(base)) * smoothstep(0.0, 1.0, scaled - base)
    }
}

/// Seeded pen pressure and sideways stray along an outline.
#[derive(Clone, Debug)]
pub struct InkPressure {
    stray: ValueNoise,
    a: ValueNoise,
    b: ValueNoise,
    blend: f64,
    strength: f64,
}

impl InkPressure {
    pub fn new(length: f64, strength: f64, seed: &[u16]) -> Self {
        let mut random = SeededRandom::new(seed);
        let stray = ValueNoise::new(3.0, || random.next());
        let octave = |depth: f64| {
            let mut random = SeededRandom::new(&seed_with_index(seed, depth));
            ValueNoise::new(js::max(2.0, js::round(0.7 * libm::pow(2.0, depth))), || random.next())
        };
        let level = js::min(7.0, js::log2(length / INK_NOISE_BASE_LENGTH));
        let near = js::round(level);
        let a = octave(near);
        let b = octave(if level > near { near + 1.0 } else { near - 1.0 });
        let blend = smoothstep(0.3, 0.7, (level - near).abs());
        InkPressure { stray, a, b, blend, strength }
    }

    pub fn press(&self, at: f64) -> f64 {
        let a = self.a.eval(at);
        js::min(1.0, self.strength * (0.62 + 0.5 * smoothstep(0.1, 0.9, a + (self.b.eval(at) - a) * self.blend)))
    }

    pub fn stray(&self, at: f64) -> f64 {
        2.0 * self.stray.eval(at) - 1.0
    }
}

/// One side of a ribbon as smooth quadratic segments.
pub fn ink_side_path_into(out: &mut String, points: &[Pt]) {
    let n = points.len();
    for (index, &point) in points.iter().enumerate().skip(1).map(|(i, p)| (i - 1, p)) {
        if index + 2 == n {
            out.push_str(if index == 0 { "L" } else { " " });
            push_ink_point(out, point);
        } else {
            out.push('Q');
            push_ink_point(out, point);
            if index + 3 != n {
                out.push(' ');
                push_ink_point(out, midpoint(point, points.get(index + 2).copied().unwrap_or(point)));
            }
        }
    }
}

/// A closed smooth loop through points.
pub fn closed_ink_loop_path_into(out: &mut String, points: &[Pt]) {
    out.push('M');
    push_ink_point(out, midpoint(points.last().copied().unwrap_or([0.0, 0.0]), points.first().copied().unwrap_or([0.0, 0.0])));
    for (index, &point) in points.iter().enumerate() {
        out.push('Q');
        push_ink_point(out, point);
        out.push(' ');
        push_ink_point(out, midpoint(point, points[(index + 1) % points.len()]));
    }
    out.push('Z');
}

pub fn ink_corner_blob_into(out: &mut String, [x, y]: Pt, size: f64) {
    let points: Vec<Pt> = (0..6)
        .map(|step| {
            let angle = (step as f64 * core::f64::consts::PI) / 3.0;
            [x + (size / 0.87) * js::cos(angle), y - (size / 0.87) * js::sin(angle)]
        })
        .collect();
    closed_ink_loop_path_into(out, &points);
}

/// The filled ribbon (path data) of one polyline.
pub fn ink_polyline_outline_into(out: &mut String, polyline: &InkPolyline, strength: f64, seed: &[u16]) {
    let pts = &polyline.pts;
    let corners = &polyline.corners;
    let closed = polyline.closed;
    let count = pts.len() as i64;
    let point_at = |index: i64| -> Pt {
        if count == 0 {
            return [0.0, 0.0];
        }
        let i = if closed { ((index % count) + count) % count } else { index.min(count - 1).max(0) };
        pts[i as usize]
    };
    let mut lengths = vec![0.0f64];
    for index in 1..(2 * count).max(1) {
        let previous = lengths[(index - 1) as usize];
        lengths.push(previous + distance(point_at(index), point_at(index - 1)));
    }
    let length_at = |index: i64| -> f64 { if index >= 0 { lengths.get(index as usize).copied().unwrap_or(0.0) } else { 0.0 } };
    let total = crate::shape_paths::or_one(length_at(if closed { count } else { count - 1 }));
    let pressure = InkPressure::new(total, strength, seed);
    let half_width_at = |index: i64| -> f64 {
        let taper = if closed { 1.0 } else { 0.25 + 0.75 * smoothstep(0.0, 7.0, length_at(index)) * smoothstep(0.0, 7.0, total - length_at(index)) };
        ink_half_width(pressure.press(length_at(index) / total) * taper)
    };
    let smooth = closed && corners.is_empty();
    let breaks: Vec<i64> = if smooth {
        vec![0, count - 1]
    } else if closed {
        let mut b: Vec<i64> = corners.iter().map(|&c| c as i64).collect();
        b.push(corners.first().map_or(0, |&c| c as i64) + count);
        b
    } else {
        let mut b = vec![0i64];
        b.extend(corners.iter().map(|&c| c as i64));
        b.push(count - 1);
        b
    };
    for segment in 0..breaks.len().saturating_sub(1) {
        let start = breaks[segment];
        let end = breaks[segment + 1];
        let mut left: Vec<Pt> = Vec::new();
        let mut right: Vec<Pt> = Vec::new();
        for step in 0..(end - start + 1).max(0) {
            let index = start + step;
            let [dx, dy] = sub(
                point_at(if smooth || index < end { index + 1 } else { index }),
                point_at(if smooth || index > start { index - 1 } else { index }),
            );
            let length = crate::shape_paths::or_one(js::hypot2(dx, dy));
            let half_width = half_width_at(index);
            let fade = if smooth {
                1.0
            } else {
                smoothstep(0.0, INK_TAPER_LENGTH, js::min(length_at(index) - length_at(start), length_at(end) - length_at(index)))
            };
            let stray = pressure.stray(length_at(index) / total) * 0.5 * half_width * fade;
            let here = point_at(index);
            let offset_point = |d: f64| -> Pt { [here[0] - (dy / length) * d, here[1] + (dx / length) * d] };
            left.push(offset_point(stray + half_width));
            right.push(offset_point(stray - half_width));
        }
        right.reverse();
        if smooth {
            closed_ink_loop_path_into(out, &left);
            closed_ink_loop_path_into(out, &right);
        } else {
            out.push('M');
            push_ink_point(out, left.first().copied().unwrap_or([0.0, 0.0]));
            ink_side_path_into(out, &left);
            out.push('L');
            push_ink_point(out, right.first().copied().unwrap_or([0.0, 0.0]));
            ink_side_path_into(out, &right);
            out.push('Z');
        }
    }
    let blob_at: Vec<i64> = if smooth {
        Vec::new()
    } else if closed {
        corners.iter().map(|&c| c as i64).collect()
    } else {
        breaks.clone()
    };
    for index in blob_at {
        ink_corner_blob_into(out, point_at(index), half_width_at(index));
    }
}

/// The hand-drawn outline of a shape as filled path data.
pub fn hand_drawn_shape_outline(kind: Kind, w: f64, h: f64, seed: &[u16]) -> String {
    let strength = 1.0 - 0.3 * SeededRandom::new(seed).next();
    let mut out = String::new();
    let polylines = flatten_path_to_polylines(&shape_outline_commands(kind, w, h), js::max(INK_TAPER_LENGTH, (w + h) / 100.0));
    for (index, polyline) in polylines.iter().enumerate() {
        ink_polyline_outline_into(&mut out, polyline, strength, &seed_with_index(seed, index as f64));
    }
    out
}

/// `normalizeStrokePoints`: the top-left corner and the points relative to it, rounded to 0.1.
pub fn normalize_stroke_points(points: &[f64]) -> (f64, f64, Vec<f64>) {
    let (mut min_x, mut min_y) = (f64::INFINITY, f64::INFINITY);
    let mut index = 0;
    while index + 1 < points.len() {
        min_x = js::min(min_x, points[index]);
        min_y = js::min(min_y, points[index + 1]);
        index += 2;
    }
    let tidy = |v: f64| {
        let r = js::round(v * 10.0) / 10.0;
        if r == 0.0 || r.is_nan() { 0.0 } else { r }
    };
    let mut relative = Vec::with_capacity(points.len());
    let mut index = 0;
    while index + 1 < points.len() {
        relative.push(tidy(points[index] - min_x));
        relative.push(tidy(points[index + 1] - min_y));
        index += 2;
    }
    (min_x, min_y, relative)
}

/// `strokeBounds` with the stroke's width already defaulted.
pub fn stroke_bounds(x: f64, y: f64, points: &[f64], width: f64) -> [f64; 4] {
    let (mut min_x, mut min_y, mut max_x, mut max_y) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
    let mut index = 0;
    while index + 1 < points.len() {
        let (px, py) = (points[index], points[index + 1]);
        min_x = js::min(min_x, px);
        min_y = js::min(min_y, py);
        max_x = js::max(max_x, px);
        max_y = js::max(max_y, py);
        index += 2;
    }
    if min_x == f64::INFINITY {
        return [x, y, 0.0, 0.0];
    }
    let pad = width / 2.0;
    [x + min_x - pad, y + min_y - pad, max_x - min_x + 2.0 * pad, max_y - min_y + 2.0 * pad]
}
