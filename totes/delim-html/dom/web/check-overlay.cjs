// Checks overlay.mjs in the browser `browser.cjs` starts: a delim warning and an uncaught error are shown as text on the page.
const http = require("http");
const fs = require("fs");
const { launch } = require("./browser.cjs");

const html = `<!doctype html><html><body><p>app</p><script type="module">
import { install } from "/overlay.mjs"; install();
dispatchEvent(new CustomEvent("delim:warning", { detail: { kind: "duplicate key", detail: "two items of one list have the key 7" } }));
setTimeout(() => { throw new Error("<b>boom</b>"); }, 0);
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/overlay.mjs") {
    res.setHeader("content-type", "text/javascript");
    return res.end(fs.readFileSync(__dirname + "/../host/overlay.mjs"));
  }
  res.setHeader("content-type", "text/html");
  res.end(html);
});

server.listen(0, "127.0.0.1", async () => {
  const browser = await launch();
  const p = await browser.newPage();
  await p.goto(`http://127.0.0.1:${server.address().port}/`);
  await p.waitForFunction(() => document.querySelectorAll("#delim-overlay .delim-overlay-item").length === 2);
  const text = (await p.$$eval("#delim-overlay .delim-overlay-item", (xs) => xs.map((x) => x.textContent))).join("\n");
  const ok = text.includes("delim: duplicate key\ntwo items of one list have the key 7") && text.includes("<b>boom</b>") && (await p.$("#delim-overlay b")) === null;
  console.log(ok ? "ok: the warning and the error are shown as text" : "FAILED: " + text);
  if (!ok) process.exitCode = 1;
  await browser.close();
  server.close();
});
