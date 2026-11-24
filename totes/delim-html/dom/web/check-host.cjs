// Checks the DOM host's regressions in `check-host.html`, in the browser `browser.cjs` starts.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { launch } = require('./browser.cjs');

(async () => {
  const files = {
    '/': [fs.readFileSync(path.join(__dirname, 'check-host.html')), 'text/html'],
    '/dom.mjs': [fs.readFileSync(path.join(__dirname, '../host/dom.mjs')), 'text/javascript'],
  };
  const server = http.createServer((req, res) => {
    const file = files[req.url];
    res.writeHead(file ? 200 : 404, { 'content-type': file?.[1] || 'text/plain' });
    res.end(file?.[0] || 'Not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await launch();
  try {
    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${server.address().port}/`);
    await p.waitForSelector('html[data-result]', { timeout: 15000 });
    const result = await p.getAttribute('html', 'data-result');
    const text = await p.textContent('#result');
    assert.equal(result, 'passed', text);
    console.log(text);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
