// Builds the game from src/:
//   dist/jetline.html   the page body as one file (three.js from a CDN), used for previews
//   dist/site/          a complete website for self-hosting: index.html plus a local copy of three.js
//                       (needs `npm install` first, which fetches three into node_modules)
// The simulation core goes in as a classic script, the game as a module.
// JETLINE_VERSION (e.g. "a1b2c3d, 2026-10-30") is stamped into the site's index.html if set.
const fs = require('fs');
const path = require('path');
const CORE_FILES = [
  'sim/math.js', 'sim/tuning.js', 'sim/rigidbody.js', 'sim/collision-proto.js',
  'sim/vehicle.js', 'sim/aero.js', 'sim/arcade.js', 'sim/car.js',
  'track/geometry.js', 'track/world.js', 'track/race.js', 'levels.js',
];
const THREE_VERSION = '0.160.0';
const THREE_CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`;
const THREE_LOCAL = `three-${THREE_VERSION}.module.min.js`; // versioned name: safe to cache for a long time
module.exports = { CORE_FILES };

function buildSite(html) {
  const threeSrc = path.join(__dirname, 'node_modules', 'three', 'build', 'three.module.min.js');
  if (!fs.existsSync(threeSrc)) return console.log('site: skipped (run npm install to fetch three.js)');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules', 'three', 'package.json'), 'utf8'));
  if (pkg.version !== THREE_VERSION) throw new Error(`node_modules has three ${pkg.version}, the game needs ${THREE_VERSION}`);
  if (!html.includes(THREE_CDN)) throw new Error('game.js no longer imports three from ' + THREE_CDN);
  const version = (process.env.JETLINE_VERSION || '').replace(/[<>"&]/g, '');
  const page = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    + (version ? `<meta name="jetline-version" content="${version}">\n` : '')
    + '</head>\n<body style="margin:0">\n'
    + html.replace(THREE_CDN, './' + THREE_LOCAL)
    + '\n</body>\n</html>\n';
  const out = path.join(__dirname, 'dist', 'site');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), page);
  fs.copyFileSync(threeSrc, path.join(out, THREE_LOCAL));
  console.log('site: dist/site/index.html', page.length, 'bytes +', THREE_LOCAL, version ? `(${version})` : '');
}

if (require.main === module) {
  const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
  const core = CORE_FILES.map(src).join('\n');
  let html = src('page.html');
  html = html.replace('/*@@CORE@@*/', () => core).replace('/*@@GAME@@*/', () => src('game.js'));
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist', 'jetline.html'), html);
  console.log('built dist/jetline.html', html.length, 'bytes');
  buildSite(html);
}
