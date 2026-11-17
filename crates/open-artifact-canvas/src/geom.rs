//! Small 2D geometry helpers shared by the scene, camera and gestures.

/// An axis-aligned rectangle: `x, y` is the top-left corner (y grows down).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub const fn new(x: f64, y: f64, w: f64, h: f64) -> Self {
        Rect { x, y, w, h }
    }
    pub fn from_points(a: (f64, f64), b: (f64, f64)) -> Self {
        let (x0, x1) = if a.0 <= b.0 { (a.0, b.0) } else { (b.0, a.0) };
        let (y0, y1) = if a.1 <= b.1 { (a.1, b.1) } else { (b.1, a.1) };
        Rect::new(x0, y0, x1 - x0, y1 - y0)
    }
    pub fn right(&self) -> f64 {
        self.x + self.w
    }
    pub fn bottom(&self) -> f64 {
        self.y + self.h
    }
    pub fn cx(&self) -> f64 {
        self.x + self.w * 0.5
    }
    pub fn cy(&self) -> f64 {
        self.y + self.h * 0.5
    }
    pub fn translate(&self, dx: f64, dy: f64) -> Rect {
        Rect::new(self.x + dx, self.y + dy, self.w, self.h)
    }
    pub fn inflate(&self, d: f64) -> Rect {
        Rect::new(self.x - d, self.y - d, self.w + 2.0 * d, self.h + 2.0 * d)
    }
    pub fn intersects(&self, o: &Rect) -> bool {
        self.x <= o.right() && o.x <= self.right() && self.y <= o.bottom() && o.y <= self.bottom()
    }
    pub fn contains_rect(&self, o: &Rect) -> bool {
        o.x >= self.x && o.y >= self.y && o.right() <= self.right() && o.bottom() <= self.bottom()
    }
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.right() && y >= self.y && y <= self.bottom()
    }
    pub fn union(&self, o: &Rect) -> Rect {
        let x = self.x.min(o.x);
        let y = self.y.min(o.y);
        Rect::new(x, y, self.right().max(o.right()) - x, self.bottom().max(o.bottom()) - y)
    }
    /// The axis-aligned bounds of this rect rotated by `rot` radians about its centre.
    pub fn rotated_bounds(&self, rot: f64) -> Rect {
        if rot == 0.0 {
            return *self;
        }
        let (s, c) = rot.sin_cos();
        let hw = (self.w * 0.5 * c).abs() + (self.h * 0.5 * s).abs();
        let hh = (self.w * 0.5 * s).abs() + (self.h * 0.5 * c).abs();
        Rect::new(self.cx() - hw, self.cy() - hh, hw * 2.0, hh * 2.0)
    }
    /// The four corners (tl, tr, br, bl) after rotating by `rot` about the centre.
    pub fn corners(&self, rot: f64) -> [(f64, f64); 4] {
        let (cx, cy) = (self.cx(), self.cy());
        let (hw, hh) = (self.w * 0.5, self.h * 0.5);
        let local = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)];
        local.map(|(x, y)| {
            let (rx, ry) = rotate(x, y, rot);
            (cx + rx, cy + ry)
        })
    }
}

/// Rotate (x, y) by `rot` radians (positive = clockwise on screen, since y grows down).
pub fn rotate(x: f64, y: f64, rot: f64) -> (f64, f64) {
    if rot == 0.0 {
        return (x, y);
    }
    let (s, c) = rot.sin_cos();
    (x * c - y * s, x * s + y * c)
}

/// A world point expressed relative to `r`'s centre, in `r`'s unrotated frame.
pub fn to_local(r: &Rect, rot: f64, x: f64, y: f64) -> (f64, f64) {
    rotate(x - r.cx(), y - r.cy(), -rot)
}

/// Signed distance from local point (relative to centre) to a box of half-size (hw, hh); negative inside.
pub fn sd_box(px: f64, py: f64, hw: f64, hh: f64) -> f64 {
    let dx = px.abs() - hw;
    let dy = py.abs() - hh;
    let ox = dx.max(0.0);
    let oy = dy.max(0.0);
    (ox * ox + oy * oy).sqrt() + dx.max(dy).min(0.0)
}

/// Distance from p to segment ab.
pub fn dist_to_segment(px: f64, py: f64, ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    let (vx, vy) = (bx - ax, by - ay);
    let len2 = vx * vx + vy * vy;
    let t = if len2 > 0.0 { (((px - ax) * vx + (py - ay) * vy) / len2).clamp(0.0, 1.0) } else { 0.0 };
    let (qx, qy) = (ax + vx * t - px, ay + vy * t - py);
    (qx * qx + qy * qy).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotated_bounds_of_square_at_45_degrees() {
        let r = Rect::new(0.0, 0.0, 10.0, 10.0);
        let b = r.rotated_bounds(std::f64::consts::FRAC_PI_4);
        let d = 10.0 * std::f64::consts::SQRT_2;
        assert!((b.w - d).abs() < 1e-9 && (b.h - d).abs() < 1e-9);
        assert!((b.cx() - 5.0).abs() < 1e-9);
    }

    #[test]
    fn local_frame_roundtrip() {
        let r = Rect::new(10.0, 20.0, 40.0, 20.0);
        let rot = 0.7;
        let (lx, ly) = to_local(&r, rot, 33.0, 27.0);
        let (wx, wy) = rotate(lx, ly, rot);
        assert!((wx + r.cx() - 33.0).abs() < 1e-9 && (wy + r.cy() - 27.0).abs() < 1e-9);
    }

    #[test]
    fn sd_box_signs() {
        assert!(sd_box(0.0, 0.0, 5.0, 5.0) < 0.0);
        assert!((sd_box(7.0, 0.0, 5.0, 5.0) - 2.0).abs() < 1e-9);
    }
}
