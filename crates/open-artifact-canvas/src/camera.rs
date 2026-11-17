//! The camera: which part of the world is on screen, at what zoom.
//!
//! Screen coordinates are CSS pixels relative to the canvas' top-left corner;
//! the device pixel ratio only matters to the renderer.
//! `screen = (world - origin) * zoom`.

use crate::geom::Rect;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Camera {
    /// World coordinate shown at the canvas' top-left corner.
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
    /// Viewport size in CSS pixels.
    pub vw: f64,
    pub vh: f64,
    pub dpr: f64,
    pub min_zoom: f64,
    pub max_zoom: f64,
}

impl Default for Camera {
    fn default() -> Self {
        Camera { x: 0.0, y: 0.0, zoom: 1.0, vw: 300.0, vh: 150.0, dpr: 1.0, min_zoom: 0.02, max_zoom: 64.0 }
    }
}

/// An in-flight `glideTo` animation.
#[derive(Clone, Copy, Debug)]
pub struct Glide {
    pub from: (f64, f64, f64),
    pub to: (f64, f64, f64),
    pub start: f64,
    pub duration: f64,
    /// Set on the first frame after it was requested (the request has no clock).
    pub started: bool,
}

impl Camera {
    pub fn screen_to_world(&self, sx: f64, sy: f64) -> (f64, f64) {
        (self.x + sx / self.zoom, self.y + sy / self.zoom)
    }
    pub fn world_to_screen(&self, wx: f64, wy: f64) -> (f64, f64) {
        ((wx - self.x) * self.zoom, (wy - self.y) * self.zoom)
    }
    /// The world rectangle on screen.
    pub fn viewport(&self) -> Rect {
        Rect::new(self.x, self.y, self.vw / self.zoom, self.vh / self.zoom)
    }
    pub fn clamp_zoom(&self, z: f64) -> f64 {
        z.clamp(self.min_zoom, self.max_zoom)
    }
    /// Zoom by `factor` keeping the world point under screen (sx, sy) fixed.
    pub fn zoom_at(&mut self, factor: f64, sx: f64, sy: f64) {
        let (wx, wy) = self.screen_to_world(sx, sy);
        let z = self.clamp_zoom(self.zoom * factor);
        self.zoom = z;
        self.x = wx - sx / z;
        self.y = wy - sy / z;
    }
    /// Pan by a screen-space delta (content moves opposite to the delta, as a scroll does).
    pub fn pan_by_screen(&mut self, dx: f64, dy: f64) {
        self.x += dx / self.zoom;
        self.y += dy / self.zoom;
    }
    /// The camera (x, y, zoom) that fits `r` in the viewport with `padding` CSS px on each side.
    pub fn fit(&self, r: &Rect, padding: f64, max_zoom: f64) -> (f64, f64, f64) {
        let aw = (self.vw - 2.0 * padding).max(1.0);
        let ah = (self.vh - 2.0 * padding).max(1.0);
        let mut z = if r.w > 0.0 && r.h > 0.0 { (aw / r.w).min(ah / r.h) } else { self.zoom };
        z = self.clamp_zoom(z.min(max_zoom));
        let x = r.cx() - self.vw * 0.5 / z;
        let y = r.cy() - self.vh * 0.5 / z;
        (x, y, z)
    }
    pub fn set(&mut self, x: f64, y: f64, zoom: f64) {
        self.zoom = self.clamp_zoom(zoom);
        self.x = x;
        self.y = y;
    }
    pub fn state(&self) -> (f64, f64, f64) {
        (self.x, self.y, self.zoom)
    }
}

impl Glide {
    /// The camera at time `now`; `None` once finished (the caller then sets `to`).
    pub fn at(&self, now: f64, vw: f64, vh: f64) -> Option<(f64, f64, f64)> {
        let t = if self.duration <= 0.0 { 1.0 } else { ((now - self.start) / self.duration).clamp(0.0, 1.0) };
        if t >= 1.0 {
            return None;
        }
        // Ease in-out (cubic), zoom interpolated in log space, the screen centre linearly.
        let e = if t < 0.5 { 4.0 * t * t * t } else { 1.0 - (-2.0 * t + 2.0).powi(3) / 2.0 };
        let (x0, y0, z0) = self.from;
        let (x1, y1, z1) = self.to;
        let z = (z0.ln() * (1.0 - e) + z1.ln() * e).exp();
        let (c0x, c0y) = (x0 + vw * 0.5 / z0, y0 + vh * 0.5 / z0);
        let (c1x, c1y) = (x1 + vw * 0.5 / z1, y1 + vh * 0.5 / z1);
        let cx = c0x + (c1x - c0x) * e;
        let cy = c0y + (c1y - c0y) * e;
        Some((cx - vw * 0.5 / z, cy - vh * 0.5 / z, z))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cam() -> Camera {
        Camera { vw: 800.0, vh: 600.0, ..Default::default() }
    }

    #[test]
    fn screen_world_roundtrip() {
        let mut c = cam();
        c.set(100.0, -50.0, 2.5);
        let (wx, wy) = c.screen_to_world(123.0, 456.0);
        let (sx, sy) = c.world_to_screen(wx, wy);
        assert!((sx - 123.0).abs() < 1e-9 && (sy - 456.0).abs() < 1e-9);
    }

    #[test]
    fn zoom_keeps_point_under_cursor() {
        let mut c = cam();
        let before = c.screen_to_world(200.0, 150.0);
        c.zoom_at(3.0, 200.0, 150.0);
        let after = c.screen_to_world(200.0, 150.0);
        assert!((before.0 - after.0).abs() < 1e-9 && (before.1 - after.1).abs() < 1e-9);
        assert_eq!(c.zoom, 3.0);
    }

    #[test]
    fn zoom_is_clamped() {
        let mut c = cam();
        c.max_zoom = 4.0;
        c.zoom_at(100.0, 0.0, 0.0);
        assert_eq!(c.zoom, 4.0);
        c.min_zoom = 0.5;
        c.zoom_at(0.0001, 0.0, 0.0);
        assert_eq!(c.zoom, 0.5);
    }

    #[test]
    fn fit_centres_rect() {
        let c = cam();
        let r = Rect::new(1000.0, 1000.0, 400.0, 300.0);
        let (x, y, z) = c.fit(&r, 0.0, 100.0);
        assert!((z - 2.0).abs() < 1e-9);
        assert!((x + 400.0 / z - r.cx()).abs() < 1e-9 && (y + 300.0 / z - r.cy()).abs() < 1e-9);
    }

    #[test]
    fn glide_ends_at_target_and_passes_through_middle() {
        let g = Glide { from: (0.0, 0.0, 1.0), to: (100.0, 0.0, 4.0), start: 0.0, duration: 100.0, started: true };
        assert!(g.at(100.0, 800.0, 600.0).is_none());
        let (_, _, z) = g.at(50.0, 800.0, 600.0).unwrap();
        assert!((z - 2.0).abs() < 1e-9, "log-space midpoint zoom, got {z}");
        let (_, _, z0) = g.at(0.0, 800.0, 600.0).unwrap();
        assert!((z0 - 1.0).abs() < 1e-9);
    }
}
