require('./load.js');
const JC = globalThis.JC, M = JC.M;
const world = JC.buildTrack({ width: 12, pieces: [{ s: 10 }] }); // nothing nearby
function fly(label, inpFn, secs = 6, tun = {}) {
  const car = new JC.Car({ ...JC.defaultTuning, ...tun });
  car.reset([0, 400, 0], [0, 0, 0, 1], 50);
  let minV = 1e9;
  for (let i = 0; i < 240 * secs; i++) {
    const vd = M.norm(car.vel), rt = M.cross(car.fwd, car.up);
    const aoa = Math.asin(Math.max(-1, Math.min(1, -M.dot(vd, car.up)))); // + when nose above flight path
    car.step(1 / 240, inpFn(car, aoa), world);
  }
  const aoa = Math.asin(-M.dot(M.norm(car.vel), car.up)) * 57.3;
  console.log(label.padEnd(40), 'dist', car.pos[2].toFixed(0).padStart(4), 'm  height change', (car.pos[1] - 400).toFixed(0).padStart(5), 'm  v', car.speed.toFixed(1), ' aoa', aoa.toFixed(1), 'lift', (car.lift || 0).toFixed(0));
}
const hold = (target) => (car, aoa) => ({ pitch: Math.max(-1, Math.min(1, (target - aoa) * 6)) });
fly('no input, no jet', () => ({}));
fly('jet only, hold 8deg AoA', (c, a) => ({ jet: true, ...hold(0.14)(c, a) }));
fly('airbrake, no input', () => ({ airbrake: true }));
fly('airbrake, hold 10deg AoA', (c, a) => ({ airbrake: true, ...hold(0.17)(c, a) }));
fly('jet + airbrake, hold 10deg AoA', (c, a) => ({ jet: true, airbrake: true, ...hold(0.17)(c, a) }));
fly('jet + airbrake, hold 15deg AoA', (c, a) => ({ jet: true, airbrake: true, ...hold(0.26)(c, a) }));
fly('jet + airbrake, no input', () => ({ jet: true, airbrake: true }));
