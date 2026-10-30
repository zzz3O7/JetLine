// Jetline track - geometry: turns a level's piece list into oriented boxes, gates and a centerline.
// This is the part that ports: in Unity the same boxes feed a mesh generator (visual + MeshCollider).
//
// Pieces (a "turtle" walks forward and lays road behind it):
//   {s: len}                         straight
//   {c: len, turn, pitch, bank, w, ease}   curve: turn / pitch are deltas (deg), bank / w are targets.
//                                    ease (0..0.5, default level.ease or 0): share of the length at each end
//                                    over which the curvature ramps in / out (0 = constant curvature)
//   {corner: deg, r, bank, ease}     a turn of `deg` (right-positive) with radius `r` at its tightest; the
//                                    bank (deg, toward the inside) follows the curvature and returns to the
//                                    previous bank; ease defaults to 0.35. Length = |deg| * r / (1 - ease)
//   {gap: len, dy, land}             jump gap; land = landing pitch (deg)
//   {loop: radius, shift}            full loop, shifted sideways by `shift` so the exit passes the entry
//   {cp: 1} / {finish: 1}            checkpoint / finish gate at the current spot
//   {w: width}                       set the width instantly
//   {at: [x, y, z], heading, w}      start a new road chain elsewhere
//   {block: [cx, cy, cz], size: [w, h, l], heading}   solid box (floors, decks, funboxes)
//   {spawn: 1}                       spawn point at the current spot
(function (JC) {
  'use strict';
  const M = JC.M;
  const DEG = Math.PI / 180;
  const Y = [0, 1, 0];
  const SLAB = 2.0;            // road slab thickness, m
  const MAX_SEG_LEN = 2.2;     // m
  const OVERLAP = 1.02;        // neighbouring slabs overlap slightly so there are no cracks

  // Curvature profile of an eased piece over a in [0, 1]: ramps linearly 0 -> 1 over the first `e` of the
  // length, holds, and ramps back to 0 over the last `e` (a clothoid-like transition).
  const easeK = (a, e) => (e <= 0 ? 1 : Math.min(1, a / e, (1 - a) / e));
  // Share of the piece's total turn reached at a: the normalized integral of easeK.
  function easeP(a, e) {
    if (e <= 0) return a;
    const I = a < e ? a * a / (2 * e) : a > 1 - e ? (1 - e) - (1 - a) * (1 - a) / (2 * e) : e / 2 + (a - e);
    return I / (1 - e);
  }
  // Rise and run of an eased pitch curve of length `len` turning by `deg` from level (deg > 0 = upward),
  // for level helpers that need to know where a ramp ends.
  function curveRise(len, deg, ease = 0, steps = 400) {
    let x = 0, y = 0;
    for (let i = 0; i < steps; i++) { const th = deg * DEG * easeP((i + 0.5) / steps, ease); x += Math.cos(th) * len / steps; y += Math.sin(th) * len / steps; }
    return { run: x, rise: y };
  }

  // Road frame from heading (right-positive), pitch (nose-up positive), bank (right side down positive)
  function frame(h, p, b) {
    let f = [0, 0, 1], u = [0, 1, 0];
    u = M.rotAxis(u, f, b);
    const r0 = M.cross(f, u);
    f = M.rotAxis(f, r0, p); u = M.rotAxis(u, r0, p);
    f = M.rotAxis(f, Y, -h); u = M.rotAxis(u, Y, -h);
    return { f, u, r: M.cross(f, u) };
  }

  // Box: { c: center, ax: [right, up, forward] unit axes, h: half extents, kind: 'road'|'loop'|'block',
  //        capB / capF: whether the back / front end is an exposed face (no road continues there) }
  // opts.maxBendDeg: max bend per segment (default 1 degree), for tests.
  function buildGeometry(level, opts = {}) {
    const maxBend = (opts.maxBendDeg || 1.0) * DEG;
    let pos = [0, 0, 0], heading = 0, pitch = 0, bank = 0, width = level.width || 12;
    const boxes = [], gates = [], line = [];
    let capNext = true, pieceIdx = 0, distAcc = 0, start = null;

    const capLastRoad = () => { for (let i = boxes.length - 1; i >= 0; i--) if (boxes[i].kind !== 'block') { boxes[i].capF = true; break; } };

    // lay `len` meters of road while moving heading / pitch / bank / width to the targets along the eased
    // profile; bankPeak (corners) instead raises the bank with the curvature and brings it back
    function segs(len, h1, p1, b1, w1, shift, kind, ease = 0, bankPeak = 0) {
      // subdivide by length and by how much the piece bends (eased pieces bend harder in the middle)
      const bend = (Math.abs(h1 - heading) + Math.abs(p1 - pitch) + Math.abs(b1 - bank)) / (1 - ease) + 2 * Math.abs(bankPeak);
      const n = Math.max(1, Math.ceil(len / MAX_SEG_LEN), Math.ceil(bend / maxBend)), sl = len / n;
      const h0 = heading, p0 = pitch, b0 = bank, w0 = width;
      const flatR = frame(h0, 0, 0).r;
      // smooth sideways-shift distribution (zero at both ends, peak in the middle)
      const sw = []; let swSum = 0;
      for (let i = 0; i < n; i++) { const v = 1 - Math.cos(2 * Math.PI * (i + 0.5) / n); sw.push(v); swSum += v; }
      for (let i = 0; i < n; i++) {
        const a = easeP((i + 0.5) / n, ease);
        const h = h0 + (h1 - h0) * a, p = p0 + (p1 - p0) * a, wd = w0 + (w1 - w0) * a;
        const b = b0 + (b1 - b0) * a + bankPeak * easeK((i + 0.5) / n, ease);
        const fr = frame(h, p, b);
        // sideways shift (loops): skew the segment so its direction follows the shifted path
        const stepV = shift ? M.add(M.mul(fr.f, sl), M.mul(flatR, shift * sw[i] / swSum)) : M.mul(fr.f, sl);
        const L = M.len(stepV);
        if (shift) { fr.f = M.mul(stepV, 1 / L); fr.r = M.norm(M.cross(fr.f, fr.u)); fr.u = M.cross(fr.r, fr.f); }
        const c = M.add(M.add(pos, M.mul(fr.f, L / 2)), M.mul(fr.u, -SLAB / 2));
        boxes.push({ c, ax: [fr.r, fr.u, fr.f], h: [wd / 2, SLAB / 2, L / 2 * OVERLAP + 0.02], capB: capNext, capF: false, kind, piece: pieceIdx, stripe: Math.floor((distAcc += L) / 4.4) & 1 });
        capNext = false;
        pos = M.add(pos, stepV);
        line.push({ p: pos.slice(), f: fr.f, u: fr.u, r: fr.r, w: wd, piece: pieceIdx });
      }
      heading = h1; pitch = p1; bank = b1; width = w1;
    }
    function gate(finish) {
      const fr = frame(heading, pitch, bank);
      gates.push({ p: pos.slice(), f: fr.f, u: fr.u, r: fr.r, w: width, finish: !!finish, line: line.length });
    }

    for (const pc of level.pieces) {
      pieceIdx++;
      if (pc.at !== undefined) {
        capLastRoad();
        pos = pc.at.slice(); heading = (pc.heading || 0) * DEG; pitch = (pc.pitch || 0) * DEG; bank = 0;
        if (pc.w !== undefined) width = pc.w;
        capNext = true;
      } else if (pc.block !== undefined) {
        const fr = frame((pc.heading || 0) * DEG, 0, 0);
        boxes.push({ c: pc.block.slice(), ax: [fr.r, fr.u, fr.f], h: pc.size.map(x => x / 2), capB: true, capF: true, kind: 'block', piece: pieceIdx, stripe: 0 });
      } else if (pc.spawn) {
        const fr = frame(heading, pitch, bank);
        start = { p: pos.slice(), f: fr.f, u: fr.u, r: fr.r, w: width };
      } else if (pc.s !== undefined) {
        if (pc.s > 0.05) segs(pc.s, heading, pitch, bank, width, 0, 'road');
      } else if (pc.c !== undefined) {
        segs(pc.c, heading + (pc.turn || 0) * DEG, pitch + (pc.pitch || 0) * DEG,
          pc.bank !== undefined ? pc.bank * DEG : bank, pc.w !== undefined ? pc.w : width, 0, 'road',
          pc.ease !== undefined ? pc.ease : (level.ease || 0));
      } else if (pc.corner !== undefined) {
        const e = pc.ease !== undefined ? pc.ease : 0.35, dh = pc.corner * DEG;
        // bank toward the inside of the turn: right turns lower the right side (positive bank)
        segs(Math.abs(dh) * pc.r / (1 - e), heading + dh, pitch, bank, width, 0, 'road', e, Math.sign(dh) * (pc.bank || 0) * DEG);
      } else if (pc.loop !== undefined) {
        segs(2 * Math.PI * pc.loop, heading, pitch + 2 * Math.PI, bank, width, pc.shift || width + 2, 'loop');
        pitch -= 2 * Math.PI;
      } else if (pc.gap !== undefined) {
        capLastRoad();
        const flat = frame(heading, 0, 0).f;
        pos = M.add(M.add(pos, M.mul(flat, pc.gap)), [0, pc.dy || 0, 0]);
        pitch = (pc.land || 0) * DEG; bank = 0;
        capNext = true;
        const fr = frame(heading, pitch, 0);
        line.push({ p: pos.slice(), f: fr.f, u: fr.u, r: fr.r, w: width, piece: pieceIdx, gap: true });
      } else if (pc.w !== undefined) width = pc.w;
      else if (pc.cp) gate(false);
      else if (pc.finish) gate(true);
    }
    capLastRoad();
    if (!start) { const fr = frame(0, 0, 0); start = { p: [0, 0, 6], f: fr.f, u: fr.u, r: fr.r, w: 12 }; }
    return { level, boxes, gates, line, start };
  }

  // Car pose for spawning at a gate or the start: on the road, facing along it.
  function spawnPose(g) {
    const q = M.qFromBasis(M.mul(g.r, -1), g.u, g.f);
    return { pos: M.add(g.p, M.mul(g.u, 1.1)), q };
  }

  JC.trackFrame = frame;
  JC.curveRise = curveRise;
  JC.buildGeometry = buildGeometry;
  JC.spawnPose = spawnPose;
})(typeof globalThis !== 'undefined' ? (globalThis.JC = globalThis.JC || {}) : (window.JC = window.JC || {}));
