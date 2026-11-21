import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Rect } from '@open-artifact/design-core';
import { cameraFor, createFollower, directionOf, GLIDE_HOLD_MS, QUIET_MS, shownIn, viewOf, WORK_END_MS, type FollowCamera, type FollowHost } from '../src/lib/follow.ts';

/** A host with a fake clock; `go` jumps the camera. */
function fakeHost() {
  let now = 0;
  let timers: { at: number; run: () => void; id: number }[] = [];
  let nextId = 0;
  const boxes = new Map<string, Rect>();
  const host: FollowHost & { camera_: FollowCamera; gone: FollowCamera[]; halted: number } = {
    camera_: { x: 0, y: 0, zoom: 1 },
    gone: [],
    halted: 0,
    minZoom: 0.01,
    now: () => now,
    after(ms, run) {
      const id = nextId++;
      timers.push({ at: now + ms, run, id });
      return () => {
        timers = timers.filter((t) => t.id !== id);
      };
    },
    boxes: () => new Map(boxes),
    screen: () => ({ w: 1000, h: 800 }),
    camera: () => host.camera_,
    go(camera) {
      host.gone.push(camera);
      host.camera_ = camera;
    },
    halt() {
      host.halted++;
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = next.at;
      next.run();
    }
    now = end;
  };
  return { host, boxes, advance };
}

describe('follow geometry', () => {
  it('reads the view of a camera', () => {
    assert.deepEqual(viewOf({ x: -100, y: -50, zoom: 2 }, { w: 1000, h: 800 }), { x: 50, y: 25, w: 500, h: 400 });
  });

  it('counts a box as shown when it fits inside, or its centre is inside when bigger', () => {
    const view = { x: 0, y: 0, w: 100, h: 100 };
    assert.equal(shownIn({ x: 10, y: 10, w: 50, h: 50 }, view), true);
    assert.equal(shownIn({ x: 80, y: 10, w: 50, h: 50 }, view), false);
    assert.equal(shownIn({ x: -100, y: -100, w: 300, h: 300 }, view), true);
  });

  it('judges the side against the view shape', () => {
    const view = { x: 0, y: 0, w: 200, h: 100 };
    assert.equal(directionOf({ x: 300, y: 40, w: 10, h: 10 }, view), 'e');
    assert.equal(directionOf({ x: -300, y: 40, w: 10, h: 10 }, view), 'w');
    assert.equal(directionOf({ x: 95, y: 300, w: 10, h: 10 }, view), 's');
    assert.equal(directionOf({ x: 95, y: -300, w: 10, h: 10 }, view), 'n');
  });

  it('frames an area within the zoom range', () => {
    const camera = cameraFor({ x: 0, y: 0, w: 2000, h: 1600 }, { min: 0.5, max: 1 }, { w: 1000, h: 800 });
    assert.equal(camera.zoom, 0.5);
    assert.deepEqual(camera, { zoom: 0.5, x: 0, y: 0 });
  });
});

describe('createFollower', () => {
  it('glides to new work once the agent has been quiet, then counts nothing', () => {
    const { host, boxes, advance } = fakeHost();
    const follower = createFollower(host);
    follower.working(true);
    boxes.set('a.dc.html', { x: 3000, y: 0, w: 400, h: 300 });
    follower.remoteChanged();
    assert.equal(host.gone.length, 0, 'waits for quiet');
    assert.equal(follower.state().following, true);
    advance(QUIET_MS);
    assert.equal(host.gone.length, 1);
    const view = viewOf(host.camera_, host.screen());
    assert.ok(shownIn(boxes.get('a.dc.html')!, view));
    assert.equal(follower.state().unseen, 0);
  });

  it('never zooms in past the viewer zoom', () => {
    const { host, boxes, advance } = fakeHost();
    host.camera_ = { x: 0, y: 0, zoom: 0.5 };
    const follower = createFollower(host);
    follower.working(true);
    boxes.set('#n1', { x: 5000, y: 5000, w: 100, h: 50 });
    follower.remoteChanged();
    advance(QUIET_MS);
    assert.equal(host.gone[0]!.zoom, 0.5);
  });

  it('frames only the newest artboard when everything would not fit at half zoom', () => {
    const { host, boxes, advance } = fakeHost();
    const follower = createFollower(host);
    follower.working(true);
    boxes.set('a.dc.html', { x: 5000, y: 0, w: 1000, h: 800 });
    boxes.set('b.dc.html', { x: 20000, y: 0, w: 1000, h: 800 });
    follower.remoteChanged();
    advance(QUIET_MS);
    const view = viewOf(host.camera_, host.screen());
    assert.ok(shownIn(boxes.get('b.dc.html')!, view));
    assert.ok(!shownIn(boxes.get('a.dc.html')!, view));
    advance(GLIDE_HOLD_MS);
    assert.deepEqual({ unseen: follower.state().unseen, heading: follower.state().heading }, { unseen: 1, heading: 'w' });
  });

  it('stops when the viewer touches the canvas and counts what lands out of view', () => {
    const { host, boxes, advance } = fakeHost();
    const follower = createFollower(host);
    follower.working(true);
    follower.touched();
    boxes.set('a.dc.html', { x: 0, y: 3000, w: 400, h: 300 });
    follower.remoteChanged();
    advance(QUIET_MS * 2);
    assert.equal(host.gone.length, 0);
    assert.deepEqual(follower.state(), { following: false, unseen: 1, of: 'artboards', heading: 's' });

    follower.show();
    assert.equal(host.gone.length, 1, 'show goes at once');
    assert.equal(follower.state().unseen, 0);
  });

  it('counts notes when no artboard is new, and hides on dismiss', () => {
    const { host, boxes, advance } = fakeHost();
    const follower = createFollower(host);
    follower.working(true);
    follower.stop();
    boxes.set('#n1', { x: -4000, y: 0, w: 100, h: 50 });
    boxes.set('#n2', { x: -4200, y: 0, w: 100, h: 50 });
    follower.remoteChanged();
    advance(QUIET_MS);
    assert.deepEqual(follower.state(), { following: false, unseen: 2, of: 'notes', heading: 'w' });
    follower.dismiss();
    assert.equal(follower.state().unseen, 0);
  });

  it('ignores changes while the agent is idle and lets following end', () => {
    const { host, boxes, advance } = fakeHost();
    const follower = createFollower(host);
    boxes.set('a.dc.html', { x: 9000, y: 0, w: 400, h: 300 });
    follower.remoteChanged();
    advance(QUIET_MS);
    assert.equal(host.gone.length, 0);
    assert.equal(follower.state().unseen, 0);

    follower.working(true);
    boxes.set('b.dc.html', { x: 200, y: 200, w: 100, h: 100 });
    follower.remoteChanged();
    advance(QUIET_MS);
    follower.working(false);
    assert.equal(follower.state().following, true, 'lingers after the agent stops');
    advance(WORK_END_MS);
    assert.equal(follower.state().following, false);
  });

  it('starts over on a page change', () => {
    const { host, boxes, advance } = fakeHost();
    const follower = createFollower(host);
    follower.working(true);
    follower.stop();
    boxes.set('a.dc.html', { x: 9000, y: 0, w: 400, h: 300 });
    follower.remoteChanged();
    advance(QUIET_MS);
    assert.equal(follower.state().unseen, 1);
    boxes.clear();
    follower.paged();
    assert.equal(follower.state().unseen, 0);
  });

  it('brings the artboard the agent draws into view, unless the viewer took over', () => {
    const { host, boxes } = fakeHost();
    const follower = createFollower(host);
    boxes.set('a.dc.html', { x: 0, y: 0, w: 400, h: 300 });
    boxes.set('b.dc.html', { x: 9000, y: 0, w: 400, h: 300 });
    follower.focus('b.dc.html');
    assert.equal(host.gone.length, 0, 'not while the agent is idle');
    follower.working(true);
    follower.focus('a.dc.html');
    assert.equal(host.gone.length, 0, 'already in view');
    follower.focus('b.dc.html');
    assert.equal(host.gone.length, 1);
    assert.ok(shownIn(boxes.get('b.dc.html')!, viewOf(host.camera_, host.screen())));
    assert.equal(host.gone[0]!.zoom, 1, 'keeps the viewer zoom');
    host.camera_ = { x: 0, y: 0, zoom: 1 };
    follower.touched();
    follower.focus('b.dc.html');
    assert.equal(host.gone.length, 1, 'the viewer took over');
  });
});
