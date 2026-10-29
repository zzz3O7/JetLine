// crooked landings on a sloped landing ramp: kicker, gap, 20-degree landing, long flat
require('./load.js');
const JC = globalThis.JC, M = JC.M;
const track = JC.buildTrack({ width: 30, pieces: [{ s: 40 }, { c: 6, pitch: 20 }, { s: 6 }, { gap: 30, dy: 0, land: -20 }, { s: 12 }, { c: 6, pitch: 20 }, { s: 200 }] });
function go(yawDeg, steer, tun) {
  const car = new JC.Car({ ...JC.defaultTuning, autoDrift: 1, ...tun });
  const sp = track.spawnFor(track.start); car.reset(sp.pos, sp.q, 26);
  let twisted = false, landed = false, drift = false, air2 = 0, flipped = false, maxBeta = 0;
  for (let i = 0; i < 240 * 5; i++) {
    if (!twisted && car.grounded === 0 && car.airTime > 0.5) {
      // turn the car about world up, keep velocity: a crooked landing
      const a = yawDeg * Math.PI / 180, hs = Math.sin(a / 2), rq = [0, hs, 0, Math.cos(a / 2)], b = car.q;
      car.q = M.qNorm([rq[3] * b[0] + rq[0] * b[3] + rq[1] * b[2] - rq[2] * b[1], rq[3] * b[1] - rq[0] * b[2] + rq[1] * b[3] + rq[2] * b[0], rq[3] * b[2] + rq[0] * b[1] - rq[1] * b[0] + rq[2] * b[3], rq[3] * b[3] - rq[0] * b[0] - rq[1] * b[1] - rq[2] * b[2]]);
      car.w = [0, 0, 0]; twisted = true;
    }
    car.step(1 / 240, { throttle: 1, steer: landed ? steer : 0 }, track);
    if (twisted && !landed && car.grounded >= 2) landed = true;
    if (landed) { if (car.drifting) drift = true; if (car.grounded === 0) air2 += 1 / 240; if (car.up[1] < 0.3) flipped = true; maxBeta = Math.max(maxBeta, Math.abs(car.slip || 0) * 57.3); }
  }
  return `${drift ? 'DRIFT   ' : 'no drift'} air after landing ${air2.toFixed(2)}s ${flipped ? 'FLIPPED' : ''} end v ${car.speed.toFixed(0)} end slip ${(Math.abs(car.slip) * 57.3).toFixed(0)}°`;
}
for (const [y, st, l] of [[0, 0, 'straight'], [25, 1, '25° steer into'], [25, 0, '25° no steer'], [-25, -1, '-25° steer into'], [45, 1, '45° steer into'], [45, -1, '45° countersteer']]) {
  console.log(l.padEnd(20), 'old susp:', go(-y, st, { reboundDamping: 1 }), ' | new:', go(-y, st, {}));
}
