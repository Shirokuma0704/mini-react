// Tests for feature 20: hook rules. Spec-draft §4-3 (Q4) and §4-7 (Q8-1). Written by the orchestrator (Opus)
// BEFORE the implementation.
//   §4-3 "훅 개수가 지난번과 다르면 에러를 내고 멈춘다. 개수는 같은데 종류 순서가 다르면 콘솔 경고." (React's way)
//   §4-7 "자식이 훅을 부르면 에러를 내고 멈춘다." (children are h(Child, props) nodes, unrolled by expand())
// Orchestrator's readings pinned here (tell him if they bite):
//   - "멈춘다" = the render throws before anything is patched, so the screen keeps showing the last good render.
//   - order warning: console.warn, once per render that has a mismatch; the render still finishes.
//   - error messages say what happened in words: "hook" + the two counts / "root".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { h } from '../src/h.js';
import { FunctionComponent, useState, useEffect, useMemo } from '../src/component.js';

function setup() {
  const { window } = new JSDOM('<!DOCTYPE html><body><div id="c"></div></body>');
  return { container: window.document.getElementById('c') };
}

// ---------- hook count changes → error (§4-3 Q4) ----------

test('a render that calls MORE hooks than last time throws (the "if (count > 0) useState" case from Q3-1)', () => {
  const { container } = setup();
  let extra = false;
  const App = () => {
    useState(0);
    if (extra) useState('안녕');
    return h('p', {}, ['x']);
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  extra = true;
  assert.throws(() => fc.update(), /hook/i);
});

test('a render that calls FEWER hooks than last time throws', () => {
  const { container } = setup();
  let both = true;
  const App = () => {
    useState(0);
    if (both) useMemo(() => 1, []);
    return h('p');
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  both = false;
  assert.throws(() => fc.update(), /hook/i);
});

test('the count error names both numbers (e.g. 1 and 2)', () => {
  const { container } = setup();
  let extra = false;
  const App = () => {
    useState(0);
    if (extra) useState(1);
    return h('p');
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  extra = true;
  assert.throws(
    () => fc.update(),
    (err) => /1/.test(err.message) && /2/.test(err.message),
  );
});

test('"stops": after a count error nothing was patched — the screen still shows the last good render', () => {
  const { container } = setup();
  let extra = false;
  let label = 'old';
  const App = () => {
    useState(0);
    if (extra) useState(1);
    return h('p', {}, [label]);
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  extra = true;
  label = 'new';
  assert.throws(() => fc.update());
  assert.equal(container.textContent, 'old');
});

test('the same hooks in the same order every render → no error, no warning', (t) => {
  const { container } = setup();
  const warn = t.mock.method(console, 'warn', () => {});
  const App = () => {
    useState(0);
    useMemo(() => 1, []);
    useEffect(() => {}, []);
    return h('p');
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  assert.doesNotThrow(() => fc.update());
  assert.doesNotThrow(() => fc.update());
  assert.equal(warn.mock.callCount(), 0);
});

// ---------- same count, different kind order → warning (§4-3 Q4) ----------

test('same number of hooks but kinds in a different order → console.warn, and the render still finishes', (t) => {
  const { container } = setup();
  const warn = t.mock.method(console, 'warn', () => {});
  let swapped = false;
  let label = 'old';
  const App = () => {
    if (swapped) {
      useEffect(() => {});
      useState(0);
    } else {
      useState(0);
      useEffect(() => {});
    }
    return h('p', {}, [label]);
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  swapped = true;
  label = 'new';
  assert.doesNotThrow(() => fc.update());
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(container.textContent, 'new');
});

test('the order warning names the kinds involved (state / effect / memo)', (t) => {
  const { container } = setup();
  const warn = t.mock.method(console, 'warn', () => {});
  let swapped = false;
  const App = () => {
    if (swapped) {
      useMemo(() => 1, []);
      useState(0);
    } else {
      useState(0);
      useMemo(() => 1, []);
    }
    return h('p');
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  swapped = true;
  fc.update();
  const message = warn.mock.calls.map((c) => c.arguments.join(' ')).join(' ');
  assert.match(message, /state/);
  assert.match(message, /memo/);
});

// ---------- hooks only in the root component (§4-7 Q8-1) ----------

test('a child component that calls useState → error at mount', () => {
  const { container } = setup();
  const Child = () => {
    useState(0);
    return h('li', {}, ['x']);
  };
  const App = () => h('ul', {}, [h(Child)]);
  assert.throws(() => new FunctionComponent(App).mount(container), /root/i);
});

test('a child component that calls useEffect or useMemo → error too', () => {
  const { container } = setup();
  const WithEffect = () => {
    useEffect(() => {});
    return h('i');
  };
  const WithMemo = () => {
    useMemo(() => 1, []);
    return h('b');
  };
  assert.throws(() => new FunctionComponent(() => h('div', {}, [h(WithEffect)])).mount(container), /root/i);
  assert.throws(() => new FunctionComponent(() => h('div', {}, [h(WithMemo)])).mount(container), /root/i);
});

test('a grandchild calling a hook is caught too', () => {
  const { container } = setup();
  const Grandchild = () => {
    useState(0);
    return h('b');
  };
  const Child = () => h('span', {}, [h(Grandchild)]);
  assert.throws(() => new FunctionComponent(() => h('div', {}, [h(Child)])).mount(container), /root/i);
});

test('a root component that returns h(Inner) directly: Inner is a child, so its hook is an error', () => {
  const { container } = setup();
  const Inner = () => {
    useState(0);
    return h('p');
  };
  assert.throws(() => new FunctionComponent(() => h(Inner)).mount(container), /root/i);
});

test('stateless children (props only) are fine, and the root keeps its hooks', () => {
  const { container } = setup();
  const Item = (p) => h('li', {}, [p.text]);
  const App = () => {
    const [items] = useState(['a', 'b']);
    return h('ul', {}, items.map((t) => h(Item, { text: t })));
  };
  assert.doesNotThrow(() => new FunctionComponent(App).mount(container));
  assert.equal(container.textContent, 'ab');
});

test('after a child-hook error, hooks used by a NEW root render work normally (the "child" mark is cleared)', () => {
  const { container } = setup();
  const Bad = () => {
    useState(0);
    return h('i');
  };
  assert.throws(() => new FunctionComponent(() => h(Bad)).mount(container));
  const Good = () => {
    const [v] = useState('ok');
    return h('p', {}, [v]);
  };
  assert.doesNotThrow(() => new FunctionComponent(Good).mount(container));
  assert.equal(container.textContent, 'ok');
});
