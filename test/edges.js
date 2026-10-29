// hit ramp edges in odd ways and look for violent reactions (spin rate, upward launch)
require('./load.js');
const JC = globalThis.JC, M = JC.M;
const track = JC.buildTrack(JC.levels[1]);
// funbox south ramp runs along +z toward z=-15 at x in [-7,7]; its side edges are at x = +-7
function test(label, pos, yawDeg, vel, inp, secs = 2.5, tun = {}) {
  const car = new JC.Car({ ...JC.defaultTuning, autoDrift: 1, ...tun });
  const yaw = yawDeg * Math.PI / 180, f = [Math.sin(-yaw), 0, Math.cos(-yaw)], u = [0, 1, 0];
  car.reset(pos, M.qFromBasis(M.mul(M.cross(f, u), -1), u, f), 0); car.vel = vel.slice();
  let maxW = 0, maxVy = -1e9, maxJump = 0, prevV = car.vel.slice(), worst = '';
  for (let i = 0; i < 240 * secs; i++) {
    car.step(1 / 240, inp, track);
    const w = M.len(car.w); if (w > maxW) { maxW = w; }
    const dvy = car.vel[1] - prevV[1]; if (dvy > maxJump) { maxJump = dvy; worst = `t=${(i / 240).toFixed(2)} body=${car.bodyContact} gr=${car.grounded}`; }
    maxVy = Math.max(maxVy, car.vel[1]); prevV = car.vel.slice();
  }
  console.log(label.padEnd(42), 'max spin', maxW.toFixed(1).padStart(5), 'rad/s | max up speed', maxVy.toFixed(1).padStart(5), '| biggest 1-step up kick', maxJump.toFixed(2), 'm/s', worst);
}
const tun = process.argv[2] ? JSON.parse(process.argv[2]) : {};
// drifting sideways into the side edge of a funbox ramp (car moving +x toward the ramp's -x side face)
for (const z of [-27, -22, -18]) test(`slide sideways into ramp side, z=${z}`, [-14, 0.9, z], 0, [12, 0, 6], { throttle: 1 }, 2.5, tun);
// driving diagonally onto the ramp's side edge
for (const ang of [30, 60]) test(`drive onto ramp side at ${ang}°`, [-20, 0.9, -32], -ang, [Math.sin(ang * Math.PI / 180) * 25, 0, Math.cos(ang * Math.PI / 180) * 25], { throttle: 1 }, 2.5, tun);
// falling onto the ramp edge from above (half the car over the edge)
for (const x of [-7.5, -6.5]) test(`fall onto ramp edge, x=${x}`, [x, 7, -22], 90, [0, -10, 15], { throttle: 1 }, 2.5, tun);
// falling onto the funbox top edge (block corner)
test('fall onto funbox block edge', [-15, 7, 0], 0, [0, -10, 20], { throttle: 1 }, 2.5, tun);
test('drift into funbox block side', [-32, 0.9, 11], -80, [25, 0, 3], { throttle: 1, steer: 1 }, 2.5, tun);
// landing onto the gap jump's landing ramp side edge
test('land on landing ramp side edge', [55.5, 8, -55], 0, [0, -6, 25], { throttle: 1 }, 2.5, tun);
