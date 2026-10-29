// Grip turns on flat ground with W held and full steering (keyboard), with and without the air brakes.
// Prints the turn radius, lateral g, speed change per second, and whether a drift started.
const JC = require('./load.js'), M = JC.M;
const w = JC.buildTrack({ mode: 'free', pieces: [{ block: [0, -1, 0], size: [4000, 2, 4000] }, { at: [0, 0, 0], heading: 0 }, { spawn: 1 }] });
function run(v, air) {
  const car = new JC.Car({ ...JC.defaultTuning });
  const sp = w.spawnFor(w.start); car.reset(sp.pos, sp.q, v);
  for (let i = 0; i < 240; i++) car.step(1 / 240, { throttle: 1 }, w);
  const v0 = car.speed;
  let steer = 0, g = 0, n = 0, drift = false;
  for (let i = 0; i < 240 * 2; i++) {
    steer = Math.min(1, steer + 4.5 / 240);           // keyboard steering ramp, as in game.js
    car.step(1 / 240, { steer, throttle: 1, airbrake: air }, w);
    if (car.drifting) drift = true;
    if (i > 120) { g += car.speed * Math.abs(M.dot(car.w, car.up)) / 9.81; n++; }
  }
  g /= n;
  const R = car.speed * car.speed / (g * 9.81);
  return `R ${R.toFixed(1)} m  ${g.toFixed(2)} g  ${((car.speed - v0) * 3.6 / 2).toFixed(1)} km/h/s  ${drift ? 'drift' : 'grip'}`;
}
for (const v of [25, 35, 45]) {
  console.log(`${v * 3.6} km/h          `, run(v, false));
  console.log(`${v * 3.6} km/h air brakes`, run(v, true));
}
