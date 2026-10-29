// Builds dist/jetline.html: the simulation core as a classic script, the game as a module.
const fs = require('fs');
const path = require('path');
const CORE_FILES = [
  'sim/math.js', 'sim/tuning.js', 'sim/rigidbody.js', 'sim/collision-proto.js',
  'sim/vehicle.js', 'sim/aero.js', 'sim/arcade.js', 'sim/car.js',
  'track/geometry.js', 'track/world.js', 'track/race.js', 'levels.js',
];
module.exports = { CORE_FILES };
if (require.main === module) {
  const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
  const core = CORE_FILES.map(src).join('\n');
  let html = src('page.html');
  html = html.replace('/*@@CORE@@*/', () => core).replace('/*@@GAME@@*/', () => src('game.js'));
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist', 'jetline.html'), html);
  console.log('built', html.length, 'bytes');
}
