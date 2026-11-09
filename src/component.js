// FunctionComponent + useState (feature 16).
// Spec §4-3: state lives in a `hooks` array outside the function; useState finds its slot by "which call am I" (cursor),
//            and mount()/update() reset the cursor to 0 right before calling the component.
// Spec §4-4: the setter takes a value or a function (called with the latest value); the same value (Object.is,
//            a pointer comparison) skips the re-render.
// Spec §4-4 (batching): many set calls in one turn re-render only once. The first set books one update() as a
//            microtask (= right after the JS work that is running now); the other sets just store their value.
//            Calling update() directly is still immediate; only setters are batched. Each component batches on its own.
// Spec §4-8: new FunctionComponent(App).mount(container); child components are expanded before diff;
//            a re-render runs everything from the root, and diff -> patch touches only what changed.
import { expand } from './h.js';
import { renderInto } from './render.js';
import { diff } from './diff.js';
import { patch } from './patch.js';
import { syncEvents } from './events.js';

// The component whose function is running right now (null when no component is rendering).
let currentComponent = null;

export class FunctionComponent {
  constructor(fn, props = {}) {
    this.fn = fn;
    this.props = props;
    this.hooks = []; // one slot per useState call, e.g. { kind: 'state', value }
    this.cursor = 0; // which slot the next useState call uses
    this.container = null;
    this.root = null; // the last drawn root VDOM
    this.updateQueued = false; // true while a batched update() is booked but has not run yet
  }

  // Call the function with the cursor at 0, expand child components, wrap in a root div.
  buildRoot() {
    this.cursor = 0;
    const previous = currentComponent;
    currentComponent = this;
    let result;
    try {
      result = expand(this.fn(this.props));
    } finally {
      currentComponent = previous;
    }
    return { kind: 'element', tag: 'div', attrs: {}, children: result === null ? [] : [result] };
  }

  // First render.
  mount(container) {
    this.container = container;
    const root = this.buildRoot();
    const doc = container.ownerDocument;
    renderInto(container, root, doc, { keys: false });
    syncEvents(container, root);
    this.root = root;
  }

  // Re-render after a state change: diff the old root against the new one and patch only the changes.
  update() {
    const root = this.buildRoot();
    const doc = this.container.ownerDocument;
    patch(this.container, diff(this.root, root), doc);
    syncEvents(this.container, root);
    this.root = root;
  }

  // "Please re-render", batched (spec §4-4). The first set in a turn books ONE update() with queueMicrotask and raises
  // the `updateQueued` flag; later sets in the same turn see the flag and only store their value. When the microtask
  // runs (right after the current JS work ends) it lowers the flag and calls update() once.
  requestUpdate() {
    if (this.updateQueued) return;
    this.updateQueued = true;
    queueMicrotask(() => {
      this.updateQueued = false;
      this.update();
    });
  }
}

export function useState(initial) {
  const component = currentComponent;
  if (component === null) {
    throw new Error('useState can only be called while a FunctionComponent is rendering');
  }
  const index = component.cursor++;
  if (index >= component.hooks.length) {
    component.hooks[index] = { kind: 'state', value: initial };
  }
  const slot = component.hooks[index];

  const set = (arg) => {
    const next = typeof arg === 'function' ? arg(slot.value) : arg;
    if (Object.is(next, slot.value)) return;
    slot.value = next;
    component.requestUpdate();
  };
  return [slot.value, set];
}
