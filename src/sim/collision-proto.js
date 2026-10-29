// Jetline sim - PROTOTYPE body collision. A stand-in for a real physics engine's contact solver.
//
// The car body is sampled as a dozen points; each point that ends up inside a track box is pushed out
// and gets a contact impulse. Contacts are solved one by one (no iterations), which over-corrects, so
// three "plugs" below compensate. In a Unity port this file is deleted: a convex/box collider on the
// car plus a MeshCollider on the track, and PhysX solves contacts properly.
(function (JC) {
  'use strict';
  const M = JC.M;

  JC.protoCollision = {
    HULL: [],                // body sample points, car local space
    pushOutRate: 0.6,        // share of an overlap removed per step (gradual: no teleports out of deep overlaps)
    pushOutMax: 0.06,        // m per step
    restitution: 0.02,       // almost no bounce off the body
    friction: 0.35,
    // --- plugs (compensate for the one-pass solver) ---
    contactRotation: 0.7,    // PLUG: share of a contact impulse that becomes rotation (clipped corners spin less)
    maxLaunch: 0.5,          // PLUG: m/s the contacts of one step may ADD along their normal (stop, never launch)
    maxSpin: 14,             // PLUG: rad/s cap on angular speed (Unity: Rigidbody.maxAngularVelocity)
  };
  const P = JC.protoCollision;
  for (const sx of [-0.9, 0.9]) for (const sz of [-2.1, 2.1]) { P.HULL.push([sx, -0.35, sz]); P.HULL.push([sx * 0.8, 0.45, sz * 0.85]); }
  P.HULL.push([0, -0.35, 0], [0, 0.55, -0.2], [0.9, -0.35, 0], [-0.9, -0.35, 0]);

  // Resolve body-vs-track contacts for one step. Returns true if the body touched anything.
  JC.resolveBodyContacts = function (body, world) {
    const m = body.mass, CR = P.contactRotation, HULL = P.HULL;
    let touched = false;
    const prevHull = body.hullPrev;
    const vBefore = body.vel.slice(), nSum = [0, 0, 0];
    for (let hi = 0; hi < HULL.length; hi++) {
      const p = M.add(body.pos, M.qRot(body.q, HULL[hi]));
      // the previous position lets the world push the point out through the face it came in through
      const hit = world.penetration(p, prevHull ? prevHull[hi] : null);
      if (!hit) continue;
      touched = true;
      const n = hit.n;
      M.axpy(nSum, n, 1);
      M.axpy(body.pos, n, Math.min(hit.d * P.pushOutRate, P.pushOutMax));
      const r = M.sub(p, body.pos);
      const vp = M.add(body.vel, M.cross(body.w, r));
      const vn = M.dot(vp, n);
      if (vn >= 0) continue;
      const k = 1 / m + M.dot(n, M.cross(body.invIw(M.cross(r, n)), r)) * CR;
      const j = -(1 + P.restitution) * vn / k;
      body.applyImpulse(M.mul(n, j), r, CR);
      const vp2 = M.add(body.vel, M.cross(body.w, r));
      const vt = M.sub(vp2, M.mul(n, M.dot(vp2, n)));
      const vtl = M.len(vt);
      if (vtl > 1e-4) {
        const td = M.mul(vt, 1 / vtl);
        const kt = 1 / m + M.dot(td, M.cross(body.invIw(M.cross(r, td)), r)) * CR;
        const jt = Math.min(vtl / kt, P.friction * j);
        body.applyImpulse(M.mul(td, -jt), r, CR);
      }
    }
    if (touched) {
      const nC = M.norm(nSum), before = Math.max(0, M.dot(vBefore, nC)), now = M.dot(body.vel, nC);
      if (now > before + P.maxLaunch) M.axpy(body.vel, nC, before + P.maxLaunch - now);
    }
    body.hullPrev = HULL.map((pl) => M.add(body.pos, M.qRot(body.q, pl)));
    const wl = M.len(body.w);
    if (wl > P.maxSpin) { const k = P.maxSpin / wl; body.w[0] *= k; body.w[1] *= k; body.w[2] *= k; }
    return touched;
  };
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
