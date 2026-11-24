// Shows errors the page raises, on the page, while developing: an uncaught error in a
// handler or a rejected promise gets a box over the page with its message and stack, and so
// does each `delim:warning` the DOM host raises (a stalled watcher, a duplicate key). The
// text goes in with `textContent`, never as HTML. Call `install()` in development builds only.

const show = (title, detail) => {
  let box = document.getElementById("delim-overlay");
  if (!box) {
    box = document.createElement("div");
    box.id = "delim-overlay";
    box.setAttribute("role", "alert");
    box.style.cssText =
      "position:fixed;inset:0 0 auto 0;max-height:50vh;overflow:auto;z-index:2147483647;" +
      "background:#2b0a0a;color:#ffd6d6;font:13px/1.4 monospace;padding:12px;white-space:pre-wrap";
    const close = document.createElement("button");
    close.textContent = "close";
    close.addEventListener("click", () => box.remove());
    box.append(close);
    document.body.append(box);
  }
  const item = document.createElement("div");
  item.className = "delim-overlay-item";
  item.textContent = `${title}\n${detail}`;
  box.append(item);
};

export const install = () => {
  addEventListener("delim:warning", (e) => show(`delim: ${e.detail.kind}`, e.detail.detail));
  addEventListener("error", (e) => show(e.message, e.error && e.error.stack ? e.error.stack : ""));
  addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    show(String(r && r.message ? r.message : r), r && r.stack ? r.stack : "");
  });
};
