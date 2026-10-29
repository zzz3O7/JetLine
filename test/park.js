// scripted runs in the skate park: drive at features and see what happens
require('./load.js');
const JC = globalThis.JC, M = JC.M;
const track = JC.buildTrack(JC.levels[1]);
function drive(label, startPos, headingDeg, speed, inpFn, secs) {
  const car = new JC.Car({ ...JC.defaultTuning });
  const h = headingDeg * Math.PI / 180, f = [-Math.sin(h), 0, Math.cos(h)], u = [0, 1, 0];
  car.reset(startPos, M.qFromBasis(M.mul(M.cross(f, u), -1), u, f), speed);
  let maxY = -1e9, maxAir = 0, flipped = false;
  for (let i = 0; i < 240 * secs; i++) {
    car.step(1 / 240, inpFn(i / 240, car), track);
    maxY = Math.max(maxY, car.pos[1]); maxAir = Math.max(maxAir, car.airTime);
    if (car.up[1] < -0.5 && car.grounded === 0 && car.bodyContact) flipped = true;
  }
  console.log(label.padEnd(30), 'maxY', maxY.toFixed(1), 'maxAir', maxAir.toFixed(2), 'end', car.pos.map(x => x.toFixed(0)).join(','), 'v', car.speed.toFixed(0), 'up.y', car.up[1].toFixed(2), car.pos[1] < track.killY ? 'FELL OFF' : '', flipped ? 'ROOF' : '');
}
drive('funbox from south', [0, 1, -60], 0, 30, () => ({ throttle: 1 }), 4);
drive('big launch ramp', [-62, 1, -100], 0, 40, () => ({ throttle: 1, jet: true }), 5);
drive('gap jump at 28 m/s', [62, 1, -100], 0, 28, () => ({ throttle: 1 }), 4);
drive('gap jump at 20 m/s (short)', [62, 1, -100], 0, 20, () => ({ throttle: 0 }), 4);
drive('quarter pipe north 35', [30, 1, 40], 0, 35, () => ({ throttle: 1 }), 6);
drive('quarter pipe east 50 + jet', [40, 1, 30], 90, 50, () => ({ throttle: 1, jet: true }), 4);
drive('rollers', [-45, 1, -75], 270, 30, () => ({ throttle: 1 }), 3);
drive('loop', [-62, 1, 10], 0, 35, () => ({ throttle: 1, jet: true }), 4);
drive('step-up table', [60, 1, -10], 0, 25, () => ({ throttle: 1 }), 4);
drive('corner wall hit', [80, 1, 80], 135, 40, () => ({ throttle: 1 }), 3);
drive('QP west 40, 10s', [-30, 1, -40], 90, 40, (t) => ({ throttle: t < 1 ? 1 : 0 }), 10);
drive('QP north 35, 10s', [30, 1, 40], 0, 35, (t) => ({ throttle: t < 1 ? 1 : 0 }), 10);
drive('QP north diagonal', [0, 1, 40], 30, 40, (t) => ({ throttle: t < 1 ? 1 : 0 }), 10);
drive('into corner block', [70, 1, 70], -45, 40, () => ({ throttle: 1 }), 3);
