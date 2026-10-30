// Sky Strip jumps: drive straight at each gap at a range of speeds (holding the speed, no air control) and
// report where the car first touches down: on the road past the gap (air time) or OFF (short into the gap, or overshot off the road).
const JC = require('./load.js'), M = JC.M;
const track = JC.buildTrack(JC.levels[0]);
const L = track.line;
const nearest = (p, from, to) => { let best = 1e9, idx = 0; for (let j = from; j < to; j++) { const d = M.len(M.sub(L[j].p, p)); if (d < best) { best = d; idx = j; } } return { idx, best }; };
for (const gi of L.map((l, i) => (l.gap ? i : -1)).filter(i => i >= 0)) {
  let k = gi - 1, d = 0; while (k > 0 && d < 60) { d += M.len(M.sub(L[k].p, L[k - 1].p)); k--; }
  const res = [];
  for (const v of [20, 25, 30, 35, 40, 45, 50, 55, 60]) {
    const car = new JC.Car({ ...JC.defaultTuning, jetUnlimited: 1 });
    const s = track.spawnFor({ p: L[k].p, f: L[k].f, u: L[k].u, r: L[k].r });
    car.reset(s.pos, s.q, v);
    let out = 'OFF', air = 0;
    for (let i = 0; i < 240 * 8; i++) {
      const { idx } = nearest(car.pos, Math.max(0, k - 5), Math.min(L.length, gi + 150));
      const L0 = L[idx], lat = M.dot(M.sub(car.pos, L0.p), L0.r), he = M.dot(car.fwd, L0.r);
      car.step(1 / 240, { throttle: car.speed < v ? 1 : 0, jet: car.speed < v - 2, steer: car.grounded ? Math.max(-1, Math.min(1, -lat * 0.15 - he * 2)) : 0 }, track);
      air = Math.max(air, car.airTime);
      if (air > 0.3 && car.grounded >= 2) {
        const n = nearest(car.pos, 0, L.length);
        out = n.idx > gi && n.best < 4 ? air.toFixed(1) + 's' : 'OFF';
        break;
      }
      if (car.pos[1] < track.killY) break;
    }
    res.push(`${v * 3.6}:${out}`);
  }
  console.log(`jump at piece ${L[gi].piece}:`, res.join(' '));
}
