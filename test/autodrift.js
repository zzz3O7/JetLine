require('./load.js');
const JC = globalThis.JC, M = JC.M;
const flat = JC.buildTrack({ width: 400, pieces: [{ s: 800 }] });
function sc(label, setup, inpFn, secs, tun) {
  const car = new JC.Car({ ...JC.defaultTuning, ...tun });
  const sp = flat.spawnFor(flat.start); car.reset(M.add(sp.pos, [0, 0, 100]), sp.q, 0); setup(car);
  let first = null, dur = 0;
  for (let i = 0; i < 240 * secs; i++) { car.step(1 / 240, inpFn(i / 240), flat); if (car.drifting) { dur += 1 / 240; if (first === null) first = i / 240; } }
  return first === null ? 'no drift' : `drift at ${first.toFixed(2)}s for ${dur.toFixed(1)}s`;
}
const set = (v, yawDeg = 0, vy = 0, y = 1) => (c) => {
  const yaw = yawDeg * Math.PI / 180, f = [Math.sin(-yaw), 0, Math.cos(-yaw)], u = [0, 1, 0];
  c.reset([0, y, 120], M.qFromBasis(M.mul(M.cross(f, u), -1), u, f), 0); c.vel = [0, vy, v];
};
const cases = [
  ['gentle steer 0.4 @40', set(40), () => ({ throttle: 1, steer: 0.4 })],
  ['full steer @25', set(25), () => ({ throttle: 1, steer: 1 })],
  ['full steer @40', set(40), () => ({ throttle: 1, steer: 1 })],
  ['full steer + jet @50', set(50), () => ({ throttle: 1, jet: true, steer: 1 })],
  ['flick L then R @40', set(40), (t) => ({ throttle: 1, steer: t < 0.4 ? -1 : 1 })],
  ['land 20° sideways, steer into it', set(40, -20, -8, 4), () => ({ throttle: 1, steer: 1 })],
  ['land 20° sideways, no steer', set(40, -20, -8, 4), () => ({ throttle: 1 })],
];
for (const ang of [0.14, 0.1]) {
  console.log(`--- autoDrift ON, angle ${ang}`);
  for (const [n, s, f] of cases) console.log('  ' + n.padEnd(36), sc(n, s, f, 3, { autoDrift: 1, autoDriftAngle: ang }));
}
console.log('--- autoDrift OFF (default)');
for (const [n, s, f] of cases) console.log('  ' + n.padEnd(36), sc(n, s, f, 3, {}));
