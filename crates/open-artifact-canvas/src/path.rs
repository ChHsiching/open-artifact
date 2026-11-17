//! Paths: decoding the command stream, dashing, tessellation (lyon) and hit testing.
//!
//! Command stream (f32): `0 x y` move, `1 x y` line, `2 cx cy x y` quadratic,
//! `3 c1x c1y c2x c2y x y` cubic, `4` close. Coordinates are local to the
//! item's rect (0,0 = its top-left), before the optional view-box scale.

use crate::geom::{dist_to_segment, Rect};
use lyon_tessellation::geom::point;
use lyon_tessellation::path::iterator::PathIterator;
use lyon_tessellation::path::{Path, PathEvent};
use lyon_tessellation::{
    BuffersBuilder, FillOptions, FillRule, FillTessellator, FillVertex, LineCap, LineJoin, StrokeOptions,
    StrokeTessellator, StrokeVertex, VertexBuffers,
};

pub const VERB_MOVE: f32 = 0.0;
pub const VERB_LINE: f32 = 1.0;
pub const VERB_QUAD: f32 = 2.0;
pub const VERB_CUBIC: f32 = 3.0;
pub const VERB_CLOSE: f32 = 4.0;

/// How a path is painted. Colours are RGBA8 (`0xRRGGBBAA`); alpha 0 means "none".
#[derive(Clone, Debug, PartialEq)]
pub struct PathStyle {
    pub fill: u32,
    pub stroke: u32,
    pub width: f32,
    /// 0 butt, 1 round, 2 square.
    pub cap: u8,
    /// 0 miter, 1 round, 2 bevel.
    pub join: u8,
    pub miter_limit: f32,
    pub dash: (f32, f32),
    /// 0 nonzero, 1 even-odd.
    pub fill_rule: u8,
}

impl Default for PathStyle {
    fn default() -> Self {
        PathStyle { fill: 0, stroke: 0x000000ff, width: 1.0, cap: 1, join: 1, miter_limit: 4.0, dash: (0.0, 0.0), fill_rule: 0 }
    }
}

impl PathStyle {
    pub fn has_fill(&self) -> bool {
        self.fill & 0xff != 0
    }
    pub fn has_stroke(&self) -> bool {
        self.stroke & 0xff != 0 && self.width > 0.0
    }
}

/// A flattened subpath: start index into the points, point count, closed.
pub type Subpath = (u32, u32, bool);

/// A tessellated path, in local coordinates (relative to the item rect's top-left).
#[derive(Clone, Debug, Default)]
pub struct PathGeom {
    pub verts: Vec<[f32; 2]>,
    /// Per vertex: 0 = fill, 1 = stroke (which colour it takes).
    pub kinds: Vec<u8>,
    pub indices: Vec<u32>,
    /// Flattened subpaths, for hit testing.
    pub flat: Vec<[f32; 2]>,
    pub subpaths: Vec<Subpath>,
    /// Bounds of the painted geometry (stroke included), local.
    pub bounds: Rect,
    /// The rect size this was tessellated for (resize previews scale from it).
    pub size: (f64, f64),
}

/// Builds a lyon path from the command stream, scaled by `scale`.
pub fn decode(data: &[f32], scale: (f32, f32)) -> Path {
    let mut b = Path::builder();
    let (sx, sy) = scale;
    let mut open = false;
    let mut start = point(0.0, 0.0);
    let mut cur = point(0.0, 0.0);
    let mut i = 0;
    let p = |x: f32, y: f32| point(x * sx, y * sy);
    while i < data.len() {
        let verb = data[i];
        let need = match verb as u32 {
            0 | 1 => 2,
            2 => 4,
            3 => 6,
            _ => 0,
        };
        if i + 1 + need > data.len() {
            break;
        }
        let a = &data[i + 1..i + 1 + need];
        match verb as u32 {
            0 => {
                if open {
                    b.end(false);
                }
                start = p(a[0], a[1]);
                cur = start;
                b.begin(start);
                open = true;
            }
            1..=3 => {
                if !open {
                    b.begin(cur);
                    start = cur;
                    open = true;
                }
                match verb as u32 {
                    1 => cur = p(a[0], a[1]),
                    2 => {
                        cur = p(a[2], a[3]);
                        b.quadratic_bezier_to(p(a[0], a[1]), cur);
                    }
                    _ => {
                        cur = p(a[4], a[5]);
                        b.cubic_bezier_to(p(a[0], a[1]), p(a[2], a[3]), cur);
                    }
                }
                if verb as u32 == 1 {
                    b.line_to(cur);
                }
            }
            _ => {
                if open {
                    b.end(true);
                    open = false;
                }
                cur = start;
            }
        }
        i += 1 + need;
    }
    if open {
        b.end(false);
    }
    b.build()
}

/// Flattens `path` into polylines: (points, subpaths (start, len, closed)).
fn flatten(path: &Path, tol: f32) -> (Vec<[f32; 2]>, Vec<Subpath>) {
    let mut pts: Vec<[f32; 2]> = Vec::new();
    let mut subs = Vec::new();
    let mut s = 0u32;
    for ev in path.iter().flattened(tol) {
        match ev {
            PathEvent::Begin { at } => {
                s = pts.len() as u32;
                pts.push([at.x, at.y]);
            }
            PathEvent::Line { to, .. } => pts.push([to.x, to.y]),
            PathEvent::End { close, .. } => subs.push((s, pts.len() as u32 - s, close)),
            _ => {}
        }
    }
    (pts, subs)
}

/// The dash pattern applied to flattened polylines, as a new path of open segments.
fn dashed(pts: &[[f32; 2]], subs: &[Subpath], on: f32, off: f32) -> Path {
    let mut b = Path::builder();
    for &(s, n, closed) in subs {
        let mut poly: Vec<[f32; 2]> = pts[s as usize..(s + n) as usize].to_vec();
        if closed && n > 1 {
            poly.push(poly[0]);
        }
        let mut drawing = true;
        let mut left = on;
        let mut open = false;
        for w in poly.windows(2) {
            let (a, c) = (w[0], w[1]);
            let len = ((c[0] - a[0]).powi(2) + (c[1] - a[1]).powi(2)).sqrt();
            let mut t = 0.0;
            while t < len {
                let step = left.min(len - t);
                let p0 = [a[0] + (c[0] - a[0]) * t / len, a[1] + (c[1] - a[1]) * t / len];
                let t1 = t + step;
                let p1 = [a[0] + (c[0] - a[0]) * t1 / len, a[1] + (c[1] - a[1]) * t1 / len];
                if drawing {
                    if !open {
                        b.begin(point(p0[0], p0[1]));
                        open = true;
                    }
                    b.line_to(point(p1[0], p1[1]));
                }
                left -= step;
                t = t1;
                if left <= 1e-6 {
                    if drawing && open {
                        b.end(false);
                        open = false;
                    }
                    drawing = !drawing;
                    left = if drawing { on } else { off };
                }
            }
        }
        if open {
            b.end(false);
        }
    }
    b.build()
}

/// Tessellates the command stream for a rect of `size`, with `scale` from the view box.
pub fn build(data: &[f32], style: &PathStyle, scale: (f32, f32), size: (f64, f64), tol: f32) -> PathGeom {
    let path = decode(data, scale);
    let (flat, subpaths) = flatten(&path, tol);
    let mut buffers: VertexBuffers<[f32; 2], u32> = VertexBuffers::new();
    let mut kinds = Vec::new();
    if style.has_fill() {
        let rule = if style.fill_rule == 1 { FillRule::EvenOdd } else { FillRule::NonZero };
        let _ = FillTessellator::new().tessellate_path(
            &path,
            &FillOptions::tolerance(tol).with_fill_rule(rule),
            &mut BuffersBuilder::new(&mut buffers, |v: FillVertex| v.position().to_array()),
        );
        kinds.resize(buffers.vertices.len(), 0u8);
    }
    if style.has_stroke() {
        let cap = match style.cap {
            0 => LineCap::Butt,
            2 => LineCap::Square,
            _ => LineCap::Round,
        };
        let join = match style.join {
            0 => LineJoin::Miter,
            2 => LineJoin::Bevel,
            _ => LineJoin::Round,
        };
        let opts = StrokeOptions::tolerance(tol)
            .with_line_width(style.width)
            .with_line_cap(cap)
            .with_line_join(join)
            .with_miter_limit(style.miter_limit.max(1.0));
        let dashing = style.dash.0 > 0.0 && style.dash.1 > 0.0;
        let stroked = if dashing { dashed(&flat, &subpaths, style.dash.0, style.dash.1) } else { path.clone() };
        let _ = StrokeTessellator::new().tessellate_path(
            &stroked,
            &opts,
            &mut BuffersBuilder::new(&mut buffers, |v: StrokeVertex| v.position().to_array()),
        );
        kinds.resize(buffers.vertices.len(), 1u8);
    }
    let mut bounds: Option<Rect> = None;
    for v in buffers.vertices.iter().chain(flat.iter()) {
        let r = Rect::new(v[0] as f64, v[1] as f64, 0.0, 0.0);
        bounds = Some(bounds.map_or(r, |b| b.union(&r)));
    }
    PathGeom {
        verts: buffers.vertices,
        kinds,
        indices: buffers.indices,
        flat,
        subpaths,
        bounds: bounds.unwrap_or_default(),
        size,
    }
}

impl PathGeom {
    /// Whether local point (x, y) hits the path: inside its fill (when `fill`) or within
    /// `half_width + tol` of its outline (when `stroke`).
    pub fn hit(&self, x: f64, y: f64, fill: bool, even_odd: bool, stroke: bool, half_width: f64, tol: f64) -> bool {
        if fill && self.inside(x, y, even_odd) {
            return true;
        }
        if stroke || fill {
            let reach = if stroke { half_width + tol } else { tol };
            for &(s, n, closed) in &self.subpaths {
                let pts = &self.flat[s as usize..(s + n) as usize];
                let segs = if closed && n > 1 { n as usize } else { (n as usize).saturating_sub(1) };
                if n == 1 {
                    let p = pts[0];
                    if ((p[0] as f64 - x).powi(2) + (p[1] as f64 - y).powi(2)).sqrt() <= reach {
                        return true;
                    }
                }
                for k in 0..segs {
                    let a = pts[k];
                    let b = pts[(k + 1) % n as usize];
                    if dist_to_segment(x, y, a[0] as f64, a[1] as f64, b[0] as f64, b[1] as f64) <= reach {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Point in polygon over all subpaths (each implicitly closed), nonzero or even-odd.
    pub fn inside(&self, x: f64, y: f64, even_odd: bool) -> bool {
        let mut winding = 0i32;
        let mut crossings = 0u32;
        for &(s, n, _) in &self.subpaths {
            let pts = &self.flat[s as usize..(s + n) as usize];
            for k in 0..n as usize {
                let a = pts[k];
                let b = pts[(k + 1) % n as usize];
                let (ax, ay, bx, by) = (a[0] as f64, a[1] as f64, b[0] as f64, b[1] as f64);
                if (ay <= y) != (by <= y) {
                    let t = (y - ay) / (by - ay);
                    if x < ax + t * (bx - ax) {
                        crossings += 1;
                        winding += if by > ay { 1 } else { -1 };
                    }
                }
            }
        }
        if even_odd { crossings % 2 == 1 } else { winding != 0 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square() -> Vec<f32> {
        vec![VERB_MOVE, 0.0, 0.0, VERB_LINE, 10.0, 0.0, VERB_LINE, 10.0, 10.0, VERB_LINE, 0.0, 10.0, VERB_CLOSE]
    }

    #[test]
    fn fill_and_stroke_tessellate() {
        let style = PathStyle { fill: 0xff0000ff, stroke: 0x000000ff, width: 2.0, ..Default::default() };
        let g = build(&square(), &style, (1.0, 1.0), (10.0, 10.0), 0.1);
        assert!(g.indices.len() >= 6);
        assert!(g.kinds.contains(&0) && g.kinds.contains(&1));
        assert!(g.bounds.x <= -0.9 && g.bounds.right() >= 10.9, "stroke widens bounds: {:?}", g.bounds);
        assert_eq!(g.subpaths.len(), 1);
        assert!(g.subpaths[0].2);
    }

    #[test]
    fn hit_fill_and_stroke() {
        let style = PathStyle { fill: 0xff0000ff, ..Default::default() };
        let g = build(&square(), &style, (1.0, 1.0), (10.0, 10.0), 0.1);
        assert!(g.hit(5.0, 5.0, true, false, false, 0.0, 0.5));
        assert!(!g.hit(15.0, 5.0, true, false, false, 0.0, 0.5));
        // Stroke only: the middle misses, the edge hits.
        assert!(!g.hit(5.0, 5.0, false, false, true, 1.0, 0.5));
        assert!(g.hit(10.4, 5.0, false, false, true, 1.0, 0.5));
    }

    #[test]
    fn polyline_stroke_proximity() {
        let line = vec![VERB_MOVE, 0.0, 0.0, VERB_LINE, 100.0, 100.0];
        let g = build(&line, &PathStyle { width: 4.0, ..Default::default() }, (1.0, 1.0), (100.0, 100.0), 0.1);
        assert!(g.hit(50.0, 51.0, false, false, true, 2.0, 1.0));
        assert!(!g.hit(50.0, 60.0, false, false, true, 2.0, 1.0));
    }

    #[test]
    fn curves_and_scale() {
        let d = vec![VERB_MOVE, 0.0, 0.0, VERB_CUBIC, 0.0, 10.0, 10.0, 10.0, 10.0, 0.0, VERB_QUAD, 5.0, -5.0, 0.0, 0.0];
        let g = build(&d, &PathStyle::default(), (2.0, 2.0), (20.0, 20.0), 0.05);
        assert!(g.flat.len() > 8, "curves are flattened into many points");
        assert!(g.bounds.right() > 19.0, "scaled by 2: {:?}", g.bounds);
    }

    #[test]
    fn dashes_split_the_stroke() {
        let line = vec![VERB_MOVE, 0.0, 0.0, VERB_LINE, 100.0, 0.0];
        let solid = build(&line, &PathStyle { cap: 0, ..Default::default() }, (1.0, 1.0), (100.0, 1.0), 0.1);
        let dashed = build(&line, &PathStyle { cap: 0, dash: (10.0, 10.0), ..Default::default() }, (1.0, 1.0), (100.0, 1.0), 0.1);
        // Five dashes, each its own quad.
        assert!(dashed.indices.len() >= 5 * solid.indices.len(), "{} vs {}", dashed.indices.len(), solid.indices.len());
    }

    #[test]
    fn even_odd_hole() {
        let mut d = vec![VERB_MOVE, 0.0, 0.0, VERB_LINE, 30.0, 0.0, VERB_LINE, 30.0, 30.0, VERB_LINE, 0.0, 30.0, VERB_CLOSE];
        d.extend([VERB_MOVE, 10.0, 10.0, VERB_LINE, 20.0, 10.0, VERB_LINE, 20.0, 20.0, VERB_LINE, 10.0, 20.0, VERB_CLOSE]);
        let g = build(&d, &PathStyle { fill: 0xff, stroke: 0, ..Default::default() }, (1.0, 1.0), (30.0, 30.0), 0.1);
        assert!(g.inside(15.0, 15.0, false));
        assert!(!g.inside(15.0, 15.0, true));
        assert!(g.inside(5.0, 5.0, true));
    }
}
