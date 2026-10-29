// sideways landings: how much does the car bounce, does a drift start?
require('./load.js');
const JC = globalThis.JC, M = JC.M;
const flat = JC.buildTrack({ width: 400, pieces: [{ s: 800 }] });
function land(yawDeg, rollDeg, vy, steer, tun, v = 40) {
  const car = new JC.Car({ ...JC.defaultTuning, autoDrift: 1, ...tun });
  const yaw = yawDeg * Math.PI / 180, f = [Math.sin(-yaw), 0, Math.cos(-yaw)];
  let u = M.rotAxis([0, 1, 0], f, rollDeg * Math.PI / 180);
  car.reset([0, 3.5, 120], M.qFromBasis(M.mul(M.cross(f, u), -1), u, f), 0);
  car.vel = [0, vy, v];
  let touched = false, maxRebound = 0, groundY = null, maxRoll = 0, drift = false, airAfter = 0, maxW = 0;
  for (let i = 0; i < 240 * 2.5; i++) {
    car.step(1 / 240, { throttle: 1, steer }, flat);
    if (!touched && car.grounded > 0) { touched = true; groundY = 0.85; }
    if (touched) {
      maxRebound = Math.max(maxRebound, car.pos[1] - groundY);
      maxRoll = Math.max(maxRoll, Math.acos(Math.min(1, car.up[1])) * 57.3);
      if (car.grounded === 0) airAfter += 1 / 240;
      maxW = Math.max(maxW, M.len(car.w));
      if (car.drifting) drift = true;
    }
  }
  const slip = Math.abs(car.slip || 0) * 57.3;
  return `bounce ${maxRebound.toFixed(2)}m air ${airAfter.toFixed(2)}s tilt ${maxRoll.toFixed(0)}° spin ${maxW.toFixed(1)}rad/s ${drift ? 'DRIFT' : 'no drift'} endSlip ${slip.toFixed(0)}° ${car.up[1] < 0.5 ? 'FLIPPED' : ''}`;
}
const cases = [[20, 0, -8, 1], [35, 0, -8, 1], [50, 0, -8, 1], [35, 10, -8, 1], [35, -10, -8, 1], [35, 0, -14, 1], [35, 0, -8, 0], [35, 0, -8, -1]];
function table(name, tun) {
  console.log('== ' + name);
  for (const [y, r, vy, st] of cases) console.log(`  yaw ${y}° roll ${r}° vy ${vy} steer ${st}`.padEnd(40), land(-y, r, vy, st, tun));
}
table('current', {});
module.exports = { table };
