// Continuous drift model (driftModel 1): the behaviors it is tuned for, on flat ground, W held,
// keyboard-style steering (on/off keys through the steering ramp) unless noted.
//   grip turn: full A/D stays a grip turn (small slide angle)
//   handbrake tap while steering: starts a slide
//   steering duty (keys tapped on a 0.2 s cycle) after a handbrake entry: little = straightens,
//     about half = holds a drift, held = spins
//   analog full lock (stick / tilt, no steering limit): oversteers into a slide
//   handbrake held while steering: spins (more with the throttle)
// Then the Sky Strip and Hairpin bots and random input in this model.
const JC = require('./load.js'), M = JC.M;
const flat = JC.buildTrack({ mode: 'free', pieces: [{ block: [0, -1, 0], size: [8000, 2, 8000] }, { at: [0, 0, 0], heading: 0 }, { spawn: 1 }] });
const TUN = { ...JC.defaultTuning, driftModel: 1 };
const kb = (s, target, dt) => { const rate = target === 0 || Math.sign(target) !== Math.sign(s) ? 9 : 4.5; return s + Math.max(-rate * dt, Math.min(rate * dt, target - s)); };
const slipFull = (car) => { const f = car.fwd, r = M.cross(f, car.up); return 57.3 * Math.atan2(M.dot(car.vel, r), M.dot(car.vel, f)); };
function run(v, fn, secs) {
  const car = new JC.Car(TUN); const sp = flat.spawnFor(flat.start); car.reset(sp.pos, sp.q, v);
  for (let i = 0; i < 120; i++) car.step(1 / 240, { throttle: 1 }, flat);
  let s = 0, max = 0, last = [], yaw = 0, prevH = Math.atan2(car.fwd[0], car.fwd[2]);
  for (let i = 0; i < 240 * secs; i++) {
    const t = i / 240, inp = fn(t, car);
    if (inp.key !== undefined) { s = kb(s, inp.key, 1 / 240); inp.steer = s; inp.steerAssist = true; }
    car.step(1 / 240, { throttle: 1, ...inp }, flat);
    const a = Math.abs(slipFull(car)); max = Math.max(max, a); if (t > secs - 1) last.push(a);
    const h = Math.atan2(car.fwd[0], car.fwd[2]); let d = h - prevH; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d; prevH = h;
  }
  return { max, end: last.reduce((x, y) => x + y, 0) / last.length, kph: car.speed * 3.6, yaw: Math.abs(yaw) * 57.3 };
}
const fmt = (r) => `max slide ${r.max.toFixed(0).padStart(3)}°  last second ${r.end.toFixed(0).padStart(3)}°  rotated ${r.yaw.toFixed(0).padStart(4)}°  end ${r.kph.toFixed(0)} km/h`;
const hbTap = (t) => (t > 0.15 && t < 0.35 ? 1 : 0);
for (const v of [25, 35, 45]) console.log(`grip turn, full A/D, ${v * 3.6} km/h`.padEnd(44), fmt(run(v, () => ({ key: 1 }), 2.5)));
console.log('handbrake tap while steering, 108 km/h'.padEnd(44), fmt(run(30, (t) => ({ key: 1, handbrake: hbTap(t) }), 2)));
for (const d of [0.25, 0.55, 1]) console.log(`after the tap, A/D held ${d * 100}% of the time`.padEnd(44), fmt(run(30, (t) => ({ key: t < 0.6 ? 1 : ((t % 0.2) < 0.2 * d ? 1 : 0), handbrake: hbTap(t) }), 4)));
console.log('countersteer after 1.5 s, let go when straight'.padEnd(44), fmt(run(30, (t, car) => { if (t < 1.5) return { key: 1, handbrake: hbTap(t) }; car._out = car._out || Math.abs(slipFull(car)) < 5; return { key: car._out ? 0 : -1 }; }, 4)));
for (const v of [18, 25]) console.log(`analog full lock, ${v * 3.6} km/h`.padEnd(44), fmt(run(v, () => ({ steer: 1, steerAssist: false }), 2.5)));
console.log('analog 45%, 90 km/h'.padEnd(44), fmt(run(25, () => ({ steer: 0.45, steerAssist: false }), 2.5)));
for (const [thr, name] of [[0, 'no gas'], [1, 'W held']]) console.log(`handbrake held 1 s + A/D, ${name}, 108 km/h`.padEnd(44), fmt(run(30, (t) => ({ key: 1, handbrake: t > 0.1 && t < 1.1 ? 1 : 0, throttle: thr }), 4)));

// the bots and random input with this model
const origLog = console.log; console.log = () => {};
const { run: bot } = require('./sim.js');
console.log = origLog;
for (const [lvl, name] of [[0, 'Sky Strip'], [2, 'Hairpin']]) {
  const r = bot({ level: lvl, tuning: TUN });
  console.log(`${name} bot (grip driving)`, r.ok ? 'OK ' + r.time.toFixed(2) : 'FAILED', 'falls', r.falls);
}
{
  const track = JC.buildTrack(JC.levels[0]); const car = new JC.Car(TUN);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let nan = 0, inp = {};
  const sp = track.spawnFor(track.start); car.reset(sp.pos, sp.q, 20);
  for (let i = 0; i < 240 * 120; i++) {
    if (i % 60 === 0) inp = { throttle: rnd() < 0.7 ? 1 : 0, brake: rnd() < 0.15 ? 1 : 0, handbrake: rnd() < 0.15 ? 1 : 0, steer: rnd() * 2 - 1, steerAssist: rnd() < 0.5, jet: rnd() < 0.3, airbrake: rnd() < 0.2, pitch: rnd() * 2 - 1 };
    car.step(1 / 240, inp, track);
    if (!car.pos.every(Number.isFinite) || !car.vel.every(Number.isFinite)) { nan++; car.reset(sp.pos, sp.q, 20); }
    if (car.pos[1] < track.killY) car.reset(sp.pos, sp.q, 20);
  }
  console.log('random input 120 s, NaNs:', nan);
}
