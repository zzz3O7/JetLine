// Jetline track - PROTOTYPE collision world: ray and point queries against the track's oriented boxes,
// with a uniform grid for broad phase. A stand-in for a physics engine's scene queries:
// in a Unity port this file is replaced by MeshColliders plus Physics.Raycast.
(function (JC) {
  'use strict';
  const M = JC.M;
  const CELL = 10; // m, broad-phase grid cell

  class TrackWorld {
    constructor(geo) {
      Object.assign(this, geo); // level, boxes, gates, line, start
      this.free = geo.level.mode === 'free';
      this.grid = new Map(); this.stamp = 0;
      let minY = Infinity;
      for (const b of this.boxes) {
        b.mark = 0;
        const e = [0, 1, 2].map(k => Math.abs(b.ax[0][k]) * b.h[0] + Math.abs(b.ax[1][k]) * b.h[1] + Math.abs(b.ax[2][k]) * b.h[2]);
        b.min = M.sub(b.c, e); b.max = M.add(b.c, e);
        minY = Math.min(minY, b.min[1]);
        this.forCells(b.min, b.max, (key) => {
          let arr = this.grid.get(key); if (!arr) this.grid.set(key, arr = []);
          arr.push(b);
        });
      }
      this.minY = minY; this.killY = minY - 40;
    }
    forCells(min, max, fn) {
      for (let x = Math.floor(min[0] / CELL); x <= Math.floor(max[0] / CELL); x++)
        for (let y = Math.floor(min[1] / CELL); y <= Math.floor(max[1] / CELL); y++)
          for (let z = Math.floor(min[2] / CELL); z <= Math.floor(max[2] / CELL); z++) fn(x + ',' + y + ',' + z);
    }
    // boxes whose grid cells overlap the AABB [min, max], each once
    candidates(min, max) {
      const s = ++this.stamp, out = [];
      this.forCells(min, max, (key) => {
        const arr = this.grid.get(key);
        if (arr) for (const b of arr) if (b.mark !== s) { b.mark = s; out.push(b); }
      });
      return out;
    }
    // nearest hit of the ray o + d * t, t in [0, maxT]: { t, n (face normal), box } or null.
    // Rays starting inside a box don't hit it.
    raycast(o, d, maxT) {
      const e = M.add(o, M.mul(d, maxT));
      const list = this.candidates([Math.min(o[0], e[0]), Math.min(o[1], e[1]), Math.min(o[2], e[2])],
        [Math.max(o[0], e[0]), Math.max(o[1], e[1]), Math.max(o[2], e[2])]);
      let best = null;
      for (const b of list) {
        const p = M.sub(o, b.c);
        let tmin = -Infinity, tmax = Infinity, ax = -1, sg = 0, miss = false;
        for (let i = 0; i < 3; i++) {
          const a = b.ax[i], ep = M.dot(a, p), f = M.dot(a, d), h = b.h[i];
          if (Math.abs(f) > 1e-9) {
            let t1 = (-h - ep) / f, t2 = (h - ep) / f, s = -1;
            if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
            if (t1 > tmin) { tmin = t1; ax = i; sg = s; }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax || tmax < 0) { miss = true; break; }
          } else if (Math.abs(ep) > h) { miss = true; break; }
        }
        if (miss || tmin < 0 || tmin > maxT) continue;
        if (!best || tmin < best.t) best = { t: tmin, n: M.mul(b.ax[ax], sg), box: b };
      }
      return best;
    }
    // How deep point p is inside the track, and which way to push it out: { d, n } or null.
    // Road slab ends only count as faces where nothing continues the road (capB / capF).
    // If `prev` (the point's position last step) is given, the point is pushed back out through the face
    // it came in through rather than the nearest one, so a car sliding into the side of a ramp isn't popped up onto it.
    penetration(p, prev) {
      const list = this.candidates(p, p);
      let best = null;
      for (const b of list) {
        const d = M.sub(p, b.c);
        const e = [M.dot(b.ax[0], d), M.dot(b.ax[1], d), M.dot(b.ax[2], d)];
        if (Math.abs(e[0]) >= b.h[0] || Math.abs(e[1]) >= b.h[1] || Math.abs(e[2]) >= b.h[2]) continue;
        const allowed = [true, true, false];
        if ((b.capF && e[2] > 0) || (b.capB && e[2] < 0)) allowed[2] = true;
        let entry = null;
        if (prev) {
          const dp = M.sub(prev, b.c);
          entry = [0, 1, 2].map(i => allowed[i] && Math.abs(M.dot(b.ax[i], dp)) >= b.h[i] - 1e-3);
          if (!entry[0] && !entry[1] && !entry[2]) entry = null; // was already inside: nearest face
        }
        let dep = Infinity, n = null;
        for (let i = 0; i < 3; i++) {
          if (!allowed[i] || (entry && !entry[i])) continue;
          const di = b.h[i] - Math.abs(e[i]);
          if (di < dep) { dep = di; n = M.mul(b.ax[i], Math.sign(e[i]) || 1); }
        }
        if (n && (!best || dep > best.d)) best = { d: dep, n };
      }
      return best;
    }
    spawnFor(g) { return JC.spawnPose(g); }
  }

  JC.TrackWorld = TrackWorld;
  JC.buildTrack = (level, opts) => new TrackWorld(JC.buildGeometry(level, opts));
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
