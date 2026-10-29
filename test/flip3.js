require('./load.js');
const JC = globalThis.JC, M = JC.M;
const world = JC.buildTrack({ width: 12, pieces: [{ s: 10 }] });
function run(speed, tun, inp) {
  const car = new JC.Car({ ...JC.defaultTuning, ...tun });
  car.reset([0, 500, 0], [0, 0, 0, 1], speed); car.flaps = 1;
  let rot = 0;
  for (let i = 0; i < 480; i++) { car.step(1 / 240, inp, world); rot += M.dot(car.w, M.cross(car.fwd, car.up)) / 240; }
  return { rot: rot * 57.3, aoa: Math.asin(-M.dot(M.norm(car.vel), car.up)) * 57.3 };
}
const V = [15, 30, 45, 60];
for (const [n, t] of [
  ['old', {}],
  ['A wc0 arm.5 fin.1 h0', { wingCenter: 0, airbrakeArm: 0.5, finStability: 0.1, airbrakeHeight: 0 }],
  ['B wc-.1 arm.5 fin.1 h.1', { wingCenter: -0.1, airbrakeArm: 0.5, finStability: 0.1, airbrakeHeight: 0.1 }],
  ['C wc-.15 arm.5 fin.15 h0', { wingCenter: -0.15, airbrakeArm: 0.5, finStability: 0.15, airbrakeHeight: 0 }],
  ['D wc-.08 arm.4 fin.1 h0', { wingCenter: -0.08, airbrakeArm: 0.4, finStability: 0.1, airbrakeHeight: 0 }],
]) {
  const flips = V.map(v => run(v, t, { airbrake: true, pitch: 1 }).rot.toFixed(0).padStart(5)).join('');
  const front = V.map(v => run(v, t, { airbrake: true, pitch: -1 }).rot.toFixed(0).padStart(5)).join('');
  const hands = V.map(v => run(v, t, { airbrake: true }).aoa.toFixed(0).padStart(5)).join('');
  console.log(n.padEnd(26), 'backflip', flips, ' | frontflip', front, ' | hands-off AoA', hands);
}
