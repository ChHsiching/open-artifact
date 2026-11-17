//! Snapping a moving box (or a resized edge) to other items' edges and centres.

use crate::geom::Rect;

/// One candidate line: a coordinate on one axis and the target's extent on the other.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Feature {
    pub v: f64,
    pub lo: f64,
    pub hi: f64,
}

/// What can be snapped to: x features (vertical lines) and y features (horizontal lines), sorted.
#[derive(Clone, Debug, Default)]
pub struct Targets {
    pub xs: Vec<Feature>,
    pub ys: Vec<Feature>,
}

/// A guide line to draw: vertical at x = `at` (or horizontal at y = `at`) from `lo` to `hi`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Guide {
    pub vertical: bool,
    pub at: f64,
    pub lo: f64,
    pub hi: f64,
}

impl Targets {
    pub fn from_rects(rects: impl IntoIterator<Item = Rect>) -> Targets {
        let mut t = Targets::default();
        for r in rects {
            for v in [r.x, r.cx(), r.right()] {
                t.xs.push(Feature { v, lo: r.y, hi: r.bottom() });
            }
            for v in [r.y, r.cy(), r.bottom()] {
                t.ys.push(Feature { v, lo: r.x, hi: r.right() });
            }
        }
        t.xs.sort_by(|a, b| a.v.total_cmp(&b.v));
        t.ys.sort_by(|a, b| a.v.total_cmp(&b.v));
        t
    }
}

/// The nearest feature value to `v` within `threshold`, as (target - v).
fn nearest(features: &[Feature], v: f64, threshold: f64) -> Option<f64> {
    let i = features.partition_point(|f| f.v < v);
    let mut best: Option<f64> = None;
    for j in [i.wrapping_sub(1), i] {
        if let Some(f) = features.get(j) {
            let d = f.v - v;
            if d.abs() <= threshold && best.is_none_or(|b| d.abs() < b.abs()) {
                best = Some(d);
            }
        }
    }
    best
}

/// The best correction for any of `values` on one axis.
pub fn snap_values(features: &[Feature], values: &[f64], threshold: f64) -> Option<f64> {
    let mut best: Option<f64> = None;
    for &v in values {
        if let Some(d) = nearest(features, v, threshold)
            && best.is_none_or(|b| d.abs() < b.abs()) {
            best = Some(d);
        }
    }
    best
}

const EPS: f64 = 1e-6;

/// Guides for every feature of `r` that lines up exactly with a target, spanning both.
pub fn guides_for(t: &Targets, r: &Rect, x_values: &[f64], y_values: &[f64]) -> Vec<Guide> {
    let mut out = Vec::new();
    for &v in x_values {
        let lo_hi = t.xs.iter().filter(|f| (f.v - v).abs() < EPS).fold(None, |acc: Option<(f64, f64)>, f| {
            Some(acc.map_or((f.lo, f.hi), |(a, b)| (a.min(f.lo), b.max(f.hi))))
        });
        if let Some((lo, hi)) = lo_hi {
            out.push(Guide { vertical: true, at: v, lo: lo.min(r.y), hi: hi.max(r.bottom()) });
        }
    }
    for &v in y_values {
        let lo_hi = t.ys.iter().filter(|f| (f.v - v).abs() < EPS).fold(None, |acc: Option<(f64, f64)>, f| {
            Some(acc.map_or((f.lo, f.hi), |(a, b)| (a.min(f.lo), b.max(f.hi))))
        });
        if let Some((lo, hi)) = lo_hi {
            out.push(Guide { vertical: false, at: v, lo: lo.min(r.x), hi: hi.max(r.right()) });
        }
    }
    out.dedup_by(|a, b| a.vertical == b.vertical && (a.at - b.at).abs() < EPS);
    out
}

/// Snaps box `r` (already moved by the raw delta) to `t`: returns the corrected
/// (dx, dy) to add and the guides to show.
pub fn snap_box(t: &Targets, r: &Rect, threshold: f64, snap_x: bool, snap_y: bool) -> (f64, f64, Vec<Guide>) {
    let dx = if snap_x { snap_values(&t.xs, &[r.x, r.cx(), r.right()], threshold).unwrap_or(0.0) } else { 0.0 };
    let dy = if snap_y { snap_values(&t.ys, &[r.y, r.cy(), r.bottom()], threshold).unwrap_or(0.0) } else { 0.0 };
    let s = r.translate(dx, dy);
    let xs: &[f64] = if snap_x { &[s.x, s.cx(), s.right()] } else { &[] };
    let ys: &[f64] = if snap_y { &[s.y, s.cy(), s.bottom()] } else { &[] };
    let guides = guides_for(t, &s, xs, ys);
    (dx, dy, guides)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snaps_left_edge_to_neighbours_right_edge() {
        let t = Targets::from_rects([Rect::new(0.0, 0.0, 100.0, 50.0)]);
        // Moving box whose left edge is 3 units right of the target's right edge.
        let r = Rect::new(103.0, 200.0, 40.0, 40.0);
        let (dx, dy, guides) = snap_box(&t, &r, 5.0, true, true);
        assert_eq!(dx, -3.0);
        assert_eq!(dy, 0.0);
        let g = guides.iter().find(|g| g.vertical).unwrap();
        assert_eq!(g.at, 100.0);
        assert_eq!((g.lo, g.hi), (0.0, 240.0), "guide spans target and moving box");
    }

    #[test]
    fn centres_snap_too_and_nearest_wins() {
        let t = Targets::from_rects([Rect::new(0.0, 0.0, 100.0, 100.0)]);
        let r = Rect::new(200.0, 47.0, 10.0, 8.0); // centre y = 51, target centre 50
        let (_, dy, _) = snap_box(&t, &r, 4.0, true, true);
        assert_eq!(dy, -1.0);
    }

    #[test]
    fn nothing_within_threshold() {
        let t = Targets::from_rects([Rect::new(0.0, 0.0, 10.0, 10.0)]);
        let (dx, dy, g) = snap_box(&t, &Rect::new(500.0, 500.0, 10.0, 10.0), 4.0, true, true);
        assert_eq!((dx, dy), (0.0, 0.0));
        assert!(g.is_empty());
    }
}
