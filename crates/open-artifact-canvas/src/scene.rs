//! The scene mirror: items keyed by handle, patched from TypeScript, indexed in an
//! R-tree for culling and hit testing.

use crate::geom::{rotate, sd_box, to_local, Rect};
use crate::path::{self, PathGeom, PathStyle};
use crate::textures::Placement;
use rstar::{RTree, RTreeObject, AABB};

// Item flags (must match packages/canvas-engine/src/protocol.ts).
pub const F_VISIBLE: u32 = 1;
pub const F_HITTABLE: u32 = 2;
pub const F_SELECTABLE: u32 = 4;
pub const F_MOVABLE: u32 = 8;
pub const F_RESIZABLE: u32 = 16;
pub const F_SNAP: u32 = 32;
pub const F_LOCK_ASPECT: u32 = 64;
pub const F_HIT_STROKE_ONLY: u32 = 128;
pub const F_STROKE_SCREEN: u32 = 256;
/// No hover outline.
pub const F_NO_HOVER: u32 = 512;
/// Selected, but no selection outline or handles (the host draws them).
pub const F_NO_OUTLINE: u32 = 1024;
/// Resize handles at the corners only.
pub const F_HANDLES_CORNERS: u32 = 2048;
/// Resize handles on the left and right edges only (width).
pub const F_HANDLES_WIDTH: u32 = 4096;
/// Drawn with multiply blending (its own batch).
pub const F_MULTIPLY: u32 = 8192;

/// Most cut-out rects a path takes.
pub const MAX_CUTS: usize = 2;

// Patch records: REC f64s each.
pub const REC: usize = 32;
pub const OP_UPSERT: u32 = 1;
pub const OP_REMOVE: u32 = 2;
pub const OP_CLEAR: u32 = 3;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    Box,
    Hole,
    Path,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct BoxStyle {
    pub fill: u32,
    pub stroke: u32,
    pub stroke_w: f32,
    pub radius: f32,
    pub dash: (f32, f32),
    pub shadow: u32,
    pub shadow_blur: f32,
    pub shadow_dx: f32,
    pub shadow_dy: f32,
    pub texture: Option<u32>,
}

impl BoxStyle {
    pub fn has_shadow(&self) -> bool {
        self.shadow & 0xff != 0
    }
}

#[derive(Clone, Debug)]
pub struct PathData {
    pub cmds: Vec<f32>,
    pub style: PathStyle,
    /// View box size the commands are in; (0, 0) = the rect's own size (no scaling).
    pub view: (f64, f64),
    pub geom: PathGeom,
    /// Zoom level the geometry was flattened for (tolerance = 0.25 / level).
    pub tess_level: f64,
    /// Rects (x, y, w, h in item-local units) where the path is not drawn; w = 0 ends the list.
    pub cuts: [f32; 4 * MAX_CUTS],
}

impl PathData {
    pub fn scale_for(&self, w: f64, h: f64) -> (f32, f32) {
        let sx = if self.view.0 > 0.0 { w / self.view.0 } else { 1.0 };
        let sy = if self.view.1 > 0.0 { h / self.view.1 } else { 1.0 };
        (sx as f32, sy as f32)
    }
    pub fn rebuild(&mut self, w: f64, h: f64, level: f64) {
        self.tess_level = level;
        self.geom = path::build(&self.cmds, &self.style, self.scale_for(w, h), (w, h), (0.25 / level) as f32);
    }
}

#[derive(Clone, Debug)]
pub struct Item {
    pub handle: u32,
    pub kind: Kind,
    pub layer: f64,
    pub z: f64,
    pub seq: u64,
    pub rect: Rect,
    pub rot: f64,
    pub flags: u32,
    pub opacity: f32,
    pub style: BoxStyle,
    pub path: Option<Box<PathData>>,
    /// The bounds it is indexed under.
    pub aabb: Rect,
    // Render bookkeeping (set by the layout).
    pub rank: u32,
    pub inst: u32,
    pub inst_n: u32,
    pub tex: Option<Placement>,
    /// Its texture was replaced while drawn: the next placement does not fade in.
    pub tex_replaced: bool,
    pub fade_start: f64,
    pub slot: u32,
    pub vstart: u32,
    pub vcap: u32,
    pub istart: u32,
    pub icap: u32,
}

impl Item {
    pub fn visible(&self) -> bool {
        self.flags & F_VISIBLE != 0
    }
    pub fn has(&self, f: u32) -> bool {
        self.flags & f != 0
    }
    /// Axis-aligned world bounds of what it paints (stroke included, shadow not).
    pub fn bounds(&self) -> Rect {
        match (&self.kind, &self.path) {
            (Kind::Path, Some(p)) => {
                let (sx, sy) = self.preview_scale(p);
                let b = p.geom.bounds;
                let local = Rect::new(b.x * sx, b.y * sy, b.w * sx, b.h * sy).translate(self.rect.x, self.rect.y);
                let all = local.union(&self.rect);
                if self.rot == 0.0 {
                    return all;
                }
                let (cx, cy) = (self.rect.cx(), self.rect.cy());
                let pts = [(all.x, all.y), (all.right(), all.y), (all.right(), all.bottom()), (all.x, all.bottom())];
                let mut r: Option<Rect> = None;
                for (x, y) in pts {
                    let (rx, ry) = rotate(x - cx, y - cy, self.rot);
                    let p = Rect::new(cx + rx, cy + ry, 0.0, 0.0);
                    r = Some(r.map_or(p, |q| q.union(&p)));
                }
                r.unwrap()
            }
            _ => {
                let sw = if self.has(F_STROKE_SCREEN) || self.style.stroke & 0xff == 0 { 0.0 } else { self.style.stroke_w as f64 * 0.5 };
                self.rect.inflate(sw).rotated_bounds(self.rot)
            }
        }
    }
    /// Scale from the tessellated size to the current rect (only differs during a resize preview).
    pub fn preview_scale(&self, p: &PathData) -> (f64, f64) {
        let (w0, h0) = p.geom.size;
        let sx = if w0 > 0.0 && self.rect.w > 0.0 { self.rect.w / w0 } else { 1.0 };
        let sy = if h0 > 0.0 && self.rect.h > 0.0 { self.rect.h / h0 } else { 1.0 };
        (sx, sy)
    }

    /// Precise hit test at world point (wx, wy) with tolerance `tol` (world units).
    pub fn hit(&self, wx: f64, wy: f64, tol: f64) -> bool {
        let (lx, ly) = to_local(&self.rect, self.rot, wx, wy);
        match (&self.kind, &self.path) {
            (Kind::Path, Some(p)) => {
                let (sx, sy) = self.preview_scale(p);
                let qx = (lx + self.rect.w * 0.5) / sx;
                let qy = (ly + self.rect.h * 0.5) / sy;
                let st = &p.style;
                let fill = st.has_fill() && !self.has(F_HIT_STROKE_ONLY);
                p.geom.hit(qx, qy, fill, st.fill_rule == 1, st.has_stroke(), st.width as f64 * 0.5, tol)
            }
            _ => {
                let (hw, hh) = (self.rect.w * 0.5, self.rect.h * 0.5);
                let r = (self.style.radius as f64).min(hw).min(hh).max(0.0);
                let d = sd_box(lx, ly, hw - r, hh - r) - r;
                if self.has(F_HIT_STROKE_ONLY) {
                    d.abs() <= self.style.stroke_w as f64 * 0.5 + tol
                } else {
                    d <= tol
                }
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Entry {
    pub handle: u32,
    pub env: AABB<[f64; 2]>,
}

impl RTreeObject for Entry {
    type Envelope = AABB<[f64; 2]>;
    fn envelope(&self) -> Self::Envelope {
        self.env
    }
}

pub fn aabb(r: &Rect) -> AABB<[f64; 2]> {
    AABB::from_corners([r.x, r.y], [r.right(), r.bottom()])
}

#[derive(Default)]
pub struct Scene {
    pub items: Vec<Option<Item>>,
    pub tree: RTree<Entry>,
    /// Add/remove/reorder/kind change: the draw layout must be rebuilt.
    pub structure_dirty: bool,
    /// Items whose instance or path transform must be rewritten.
    pub dirty: Vec<u32>,
    /// Paths whose tessellated geometry changed (rewrite their arena range).
    pub geom_dirty: Vec<u32>,
    pub seq: u64,
    pub count: usize,
}

/// What an `apply` changed that the engine must react to.
#[derive(Default, Debug)]
pub struct Applied {
    pub removed: Vec<u32>,
    pub changed: usize,
}

fn color(v: f64) -> u32 {
    v as u32
}

impl Scene {
    pub fn get(&self, h: u32) -> Option<&Item> {
        self.items.get(h as usize).and_then(|i| i.as_ref())
    }
    pub fn get_mut(&mut self, h: u32) -> Option<&mut Item> {
        self.items.get_mut(h as usize).and_then(|i| i.as_mut())
    }
    pub fn iter(&self) -> impl Iterator<Item = &Item> {
        self.items.iter().flatten()
    }

    fn unindex(&mut self, h: u32, r: Rect) {
        self.tree.remove(&Entry { handle: h, env: aabb(&r) });
    }
    fn index(&mut self, h: u32, r: Rect) {
        self.tree.insert(Entry { handle: h, env: aabb(&r) });
    }

    /// Re-index one item after its rect changed (gestures call this on release).
    pub fn reindex(&mut self, h: u32) {
        let Some(item) = self.get(h) else { return };
        let (old, new) = (item.aabb, item.bounds());
        if old == new {
            return;
        }
        self.unindex(h, old);
        self.index(h, new);
        self.get_mut(h).unwrap().aabb = new;
    }

    pub fn rebuild_index(&mut self) {
        let entries: Vec<Entry> = self.iter().map(|i| Entry { handle: i.handle, env: aabb(&i.aabb) }).collect();
        self.tree = RTree::bulk_load(entries);
    }

    pub fn clear(&mut self) -> Vec<u32> {
        let removed: Vec<u32> = self.iter().map(|i| i.handle).collect();
        self.items.clear();
        self.tree = RTree::new();
        self.count = 0;
        self.structure_dirty = true;
        removed
    }

    pub fn remove(&mut self, h: u32) -> bool {
        let Some(slot) = self.items.get_mut(h as usize) else { return false };
        let Some(item) = slot.take() else { return false };
        self.unindex(h, item.aabb);
        self.count -= 1;
        self.structure_dirty = true;
        true
    }

    /// Applies a patch: `ops` is a sequence of REC-sized records, `paths` the path command data they point into.
    pub fn apply(&mut self, ops: &[f64], paths: &[f32], tess_level: f64) -> Applied {
        let mut out = Applied::default();
        let n = ops.len() / REC;
        let bulk = n > 64;
        let mut i = 0;
        while i + REC <= ops.len() {
            let r = &ops[i..i + REC];
            i += REC;
            match r[0] as u32 {
                OP_CLEAR => out.removed.extend(self.clear()),
                OP_REMOVE => {
                    if self.remove(r[1] as u32) {
                        out.removed.push(r[1] as u32);
                    }
                }
                OP_UPSERT => {
                    self.upsert(r, paths, tess_level, bulk);
                    out.changed += 1;
                }
                _ => {}
            }
        }
        if bulk {
            self.rebuild_index();
        }
        out
    }

    fn upsert(&mut self, r: &[f64], paths: &[f32], tess_level: f64, bulk: bool) {
        let h = r[1] as u32;
        let kind = match r[2] as u32 {
            1 => Kind::Hole,
            2 => Kind::Path,
            _ => Kind::Box,
        };
        let rect = Rect::new(r[5], r[6], r[7].max(0.0), r[8].max(0.0));
        let style = BoxStyle {
            fill: color(r[12]),
            stroke: color(r[13]),
            stroke_w: r[14] as f32,
            radius: r[15] as f32,
            dash: (r[16] as f32, r[17] as f32),
            shadow: color(r[18]),
            shadow_blur: r[19] as f32,
            shadow_dx: r[20] as f32,
            shadow_dy: r[21] as f32,
            texture: if r[22] >= 0.0 { Some(r[22] as u32) } else { None },
        };
        let path_in = if kind == Kind::Path {
            let off = r[23] as usize;
            let len = r[24] as usize;
            let cmds = paths.get(off..off + len).unwrap_or(&[]).to_vec();
            let pstyle = PathStyle {
                fill: color(r[12]),
                stroke: color(r[13]),
                width: r[14] as f32,
                cap: r[27] as u8,
                join: r[28] as u8,
                miter_limit: r[29] as f32,
                dash: (r[16] as f32, r[17] as f32),
                fill_rule: r[30] as u8,
            };
            // Cut-out rects follow the commands in the path stream.
            let mut cuts = [0.0; 4 * MAX_CUTS];
            let n = (r[31].max(0.0) as usize).min(MAX_CUTS) * 4;
            if let Some(c) = paths.get(off + len..off + len + n) {
                cuts[..n].copy_from_slice(c);
            }
            Some((cmds, pstyle, (r[25], r[26]), cuts))
        } else {
            None
        };
        let layer = r[3];
        let z = r[4];
        let rot = r[9];
        let flags = r[10] as u32;
        let opacity = r[11] as f32;

        let idx = h as usize;
        if self.items.len() <= idx {
            self.items.resize_with(idx + 1, || None);
        }
        let existing = self.items[idx].take();
        let mut item = match existing {
            Some(mut it) => {
                let structural = it.kind != kind
                    || it.layer != layer
                    || it.z != z
                    || (it.flags & (F_VISIBLE | F_MULTIPLY)) != (flags & (F_VISIBLE | F_MULTIPLY))
                    || it.style.has_shadow() != style.has_shadow();
                if structural {
                    self.structure_dirty = true;
                }
                let size_changed = it.rect.w != rect.w || it.rect.h != rect.h;
                if style.texture != it.style.texture {
                    it.tex_replaced |= it.tex.is_some();
                    it.tex = None;
                }
                it.kind = kind;
                it.layer = layer;
                it.z = z;
                it.rect = rect;
                it.rot = rot;
                it.flags = flags;
                it.opacity = opacity;
                it.style = style;
                match (path_in, &mut it.path) {
                    (Some((cmds, pstyle, view, cuts)), Some(p)) => {
                        p.cuts = cuts;
                        let retess = p.cmds != cmds || p.style != pstyle || p.view != view || (size_changed && view.0 > 0.0);
                        if retess {
                            p.cmds = cmds;
                            p.style = pstyle;
                            p.view = view;
                            p.rebuild(rect.w, rect.h, tess_level);
                            self.geom_dirty.push(h);
                        } else if size_changed {
                            p.geom.size = (rect.w, rect.h);
                        }
                    }
                    (Some((cmds, pstyle, view, cuts)), None) => {
                        let mut p = PathData { cmds, style: pstyle, view, geom: PathGeom::default(), tess_level, cuts };
                        p.rebuild(rect.w, rect.h, tess_level);
                        it.path = Some(Box::new(p));
                        self.structure_dirty = true;
                    }
                    (None, _) => it.path = None,
                }
                it
            }
            None => {
                self.count += 1;
                self.structure_dirty = true;
                self.seq += 1;
                let path = path_in.map(|(cmds, pstyle, view, cuts)| {
                    let mut p = PathData { cmds, style: pstyle, view, geom: PathGeom::default(), tess_level, cuts };
                    p.rebuild(rect.w, rect.h, tess_level);
                    Box::new(p)
                });
                Item {
                    handle: h,
                    kind,
                    layer,
                    z,
                    seq: self.seq,
                    rect,
                    rot,
                    flags,
                    opacity,
                    style,
                    path,
                    aabb: Rect::new(f64::NAN, f64::NAN, 0.0, 0.0),
                    rank: 0,
                    inst: u32::MAX,
                    inst_n: 0,
                    tex: None,
                    tex_replaced: false,
                    fade_start: f64::NEG_INFINITY,
                    slot: u32::MAX,
                    vstart: 0,
                    vcap: 0,
                    istart: 0,
                    icap: 0,
                }
            }
        };
        let new_bounds = item.bounds();
        let old = item.aabb;
        item.aabb = new_bounds;
        self.items[idx] = Some(item);
        if !bulk && old != new_bounds {
            if !old.x.is_nan() {
                self.unindex(h, old);
            }
            self.index(h, new_bounds);
        }
        self.dirty.push(h);
    }

    /// Handles whose bounds intersect `r`.
    pub fn query(&self, r: &Rect) -> Vec<u32> {
        self.tree.locate_in_envelope_intersecting(&aabb(r)).map(|e| e.handle).collect()
    }

    /// The topmost visible, hittable item at world (x, y), within `tol`.
    pub fn hit(&self, x: f64, y: f64, tol: f64) -> Option<u32> {
        let probe = Rect::new(x - tol, y - tol, 2.0 * tol, 2.0 * tol);
        let mut best: Option<(u32, f64, f64, u64)> = None;
        for e in self.tree.locate_in_envelope_intersecting(&aabb(&probe)) {
            let Some(it) = self.get(e.handle) else { continue };
            if !it.visible() || !it.has(F_HITTABLE) {
                continue;
            }
            let key = (it.layer, it.z, it.seq);
            if let Some((_, l, z, s)) = best
                && (key.0, key.1, key.2) <= (l, z, s) {
                continue;
            }
            if it.hit(x, y, tol) {
                best = Some((it.handle, key.0, key.1, key.2));
            }
        }
        best.map(|b| b.0)
    }

    /// Visible items in draw order: by layer, then z, then insertion.
    pub fn draw_order(&self) -> Vec<u32> {
        let mut v: Vec<&Item> = self.iter().filter(|i| i.visible()).collect();
        v.sort_by(|a, b| a.layer.total_cmp(&b.layer).then(a.z.total_cmp(&b.z)).then(a.seq.cmp(&b.seq)));
        v.into_iter().map(|i| i.handle).collect()
    }
}

/// Encodes one upsert record (tests and the headless API use it; TS has its own encoder).
#[cfg(test)]
pub fn record(h: u32, kind: u32, rect: Rect, flags: u32) -> Vec<f64> {
    let mut r = vec![0.0; REC];
    r[0] = OP_UPSERT as f64;
    r[1] = h as f64;
    r[2] = kind as f64;
    r[5] = rect.x;
    r[6] = rect.y;
    r[7] = rect.w;
    r[8] = rect.h;
    r[10] = flags as f64;
    r[11] = 1.0;
    r[12] = 0xffffffffu32 as f64;
    r[22] = -1.0;
    r[29] = 4.0;
    r
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{VERB_LINE, VERB_MOVE};

    pub const ALL: u32 = F_VISIBLE | F_HITTABLE | F_SELECTABLE | F_MOVABLE | F_RESIZABLE | F_SNAP;

    fn scene_with(items: &[(u32, Rect)]) -> Scene {
        let mut s = Scene::default();
        let mut ops = Vec::new();
        for (h, r) in items {
            ops.extend(record(*h, 0, *r, ALL));
        }
        s.apply(&ops, &[], 1.0);
        s
    }

    #[test]
    fn upsert_indexes_and_hit_respects_z_order() {
        let mut s = scene_with(&[(0, Rect::new(0.0, 0.0, 100.0, 100.0)), (1, Rect::new(50.0, 50.0, 100.0, 100.0))]);
        assert_eq!(s.count, 2);
        assert_eq!(s.hit(75.0, 75.0, 0.0), Some(1), "later item is on top");
        assert_eq!(s.hit(10.0, 10.0, 0.0), Some(0));
        assert_eq!(s.hit(500.0, 500.0, 0.0), None);
        // Raise item 0 with a higher z.
        let mut r = record(0, 0, Rect::new(0.0, 0.0, 100.0, 100.0), ALL);
        r[4] = 10.0;
        s.apply(&r, &[], 1.0);
        assert!(s.structure_dirty);
        assert_eq!(s.hit(75.0, 75.0, 0.0), Some(0));
        assert_eq!(s.draw_order(), vec![1, 0]);
    }

    #[test]
    fn move_updates_index_and_remove_drops_it() {
        let mut s = scene_with(&[(3, Rect::new(0.0, 0.0, 10.0, 10.0))]);
        s.apply(&record(3, 0, Rect::new(1000.0, 0.0, 10.0, 10.0), ALL), &[], 1.0);
        assert_eq!(s.query(&Rect::new(-5.0, -5.0, 20.0, 20.0)), Vec::<u32>::new());
        assert_eq!(s.query(&Rect::new(995.0, 0.0, 20.0, 20.0)), vec![3]);
        let mut rm = vec![0.0; REC];
        rm[0] = OP_REMOVE as f64;
        rm[1] = 3.0;
        let a = s.apply(&rm, &[], 1.0);
        assert_eq!(a.removed, vec![3]);
        assert!(s.query(&Rect::new(995.0, 0.0, 20.0, 20.0)).is_empty());
        assert_eq!(s.count, 0);
    }

    #[test]
    fn bulk_patch_builds_index() {
        let items: Vec<(u32, Rect)> = (0..500).map(|i| (i, Rect::new(i as f64 * 20.0, 0.0, 10.0, 10.0))).collect();
        let s = scene_with(&items);
        assert_eq!(s.tree.size(), 500);
        let mut q = s.query(&Rect::new(95.0, 0.0, 30.0, 5.0));
        q.sort();
        assert_eq!(q, vec![5, 6]);
        assert_eq!(s.hit(205.0, 5.0, 0.0), Some(10));
    }

    #[test]
    fn rotated_hit_test() {
        let mut s = Scene::default();
        let mut r = record(0, 0, Rect::new(0.0, 0.0, 100.0, 10.0), ALL);
        r[9] = std::f64::consts::FRAC_PI_2; // now a vertical bar centred at (50, 5)
        s.apply(&r, &[], 1.0);
        assert_eq!(s.hit(50.0, 40.0, 0.0), Some(0));
        assert_eq!(s.hit(90.0, 5.0, 0.0), None, "the unrotated extent no longer hits");
    }

    #[test]
    fn invisible_and_unhittable_items_are_skipped() {
        let mut s = Scene::default();
        s.apply(&record(0, 0, Rect::new(0.0, 0.0, 10.0, 10.0), F_VISIBLE), &[], 1.0);
        s.apply(&record(1, 0, Rect::new(20.0, 0.0, 10.0, 10.0), F_HITTABLE), &[], 1.0);
        assert_eq!(s.hit(5.0, 5.0, 0.0), None);
        assert_eq!(s.hit(25.0, 5.0, 0.0), None);
        assert!(s.draw_order() == vec![0]);
    }

    #[test]
    fn path_stroke_hit_and_retessellate_only_on_change() {
        let mut s = Scene::default();
        let cmds = [VERB_MOVE, 0.0, 0.0, VERB_LINE, 100.0, 100.0];
        let mut r = record(0, 2, Rect::new(10.0, 10.0, 100.0, 100.0), ALL);
        r[12] = 0.0; // no fill
        r[13] = 0x000000ffu32 as f64;
        r[14] = 4.0;
        r[23] = 0.0;
        r[24] = cmds.len() as f64;
        s.apply(&r, &cmds, 1.0);
        assert_eq!(s.hit(60.0, 61.0, 1.0), Some(0), "on the diagonal");
        assert_eq!(s.hit(100.0, 20.0, 1.0), None, "inside the bounds but off the stroke");
        s.geom_dirty.clear();
        // Same geometry, new position: no re-tessellation.
        r[5] = 20.0;
        s.apply(&r, &cmds, 1.0);
        assert!(s.geom_dirty.is_empty());
        // New stroke width: re-tessellated.
        r[14] = 8.0;
        s.apply(&r, &cmds, 1.0);
        assert_eq!(s.geom_dirty, vec![0]);
    }

    #[test]
    fn stroke_only_box_hit() {
        let mut s = Scene::default();
        let mut r = record(0, 0, Rect::new(0.0, 0.0, 100.0, 100.0), ALL | F_HIT_STROKE_ONLY);
        r[13] = 255.0;
        r[14] = 2.0;
        s.apply(&r, &[], 1.0);
        assert_eq!(s.hit(50.0, 50.0, 1.0), None);
        assert_eq!(s.hit(0.5, 50.0, 1.0), Some(0));
    }
}
