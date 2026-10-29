// Loads the simulation core for Node tests (same files, same order as the browser build).
const files = require('../build.js').CORE_FILES;
for (const f of files) require('../src/' + f);
module.exports = globalThis.JC;
