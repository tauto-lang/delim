// Starts the browser the checks run in: `DELIM_BROWSER` is chromium (the default), firefox
// or webkit. For Chromium, `CHROMIUM_EXECUTABLE_PATH` names an installed executable to use.
const playwright = require('playwright');

const name = process.env.DELIM_BROWSER || 'chromium';

function launch() {
  const type = { chromium: playwright.chromium, firefox: playwright.firefox, webkit: playwright.webkit }[name];
  if (!type) throw new Error(`DELIM_BROWSER must be chromium, firefox or webkit, not ${name}`);
  const executablePath = name === 'chromium' ? process.env.CHROMIUM_EXECUTABLE_PATH : undefined;
  return type.launch(executablePath ? { executablePath } : {});
}

module.exports = { name, launch };
