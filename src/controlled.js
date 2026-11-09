// Controlled form boxes: the live value / checked of an input, textarea or select follows the state. Spec §4-10.
// - A box whose VDOM node has `props` ({ value } and/or { checked }, see h.js) is written after every render, and only
//   when the live value differs (writing a different value moves the caret to the end).
// - After an "input" or "change" event the live value is put back to the wanted one (a box with no handler is locked).
//   The restore is deferred by two microtasks: the handler's own re-render is booked by queueMicrotask during the event,
//   so the restore has to run after it, whatever the listener order on the element is.
// - A box whose new VDOM has no props stops being watched; its live value is left alone (the user's box).
// Like src/events.js, the wanted values live on the real element (`el._controlled`); syncProps walks the new tree.

const WANTED = '_controlled';
const LISTENING = '_controlledListening';

function restore(el) {
  const want = el[WANTED];
  if (!want) return;
  if (want.value !== undefined && el.value !== want.value) el.value = want.value;
  if (want.checked !== undefined && el.checked !== want.checked) el.checked = want.checked;
}

function listen(el) {
  if (el[LISTENING]) return;
  el[LISTENING] = true;
  const later = () => queueMicrotask(() => queueMicrotask(() => restore(el)));
  el.addEventListener('input', later);
  el.addEventListener('change', later);
}

function syncNode(el, vnode) {
  if (vnode.kind !== 'element' || !el || el.nodeType !== 1) return;
  syncChildren(el, vnode); // children first: a select's options must exist before its value is set
  if (vnode.props) {
    el[WANTED] = { ...vnode.props };
    listen(el);
    restore(el);
  } else {
    delete el[WANTED];
  }
}

function syncChildren(parent, vnode) {
  vnode.children.forEach((child, i) => syncNode(parent.childNodes[i], child));
}

// `root` is the new root VDOM (a wrapper div) whose children are drawn inside `container`.
export function syncProps(container, root) {
  syncChildren(container, root);
}
