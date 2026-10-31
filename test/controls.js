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

// handbrake in a drift: the rear wheels lock and the angle hold lets go; a short hold swings the car wider and
// the drift catches it again, a long one spins it out
{
  const kb = (s, target, dt) => { const rate = target === 0 || Math.sign(target) !== Math.sign(s) ? 9 : 4.5; return s + Math.max(-rate * dt, Math.min(rate * dt, target - s)); };
  for (const hold of [0.3, 0.6, 1.0]) {
    const car = fresh(); const sp = flat.spawnFor(flat.start); car.reset(sp.pos, sp.q, 30);
    for (let i = 0; i < 60; i++) car.step(1 / 240, { throttle: 1 }, flat);
    let s = 0, maxA = 0;
    for (let i = 0; i < 240 * 4; i++) {
      const t = i / 240; s = kb(s, 1, 1 / 240);
      const hb = (t > 0.1 && t < 0.25) || (t > 1 && t < 1 + hold) ? 1 : 0;
      car.step(1 / 240, { throttle: 1, steer: s, steerAssist: true, handbrake: hb }, flat);
      const f = car.fwd; maxA = Math.max(maxA, Math.abs(57.3 * Math.atan2(M.dot(car.vel, M.cross(f, car.up)), M.dot(car.vel, f))));
    }
    console.log(`drift, handbrake held ${hold} s:`.padEnd(36), `max angle ${maxA.toFixed(0)}°, ${car.drifting ? 'still drifting' : 'spun out'}, end ${kph(car.speed)} km/h`);
  }
}

// analog (stick / tilt) in a drift: steering past driftOversteer works like the handbrake
{
  for (const dur of [0, 0.3, 0.6]) {
    const car = fresh(); const sp = flat.spawnFor(flat.start); car.reset(sp.pos, sp.q, 30);
    for (let i = 0; i < 60; i++) car.step(1 / 240, { throttle: 1 }, flat);
    let maxA = 0;
    for (let i = 0; i < 240 * 4; i++) {
      const t = i / 240, steer = t > 1 && t < 1 + dur ? 1 : 0.7;
      car.step(1 / 240, { throttle: 1, steer, steerAssist: false, brake: t > 0.1 && t < 0.25 ? 1 : 0 }, flat);
      if (t > 0.5) { const f = car.fwd; maxA = Math.max(maxA, Math.abs(57.3 * Math.atan2(M.dot(car.vel, M.cross(f, car.up)), M.dot(car.vel, f)))); }
    }
    console.log(`analog drift at 70%, full lock for ${dur} s:`.padEnd(40), `max angle ${maxA.toFixed(0)}°, ${car.drifting ? 'still drifting' : 'spun out'}`);
  }
}
// a flat spin in the air keeps going
{
  const car = fresh(); car.reset([0, 300, 0], [0, 0, 0, 1], 30); car.vel = [0, 4, 30]; car.w = [0, 2.5, 0];
  let yaw = 0, prevH = Math.atan2(car.fwd[0], car.fwd[2]);
  for (let i = 0; i < 480; i++) { car.step(1 / 240, { throttle: 1 }, open); const h = Math.atan2(car.fwd[0], car.fwd[2]); let d = h - prevH; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d; prevH = h; }
  console.log('flat spin in the air, 2.5 rad/s for 2 s:', `rotated ${(yaw * 57.3).toFixed(0)}°`);
}

// analog full lock from a straight line starts a drift (keeping it there doesn't spin out: the spin-out re-arms
// only after easing back below driftOversteer)
for (const v of [14, 25]) {
  const car = fresh(); const sp = flat.spawnFor(flat.start); car.reset(sp.pos, sp.q, v);
  for (let i = 0; i < 60; i++) car.step(1 / 240, { throttle: 1 }, flat);
  let drift = null;
  for (let i = 0; i < 240 * 3; i++) { const t = i / 240; car.step(1 / 240, { throttle: 1, steer: t < 0.3 ? 0 : 1, steerAssist: false }, flat); if (car.drifting && drift === null) drift = t; }
  console.log(`analog full lock from straight, ${kph(v)} km/h:`.padEnd(40), drift === null ? 'no drift' : `drift at ${drift.toFixed(2)} s, ${car.drifting ? 'still drifting' : 'ended'} after 3 s`);
}
