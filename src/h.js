// h() builds VDOM nodes by hand; expand() unrolls component nodes into plain VDOM before diff.
// Spec §4-1: h('button', {}, ['3']) is a small helper; h(Comp, props) only records "this component, these props".
// Spec §4-2 / §4-8: props named on... (functions) go to the node's `events` slot; diff never looks at events.
// Spec §4-10: on input / textarea / select, `value` and `checked` are also copied to the node's
//            `props` slot (String value / Boolean checked; null or undefined = not given) so that src/controlled.js can
//            make the live box follow state. diff never looks at props. Choice the spec does not make: for
//            <input type=checkbox|radio>, `value` stays a plain attribute (it is not the typed text there).
// Spec §4-8: expand() calls every component first, so Phase 1's diff and patch work unchanged.

// Turn one child (or nested arrays of children) into VDOM nodes, appended to `out`.
function pushChildren(child, out) {
  if (Array.isArray(child)) {
    for (const c of child) pushChildren(c, out);
  } else if (child === null || child === undefined || typeof child === 'boolean') {
    // draws nothing
  } else if (typeof child === 'string' || typeof child === 'number') {
    out.push({ kind: 'text', text: String(child) });
  } else {
    out.push(child); // already a VDOM node
  }
}

function normalizeChildren(children) {
  const out = [];
  pushChildren(children, out);
  return out;
}

export function h(type, props, children) {
  // Component: record fn + props, do not call it yet.
  if (typeof type === 'function') {
    const node = { kind: 'component', fn: type, props: { ...props } };
    if (children !== undefined) node.props.children = normalizeChildren(children);
    return node;
  }

  // Element: split props into attrs (strings) and events (on... functions).
  const attrs = {};
  const events = {};
  let hasEvents = false;
  const formProps = {};
  let hasProps = false;
  const isForm = type === 'input' || type === 'textarea' || type === 'select';
  const inputKind = type === 'input' ? String(props?.type ?? '').toLowerCase() : '';
  const valueIsAttr = inputKind === 'checkbox' || inputKind === 'radio';
  for (const name of Object.keys(props ?? {})) {
    const value = props[name];
    if (/^on[A-Z]/.test(name)) {
      if (typeof value === 'function') {
        events[name.slice(2).toLowerCase()] = value;
        hasEvents = true;
      }
    } else if (isForm && name === 'value' && !valueIsAttr) {
      if (value !== null && value !== undefined) {
        formProps.value = String(value);
        attrs[name] = String(value); // also kept as an attribute (= defaultValue), as before
        hasProps = true;
      }
    } else if (type === 'input' && name === 'checked') {
      if (value !== null && value !== undefined) {
        formProps.checked = Boolean(value);
        if (value === true) attrs[name] = ''; // as before; false stays out of attrs but is kept in props
        hasProps = true;
      }
    } else if (value === true) {
      attrs[name] = '';
    } else if (value !== false && value !== null && value !== undefined) {
      attrs[name] = String(value);
    }
  }
  const node = { kind: 'element', tag: type, attrs, children: normalizeChildren(children) };
  if (hasEvents) node.events = events;
  if (hasProps) node.props = formProps;
  return node;
}

// Returns a new plain tree with no component nodes. Never changes its input.
// A component that draws nothing (null) gives null, and its parent skips it.
export function expand(vnode) {
  let node = vnode;
  // Unroll: call the component, and keep going while the result is another component.
  while (node && node.kind === 'component') {
    node = node.fn(node.props);
  }
  if (node === null || node === undefined || typeof node === 'boolean') return null;
  if (typeof node === 'string' || typeof node === 'number') return { kind: 'text', text: String(node) };
  if (node.kind === 'text') return { kind: 'text', text: node.text };

  const children = [];
  for (const child of node.children) {
    const expanded = expand(child);
    if (expanded !== null) children.push(expanded);
  }
  const out = { kind: 'element', tag: node.tag, attrs: { ...node.attrs }, children };
  if (node.events) out.events = { ...node.events };
  if (node.props) out.props = { ...node.props };
  return out;
}
