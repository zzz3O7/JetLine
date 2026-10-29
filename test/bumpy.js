// how rough is driving over curved pieces? compare coarse vs fine subdivision
require('./load.js');
const JC = globalThis.JC, M = JC.M;
for (const segDeg of [99, 1.0]) {
  // re-require levels so helper-built pieces use the same defs
  const lvl = { width: 14, pieces: [{ s: 20 }, { c: 5, pitch: 18 }, { s: 3 }, { c: 5, pitch: -18 }, { s: 30 }, { c: 5, pitch: -18 }, { s: 3 }, { c: 5, pitch: 18 }, { s: 30 }, { c: 40, turn: 60 }, { s: 30 }] };
  const t = JC.buildTrack(lvl, { maxBendDeg: segDeg });
  const car = new JC.Car({ ...JC.defaultTuning });
  const sp = t.spawnFor(t.start); car.reset(sp.pos, sp.q, 25);
  let jerk = 0, prevAy = null, maxAy = 0, prev = car.vel[1], airFrames = 0;
  const t0 = performance.now();
  for (let i = 0; i < 240 * 4; i++) {
    car.step(1 / 240, { throttle: 0.5, steer: 0 }, t);
    const ay = (car.vel[1] - prev) * 240; prev = car.vel[1];
    if (prevAy !== null) jerk += Math.abs(ay - prevAy);
    prevAy = ay; maxAy = Math.max(maxAy, Math.abs(ay));
    if (car.grounded < 4) airFrames++;
  }
  console.log(segDeg === 99 ? 'coarse (old)' : 'fine (new)  ', 'boxes', t.boxes.length, 'sum|jerk|', jerk.toFixed(0), 'max|ay|', maxAy.toFixed(0), 'frames w/ wheel off', airFrames, 'ms', (performance.now() - t0).toFixed(0));
}
