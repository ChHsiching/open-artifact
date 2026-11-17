//! Shape outlines: command
//! lists for every kind in the local box (0,0)–(w,h), their flattening, the
//! edge inset an arrow end or a label needs, SVG path data, text insets and
//! the seeded random generator the hand-drawn look uses.

use crate::js;
use crate::routing::{Pt, Side};

/// A shape kind, or `Frame` (a section's rounded outline). Unknown kinds
/// behave as `Rect` in every function here, as they do in TypeScript.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Rect = 0,
    Rounded = 1,
    Ellipse = 2,
    Diamond = 3,
    Pill = 4,
    Hexagon = 5,
    Parallelogram = 6,
    Database = 7,
    Queue = 8,
    Document = 9,
    Cloud = 10,
    Person = 11,
    Frame = 12,
}

impl Kind {
    pub fn from_code(code: u8) -> Kind {
        match code {
            1 => Kind::Rounded,
            2 => Kind::Ellipse,
            3 => Kind::Diamond,
            4 => Kind::Pill,
            5 => Kind::Hexagon,
            6 => Kind::Parallelogram,
            7 => Kind::Database,
            8 => Kind::Queue,
            9 => Kind::Document,
            10 => Kind::Cloud,
            11 => Kind::Person,
            12 => Kind::Frame,
            _ => Kind::Rect,
        }
    }

    /// Drawn from curves (database, queue, document, cloud, person).
    pub fn is_curved(self) -> bool {
        matches!(self, Kind::Database | Kind::Queue | Kind::Document | Kind::Cloud | Kind::Person)
    }

    pub fn is_polygon(self) -> bool {
        matches!(self, Kind::Diamond | Kind::Hexagon | Kind::Parallelogram)
    }
}

/// One outline command in local box coordinates.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Cmd {
    M(f64, f64),
    L(f64, f64),
    C([f64; 6]),
    Z,
}

pub const BEZIER_CIRCLE_KAPPA: f64 = 0.5523;

pub fn quarter_arc(x1: f64, y1: f64, x2: f64, y2: f64, horizontal_first: bool) -> Cmd {
    if horizontal_first {
        Cmd::C([x1 + (x2 - x1) * BEZIER_CIRCLE_KAPPA, y1, x2, y2 - (y2 - y1) * BEZIER_CIRCLE_KAPPA, x2, y2])
    } else {
        Cmd::C([x1, y1 + (y2 - y1) * BEZIER_CIRCLE_KAPPA, x2 - (x2 - x1) * BEZIER_CIRCLE_KAPPA, y2, x2, y2])
    }
}

pub fn shape_corner_radius(kind: Kind, width: f64, height: f64) -> f64 {
    let half = js::min(width, height) / 2.0;
    let inner = if kind == Kind::Pill { half } else { js::min(12.0, if kind == Kind::Frame { half } else { half / 2.0 }) };
    js::max(0.0, js::min(inner, half))
}

/// Corner points of the polygon kinds (diamond, hexagon; anything else is a parallelogram).
pub fn polygon_shape_points(kind: Kind, width: f64, height: f64) -> Vec<Pt> {
    if kind == Kind::Diamond {
        return vec![[width / 2.0, 0.0], [width, height / 2.0], [width / 2.0, height], [0.0, height / 2.0]];
    }
    if kind == Kind::Hexagon {
        let inset = js::min(width * 0.25, height * 0.5);
        return vec![[inset, 0.0], [width - inset, 0.0], [width, height / 2.0], [width - inset, height], [inset, height], [0.0, height / 2.0]];
    }
    let slant = js::min(width * 0.2, height * 0.6);
    vec![[slant, 0.0], [width, 0.0], [width - slant, height], [0.0, height]]
}

pub fn cylinder_cap_depth(width: f64, height: f64) -> f64 {
    js::min(width * 0.1, height * 0.13)
}

pub fn person_head_radius(width: f64, height: f64) -> f64 {
    js::min(height * 0.195, width * 0.35)
}

pub fn person_shoulder_top(width: f64, height: f64) -> f64 {
    2.0 * person_head_radius(width, height) + height * 0.03
}

pub fn document_wave_depth(width: f64, height: f64) -> f64 {
    js::min(height * 0.08, width * 0.12)
}

pub fn database_path(width: f64, height: f64) -> Vec<Cmd> {
    let center_x = width / 2.0;
    let cap = cylinder_cap_depth(width, height);
    vec![
        Cmd::M(0.0, cap),
        quarter_arc(0.0, cap, center_x, 0.0, false),
        quarter_arc(center_x, 0.0, width, cap, true),
        Cmd::L(width, height - cap),
        quarter_arc(width, height - cap, center_x, height, false),
        quarter_arc(center_x, height, 0.0, height - cap, true),
        Cmd::Z,
        Cmd::M(width, cap),
        quarter_arc(width, cap, center_x, 2.0 * cap, false),
        quarter_arc(center_x, 2.0 * cap, 0.0, cap, true),
    ]
}

pub fn person_head_path(width: f64, height: f64) -> Vec<Cmd> {
    let cx = width / 2.0;
    let r = person_head_radius(width, height);
    let cy = r;
    vec![
        Cmd::M(cx, cy - r),
        quarter_arc(cx, cy - r, cx + r, cy, true),
        quarter_arc(cx + r, cy, cx, cy + r, false),
        quarter_arc(cx, cy + r, cx - r, cy, true),
        quarter_arc(cx - r, cy, cx, cy - r, false),
        Cmd::Z,
    ]
}

pub fn person_body_path(width: f64, height: f64) -> Vec<Cmd> {
    let top = person_shoulder_top(width, height);
    let sr = js::min(width * 0.3, (height - top) * 0.5);
    let fr = js::min(js::min(10.0, width / 4.0), (height - top) / 4.0);
    vec![
        Cmd::M(sr, top),
        Cmd::L(width - sr, top),
        quarter_arc(width - sr, top, width, top + sr, true),
        Cmd::L(width, height - fr),
        quarter_arc(width, height - fr, width - fr, height, false),
        Cmd::L(fr, height),
        quarter_arc(fr, height, 0.0, height - fr, true),
        Cmd::L(0.0, top + sr),
        quarter_arc(0.0, top + sr, sr, top, false),
        Cmd::Z,
    ]
}

pub fn document_path(width: f64, height: f64) -> Vec<Cmd> {
    let wave = document_wave_depth(width, height);
    let cr = js::min(js::min(10.0, width / 4.0), height / 4.0);
    vec![
        Cmd::M(cr, 0.0),
        Cmd::L(width - cr, 0.0),
        quarter_arc(width - cr, 0.0, width, cr, true),
        Cmd::L(width, height - wave),
        Cmd::C([width * 0.66, height - wave - 3.464 * wave, width * 0.34, height - wave + 3.464 * wave, 0.0, height - wave]),
        Cmd::L(0.0, cr),
        quarter_arc(0.0, cr, cr, 0.0, false),
        Cmd::Z,
    ]
}

pub const CLOUD_CURVES: [[f64; 6]; 4] = [
    [-0.068, 0.99, -0.068, 0.46, 0.17, 0.46],
    [0.12, 0.2, 0.32, 0.07, 0.41, 0.21],
    [0.45, -0.07, 0.73, -0.07, 0.75, 0.29],
    [1.07, 0.24, 1.09, 0.99, 0.78, 0.99],
];

pub fn cloud_path(width: f64, height: f64) -> Vec<Cmd> {
    let mut out = vec![Cmd::M(0.24 * width, 0.99 * height)];
    for [a, b, c, d, e, f] in CLOUD_CURVES {
        out.push(Cmd::C([a * width, b * height, c * width, d * height, e * width, f * height]));
    }
    out.push(Cmd::Z);
    out
}

pub fn queue_path(width: f64, height: f64) -> Vec<Cmd> {
    database_path(height, width)
        .into_iter()
        .map(|command| match command {
            Cmd::Z => Cmd::Z,
            Cmd::C(c) => Cmd::C([width - c[1], c[0], width - c[3], c[2], width - c[5], c[4]]),
            Cmd::M(x, y) => Cmd::M(width - y, x),
            Cmd::L(x, y) => Cmd::L(width - y, x),
        })
        .collect()
}

/// The outline of a curved kind (`CURVED_SHAPE_PATHS[kind]`).
pub fn curved_shape_path(kind: Kind, width: f64, height: f64) -> Vec<Cmd> {
    match kind {
        Kind::Database => database_path(width, height),
        Kind::Queue => queue_path(width, height),
        Kind::Document => document_path(width, height),
        Kind::Cloud => cloud_path(width, height),
        _ => {
            let mut out = person_head_path(width, height);
            out.extend(person_body_path(width, height));
            out
        }
    }
}

pub fn shape_outline_commands(kind: Kind, width: f64, height: f64) -> Vec<Cmd> {
    if kind.is_curved() {
        return curved_shape_path(kind, width, height);
    }
    if kind.is_polygon() {
        let mut out: Vec<Cmd> = polygon_shape_points(kind, width, height)
            .into_iter()
            .enumerate()
            .map(|(index, [x, y])| if index == 0 { Cmd::M(x, y) } else { Cmd::L(x, y) })
            .collect();
        out.push(Cmd::Z);
        return out;
    }
    let (rx, ry) = if kind == Kind::Ellipse {
        (width / 2.0, height / 2.0)
    } else {
        (shape_corner_radius(kind, width, height), shape_corner_radius(kind, width, height))
    };
    vec![
        Cmd::M(rx, 0.0),
        Cmd::L(width - rx, 0.0),
        quarter_arc(width - rx, 0.0, width, ry, true),
        Cmd::L(width, height - ry),
        quarter_arc(width, height - ry, width - rx, height, false),
        Cmd::L(rx, height),
        quarter_arc(rx, height, 0.0, height - ry, true),
        Cmd::L(0.0, ry),
        quarter_arc(0.0, ry, rx, 0.0, false),
        Cmd::Z,
    ]
}

/// Walks an outline as straight segments: lines as they are, each cubic
/// flattened into 16 pieces.
pub fn walk_path_segments(commands: &[Cmd], mut visit: impl FnMut(f64, f64, f64, f64)) {
    let (mut x, mut y, mut sx, mut sy) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
    for command in commands {
        match *command {
            Cmd::M(mx, my) => {
                x = mx;
                sx = mx;
                y = my;
                sy = my;
            }
            Cmd::Z => {
                visit(x, y, sx, sy);
                x = sx;
                y = sy;
            }
            Cmd::L(lx, ly) => {
                visit(x, y, lx, ly);
                x = lx;
                y = ly;
            }
            Cmd::C(c) => {
                let (fx, fy) = (x, y);
                for step in 1..=16 {
                    let t = step as f64 / 16.0;
                    let u = 1.0 - t;
                    let nx = u * u * u * fx + 3.0 * u * u * t * c[0] + 3.0 * u * t * t * c[2] + t * t * t * c[4];
                    let ny = u * u * u * fy + 3.0 * u * u * t * c[1] + 3.0 * u * t * t * c[3] + t * t * t * c[5];
                    visit(x, y, nx, ny);
                    x = nx;
                    y = ny;
                }
            }
        }
    }
}

/// The flattened segments of a curved outline plus its inner lines. `None`
/// for kinds that are not curved.
pub fn curved_shape_line_segments(kind: Kind, width: f64, height: f64) -> Option<Vec<[f64; 4]>> {
    if !kind.is_curved() {
        return None;
    }
    let mut lines: Vec<[f64; 4]> = match kind {
        Kind::Document => {
            let top = height - document_wave_depth(width, height);
            vec![[0.0, top, 0.0, height], [width, top, width, height]]
        }
        Kind::Person => vec![[width / 2.0, 2.0 * person_head_radius(width, height), width / 2.0, person_shoulder_top(width, height)]],
        _ => Vec::new(),
    };
    walk_path_segments(&curved_shape_path(kind, width, height), |a, b, c, d| lines.push([a, b, c, d]));
    Some(lines)
}

/// Distance from `side` to the outline along the line crossing that side at
/// `line_offset`; infinity when the outline never crosses it.
pub fn shape_edge_inset_at_line(commands: &[Cmd], width: f64, height: f64, side: Side, line_offset: f64) -> f64 {
    let vertical = matches!(side, Side::Left | Side::Right);
    let side_coord = match side {
        Side::Right => width,
        Side::Bottom => height,
        _ => 0.0,
    };
    let mut best = f64::INFINITY;
    walk_path_segments(commands, |x1, y1, x2, y2| {
        let (along1, along2, across1, across2) = if vertical { (y1, y2, x1, x2) } else { (x1, x2, y1, y2) };
        if (along1 - line_offset) * (along2 - line_offset) <= 0.0 {
            if along1 == along2 {
                best = js::min(best, (side_coord - across1).abs());
                best = js::min(best, (side_coord - across2).abs());
            } else {
                let crossing = across1 + ((across2 - across1) * (line_offset - along1)) / (along2 - along1);
                best = js::min(best, (side_coord - crossing).abs());
            }
        }
    });
    best
}

pub fn curved_shape_edge_inset(kind: Kind, width: f64, height: f64, side: Side, line_offset: f64, fallback: f64) -> f64 {
    let vertical = matches!(side, Side::Left | Side::Right);
    let inset = if vertical && kind == Kind::Person {
        js::min(
            shape_edge_inset_at_line(&person_head_path(width, height), width, height, side, line_offset),
            shape_edge_inset_at_line(
                &person_body_path(width, height),
                width,
                height,
                side,
                js::max(line_offset, person_shoulder_top(width, height)),
            ),
        )
    } else {
        let offset = if vertical && kind == Kind::Document { js::min(line_offset, height - document_wave_depth(width, height)) } else { line_offset };
        shape_edge_inset_at_line(&curved_shape_path(kind, width, height), width, height, side, offset)
    };
    if inset == f64::INFINITY { fallback } else { inset }
}

pub fn rounded_corner_inset(radius: f64, half_span: f64, offset: f64) -> f64 {
    let from_corner = half_span - js::min(half_span, offset.abs());
    if from_corner >= radius {
        0.0
    } else {
        let d = radius - from_corner;
        radius - js::max(0.0, radius * radius - d * d).sqrt()
    }
}

/// `x || 1` for a number.
#[inline]
pub(crate) fn or_one(x: f64) -> f64 {
    if x == 0.0 || x.is_nan() { 1.0 } else { x }
}

pub fn shape_edge_inset(kind: Kind, width: f64, height: f64, side: Side, offset: f64, fallback: f64) -> f64 {
    let vertical = matches!(side, Side::Left | Side::Right);
    let (half_span, depth_span) = if vertical { (height / 2.0, width) } else { (width / 2.0, height) };
    let clamped = js::max(-half_span, js::min(half_span, offset));
    if kind.is_curved() {
        return curved_shape_edge_inset(kind, width, height, side, half_span + clamped, fallback);
    }
    match kind {
        Kind::Ellipse => {
            let q = clamped / or_one(half_span);
            (depth_span / 2.0) * (1.0 - js::max(0.0, 1.0 - q * q).sqrt())
        }
        Kind::Diamond => ((depth_span / 2.0) * clamped.abs()) / or_one(half_span),
        Kind::Hexagon => {
            let inset = js::min(width * 0.25, height * 0.5);
            if vertical {
                return (inset * clamped.abs()) / or_one(half_span);
            }
            let from_corner = half_span - clamped.abs();
            if from_corner >= inset { 0.0 } else { (height / 2.0) * (1.0 - from_corner / or_one(inset)) }
        }
        Kind::Parallelogram => {
            let slant = js::min(width * 0.2, height * 0.6);
            match side {
                Side::Left => slant * (0.5 - clamped / height),
                Side::Right => slant * (0.5 + clamped / height),
                _ => {
                    let from_corner = if side == Side::Top { half_span + clamped } else { half_span - clamped };
                    if from_corner >= slant { 0.0 } else { height * (1.0 - from_corner / or_one(slant)) }
                }
            }
        }
        _ => rounded_corner_inset(shape_corner_radius(kind, width, height), half_span, clamped),
    }
}

/// `String(Math.round(value * 10) / 10)`.
pub fn format_path_number(value: f64) -> String {
    js::number_to_string(js::round(value * 10.0) / 10.0)
}

fn push_num(out: &mut String, value: f64) {
    js::push_number(out, value);
}

/// Commands as `command.join(' ')`, joined by spaces.
pub fn commands_path_data(commands: &[Cmd]) -> String {
    let mut out = String::new();
    for (index, command) in commands.iter().enumerate() {
        if index > 0 {
            out.push(' ');
        }
        match *command {
            Cmd::M(x, y) | Cmd::L(x, y) => {
                out.push_str(if matches!(command, Cmd::M(..)) { "M " } else { "L " });
                push_num(&mut out, x);
                out.push(' ');
                push_num(&mut out, y);
            }
            Cmd::C(c) => {
                out.push('C');
                for value in c {
                    out.push(' ');
                    push_num(&mut out, value);
                }
            }
            Cmd::Z => out.push('Z'),
        }
    }
    out
}

pub fn shape_path_data(kind: Kind, width: f64, height: f64) -> String {
    if kind != Kind::Frame {
        return commands_path_data(&shape_outline_commands(kind, width, height));
    }
    let r = shape_corner_radius(kind, width, height);
    let s = js::number_to_string;
    let (rs, wr, hr) = (s(r), s(width - r), s(height - r));
    format!(
        "M {rs} 0 H {wr} A {rs} {rs} 0 0 1 {w} {rs} V {hr} A {rs} {rs} 0 0 1 {wr} {h} H {rs} A {rs} {rs} 0 0 1 0 {hr} V {rs} A {rs} {rs} 0 0 1 {rs} 0 Z",
        w = s(width),
        h = s(height)
    )
}

pub fn polygon_corner_radius(kind: Kind) -> f64 {
    if kind.is_polygon() { 6.0 } else { 0.0 }
}

pub fn rounded_polygon_path_data(kind: Kind, width: f64, height: f64, rounded: bool) -> String {
    let radius = polygon_corner_radius(kind) / 2.0;
    if !rounded || !kind.is_polygon() {
        return shape_path_data(kind, width, height);
    }
    let points = polygon_shape_points(kind, width, height);
    let n = points.len() as isize;
    let point_at = |index: isize| points[((index + n) % n) as usize];
    let corner_offset = |index: isize| -> Pt {
        let [x1, y1] = point_at(index);
        let [x2, y2] = point_at(index + 1);
        let length = or_one(js::hypot2(x2 - x1, y2 - y1));
        let nx = (y2 - y1) / length;
        let ny = (x1 - x2) / length;
        let signed = if nx * ((x1 + x2) / 2.0 - width / 2.0) + ny * ((y1 + y2) / 2.0 - height / 2.0) < 0.0 { -radius } else { radius };
        [nx * signed, ny * signed]
    };
    let format_point = |[x, y]: Pt, [dx, dy]: Pt| format!("{} {}", format_path_number(x + dx), format_path_number(y + dy));
    let mut sum = 0.0;
    for (index, &[x, y]) in points.iter().enumerate() {
        let next = point_at(index as isize + 1);
        sum = sum + x * next[1] - next[0] * y;
    }
    let sweep = if sum > 0.0 { 1 } else { 0 };
    let arc = format!("A {r} {r} 0 0 {sweep} ", r = js::number_to_string(radius));
    let mut parts = Vec::with_capacity(points.len());
    for index in 0..n {
        let offset = corner_offset(index);
        parts.push(format!(
            "{}{} L {}",
            if index == 0 { "M " } else { arc.as_str() },
            format_point(point_at(index), offset),
            format_point(point_at(index + 1), offset)
        ));
    }
    format!("{} {}{} Z", parts.join(" "), arc, format_point(point_at(0), corner_offset(0)))
}

pub fn cylinder_cap_path_data(kind: Kind, width: f64, height: f64) -> Option<String> {
    if kind != Kind::Database && kind != Kind::Queue {
        return None;
    }
    let (rx, ry) = if kind == Kind::Database { (width / 2.0, cylinder_cap_depth(width, height)) } else { (cylinder_cap_depth(height, width), height / 2.0) };
    let (cx, cy) = if kind == Kind::Database { (rx, ry) } else { (width - rx, ry) };
    let s = js::number_to_string;
    Some(format!(
        "M {a} {cy} A {rx} {ry} 0 1 1 {b} {cy} A {rx} {ry} 0 1 1 {a} {cy} Z",
        a = s(cx - rx),
        b = s(cx + rx),
        cy = s(cy),
        rx = s(rx),
        ry = s(ry)
    ))
}

/// `seededRandomFromString`: FNV-1a over the UTF-16 code units, then a
/// mulberry-style mix per draw; values in [0, 1).
#[derive(Clone, Copy, Debug)]
pub struct SeededRandom {
    state: u32,
}

impl SeededRandom {
    pub fn seed_state(seed: &[u16]) -> u32 {
        let mut state: u32 = 2166136261;
        for &unit in seed {
            state = (state ^ unit as u32).wrapping_mul(16777619);
        }
        state
    }

    pub fn new(seed: &[u16]) -> Self {
        SeededRandom { state: Self::seed_state(seed) }
    }

    pub fn from_state(state: u32) -> Self {
        SeededRandom { state }
    }

    /// The value a fresh generator in `state` gives after `draws` draws plus one.
    pub fn value_of(state: u32) -> f64 {
        let mut value = (state ^ (state >> 15)).wrapping_mul(1 | state);
        value = value.wrapping_add((value ^ (value >> 7)).wrapping_mul(61 | value)) ^ value;
        (value ^ (value >> 14)) as f64 / 4294967296.0
    }

    pub fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_add(1831565813);
        Self::value_of(self.state)
    }
}

/// UTF-16 code units of `text`.
pub fn utf16(text: &str) -> Vec<u16> {
    text.encode_utf16().collect()
}

/// `${seed}/${n}` as UTF-16.
pub fn seed_with_index(seed: &[u16], n: f64) -> Vec<u16> {
    let mut out = Vec::with_capacity(seed.len() + 4);
    out.extend_from_slice(seed);
    out.push(b'/' as u16);
    out.extend(js::number_to_string(n).encode_utf16());
    out
}

/// `shapeTextInsets`: left, right, top, bottom fractions.
pub fn shape_text_insets(kind: Kind, width: f64, height: f64) -> [f64; 4] {
    match kind {
        Kind::Diamond => [0.22, 0.22, 0.22, 0.22],
        Kind::Ellipse => [0.14, 0.14, 0.14, 0.14],
        Kind::Hexagon | Kind::Parallelogram => [0.18, 0.18, 0.06, 0.06],
        Kind::Database => [0.06, 0.06, (2.0 * cylinder_cap_depth(width, height)) / height + 0.03, (0.6 * cylinder_cap_depth(width, height)) / height],
        Kind::Queue => [(0.6 * cylinder_cap_depth(height, width)) / width, (2.0 * cylinder_cap_depth(height, width)) / width + 0.03, 0.06, 0.06],
        Kind::Document => [0.06, 0.06, 0.06, 0.18],
        Kind::Cloud => [0.2, 0.15, 0.38, 0.07],
        Kind::Person => [0.1, 0.1, person_shoulder_top(width, height) / height + 0.07, 0.04],
        _ => [0.06, 0.06, 0.06, 0.06],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeded_random_matches_typescript() {
        // seededRandomFromString('seed')() in Node.
        let mut random = SeededRandom::new(&utf16("seed"));
        let first = random.next();
        assert!((0.0..1.0).contains(&first));
        let mut again = SeededRandom::new(&utf16("seed"));
        assert_eq!(again.next(), first);
    }

    #[test]
    fn path_data_formats_like_javascript() {
        assert_eq!(shape_path_data(Kind::Diamond, 100.0, 50.0), "M 50 0 L 100 25 L 50 50 L 0 25 Z");
        assert_eq!(format_path_number(-0.04), "0");
    }
}
