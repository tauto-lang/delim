// Runs the browser checks that start their own server, in each of Chromium, Firefox and
// WebKit. Give the browsers to run as arguments to run only those, as in
// `node check-all.cjs firefox webkit`. Build the DOM tote first (see the README).
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const checks = [
  path.join(__dirname, 'check.cjs'),
  path.join(__dirname, 'check-overlay.cjs'),
  path.join(__dirname, 'check-host.cjs'),
];
const browsers = process.argv.length > 2 ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit'];

const failed = [];
for (const browser of browsers) {
  for (const check of checks) {
    const label = `${browser} ${path.relative(path.join(__dirname, '../../..'), check)}`;
    console.log(`== ${label}`);
    const run = spawnSync(process.execPath, [check], {
      stdio: 'inherit', timeout: 120000, env: { ...process.env, DELIM_BROWSER: browser },
    });
    if (run.status !== 0) failed.push(label);
  }
}
if (failed.length > 0) {
  console.error(`failed:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
console.log(`all ${checks.length * browsers.length} checks passed`);
