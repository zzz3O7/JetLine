require('./load.js');
const JC = globalThis.JC, M = JC.M;
for (const segDeg of [99, 3, 1.0, 0.5]) {
  const t = JC.buildTrack({ width: 14, pieces: [{ s: 20 }, { c: 12, pitch: 25 }, { c: 40, pitch: -25 }, { c: 20, pitch: 0 }, { c: 60, turn: 70, bank: 15 }, { s: 30 }] }, { maxBendDeg: segDeg });
  const car = new JC.Car({ ...JC.defaultTuning });
  const sp = t.spawnFor(t.start); car.reset(sp.pos, sp.q, 18);
  let hf = 0, prev = [0, 0, 0, 0];
  for (let i = 0; i < 240 * 5; i++) {
    car.step(1 / 240, { throttle: 0.3, steer: 0.15 }, t);
    // high-frequency suspension activity: 2nd difference of compression
    car.wheels.forEach((w, k) => { const c = w.comp; if (i > 240) hf += Math.abs(c - 2 * prev[k] + (w._pp || 0)); w._pp = prev[k]; prev[k] = c; });
  }
  console.log(('segDeg ' + segDeg).padEnd(12), 'boxes', String(t.boxes.length).padStart(4), 'suspension HF noise', hf.toFixed(3));
}
