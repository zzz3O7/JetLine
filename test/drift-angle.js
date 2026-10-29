// Angle-control drift, driven with taps: start with a brake tap, then hold / widen / narrow / exit.
const JC = require('./load.js'), M = JC.M;
const flat = JC.buildTrack({ width: 600, pieces: [{ s: 900 }] });
function run(label, plan, secs = 5, v0 = 40, tun = {}) {
  const car = new JC.Car({ ...JC.defaultTuning, ...tun });
  const sp = flat.spawnFor(flat.start); car.reset(M.add(sp.pos, [0, 0, 150]), sp.q, v0);
  const out = []; let h0 = null, turned = 0, prevH = null;
  for (let i = 0; i < 240 * secs; i++) {
    const t = i / 240;
    car.step(1 / 240, { throttle: 1, ...plan(t) }, flat);
    const h = Math.atan2(car.vel[0], car.vel[2]);
    if (prevH !== null) { let d = h - prevH; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; turned += d; }
    prevH = h;
    if (i % 60 === 59) out.push(`${(t + 1 / 240).toFixed(2)}s ${(Math.abs(car.slip) * 57.3).toFixed(0)}°${car.drifting ? 'D' : ''}/${(car.speed * 3.6).toFixed(0)}`);
  }
  console.log(label);
  console.log('   ' + out.join('  ') + `   | travel turned ${(Math.abs(turned) * 57.3).toFixed(0)}°`);
}
const tapS = (t) => (t > 0.3 && t < 0.45 ? 1 : 0);
run('tap S with D, then let go of D: angle holds', (t) => ({ steer: t > 0.2 && t < 0.5 ? 1 : 0, brake: tapS(t) }));
run('...then tap D twice (0.15 s each): angle grows per tap', (t) => ({ steer: (t > 0.2 && t < 0.5) || (t > 1.5 && t < 1.65) || (t > 2.2 && t < 2.35) ? 1 : 0, brake: tapS(t) }));
run('...then hold A (countersteer) 0.5 s: back to straight, drift ends', (t) => ({ steer: t > 0.2 && t < 0.5 ? 1 : (t > 2 && t < 2.5 ? -1 : 0), brake: tapS(t) }));
run('hold D the whole time: angle keeps growing to the max', (t) => ({ steer: t > 0.2 ? 1 : 0, brake: tapS(t) }));
run('no drift: full steering, no brake (grip turn)', (t) => ({ steer: t > 0.2 ? 1 : 0 }));
run('drift held with jet', (t) => ({ steer: t > 0.2 && t < 0.5 ? 1 : 0, brake: tapS(t), jet: true }), 5, 40, { jetUnlimited: 1 });
// mode 1: steering sets the angle
run('mode 1: tap S with D held 2 s, then release', (t) => ({ steer: t > 0.2 && t < 2 ? 1 : 0, brake: tapS(t) }), 4, 40, { driftControl: 1 });
run('mode 1: half steering', (t) => ({ steer: t > 0.2 && t < 0.5 ? 1 : (t >= 0.5 && t < 3 ? 0.5 : 0), brake: tapS(t) }), 4, 40, { driftControl: 1 });
