// The PC controls: handbrake, air control from the jet, and the steering limit as an input-side choice.
const JC = require('./load.js'), M = JC.M;
const flat = JC.buildTrack({ mode: 'free', pieces: [{ block: [0, -1, 0], size: [6000, 2, 6000] }, { at: [0, 0, 0], heading: 0 }, { spawn: 1 }] });
const open = JC.buildTrack({ width: 12, pieces: [{ s: 10 }] }); // nothing nearby: free flight
const fresh = (tun = {}) => new JC.Car({ ...JC.defaultTuning, ...tun });
const kph = (v) => (v * 3.6).toFixed(0);

// handbrake
function onFlat(v, script, secs, tun) {
  const car = fresh(tun); const sp = flat.spawnFor(flat.start); car.reset(sp.pos, sp.q, v);
  for (let i = 0; i < 60; i++) car.step(1 / 240, { throttle: 1 }, flat);
  let drift = null;
  for (let i = 0; i < 240 * secs; i++) { car.step(1 / 240, script(i / 240), flat); if (car.drifting && drift === null) drift = i / 240; }
  return { car, drift };
}
{
  const r = onFlat(30, () => ({ handbrake: 1 }), 1, {});
  console.log('handbrake held 1 s from', kph(30), 'km/h, straight:', kph(r.car.speed), 'km/h', r.drift === null ? 'no drift' : 'DRIFT');
  const b = onFlat(30, () => ({ brake: 1 }), 1, {});
  console.log('brake held 1 s from', kph(30), 'km/h, straight:    ', kph(b.car.speed), 'km/h');
  const t = onFlat(30, (s) => ({ throttle: 1, steer: 1, handbrake: s > 0.1 && s < 0.25 ? 1 : 0 }), 1.5, {});
  console.log('handbrake tap while steering:', t.drift === null ? 'no drift' : `drift at ${t.drift.toFixed(2)} s`, 'end', kph(t.car.speed), 'km/h');
  const d0 = onFlat(30, (s) => ({ throttle: 1, steer: 1, brake: s > 0.1 && s < 0.25 ? 1 : 0 }), 2.5, {});
  const d1 = onFlat(30, (s) => ({ throttle: 1, steer: 1, brake: s > 0.1 && s < 0.25 ? 1 : 0, handbrake: s > 1 ? 1 : 0 }), 2.5, {});
  console.log('drift 2.5 s:', kph(d0.car.speed), 'km/h; holding the handbrake from 1 s:', kph(d1.car.speed), 'km/h', d1.car.drifting ? '(still drifting)' : '(drift ended)');
}

// air control: pitch rate after 0.5 s of full pitch input, in free flight
function pitchRate(inp, tun) {
  const car = fresh(tun); car.reset([0, 200, 0], [0, 0, 0, 1], 40);
  for (let i = 0; i < 120; i++) car.step(1 / 240, { pitch: 1, ...inp }, open);
  return Math.abs(M.dot(car.w, M.cross(car.fwd, car.up)));
}
for (const [name, inp, tun] of [
  ['nothing', {}, {}],
  ['air brakes', { airbrake: true }, {}],
  ['jet', { jet: true }, {}],
  ['jet, empty tank', { jet: true }, { jetUnlimited: 0 }],
  ['jet, jetAirControl 0', { jet: true }, { jetAirControl: 0 }],
]) {
  let r;
  if (name === 'jet, empty tank') { const car = fresh(tun); car.reset([0, 200, 0], [0, 0, 0, 1], 40); car.fuel = 0; for (let i = 0; i < 120; i++) car.step(1 / 240, { pitch: 1, ...inp }, open); r = Math.abs(M.dot(car.w, M.cross(car.fwd, car.up))); }
  else r = pitchRate(inp, tun);
  console.log(`air control, ${name}:`.padEnd(36), `pitch rate ${r.toFixed(2)} rad/s`);
}

// steering limit only for keyboard-style input
for (const assist of [true, false]) {
  const r = onFlat(40, () => ({ throttle: 1, steer: 1, steerAssist: assist }), 2, {});
  console.log(`full steering at ${kph(40)} km/h, steerAssist ${assist}:`, r.drift === null ? 'grip' : 'drift', `slip ${Math.abs(r.car.slip * 57.3).toFixed(0)}°`);
}
