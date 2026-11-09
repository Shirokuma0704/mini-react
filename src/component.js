// FunctionComponent + useState (feature 16) + useEffect (feature 18) + useMemo (feature 19).
// Spec §4-5: useEffect(fn, deps) runs fn AFTER patch has really changed the screen, never while the component function
//            runs. deps: no list = every render; [] = first render only; [a, b] = compare slot by slot with Object.is
//            (a pointer comparison) and run again if any one differs. fn may return a cleanup function; the library calls
//            it right before that same effect runs again (clearing what an effect set up is that effect's own job).
// Spec §4-6: useMemo(fn, deps) computes right there while App() runs (unlike useEffect, which waits until after patch)
//            and hands back the value. Same watched values as last time (compared like useEffect) = the remembered
//            value, different = compute again. No list = compute on every render; [] = compute once.
// Spec §4-3: state lives in a `hooks` array outside the function; useState finds its slot by "which call am I" (cursor),
//            and mount()/update() reset the cursor to 0 right before calling the component.
//            Rules (§4-3): after the component function returns, the number of hooks it called must equal the number of
//            slots from earlier renders, otherwise it throws before anything is patched (the screen keeps the last good
//            render). Same number but a different kind at some slot (state/effect/memo) = one console.warn per render,
//            and the render goes on with a fresh slot of the new kind in that place.
//            A rejected render (count error, a child calling a hook, or the function itself throwing) leaves no trace on
//            the hooks: the slots it replaced come back, effects it booked never run, and a failed first render puts
//            hookCount back to null. State values already set by setters stay (those are real updates).
//            Choice the spec does not make: an effect slot thrown away by a kind swap keeps its cleanup; it is called after
//            patch, right before that render's effects run (and not at all if that render is rejected).
// Spec §4-7: hooks only work in the root component. While child components are being expanded, any hook call throws
//            an error that says "root". The flag is cleared in a finally, so a later component can use hooks normally.
// Spec §4-4: the setter takes a value or a function (called with the latest value); the same value (Object.is,
//            a pointer comparison) skips the re-render.
// Spec §4-4 (batching): many set calls in one turn re-render only once. The first set books one update() as a
//            microtask (= right after the JS work that is running now); the other sets just store their value.
//            Calling update() directly is still immediate; only setters are batched. Each component batches on its own.
// Spec §4-10: after every mount/update, syncProps (src/controlled.js) makes input/textarea/select boxes that were given
//            value/checked follow the state, and puts typed-over values back (locked boxes).
// Spec §4-8: new FunctionComponent(App).mount(container); child components are expanded before diff;
//            a re-render runs everything from the root, and diff -> patch touches only what changed.
import { expand } from './h.js';
import { renderInto } from './render.js';
import { diff } from './diff.js';
import { patch } from './patch.js';
import { syncEvents } from './events.js';
import { syncProps } from './controlled.js';

// The component whose function is running right now (null when no component is rendering).
let currentComponent = null;
// True while child components are being expanded (the root function has already returned): hooks are an error then.
let expandingChildren = false;

export class FunctionComponent {
  constructor(fn, props = {}) {
    this.fn = fn;
    this.props = props;
    this.hooks = []; // one slot per useState call, e.g. { kind: 'state', value }
    this.cursor = 0; // which slot the next useState call uses
    this.hookCount = null; // how many hooks the last good render called (null = never rendered)
    this.warned = false; // true once this render has already warned about hook order
    this.dropped = []; // effect slots this render threw away by a kind swap; their cleanups run after patch
    this.container = null;
    this.root = null; // the last drawn root VDOM
    this.updateQueued = false; // true while a batched update() is booked but has not run yet
  }

  // Call the function with the cursor at 0, expand child components, wrap in a root div.
  buildRoot() {
    this.cursor = 0;
    this.warned = false;
    this.dropped = [];
    // Snapshot for a rejected render: the slot objects (setters close over them) and the count of the last good render.
    const committedHooks = this.hooks.slice();
    const committedCount = this.hookCount;
    const previous = currentComponent;
    const previousExpanding = expandingChildren;
    currentComponent = this;
    expandingChildren = false;
    let result;
    try {
      const vnode = this.fn(this.props);
      this.checkHookCount();
      expandingChildren = true; // from here on, only child components run
      result = expand(vnode);
    } catch (error) {
      this.hooks = committedHooks;
      this.hookCount = committedCount;
      for (const slot of this.hooks) if (slot.kind === 'effect') slot.pending = null; // forget effects it booked
      this.dropped = [];
      throw error;
    } finally {
      currentComponent = previous;
      expandingChildren = previousExpanding;
    }
    return { kind: 'element', tag: 'div', attrs: {}, children: result === null ? [] : [result] };
  }

  // Compare this render's hook count with the last good one; on a difference throw (buildRoot then undoes the render).
  checkHookCount() {
    if (this.hookCount === null) {
      this.hookCount = this.cursor; // first render: nothing to compare
      return;
    }
    if (this.cursor === this.hookCount) return;
    const message = `hook count changed: last render called ${this.hookCount} hooks, this render called ${this.cursor}`;
    throw new Error(message);
  }

  // First render.
  mount(container) {
    this.container = container;
    const root = this.buildRoot();
    const doc = container.ownerDocument;
    renderInto(container, root, doc, { keys: false });
    syncEvents(container, root);
    syncProps(container, root);
    this.root = root;
    this.runEffects();
  }

  // Re-render after a state change: diff the old root against the new one and patch only the changes.
  update() {
    const root = this.buildRoot();
    const doc = this.container.ownerDocument;
    patch(this.container, diff(this.root, root), doc);
    syncEvents(this.container, root);
    syncProps(this.container, root);
    this.root = root;
    this.runEffects();
  }

  // After drawing: first the cleanups of effect slots this render threw away, then go through the slots in order; for
  // each effect marked pending, call the old cleanup, then run fn.
  runEffects() {
    const dropped = this.dropped;
    this.dropped = [];
    for (const slot of dropped) {
      if (!slot.cleanup) continue;
      const cleanup = slot.cleanup;
      slot.cleanup = null;
      cleanup();
    }
    for (const slot of this.hooks) {
      if (slot.kind !== 'effect' || !slot.pending) continue;
      const { fn, deps } = slot.pending;
      slot.pending = null;
      if (slot.cleanup) {
        const cleanup = slot.cleanup;
        slot.cleanup = null;
        cleanup();
      }
      slot.deps = deps;
      const result = fn();
      if (typeof result === 'function') slot.cleanup = result;
    }
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
  const { slot } = takeSlot(component, 'state', () => ({ kind: 'state', value: initial }));

  const set = (arg) => {
    const next = typeof arg === 'function' ? arg(slot.value) : arg;
    if (Object.is(next, slot.value)) return;
    slot.value = next;
    component.requestUpdate();
  };
  return [slot.value, set];
}

// Decide during render whether the effect must run; if so just mark it pending. mount()/update() run it after drawing.
export function useEffect(fn, deps) {
  const component = currentComponent;
  if (component === null) {
    throw new Error('useEffect can only be called while a FunctionComponent is rendering');
  }
  const { slot, first } = takeSlot(component, 'effect', () => ({ kind: 'effect', deps: undefined, cleanup: null, pending: null }));
  if (first || depsChanged(deps, slot.deps)) slot.pending = { fn, deps };
}

// Compute during render, right where it is called; reuse the remembered value while the deps are unchanged.
export function useMemo(fn, deps) {
  const component = currentComponent;
  if (component === null) {
    throw new Error('useMemo can only be called while a FunctionComponent is rendering');
  }
  const { slot, first } = takeSlot(component, 'memo', () => ({ kind: 'memo', deps: undefined, value: undefined }));
  if (first || depsChanged(deps, slot.deps)) {
    slot.value = fn();
    slot.deps = deps;
  }
  return slot.value;
}

// Every hook asks here for "its" slot. Throws in child components (§4-7); warns once per render when the slot at this
// position was made by a different kind of hook (§4-3) and then replaces it with a fresh slot (its old value is lost).
// Returns the slot and whether it is new (first = true).
function takeSlot(component, kind, make) {
  if (expandingChildren) {
    throw new Error(`hooks can only be called in the root component, not in a child (called: ${kind})`);
  }
  const index = component.cursor++;
  let first = index >= component.hooks.length;
  if (!first && component.hooks[index].kind !== kind) {
    if (!component.warned) {
      component.warned = true;
      console.warn(`hook order changed: slot ${index} was "${component.hooks[index].kind}" but is now "${kind}"`);
    }
    first = true;
  }
  if (first) {
    const old = component.hooks[index];
    if (old && old.kind === 'effect' && old.cleanup) component.dropped.push(old);
    component.hooks[index] = make();
  }
  return { slot: component.hooks[index], first };
}

// True when an effect/memo must run again: no list on either side, different length, or any item differs (Object.is).
function depsChanged(deps, previous) {
  return (
    deps === undefined ||
    previous === undefined ||
    deps.length !== previous.length ||
    deps.some((d, i) => !Object.is(d, previous[i]))
  );
}
