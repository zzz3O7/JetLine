process.argv = process.argv.slice(0, 2);
const variants = [{ spinAssist: 1, loopAssist: 1 }, { spinAssist: 1, loopAssist: 0 }, { spinAssist: 0, loopAssist: 1 }, { spinAssist: 0, loopAssist: 0 }];
const origLog = console.log; console.log = () => {};
const { run } = require('./sim.js');
console.log = origLog;
for (const v of variants) {
  const r = run({ tuning: v });
  console.log(JSON.stringify(v), r.ok ? 'OK ' + r.time.toFixed(2) : 'FAILED', 'falls', r.falls, r.log.filter(l => l.startsWith('FELL')).slice(0, 2).join(' | '));
}
{
  const r = run({ level: 2 });
  console.log('Hairpin level', r.ok ? 'OK ' + r.time.toFixed(2) : 'FAILED', 'falls', r.falls);
}
