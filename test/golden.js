// Full-precision behavior fingerprint: scripted drives on both levels plus edge cases.
// A pure refactor must reproduce these numbers exactly.
const JC = require('./load.js'), M = JC.M;
const out = [];
const fp = (car) => [...car.pos, ...car.q, ...car.vel, ...car.w].map((x) => x.toPrecision(15)).join(' ') +
  ` g${car.grounded} d${car.drifting ? 1 : 0} f${car.fuel.toFixed(12)} fl${car.flaps.toFixed(12)}`;
function scenario(name, levelIdx, tun, setup, inputAt, secs) {
  const track = JC.buildTrack(JC.levels[levelIdx]);
  const race = new JC.Race(track);
  const car = new JC.Car({ ...JC.defaultTuning, ...tun });
  race.respawnCar(car); race.started = true;
  if (setup) setup(car, track);
  const evs = [];
  for (let i = 0; i < 240 * secs; i++) {
    car.step(1 / 240, inputAt(i / 240, car), track);
    for (const e of race.update(car, 1 / 240)) { evs.push(e.type + '@' + i); if (e.type === 'fell') race.respawnCar(car); }
    if (i % 240 === 239) out.push(`${name} t=${(i + 1) / 240} ${fp(car)}`);
  }
  out.push(`${name} events ${evs.join(',')}`);
}
const wave = (t, f, a = 1) => Math.max(-1, Math.min(1, a * Math.sin(t * f)));
scenario('strip-drive', 0, {}, null, (t) => ({ throttle: 1, jet: t % 3 < 1.5, steer: wave(t, 0.7, 0.4), brake: t % 5 > 4.7 ? 1 : 0, airbrake: t % 4 > 3.5, pitch: wave(t, 2), roll: wave(t, 1.3, 0.5) }), 25);
scenario('strip-limited-jet', 0, { jetUnlimited: 0, autoDrift: 1 }, null, (t) => ({ throttle: 1, jet: true, steer: wave(t, 1.1, 0.8), brake: t % 2 > 1.8 ? 1 : 0 }), 15);
scenario('park-drive', 1, { autoDrift: 1 }, null, (t) => ({ throttle: 1, jet: t % 6 < 2, steer: wave(t, 0.9), brake: t % 3 > 2.85 ? 1 : 0, airbrake: t % 5 > 4, pitch: wave(t, 3), roll: wave(t, 2, 0.6) }), 30);
scenario('park-assists', 1, { spinAssist: 1, loopAssist: 1, airControlBase: 0.3, airYaw: 2 }, null, (t) => ({ throttle: t % 4 < 3 ? 1 : 0, jet: t % 7 < 1, steer: wave(t, 1.7), brake: t % 4 > 3.5 ? 1 : 0, airbrake: t % 3 > 2, pitch: wave(t, 1.5) }), 30);
scenario('park-edge', 1, {}, (c) => { const a = 1.047, f = [Math.sin(a), 0, Math.cos(a)], u = [0, 1, 0]; c.reset([-20, 0.9, -32], M.qFromBasis(M.mul(M.cross(f, u), -1), u, f), 25); }, () => ({ throttle: 1 }), 4);
scenario('park-drop', 1, {}, (c) => { c.reset([0, 30, -60], [0, 0, 0, 1], 30); c.vel[1] = -20; }, (t) => ({ throttle: 1, steer: 1, airbrake: t < 1, pitch: 0.5 }), 5);
// fuzz fingerprint
{
  const track = JC.buildTrack(JC.levels[1]);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const car = new JC.Car({ ...JC.defaultTuning, autoDrift: 1 });
  const sp = track.spawnFor(track.start); car.reset(sp.pos, sp.q, 20);
  let inp = {};
  for (let i = 0; i < 240 * 40; i++) {
    if (i % 60 === 0) inp = { steer: rnd() * 2 - 1, throttle: rnd() < 0.7 ? 1 : 0, brake: rnd() < 0.2 ? 1 : 0, jet: rnd() < 0.5, airbrake: rnd() < 0.3, pitch: rnd() * 2 - 1, roll: rnd() < 0.2 ? rnd() * 2 - 1 : 0 };
    car.step(1 / 240, inp, track);
    if (car.pos[1] < track.killY) car.reset(sp.pos, sp.q, 20);
    if (i % 2400 === 2399) out.push(`fuzz ${i} ${fp(car)}`);
  }
}
// track geometry fingerprint
for (const lv of JC.levels) {
  const t = JC.buildTrack(lv);
  let h = 0; for (const b of t.boxes) for (const v of [...b.c, ...b.h, ...b.ax[0], ...b.ax[1]]) h = (h * 31 + Math.round(v * 1e6)) % 1000000007;
  out.push(`geom ${lv.name} boxes=${t.boxes.length} gates=${t.gates.length} line=${t.line.length} hash=${h} killY=${t.killY}`);
}
console.log(out.join('\n'));
