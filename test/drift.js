require('./load.js');
const JC = globalThis.JC, M = JC.M;
const flat = JC.buildTrack({ width: 400, pieces: [{ s: 600 }] });
function run(label, inpFn, secs = 4, v0 = 40) {
  const car = new JC.Car({ ...JC.defaultTuning });
  const sp = flat.spawnFor(flat.start); car.reset(M.add(sp.pos, [0, 0, 100]), sp.q, v0);
  let maxB = 0, out = [], heading0 = 0;
  for (let i = 0; i < 240 * secs; i++) {
    const t = i / 240;
    car.step(1 / 240, inpFn(t, car), flat);
    const b = Math.abs(car.slip || 0) * 57.3; if (car.grounded >= 2) maxB = Math.max(maxB, b);
    if (i % 60 === 0) out.push(`${t.toFixed(2)}:${(car.slip * 57.3).toFixed(0)}°/${car.speed.toFixed(0)}${car.drifting ? 'D' : ''}`);
  }
  const hd = Math.atan2(car.vel[0], car.vel[2]) * 57.3;
  console.log(label.padEnd(30), 'maxSlip', maxB.toFixed(0), 'end v', car.speed.toFixed(1), 'travel turned', hd.toFixed(0) + '°', car.pos[1] < -5 ? 'FELL' : '');
  console.log('   ', out.join(' '));
}
const tap = (t) => (t > 0.3 && t < 0.45 ? 1 : 0);
run('steer only (grip turn)', (t) => ({ throttle: 1, steer: t > 0.2 ? 1 : 0 }));
run('steer + brake tap (drift)', (t) => ({ throttle: 1, steer: t > 0.2 ? 1 : 0, brake: tap(t) }));
run('drift + jet', (t) => ({ throttle: 1, jet: true, steer: t > 0.2 ? 1 : 0, brake: tap(t) }));
run('drift, half steer', (t) => ({ throttle: 1, steer: t > 0.2 ? (t < 0.5 ? 1 : 0.5) : 0, brake: tap(t) }));
run('drift then release steer @2s', (t) => ({ throttle: 1, steer: t > 0.2 && t < 2 ? 1 : 0, brake: tap(t) }));
run('drift then countersteer @2s', (t) => ({ throttle: 1, steer: t > 0.2 && t < 2 ? 1 : (t >= 2 ? -0.6 : 0), brake: tap(t) }));
run('drift, brake held', (t) => ({ throttle: 1, steer: t > 0.2 ? 1 : 0, brake: t > 0.3 ? 1 : 0 }));
run('left drift 55 m/s', (t) => ({ throttle: 1, steer: t > 0.2 ? -1 : 0, brake: tap(t) }), 4, 55);
