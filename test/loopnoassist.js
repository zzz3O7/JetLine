require('./load.js');
const JC = globalThis.JC, M = JC.M;
function tryLoop(levelIdx, piece, speed, steerer, label) {
  const track = JC.buildTrack(JC.levels[levelIdx]);
  const tun = { ...JC.defaultTuning, loopAssist: 0, spinAssist: 0 };
  const car = new JC.Car(tun);
  const pre = track.boxes.filter(b => b.piece === piece)[0];
  const g = { p: M.add(pre.c, M.mul(pre.ax[1], 1)), f: pre.ax[2], u: pre.ax[1], r: pre.ax[0] };
  const sp = track.spawnFor(g); car.reset(sp.pos, sp.q, speed);
  const loopBoxes = track.boxes.filter(b => b.kind === 'loop');
  let maxOff = 0, done = false, fell = false;
  for (let i = 0; i < 240 * 6; i++) {
    // nearest road box under/around the car
    let best = null, bd = 1e9;
    for (const b of track.boxes) { if (b.kind === 'block') continue; const d = M.len(M.sub(b.c, car.pos)); if (d < bd) { bd = d; best = b; } }
    const lat = M.dot(M.sub(car.pos, best.c), best.ax[0]);
    const inp = { throttle: 1, steer: steerer ? steerer(car, best, lat) : 0 };
    car.step(1 / 240, inp, track);
    if (best.kind === 'loop') maxOff = Math.max(maxOff, Math.abs(lat));
    if (car.pos[1] < track.killY) { fell = true; break; }
  }
  // finished = still on the road, upright, past the loop
  const up = car.up[1];
  console.log(label.padEnd(40), fell ? 'FELL OFF' : (up > 0.8 ? 'made it' : 'not upright'), ' max offset in loop', maxOff.toFixed(1), 'm (half width', (loopBoxes[0].h[0]).toFixed(0) + ')');
}
// a player-like steerer: aim back toward the road centerline using road-relative heading + offset
const steerer = (car, box, lat) => {
  const fwdRoad = box.ax[2], r = box.ax[0];
  const headErr = M.dot(car.fwd, r);      // + = nose pointing to the road's right
  return Math.max(-1, Math.min(1, -lat * 0.25 - headErr * 3));
};
for (const [lvl, piece, name] of [[0, 10, 'Sky Strip loop'], [1, null, 'Skate Park loop']]) {
  const t = JC.buildTrack(JC.levels[lvl]);
  const p = piece || t.boxes.find(b => b.kind === 'loop').piece - 1;
  for (const v of [30, 40]) {
    tryLoop(lvl, p, v, null, `${name} ${v} m/s, no steering`);
    tryLoop(lvl, p, v, steerer, `${name} ${v} m/s, steering to center`);
  }
}
