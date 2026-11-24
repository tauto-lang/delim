// The DOM side of the renderer: a map from node numbers to DOM nodes, and one listener per
// event type on the root. Everything else is in Tauto.

export class HydrationError extends Error {
  constructor(message) { super(message); this.name = "HydrationError"; }
}

class Doc {
  constructor(root) {
    this.root = root;
    this.nodes = new Map();
    this.listeners = [];
    // While hydrating: the nodes the server rendered, by number.
    this.adopt = null;
    this.expected = new Map();
    this.loads = new Set();
    this.timers = new Set();
    this.sleeps = new Map();
    // Events not yet taken by `next`, and the `next` waiting for one.
    this.events = [];
    this.waiting = null;
    this.closed = false;
    this.released = false;
    // The press that may become a drag, and whether the last one did.
    this.drag = null;
    this.dragged = false;
  }
}

// The numbered nodes under `root`: elements carry `data-b`, and each text node follows a
// comment with its number. An empty text was written as nothing, so it is made here.
const numberedNodes = (root) => {
  const m = new Map();
  // Nested islands have their own numbering; trusted HTML is opaque to this renderer.
  const owned = (x) => {
    for (let p = x.parentElement; p && p !== root; p = p.parentElement) {
      if (p.localName === "delim-island" || p.localName === "delim-trusted") return false;
    }
    return true;
  };
  const add = (id, x) => {
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || m.has(Number(id))) {
      throw new HydrationError(`invalid or duplicate node number: ${id}`);
    }
    m.set(Number(id), x);
  };
  for (const e of root.querySelectorAll("[data-b]")) if (owned(e)) add(e.dataset.b, e);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const marks = [];
  for (let c = w.nextNode(); c; c = w.nextNode()) {
    if (owned(c) && /^\d+$/.test(c.data)) marks.push(c);
  }
  for (const c of marks) {
    let t = c.nextSibling;
    if (!t || t.nodeType !== Node.TEXT_NODE) {
      t = document.createTextNode("");
      c.after(t);
    }
    add(c.data, t);
  }
  return m;
};

// The node the server rendered for `n`, while hydrating.
const adopted = (d, n) => (d.adopt ? d.adopt.get(Number(n)) : undefined);

// A number no patch may name: one never made, or one removed with its subtree (the README's
// patch rules). Failing here names the number instead of failing inside the DOM.
const node = (d, n) => {
  const x = d.nodes.get(Number(n));
  if (x === undefined) throw new Error(`delim: node ${n} is not alive (never made, or removed with its subtree)`);
  return x;
};
const put = (d, n, x) => {
  x.__delim = Number(n);
  d.nodes.set(Number(n), x);
};

// The live root of each element, for `unmount`.
const mounted = new WeakMap();
const rootAt = (selector) => {
  const e = document.querySelector(selector);
  const d = new Doc(e);
  if (e) {
    const old = mounted.get(e);
    if (old && !old.released) release(old);
    mounted.set(e, d);
  }
  return d;
};
export const root = (selector) => rootAt(selector);
export const hydrateRoot = (selector) => {
  const d = rootAt(selector);
  d.adopt = numberedNodes(d.root);
  return d;
};
export const props = (d) => d.root.dataset.props ?? "";
export const settle = (d) => {
  if (d.adopt) for (const [n, x] of d.adopt) {
    if (d.nodes.get(n) !== x) throw new HydrationError(`unused server node: ${n}`);
  }
  if (d.adopt) for (const [n, children] of d.expected) {
    const parent = d.nodes.get(n);
    if (!d.adopt.has(n)) continue;
    const actual = [...parent.childNodes].filter(x => x.nodeType !== Node.COMMENT_NODE);
    if (actual.length !== children.length || actual.some((x, i) => x !== children[i])) {
      throw new HydrationError(`node ${n}: children differ from the server`);
    }
  }
  d.expected.clear();
  d.adopt = null;
};
const adoptElement = (d, n, tag) => {
  const x = adopted(d, n);
  if (x && (x.nodeType !== Node.ELEMENT_NODE || x.localName !== tag)) {
    throw new HydrationError(`node ${n}: expected <${tag}>`);
  }
  return x;
};
export const create = (d, n, tag) => {
  put(d, n, adoptElement(d, n, tag) ?? document.createElement(tag));
  // A textarea's value is text content, not numbered child nodes.
  if (d.adopt && tag !== "textarea") d.expected.set(Number(n), []);
};
// An SVG element: `tag` is one the Tauto side allows (`svg_tag_ok`).
export const svg = (d, n, tag) => {
  put(d, n, adoptElement(d, n, tag) ?? document.createElementNS("http://www.w3.org/2000/svg", tag));
  if (d.adopt) d.expected.set(Number(n), []);
};
export const text = (d, n, s) => {
  const t = adopted(d, n);
  if (t && (t.nodeType !== Node.TEXT_NODE || t.data !== s)) {
    throw new HydrationError(`node ${n}: text differs from the server`);
  }
  put(d, n, t ?? document.createTextNode(s));
};
export const group = (d, n) => {
  let g = adoptElement(d, n, "delim-group");
  if (!g) {
    g = document.createElement("delim-group");
    g.style.display = "contents";
  }
  put(d, n, g);
  if (d.adopt) d.expected.set(Number(n), []);
};
export const island = (d, n, name, props, inner) => {
  let e = adoptElement(d, n, "delim-island");
  if (!e) {
    e = document.createElement("delim-island");
    e.dataset.name = name;
    e.dataset.props = props;
    e.innerHTML = inner;
  }
  put(d, n, e);
};
// HTML a `TrustedHtml` vouches for, written as it is.
export const trusted = (d, n, html) => {
  let e = adoptElement(d, n, "delim-trusted");
  if (!e) {
    e = document.createElement("delim-trusted");
    e.style.display = "contents";
    e.innerHTML = html;
  }
  put(d, n, e);
};
export const attr = (d, n, name, value) => node(d, n).setAttribute(name, value);
export const removeAttr = (d, n, name) => node(d, n).removeAttribute(name);
export const boolean = (d, n, name, value) => { node(d, n)[name] = value; };
export const value = (d, n, v) => {
  const target = node(d, n);
  if (target.value !== v) target.value = v;
  if (target.tagName === 'SELECT') queueMicrotask(() => {
    if (target.value !== v) target.value = v;
  });
};
// A custom property (`--name`, which the Tauto side checked); "" removes it. The value is
// written from a number and a unit there.
export const styleVar = (d, n, name, value) => {
  const s = node(d, n).style;
  if (value === "") s.removeProperty(name); else s.setProperty(name, value);
};
export const drag = (d, n, on) => { node(d, n).__delimDrag = on; };
// The nearest numbered node of this root above `n`, or 0.
export const parent = (d, n) => BigInt(own(d, node(d, n).parentNode) ?? 0);
export const disabled = (d, n, value) => {
  node(d, n).disabled = value;
};
export const setText = (d, n, s) => {
  node(d, n).data = s;
};
// A node the server already put in its parent stays where it is.
const placed = (d, parent, child) => d.adopt && node(d, child).parentNode === node(d, parent);
const checkParent = (d, parent, child) => {
  if (adopted(d, parent) && !adopted(d, child)) {
    throw new HydrationError(`node ${child}: missing from the server`);
  }
  if (adopted(d, child) && node(d, child).parentNode !== node(d, parent)) {
    throw new HydrationError(`node ${child}: parent differs from the server`);
  }
};
const expectChild = (d, parent, child, before) => {
  if (!d.adopt) return;
  const x = node(d, child);
  for (const [n, children] of d.expected) d.expected.set(n, children.filter(c => c !== x));
  const children = d.expected.get(Number(parent)) ?? [];
  const index = before === undefined ? -1 : children.indexOf(node(d, before));
  if (index < 0) children.push(x); else children.splice(index, 0, x);
  d.expected.set(Number(parent), children);
};
// Puts `x` before `before` (at the end when null). A node already in the page is moved, as a
// reorder does: `moveBefore` keeps its focus, selection and scroll where the browser has it;
// elsewhere the node is taken out and put back, and the focused element under it, its text
// selection and the scroll positions on the way to it are written back afterwards.
const scrolled = (x, stop) => {
  const kept = [];
  for (let y = x; y; y = y === stop ? null : y.parentElement) {
    if (y.scrollTop || y.scrollLeft) kept.push([y, y.scrollTop, y.scrollLeft]);
  }
  return kept;
};
const place = (p, x, before) => {
  if (x.isConnected && p.isConnected && typeof p.moveBefore === "function") {
    try { p.moveBefore(x, before); return; } catch { /* not movable this way; insert below */ }
  }
  const active = x.isConnected ? document.activeElement : null;
  if (!active || active === document.body || !x.contains(active)) {
    p.insertBefore(x, before);
    return;
  }
  let range = null;
  try {
    if (active.selectionStart !== null && active.selectionStart !== undefined) {
      range = [active.selectionStart, active.selectionEnd, active.selectionDirection];
    }
  } catch { /* an input type with no selection */ }
  const scrolls = scrolled(active, x);
  p.insertBefore(x, before);
  if (document.activeElement !== active) active.focus({ preventScroll: true });
  if (range) try { active.setSelectionRange(...range); } catch { /* the same */ }
  for (const [y, top, left] of scrolls) { y.scrollTop = top; y.scrollLeft = left; }
};
export const append = (d, parent, child) => {
  checkParent(d, parent, child);
  expectChild(d, parent, child);
  if (!placed(d, parent, child)) place(node(d, parent), node(d, child), null);
};
export const insertBefore = (d, parent, child, before) => {
  checkParent(d, parent, child);
  expectChild(d, parent, child, before);
  if (!placed(d, parent, child)) place(node(d, parent), node(d, child), node(d, before));
};
// Forgets the numbers of `x` and everything under it, with a stack of its own rather than
// the call stack, so a deep tree does not exhaust it.
const forget = (d, x) => {
  const todo = [x];
  while (todo.length > 0) {
    const y = todo.pop();
    d.nodes.delete(y.__delim);
    for (const c of y.childNodes) todo.push(c);
  }
};
export const remove = (d, n) => {
  const x = node(d, n);
  x.remove();
  forget(d, x);
};
export const mount = (d, n) => {
  if (d.adopt && (!adopted(d, n) || node(d, n).parentNode !== d.root)) {
    throw new HydrationError(`node ${n}: island root differs from the server`);
  }
  if (node(d, n).parentNode !== d.root) d.root.replaceChildren(node(d, n));
};

// The DOM event types, with the code of each in `kind_code`.
const kinds = [
  ["click", 0n],
  ["focusin", 1n],
  ["focusout", 2n],
  ["keydown", 3n],
  ["input", 4n],
  ["change", 4n],
  ["pointerenter", 5n],
  ["pointerleave", 6n],
  ["pointerdown", 7n],
  ["pointermove", 8n],
  ["pointerup", 9n],
  ["scroll", 10n],
  ["delim:action", 11n],
  ["submit", 12n],
  ["keyup", 17n],
  ["dblclick", 18n],
  ["contextmenu", 19n],
  ["wheel", 20n],
  ["paste", 21n],
];

const numbered = (x) => {
  for (; x; x = x.parentNode) if (x.__delim !== undefined) return x.__delim;
  return undefined;
};

// Drags. A press on an element marked with `drag` (or inside one) becomes a drag of it once
// the pointer has moved `slop` pixels: the element holds the pointer from then on, and gets
// DragStart (13, where the press was), DragMove (14) and DragEnd (15); where the pointer is let
// go, the numbered node under it gets Drop (16) first. The click that ends a drag is not a
// press. A cancelled pointer ends the drag with no Drop.
const slop = 4;
const dragSource = (d, x) => {
  for (; x && x !== d.root; x = x.parentNode) if (x.__delimDrag && x.__delim !== undefined) return x;
  return undefined;
};
// The number of the nearest node of this root at or above `x`.
const own = (d, x) => {
  for (; x && x !== d.root; x = x.parentNode) if (x.__delim !== undefined && d.nodes.get(x.__delim) === x) return x.__delim;
  return undefined;
};
const at = (v) => BigInt(Math.trunc(v ?? 0));
const listenDrags = (d, f) => {
  const send = (n, code, x, y) => f(BigInt(n), code, "", at(x), at(y), 0n);
  const down = (e) => {
    d.drag = null;
    d.dragged = false;
    const x = e.button === 0 ? dragSource(d, e.target) : undefined;
    if (x) d.drag = { x, id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false };
  };
  const move = (e) => {
    const g = d.drag;
    if (!g || g.id !== e.pointerId) return;
    if (!g.on) {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < slop) return;
      g.on = true;
      try { g.x.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
      send(g.x.__delim, 13n, g.x0, g.y0);
    }
    send(g.x.__delim, 14n, e.clientX, e.clientY);
  };
  const end = (e) => {
    const g = d.drag;
    if (!g || g.id !== e.pointerId) return;
    d.drag = null;
    if (!g.on) return;
    d.dragged = true;
    if (e.type === "pointerup") {
      const hit = own(d, document.elementFromPoint(e.clientX, e.clientY));
      if (hit !== undefined) send(hit, 16n, e.clientX, e.clientY);
    }
    send(g.x.__delim, 15n, e.clientX, e.clientY);
  };
  const click = (e) => {
    if (!d.dragged) return;
    d.dragged = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  };
  for (const [type, h] of [["pointerdown", down], ["pointermove", move], ["pointerup", end], ["pointercancel", end], ["click", click]]) {
    d.root.addEventListener(type, h, true);
    d.listeners.push([type, h]);
  }
};

// An event as `next` gives it: `open` false says no more come.
const closedEvent = { open: false, node: 0, code: 0n, text: "", x: 0n, y: 0n, button: 0n };
const push = (d, ev) => {
  if (d.closed || d.released) return;
  const w = d.waiting;
  if (w) { d.waiting = null; w(ev); } else d.events.push(ev);
};
const close = (d) => {
  d.closed = true;
  d.events.length = 0;
  const w = d.waiting;
  if (w) { d.waiting = null; w(closedEvent); }
};

// The next event under the root, as a Promise. The root's listeners are added at the first call.
export const next = (d) => {
  if (d.closed || d.released) return closedEvent;
  if (!d.listening) {
    d.listening = true;
    listen(d, (node, code, text, x, y, button) => push(d, { open: true, node, code, text, x, y, button }));
  }
  if (d.events.length) return d.events.shift();
  return new Promise((resolve) => { d.waiting = resolve; });
};
export const unlisten = (d) => close(d);
export const eventOpen = (e) => e.open;
export const eventNode = (e) => e.node;
export const eventCode = (e) => e.code;
export const eventText = (e) => e.text;
export const eventX = (e) => e.x;
export const eventY = (e) => e.y;
export const eventButton = (e) => e.button;
export const loadOk = (l) => l.ok;
export const loadText = (l) => l.text;
// A load's or an event's answer holds nothing to release.
export const dropAnswer = () => {};

const listen = (d, f) => {
  listenDrags(d, f);
  for (const [type, code] of kinds) {
    const h = (e) => {
      const n = numbered(e.target);
      if (n === undefined) return;
      // A key that an input method takes while composing, as the Enter that ends a Japanese
      // conversion, is the method's own: it presses nothing in the page.
      if ((code === 3n || code === 17n) && (e.isComposing || e.keyCode === 229)) return;
      // A submitted form is handled here; the page stays.
      if (code === 12n) e.preventDefault();
      const s = code === 11n ? String(e.detail?.action ?? "") : code === 3n || code === 17n ? e.key : code === 21n ? String(e.clipboardData?.getData("text/plain") ?? "") : code === 4n ? (e.target.type === "checkbox" ? String(e.target.checked) : String(e.target.value ?? "")) : "";
      const x = BigInt(Math.trunc(code === 10n ? e.target.scrollLeft ?? 0 : code === 20n ? e.deltaX ?? 0 : e.clientX ?? 0));
      const y = BigInt(Math.trunc(code === 10n ? e.target.scrollTop ?? 0 : code === 20n ? e.deltaY ?? 0 : e.clientY ?? 0));
      const b = BigInt(e.button ?? 0);
      f(BigInt(n), code, s, x, y, b);
    };
    // Scroll, focus and pointer enter/leave do not bubble; capture reaches them all. A wheel
    // listener is passive, so the page still scrolls without waiting on the program.
    d.root.addEventListener(type, h, code === 20n ? { capture: true, passive: true } : true);
    d.listeners.push([type, h]);
  }
};

// Something the program got wrong but went on from: a watcher it stopped running because one
// write ran it too often (`kind` "stalled"), or a key two items of one list had ("duplicate
// key"). Each is told to `console.warn` and, as a `delim:warning` event on `window` whose
// `detail` is `{ kind, detail }`, to whatever listens: the development overlay, or a
// production error hook added with `addEventListener`.
export const warn = (d, kind, detail) => {
  if (d.released) return;
  console.warn(`delim: ${kind}: ${detail}`);
  if (typeof dispatchEvent === "function" && typeof CustomEvent === "function") {
    dispatchEvent(new CustomEvent("delim:warning", { detail: { kind, detail } }));
  }
};

// `loader(key, { signal })` gives a Promise of `{ ok, text }`. The optional second argument
// lets a loader abort its I/O when this DOM root is released; existing one-argument loaders
// keep working. Results are never delivered after release, even if a loader ignores abort.
//
// `setLoader(f)` sets the page's loader. `setLoader(f, within)` sets one for the roots at or
// under the element `within` (or the element a selector names), so that two apps on one page,
// or an island, can load differently; the nearest one above a root is used. `f` null removes it.
let loader = async () => ({ ok: false, text: "no loader is set" });
const scoped = new WeakMap();
export const setLoader = (f, within) => {
  if (within === undefined) {
    loader = f ?? (async () => ({ ok: false, text: "no loader is set" }));
    return;
  }
  const e = typeof within === "string" ? document.querySelector(within) : within;
  if (!e) throw new Error(`delim: setLoader: no element for ${within}`);
  if (f == null) scoped.delete(e); else scoped.set(e, f);
};
const loaderOf = (d) => {
  for (let e = d.root; e; e = e.parentElement) {
    const f = scoped.get(e);
    if (f) return f;
  }
  return loader;
};

// `{ ok, text }` as a Promise. A load the release of the root ends is a failure.
export const load = (d, key) => {
  if (d.released) return { ok: false, text: "the root was released" };
  const controller = new AbortController();
  d.loads.add(controller);
  return Promise.resolve()
    .then(() => d.released ? undefined : loaderOf(d)(key, { signal: controller.signal }))
    .then((r) => {
      d.loads.delete(controller);
      return d.released || !r ? { ok: false, text: "the root was released" } : { ok: !!r.ok, text: String(r.text) };
    }, (e) => {
      d.loads.delete(controller);
      return { ok: false, text: String(e) };
    });
};

// Resolves `ms` (a u64, a BigInt) milliseconds from now with whether the root is still there.
// Released first, it resolves false at once.
export const sleep = (d, ms) => {
  if (d.released) return false;
  return new Promise((resolve) => {
    const id = setTimeout(() => {
      d.timers.delete(id);
      d.sleeps.delete(id);
      resolve(!d.released);
    }, Number(ms));
    d.timers.add(id);
    d.sleeps.set(id, resolve);
  });
};

export const release = (d) => {
  d.released = true;
  for (const id of d.timers) clearTimeout(id);
  d.timers.clear();
  for (const resolve of d.sleeps.values()) resolve(false);
  d.sleeps.clear();
  close(d);
  for (const controller of d.loads) controller.abort();
  d.loads.clear();
  for (const [type, h] of d.listeners) d.root.removeEventListener(type, h, true);
  d.listeners.length = 0;
  d.drag = null;
  d.nodes.clear();
  d.expected.clear();
  d.adopt = null;
};

// Ends the app mounted on `target` (an element or a selector): its listeners, timers and loads
// are released as `release` does, and the nodes it rendered are taken out of the page. Its
// callbacks never run again. Whether anything was mounted there is returned.
export const unmount = (target) => {
  const e = typeof target === "string" ? document.querySelector(target) : target;
  const d = e ? mounted.get(e) : undefined;
  if (!d) return false;
  mounted.delete(e);
  const was = !d.released;
  release(d);
  e.replaceChildren();
  return was;
};

// Every extern of Tauto.eure by its name there, and the drops of its host types, for a page
// that starts its program through `instantiate(externs, { release })` and calls an exported
// `start`: such a program keeps its page handles for as long as the page lives.
export const externs = {
  dom_root: root,
  dom_hydrate_root: hydrateRoot,
  dom_props: props,
  dom_settle: settle,
  dom_island: island,
  dom_trusted: trusted,
  dom_create: create,
  dom_text: text,
  dom_group: group,
  dom_attr: attr,
  dom_value: value,
  dom_remove_attr: removeAttr,
  dom_bool: boolean,
  dom_disabled: disabled,
  dom_set_text: setText,
  dom_append: append,
  dom_insert_before: insertBefore,
  dom_remove: remove,
  dom_mount: mount,
  dom_next: next,
  host_load_ok: loadOk,
  host_load_text: loadText,
  host_event_open: eventOpen,
  host_event_node: eventNode,
  host_event_code: eventCode,
  host_event_text: eventText,
  host_event_x: eventX,
  host_event_y: eventY,
  host_event_button: eventButton,
  dom_unlisten: unlisten,
  dom_load: load,
  dom_sleep: sleep,
  dom_svg: svg,
  dom_var: styleVar,
  dom_drag: drag,
  dom_parent: parent,
  dom_warn: warn,
};
export const releases = { Doc: release, HostLoad: dropAnswer, HostEvent: dropAnswer };
