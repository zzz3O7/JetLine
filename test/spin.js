// Measures how easily the car spins: body slip angle (deg) in a few scenarios.
require('./load.js');
const JC = globalThis.JC, M = JC.M;
const flat = JC.buildTrack({ width: 60, pieces: [{ s: 1500 }] });
const tun = () => ({ ...JC.defaultTuning, ...(global.TUNE || {}) });
function slip(car) { const v = car.vel, f = car.fwd; const vl = M.dot(v, f), vs = Math.abs(M.dot(v, M.cross(f, car.up))); return Math.atan2(vs, Math.max(0.1, Math.abs(vl))) * 180 / Math.PI; }
function scenario(name, setup, inputFn, secs) {
  const car = new JC.Car(tun()); setup(car);
  let maxB = 0, spun = false;
  for (let i = 0; i < 240 * secs; i++) { car.step(1 / 240, inputFn(i / 240, car), flat); if (car.grounded >= 2 && car.speed > 5) { const b = slip(car); maxB = Math.max(maxB, b); if (b > 60) spun = true; } }
  console.log(name.padEnd(36), 'max slip', maxB.toFixed(1).padStart(6), 'deg', spun ? 'SPUN' : '', 'v', car.speed.toFixed(1));
}
const at = (x, y, z, yawDeg, rollDeg, speed, velYawDeg = 0) => (car) => {
  const yaw = yawDeg * Math.PI / 180, roll = (rollDeg || 0) * Math.PI / 180;
  const f = [Math.sin(-yaw), 0, Math.cos(-yaw)];
  let u = M.rotAxis([0, 1, 0], f, roll);
  const r = M.cross(f, u);
  car.reset([x, y, z], M.qFromBasis(M.mul(r, -1), u, f), 0);
  const vy = velYawDeg * Math.PI / 180;
  car.vel = [Math.sin(-vy) * speed, 0, Math.cos(-vy) * speed];
};
scenario('full throttle + steer 30 m/s', at(0, 1.0, 20, 0, 0, 30), () => ({ throttle: 1, steer: 1 }), 3);
scenario('jet + steer 45 m/s', at(0, 1.0, 20, 0, 0, 45), () => ({ throttle: 1, jet: true, steer: 1 }), 3);
scenario('steer flick L/R 40 m/s', at(0, 1.0, 20, 0, 0, 40), (t) => ({ throttle: 1, steer: Math.sin(t * 6) }), 4);
scenario('landing, 12 deg yaw off, 40 m/s', (c) => { at(0, 4, 20, 12, 0, 40)(c); c.vel[1] = -9; }, () => ({ throttle: 1 }), 3);
scenario('landing, 12 deg yaw + 10 roll', (c) => { at(0, 4, 20, 12, 10, 40)(c); c.vel[1] = -9; }, () => ({ throttle: 1 }), 3);
scenario('landing hard, 20 deg yaw, 50 m/s', (c) => { at(0, 6, 20, 20, 0, 50)(c); c.vel[1] = -16; }, () => ({ throttle: 1, jet: true }), 3);
scenario('brake + steer 40 m/s', at(0, 1.0, 20, 0, 0, 40), () => ({ brake: 1, steer: 0.6 }), 3);
module.exports = {};
// bumpy road while cornering
{
  const pcs = [{ s: 30 }]; for (let i = 0; i < 40; i++) pcs.push({ c: 4, pitch: 5 }, { c: 4, pitch: -10 }, { c: 4, pitch: 5 }, { s: 6 });
  const bumpy = JC.buildTrack({ width: 80, pieces: pcs });
  for (const [steer, label] of [[0.0, 'straight'], [0.5, 'half steer'], [1, 'full steer']]) {
    const car = new JC.Car(tun()); const sp = bumpy.spawnFor(bumpy.start); car.reset(sp.pos, sp.q, 45);
    let maxB = 0, spun = false;
    for (let i = 0; i < 240 * 4; i++) {
      car.step(1 / 240, { throttle: 1, jet: car.speed < 45, steer: i > 120 ? steer : 0 }, bumpy);
      if (car.grounded >= 2) { const b = slip(car); maxB = Math.max(maxB, b); if (b > 60) spun = true; }
    }
    console.log(('bumps 45 m/s ' + label).padEnd(36), 'max slip', maxB.toFixed(1).padStart(6), 'deg', spun ? 'SPUN' : '', 'v', car.speed.toFixed(1), 'y', car.pos[1].toFixed(1));
  }
}
