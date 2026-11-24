// Instantiates the program built by `tauto build --backend javascript --target browser
// delim-html/dom` with the DOM host.
const out = "../target/tauto/javascript/browser/dom";
const { instantiate } = await import(`${out}/program.mjs`);
const dom = await import(`${out}/host/host/dom.mjs`);

const externs = {
  dom_root: dom.root,
  dom_hydrate_root: dom.hydrateRoot,
  dom_props: dom.props,
  dom_settle: dom.settle,
  dom_island: dom.island,
  dom_trusted: dom.trusted,
  dom_create: dom.create,
  dom_text: dom.text,
  dom_group: dom.group,
  dom_attr: dom.attr,
  dom_value: dom.value,
  dom_disabled: dom.disabled,
  dom_set_text: dom.setText,
  dom_append: dom.append,
  dom_insert_before: dom.insertBefore,
  dom_remove: dom.remove,
  dom_mount: dom.mount,
  dom_next: dom.next, dom_unlisten: dom.unlisten, host_load_ok: dom.loadOk, host_load_text: dom.loadText, host_event_open: dom.eventOpen, host_event_node: dom.eventNode, host_event_code: dom.eventCode, host_event_text: dom.eventText, host_event_x: dom.eventX, host_event_y: dom.eventY, host_event_button: dom.eventButton,
  dom_load: dom.load,
  dom_remove_attr: dom.removeAttr,
  dom_bool: dom.boolean,
  dom_sleep: dom.sleep,
  dom_svg: dom.svg,
  dom_var: dom.styleVar,
  dom_drag: dom.drag,
  dom_parent: dom.parent,
};

// The pages here load a resource from `/resource/<key>`, which `check.cjs` answers.
dom.setLoader(async (key) => {
  const r = await fetch(`/resource/${encodeURIComponent(key)}`);
  return { ok: r.ok, text: await r.text() };
});

export const program = instantiate(externs, { release: { Doc: dom.release } });
