// Events: one relay listener per element and event type, attached once; re-rendering only swaps the stored handler.
// Spec §4-2 (Preact's way) and §4-8 (patch quietly adds a relay or empties the pointer; diff never reports events).
//
// Each real element gets one property, `el._handlers`, shaped { click: fn | null, input: fn | null, ... }.
// The relay for a type is `(e) => el._handlers[type]?.(e)`: it looks up the current function every time it runs.

const HANDLERS = '_handlers';

// Make sure `el` has a relay for `type` (added only the first time) and point it at `handler`.
function setHandler(el, type, handler) {
  if (!el[HANDLERS]) el[HANDLERS] = {};
  const handlers = el[HANDLERS];
  if (!(type in handlers)) {
    el.addEventListener(type, (e) => {
      const current = el[HANDLERS][type];
      if (current) current(e);
    });
  }
  handlers[type] = handler;
}

// Called by render.js when an element is created.
export function attachEvents(el, events) {
  if (!events) return;
  for (const [type, handler] of Object.entries(events)) setHandler(el, type, handler);
}

// Point one element at the new VDOM's events, then do the same for its children.
function syncNode(el, vnode) {
  if (vnode.kind !== 'element' || el.nodeType !== 1) return;
  const events = vnode.events ?? {};
  for (const [type, handler] of Object.entries(events)) setHandler(el, type, handler);
  // A type that had a handler before but is not in the new VDOM: empty the pointer, keep the relay.
  for (const type of Object.keys(el[HANDLERS] ?? {})) {
    if (!(type in events)) el[HANDLERS][type] = null;
  }
  syncChildren(el, vnode);
}

function syncChildren(parent, vnode) {
  vnode.children.forEach((child, i) => syncNode(parent.childNodes[i], child));
}

// `root` is the new root VDOM (a wrapper div) whose children are drawn inside `container`.
export function syncEvents(container, root) {
  syncChildren(container, root);
}
