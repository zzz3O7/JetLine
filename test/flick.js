// Drift chains on flat ground with W held and keyboard steering: brake-tap a drift right, then flick the
// steering left / right every `period` seconds. Prints when each drift (R / L) starts; switching direction
// mid-chain should keep working with the steering limit on.
const JC = require('./load.js'), M = JC.M;
const w = JC.buildTrack({ mode: 'free', pieces: [{ block: [0, -1, 0], size: [6000, 2, 6000] }, { at: [0, 0, 0], heading: 0 }, { spawn: 1 }] });
const kb = (s, target, dt) => { const rate = target === 0 || Math.sign(target) !== Math.sign(s) ? 9 : 4.5; return s + Math.max(-rate * dt, Math.min(rate * dt, target - s)); };
function chain(tun, period, v, amt = 1) {
  const car = new JC.Car({ ...JC.defaultTuning, ...tun });
  const sp = w.spawnFor(w.start); car.reset(sp.pos, sp.q, v);
  for (let i = 0; i < 240; i++) car.step(1 / 240, { throttle: 1 }, w);
  let s = 0, seq = [], last = '.';
  for (let i = 0; i < 240 * (0.4 + period * 5); i++) {
    const t = i / 240, seg = t < 0.4 ? 0 : Math.floor((t - 0.4) / period);
    s = kb(s, t < 0.1 ? 0 : (seg % 2 === 0 ? 1 : -amt), 1 / 240);
    car.step(1 / 240, { steer: s, throttle: 1, brake: t > 0.25 && t < 0.4 ? 1 : 0 }, w);
    const st = car.drifting ? (car.driftDir > 0 ? 'R' : 'L') : '.';
    if (st !== last && st !== '.') seq.push(`${st}${t.toFixed(2)}`);
    last = st;
  }
  return seq.join(' ') + `  end ${(car.speed * 3.6).toFixed(0)} km/h`;
}
for (const amt of [1, 0.6]) for (const period of [1, 1.5]) for (const v of [25, 40, 50]) {
  const name = `flick ${amt === 1 ? 'full' : '60%'} every ${period}s from ${v * 3.6} km/h`;
  console.log(`${name}, limit on: `, chain({}, period, v, amt));
  console.log(`${name}, limit off:`, chain({ steerLimit: 0 }, period, v, amt));
}
