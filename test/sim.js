// Headless test: drive the level with a simple autopilot and report what happens.
require('./load.js');
const JC = globalThis.JC, M = JC.M;

function run(opts = {}) {
  const tuning = { ...JC.defaultTuning, ...(opts.tuning || {}) };
  const track = JC.buildTrack(JC.levels[opts.level || 0]);
  const race = new JC.Race(track);
  const car = new JC.Car(tuning);
  race.respawnCar(car);
  race.started = true;
  const dt = 1 / 240;
  let idx = 0, log = [], falls = 0, maxSpeed = 0, airMax = 0, lastPiece = -1;
  const line = track.line;
  // target speed: the slowest of (corner speed from the road's curvature ahead, plus the distance left to
  // brake for it), loops, jumps and the cruise speed
  const latG = opts.latG || 2.0, decel = opts.decel || 7;
  const flatH = (v) => Math.atan2(v[0], v[2]);
  function targetSpeed(i) {
    let dist = 0, best = opts.cruise || 45;
    for (let k = i; k < line.length - 1 && dist < 160; k++) {
      const L = line[k], N = line[k + 1];
      const step = M.len(M.sub(N.p, L.p));
      if (N.gap) { best = Math.min(best, Math.sqrt((opts.jumpSpeed || 40) ** 2 + 2 * decel * dist)); break; }
      const box = track.boxes.find(b => b.piece === L.piece);
      if (box && box.kind === 'loop') { if (dist < 40) best = Math.min(best, 40); }
      else if (step > 0.1) {
        let dh = flatH(N.f) - flatH(L.f); dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const k1 = Math.abs(dh) / step;
        if (k1 > 1e-4) best = Math.min(best, Math.sqrt(Math.sqrt(latG * 9.81 / k1) ** 2 + 2 * decel * dist));
      }
      dist += step;
    }
    return best;
  }
  for (let step = 0; step < 240 * (opts.seconds || 90); step++) {
    // nearest line point near previous index
    let best = Infinity;
    for (let k = Math.max(0, idx - 5); k < Math.min(line.length, idx + 40); k++) {
      const d = M.len(M.sub(line[k].p, car.pos));
      if (d < best) { best = d; idx = k; }
    }
    const look = Math.min(line.length - 1, idx + Math.max(4, Math.round(car.speed * 0.35 / 2.2)));
    const tgt = line[look].p;
    const local = M.qInvRot(car.q, M.sub(tgt, car.pos));
    const ang = Math.atan2(-local[0], local[2]); // right is -X
    const ts = targetSpeed(idx);
    const v = car.speed;
    const L0 = line[idx], latErr = M.dot(M.sub(car.pos, L0.p), L0.r), headErr = M.dot(car.fwd, L0.r);
    const inp = { steer: car.inLoop ? Math.max(-1, Math.min(1, -latErr * 0.25 - headErr * 3)) : Math.max(-1, Math.min(1, ang * 3)), throttle: v < ts ? 1 : 0, brake: !car.inLoop && car.grounded >= 3 && v > ts + 3 && Math.abs(ang * 3) < 0.35 ? 1 : 0, jet: v < ts - 3, airbrake: false, pitch: 0 };
    if (car.grounded === 0 && car.airTime > 0.2 && !car.inLoop) {
      // keep the nose along the flight path
      const vd = M.norm(car.vel), rt = M.cross(car.fwd, car.up);
      inp.pitch = Math.max(-1, Math.min(1, M.dot(M.cross(car.fwd, vd), rt) * 4));
      inp.steer = 0;
    }
    car.step(dt, inp, track);
    maxSpeed = Math.max(maxSpeed, car.speed);
    if (opts.window && race.time > opts.window[0] && race.time < opts.window[1] && step % 12 === 0) log.push(`  ${race.time.toFixed(2)} pos ${car.pos.map(x=>x.toFixed(1))} v ${car.speed.toFixed(1)} gr ${car.grounded} loop ${car.inLoop} body ${car.bodyContact} steer ${inp.steer.toFixed(2)} pitch ${inp.pitch.toFixed(2)} idx ${idx}`);
    airMax = Math.max(airMax, car.airTime);
    const piece = line[idx].piece;
    if (opts.trace && piece !== lastPiece) { log.push(`t=${race.time.toFixed(2)} piece ${piece} v=${car.speed.toFixed(1)} y=${car.pos[1].toFixed(1)} gr=${car.grounded}`); lastPiece = piece; }
    for (const e of race.update(car, dt)) {
      if (e.type === 'fell') { falls++; log.push(`FELL at t=${race.time.toFixed(2)} near piece ${piece} (next gate ${race.next})`); race.respawnCar(car); idx = race.respawn.gate.line || 0; if (falls > 4) return { ok: false, log, falls }; }
      else if (e.type === 'cp') log.push(`CP${e.index} at ${e.time.toFixed(2)}s v=${car.speed.toFixed(1)}`);
      else if (e.type === 'finish') { log.push(`FINISH ${e.time.toFixed(2)}s`); return { ok: true, time: e.time, log, falls, maxSpeed, airMax }; }
    }
    if (step % (240 * 5) === 0 && opts.verbose) log.push(`  t=${(step / 240).toFixed(0)} pos=${car.pos.map(x => x.toFixed(1))} v=${car.speed.toFixed(1)} gr=${car.grounded} body=${car.bodyContact}`);
  }
  return { ok: false, log, falls, timeout: true, pos: car.pos };
}

// sanity: car at rest settles on the start
{
  const track = JC.buildTrack(JC.levels[0]);
  const race = new JC.Race(track); const car = new JC.Car({ ...JC.defaultTuning });
  race.respawnCar(car);
  for (let i = 0; i < 480; i++) car.step(1 / 240, {}, track);
  console.log('rest: y=', car.pos[1].toFixed(3), 'grounded', car.grounded, 'v', car.speed.toFixed(3), 'comp', car.wheels.map(w => w.comp.toFixed(3)).join(' '));
  // straight-line acceleration
  for (let i = 0; i < 240 * 3; i++) car.step(1 / 240, { throttle: 1, jet: true }, track);
  console.log('after 3s throttle+jet: v=', car.speed.toFixed(1), 'm/s, z=', car.pos[2].toFixed(1));
}
const args = process.argv.slice(2);
const res = run({ trace: args.includes('trace'), verbose: args.includes('v'), window: args.includes('w') ? [+args[args.indexOf('w')+1], +args[args.indexOf('w')+2]] : null });
console.log(res.log.join('\n'));
console.log(res.ok ? `OK time=${res.time.toFixed(2)} falls=${res.falls} maxSpeed=${res.maxSpeed.toFixed(1)} maxAir=${res.airMax.toFixed(2)}` : `FAILED ${JSON.stringify({ falls: res.falls, timeout: res.timeout, pos: res.pos })}`);
module.exports = { run };
