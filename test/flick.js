// Drift exits and switches on flat ground, W held, keyboard steering. A drift right is held for 2 s, then:
//   exits: let go, or countersteer and let go up to 0.35 s after the car is straight (reaction time);
//          the car should come out and stay out (small swing, no new drift)
//   switch: countersteer + tap S (at the same time or later) should swing straight into a drift the other way
// Also a chain of switches every 1.2 s.
const JC = require('./load.js'), M = JC.M;
const w = JC.buildTrack({ mode: 'free', pieces: [{ block: [0, -1, 0], size: [6000, 2, 6000] }, { at: [0, 0, 0], heading: 0 }, { spawn: 1 }] });
const kb = (s, target, dt) => { const rate = target === 0 || Math.sign(target) !== Math.sign(s) ? 9 : 4.5; return s + Math.max(-rate * dt, Math.min(rate * dt, target - s)); };
function exit(v, pattern, tun = {}) {
  const car = new JC.Car({ ...JC.defaultTuning, ...tun });
  const sp = w.spawnFor(w.start); car.reset(sp.pos, sp.q, v);
  for (let i = 0; i < 120; i++) car.step(1 / 240, { throttle: 1 }, w);
  let s = 0, ended = null, straight = null, swing = 0, again = null;
  for (let i = 0; i < 240 * 5; i++) {
    const t = i / 240;
    let inp = { steer: 1, brake: t > 0.1 && t < 0.25 ? 1 : 0 };
    if (t >= 2) { if (straight === null && car.slip > -0.03) straight = t - 2; inp = pattern(t - 2, straight); }
    s = kb(s, inp.steer, 1 / 240);
    car.step(1 / 240, { steer: s, throttle: 1, brake: inp.brake || 0 }, w);
    if (t >= 2) {
      if (ended === null && (!car.drifting || car.driftDir < 0)) ended = t - 2;
      if (ended !== null) swing = Math.max(swing, car.slip * 57.3);
      if (ended !== null && car.drifting && again === null) again = (car.driftDir < 0 ? 'L' : 'R') + (t - 2).toFixed(2);
    }
  }
  return `out ${ended === null ? 'never' : ended.toFixed(2) + 's'}  swing ${swing.toFixed(0)}°  ${again ? 'drift ' + again : 'stays out'}`;
}
const late = (d) => (t, st) => ({ steer: st !== null && t > st + d ? 0 : -1 });
const patterns = [
  ['let go', () => ({ steer: 0 })],
  ['countersteer, let go when straight', late(0)],
  ['countersteer, let go 0.2 s late', late(0.2)],
  ['countersteer, let go 0.35 s late', late(0.35)],
  ['countersteer + tap S together', (t) => ({ steer: -1, brake: t < 0.12 ? 1 : 0 })],
  ['countersteer, tap S 0.2 s later', (t) => ({ steer: -1, brake: t > 0.2 && t < 0.32 ? 1 : 0 })],
];
for (const v of [25, 40]) {
  console.log(`--- ${v * 3.6} km/h`);
  for (const [name, f] of patterns) console.log(`${name.padEnd(36)} ${exit(v, f)}`);
  console.log(`${'countersteer, let go 0.2 s late (catch and recovery off)'.padEnd(36)} ${exit(v, late(0.2), { driftCatch: 0, driftRecover: 0 })}`);
}
function chain(v) {
  const car = new JC.Car({ ...JC.defaultTuning });
  const sp = w.spawnFor(w.start); car.reset(sp.pos, sp.q, v);
  for (let i = 0; i < 120; i++) car.step(1 / 240, { throttle: 1 }, w);
  let s = 0, seq = [], last = '.';
  for (let i = 0; i < 240 * 6.4; i++) {
    const t = i / 240, seg = t < 0.4 ? -1 : Math.floor((t - 0.4) / 1.2), ts = t < 0.4 ? t : (t - 0.4) % 1.2;
    s = kb(s, t < 0.1 ? 0 : seg % 2 === 0 ? -1 : 1, 1 / 240);
    const brake = (t > 0.25 && t < 0.4) || (seg >= 0 && ts < 0.12) ? 1 : 0;
    car.step(1 / 240, { steer: s, throttle: 1, brake }, w);
    const st = car.drifting ? (car.driftDir > 0 ? 'R' : 'L') : '.';
    if (st !== last) seq.push(`${st}${t.toFixed(2)}`);
    last = st;
  }
  return seq.join(' ') + `  end ${(car.speed * 3.6).toFixed(0)} km/h`;
}
for (const v of [25, 40]) console.log(`switch chain every 1.2 s from ${v * 3.6} km/h:`, chain(v));
