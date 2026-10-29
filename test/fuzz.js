require('./load.js');
const JC = globalThis.JC, M = JC.M;
const track = JC.buildTrack(JC.levels[+(process.env.LVL || 0)]);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let nan = 0, deep = 0, steps = 0, falls = 0;
for (let trial = 0; trial < 30; trial++) {
  const race = new JC.Race(track); const car = new JC.Car({ ...JC.defaultTuning });
  const g = trial % 2 && track.gates.length ? track.gates[trial % track.gates.length] : track.start;
  race.respawn = { gate: g, speed: rnd() * 60 }; race.respawnCar(car);
  let inp = {};
  for (let i = 0; i < 240 * 20; i++) {
    if (i % 60 === 0) inp = { steer: rnd() * 2 - 1, throttle: rnd() < 0.7 ? 1 : 0, brake: rnd() < 0.2 ? 1 : 0, jet: rnd() < 0.5, airbrake: rnd() < 0.3, pitch: rnd() * 2 - 1, roll: rnd() < 0.2 ? rnd() * 2 - 1 : 0 };
    car.step(1 / 240, inp, track); steps++;
    if (car.pos.some(isNaN) || car.q.some(isNaN)) { nan++; break; }
    const p = track.penetration(car.pos); if (p && p.d > 0.3) deep++;
    if (car.pos[1] < track.killY) { falls++; race.respawnCar(car); }
  }
}
console.log({ steps, nan, deepCenterPenetrations: deep, falls });
