//! The texture store: atlas placement (etagere, one allocator per array layer),
//! resolution choice by on-screen size, and least-recently-used eviction under a
//! GPU memory budget. Pure bookkeeping: the renderer uploads what it says.

use etagere::{size2, AllocId, AllocatorOptions, AtlasAllocator};

/// Where one resolution of a texture lives in the atlas (texels, level 0).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    pub layer: u32,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

#[derive(Clone, Debug)]
pub struct Res {
    pub place: Placement,
    id: AllocId,
}

#[derive(Clone, Debug, Default)]
pub struct TexEntry {
    /// Resolutions held, sorted by width.
    pub res: Vec<Res>,
    pub last_used: u64,
    /// `textureNeeded` was emitted and nothing arrived since.
    pub requested: bool,
    /// When the last `set` happened (ms), for fading in.
    pub arrived: f64,
}

pub struct TextureStore {
    pub page: u32,
    pub levels: u32,
    pub max_layers: u32,
    layers: Vec<AtlasAllocator>,
    entries: Vec<Option<TexEntry>>,
    /// Advanced once per frame; entries used in the current frame are not evicted.
    pub frame: u64,
    /// Keys that lost their resolutions to eviction since the last drain.
    pub evicted: Vec<u32>,
}

/// Mip alignment: allocations start and end on multiples of this (level 4 stays texel-aligned).
pub const ALIGN: i32 = 16;

impl TextureStore {
    pub fn new(page: u32, levels: u32, budget_bytes: f64) -> Self {
        let mut s = TextureStore { page, levels, max_layers: 1, layers: Vec::new(), entries: Vec::new(), frame: 1, evicted: Vec::new() };
        s.set_budget(budget_bytes);
        s
    }

    /// GPU bytes of one atlas layer, mip chain included.
    pub fn layer_bytes(&self) -> f64 {
        let mut total = 0.0;
        for l in 0..self.levels {
            let s = (self.page >> l) as f64;
            total += s * s * 4.0;
        }
        total
    }

    pub fn set_budget(&mut self, bytes: f64) {
        self.max_layers = ((bytes / self.layer_bytes()).floor() as u32).max(1);
    }

    pub fn layer_count(&self) -> u32 {
        self.layers.len() as u32
    }

    pub fn entry(&self, key: u32) -> Option<&TexEntry> {
        self.entries.get(key as usize).and_then(|e| e.as_ref())
    }

    pub fn has_any(&self, key: u32) -> bool {
        self.entry(key).is_some_and(|e| !e.res.is_empty())
    }

    pub fn entry_count(&self) -> usize {
        self.entries.iter().filter(|e| e.as_ref().is_some_and(|e| !e.res.is_empty())).count()
    }

    /// Texels allocated (level 0), times 4 bytes and the mip chain's 4/3.
    pub fn used_bytes(&self) -> f64 {
        let mut texels = 0.0;
        for e in self.entries.iter().flatten() {
            for r in &e.res {
                texels += (r.place.w as f64) * (r.place.h as f64);
            }
        }
        texels * 4.0 * 4.0 / 3.0
    }

    fn slot(&mut self, key: u32) -> &mut Option<TexEntry> {
        let i = key as usize;
        if self.entries.len() <= i {
            self.entries.resize_with(i + 1, || None);
        }
        &mut self.entries[i]
    }

    fn free_entry(&mut self, key: u32) {
        if let Some(Some(e)) = self.entries.get_mut(key as usize) {
            for r in e.res.drain(..) {
                self.layers[r.place.layer as usize].deallocate(r.id);
            }
        }
    }

    pub fn remove(&mut self, key: u32) {
        self.free_entry(key);
        if let Some(slot) = self.entries.get_mut(key as usize) {
            *slot = None;
        }
    }

    /// Forget everything (context lost): no layers, no entries.
    pub fn reset(&mut self) {
        self.layers.clear();
        self.entries.clear();
        self.evicted.clear();
    }

    fn try_alloc(&mut self, w: u32, h: u32) -> Option<(u32, etagere::Allocation)> {
        for (i, l) in self.layers.iter_mut().enumerate() {
            if let Some(a) = l.allocate(size2(w as i32, h as i32)) {
                return Some((i as u32, a));
            }
        }
        None
    }

    fn new_layer(&self) -> AtlasAllocator {
        let opts = AllocatorOptions { alignment: size2(ALIGN, ALIGN), vertical_shelves: false, num_columns: 1 };
        AtlasAllocator::with_options(size2(self.page as i32, self.page as i32), &opts)
    }

    /// The least recently used key other than `keep` not used this frame.
    fn lru_victim(&self, keep: u32) -> Option<u32> {
        let mut best: Option<(u64, u32)> = None;
        for (k, e) in self.entries.iter().enumerate() {
            let Some(e) = e else { continue };
            if k as u32 == keep || e.res.is_empty() || e.last_used >= self.frame {
                continue;
            }
            if best.is_none_or(|(t, _)| e.last_used < t) {
                best = Some((e.last_used, k as u32));
            }
        }
        best.map(|(_, k)| k)
    }

    /// Store `key` with these resolutions (w, h), replacing what it had. Returns the
    /// placement of each resolution, or None for one that found no room even after
    /// evicting everything not used in this frame. Sizes over the page are refused.
    pub fn set(&mut self, key: u32, sizes: &[(u32, u32)], now: f64) -> Vec<Option<Placement>> {
        self.free_entry(key);
        let mut out = Vec::with_capacity(sizes.len());
        let mut res = Vec::new();
        for &(w, h) in sizes {
            if w == 0 || h == 0 || w > self.page || h > self.page {
                out.push(None);
                continue;
            }
            let mut got = self.try_alloc(w, h);
            while got.is_none() {
                if (self.layers.len() as u32) < self.max_layers {
                    let layer = self.new_layer();
                    self.layers.push(layer);
                } else if let Some(victim) = self.lru_victim(key) {
                    self.free_entry(victim);
                    if let Some(Some(e)) = self.entries.get_mut(victim as usize) {
                        e.requested = false;
                    }
                    self.evicted.push(victim);
                } else {
                    break;
                }
                got = self.try_alloc(w, h);
            }
            match got {
                Some((layer, a)) => {
                    let p = Placement { layer, x: a.rectangle.min.x as u32, y: a.rectangle.min.y as u32, w, h };
                    res.push(Res { place: p, id: a.id });
                    out.push(Some(p));
                }
                None => out.push(None),
            }
        }
        res.sort_by_key(|r| r.place.w);
        let frame = self.frame;
        let slot = self.slot(key);
        let e = slot.get_or_insert_with(TexEntry::default);
        e.res = res;
        e.requested = false;
        e.arrived = now;
        e.last_used = frame;
        out
    }

    /// The resolution to draw `key` at for `want_px` device pixels of width: the
    /// smallest at least that wide, else the largest. Marks it used this frame.
    pub fn choose(&mut self, key: u32, want_px: f64) -> Option<Placement> {
        let frame = self.frame;
        let e = self.entries.get_mut(key as usize)?.as_mut()?;
        if e.res.is_empty() {
            return None;
        }
        e.last_used = frame;
        let pick = e.res.iter().find(|r| r.place.w as f64 >= want_px).unwrap_or(e.res.last().unwrap());
        Some(pick.place)
    }

    /// Marks `key` requested; true if it was not already (so the caller emits it once).
    pub fn request(&mut self, key: u32) -> bool {
        let e = self.slot(key).get_or_insert_with(TexEntry::default);
        if e.requested || !e.res.is_empty() {
            return false;
        }
        e.requested = true;
        true
    }

    pub fn arrived(&self, key: u32) -> f64 {
        self.entry(key).map_or(f64::NEG_INFINITY, |e| e.arrived)
    }

    /// Clears every "requested" mark (after a context restore, everything is asked again).
    pub fn clear_requests(&mut self) {
        for e in self.entries.iter_mut().flatten() {
            e.requested = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placements_are_aligned_and_disjoint() {
        let mut s = TextureStore::new(512, 5, 1e9);
        let mut placed = Vec::new();
        for k in 0..20 {
            let p = s.set(k, &[(100 + k, 60 + k * 2)], 0.0)[0].unwrap();
            assert_eq!(p.x % ALIGN as u32, 0);
            assert_eq!(p.y % ALIGN as u32, 0);
            placed.push(p);
        }
        for (i, a) in placed.iter().enumerate() {
            for b in &placed[i + 1..] {
                let overlap = a.layer == b.layer && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
                assert!(!overlap, "{a:?} overlaps {b:?}");
            }
        }
    }

    #[test]
    fn grows_layers_up_to_budget_then_evicts_lru() {
        // Page 256: one layer holds four 128x128 tiles. Budget: two layers.
        let mut s = TextureStore::new(256, 1, 256.0 * 256.0 * 4.0 * 2.0);
        assert_eq!(s.max_layers, 2);
        for k in 0..8 {
            s.frame += 1;
            assert!(s.set(k, &[(128, 128)], 0.0)[0].is_some());
        }
        assert_eq!(s.layer_count(), 2);
        assert!(s.evicted.is_empty());
        // Use key 0 in a later frame: it is no longer the oldest.
        s.frame += 1;
        assert!(s.choose(0, 10.0).is_some());
        s.frame += 1;
        assert!(s.set(8, &[(128, 128)], 0.0)[0].is_some());
        assert_eq!(s.evicted, vec![1], "the least recently used key goes first");
        assert!(!s.has_any(1));
        assert!(s.has_any(0));
    }

    #[test]
    fn keys_in_use_this_frame_are_not_evicted() {
        let mut s = TextureStore::new(256, 1, 256.0 * 256.0 * 4.0);
        assert!(s.set(0, &[(256, 256)], 0.0)[0].is_some());
        // Same frame: key 0 counts as in use, so key 1 gets nothing.
        assert!(s.choose(0, 1.0).is_some());
        assert!(s.set(1, &[(256, 256)], 0.0)[0].is_none());
        assert!(s.has_any(0));
    }

    #[test]
    fn chooses_resolution_by_screen_width() {
        let mut s = TextureStore::new(2048, 5, 1e9);
        s.set(3, &[(800, 500), (200, 125), (400, 250)], 0.0);
        assert_eq!(s.choose(3, 150.0).unwrap().w, 200);
        assert_eq!(s.choose(3, 300.0).unwrap().w, 400);
        assert_eq!(s.choose(3, 5000.0).unwrap().w, 800);
    }

    #[test]
    fn request_once_until_it_arrives_or_is_evicted() {
        let mut s = TextureStore::new(256, 1, 1e9);
        assert!(s.request(5));
        assert!(!s.request(5));
        s.set(5, &[(16, 16)], 0.0);
        assert!(!s.request(5), "has a texture now");
        s.remove(5);
        assert!(s.request(5));
    }

    #[test]
    fn oversize_is_refused_and_replacing_frees_space() {
        let mut s = TextureStore::new(256, 1, 256.0 * 256.0 * 4.0);
        assert!(s.set(0, &[(300, 10)], 0.0)[0].is_none());
        assert!(s.set(0, &[(256, 256)], 0.0)[0].is_some());
        assert!(s.set(0, &[(256, 256)], 0.0)[0].is_some(), "replacing a key frees its old space first");
        assert!((s.used_bytes() - 256.0 * 256.0 * 4.0 * 4.0 / 3.0).abs() < 1.0);
    }
}
