const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, "..");
const srv = http.createServer((q, r) => {
  if (q.url === '/resource/name') {
    setTimeout(() => { r.writeHead(200); r.end('Ada'); }, 300); return;
  }
  let decoded;
  try { decoded = decodeURIComponent(q.url.split('?')[0]); } catch { r.writeHead(400); r.end(); return; }
  if (decoded.includes('\0')) { r.writeHead(400); r.end(); return; }
  const f = path.resolve(root, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded));
  if (f !== root && !f.startsWith(root + path.sep)) { r.writeHead(403); r.end(); return; }
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, {'content-type': f.endsWith('.html') ? 'text/html' : 'text/javascript'}); r.end(b); });
}).listen(8123, '127.0.0.1', async () => {
  const b = await launch(); const p = await b.newPage();
  p.on('console', m => console.log('console:', m.text())); const errors = []; p.on('pageerror', e => { console.log('err:', e.message); errors.push(e.message); });
  await p.goto('http://127.0.0.1:8123/web/index.html');
  await p.waitForSelector('body[data-ready]', {timeout: 10000}).catch(()=>{});
  console.log(await p.innerHTML('#app'));
  await p.click('button[aria-label=Increment]'); await p.click('button[aria-label=Increment]');
  assert.equal(await p.textContent('output'), '2', 'two increments');
  await p.click('button[aria-label=Reset]');
  assert.equal(await p.textContent('output'), '0', 'reset');
  await p.goto('http://127.0.0.1:8123/web/island.html');
  await p.waitForSelector('body[data-ready]', {timeout: 10000}).catch(()=>{});
  console.log(await p.innerHTML('#app'));
  assert.equal(await p.evaluate(() => window.before === document.querySelector('button')), true, 'the island kept its nodes');
  await p.click('button[aria-label=Increment]');
  assert.equal(await p.textContent('output'), '6', 'the island counts from its props');
  await p.goto('http://127.0.0.1:8123/web/loading.html');
  await p.waitForSelector('body[data-ready]', {timeout: 10000}).catch(()=>{});
  assert.match(await p.textContent('#app'), /Loading…/, 'the fallback shows while loading');
  await p.waitForSelector('p', {timeout: 5000}).catch(()=>{});
  assert.match(await p.textContent('#app'), /Hello, Ada/, 'the loaded value replaces the fallback');
  await p.goto('http://127.0.0.1:8123/web/disabled.html');
  await p.waitForSelector('body[data-ready]', {timeout:10000});
  const target = p.locator('#disabled-target');
  assert.equal(await target.isDisabled(),true);
  for(let cycle=0;cycle<3;cycle++) {
    await p.getByRole('button',{name:'Toggle disabled',exact:true}).click();
    assert.equal(await target.isDisabled(),false);
    assert.equal(await target.getAttribute('disabled'),null);
    await target.click();
    assert.equal(await p.textContent('output'),String(cycle+1));
    await p.getByRole('button',{name:'Toggle disabled',exact:true}).click();
    assert.equal(await target.isDisabled(),true);
  }
  assert.deepEqual(errors, [], 'no uncaught error on the pages');
  console.log('ok: counter, island, loading and disabled');
  await b.close(); srv.close();
});
