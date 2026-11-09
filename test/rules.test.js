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

// ---------- a rejected render leaves no trace (Codex bundle r1, 11-09 17:30) ----------
// Orchestrator's reading (Opus, written before the fix): a render that throws (count error, child hook, or App itself
// throwing) is as if it never happened for the hooks: slots it replaced come back, effects it booked never run,
// cleanups it would have caused never run. State set by setters is NOT undone (those are real updates).

const quiet = (t) => t.mock.method(console, 'warn', () => {});
const tick = () => new Promise((r) => setTimeout(r, 0));

test('F1: an effect booked by a render that failed in child expansion does not run after a later good render', () => {
  const { container } = setup();
  const log = [];
  const Child = ({ bad }) => {
    if (bad) useState(0);
    return h('i', {}, ['c']);
  };
  const App = ({ n, bad }) => {
    useEffect(() => {
      log.push(`run ${n}`);
      return () => log.push(`clean ${n}`);
    }, [n]);
    return h('p', {}, [n, h(Child, { bad })]);
  };
  const fc = new FunctionComponent(App, { n: 0, bad: false });
  fc.mount(container);
  fc.props = { n: 1, bad: true };
  assert.throws(() => fc.update(), /root/);
  fc.props = { n: 0, bad: false };
  fc.update();
  assert.equal(container.textContent, '0c');
  assert.deepEqual(log, ['run 0']); // deps [0] equal the last committed [0]: no cleanup, no rerun
});

test('F1: an effect booked before App itself threw does not run later either', () => {
  const { container } = setup();
  const log = [];
  const App = ({ n, boom }) => {
    useEffect(() => {
      log.push(`run ${n}`);
    }, [n]);
    if (boom) throw new Error('boom');
    return h('p', {}, [n]);
  };
  const fc = new FunctionComponent(App, { n: 0 });
  fc.mount(container);
  fc.props = { n: 1, boom: true };
  assert.throws(() => fc.update(), /boom/);
  fc.props = { n: 0 };
  fc.update();
  assert.deepEqual(log, ['run 0']);
});

test('F2: after a count error, the committed state slot survives and its saved setter still updates the screen', async (t) => {
  quiet(t);
  const { container } = setup();
  let mode = 'good';
  let set;
  const App = () => {
    if (mode === 'good') {
      const [v, s] = useState(0);
      set = s;
      return h('p', {}, [v]);
    }
    useMemo(() => 42, []); // takes slot 0 with a different kind…
    useState(1); // …and adds a slot: count 1 → 2, error
    return h('p', {}, ['x']);
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  const saved = set;
  saved(7);
  await tick();
  assert.equal(container.textContent, '7');
  mode = 'bad';
  assert.throws(() => fc.update(), /hook count/);
  assert.equal(container.textContent, '7');
  mode = 'good';
  saved(8);
  await tick();
  assert.equal(container.textContent, '8');
});

test('F2: a kind swap inside a render that then fails on a child hook is undone too', (t) => {
  quiet(t);
  const { container } = setup();
  let swap = false;
  let set;
  const Child = () => {
    useState(0);
    return h('i', {}, []);
  };
  const App = () => {
    if (!swap) {
      const [v, s] = useState(5);
      set = s;
      useMemo(() => 1, []);
      return h('p', {}, [v]);
    }
    useMemo(() => 1, []);
    useState(5);
    return h('p', {}, ['x', h(Child, {})]);
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  const saved = set;
  swap = true;
  assert.throws(() => fc.update(), /root/);
  swap = false;
  saved(6);
  fc.update();
  assert.equal(container.textContent, '6');
});

test('F2: a failed first mount leaves no hook count behind (the next mount compares nothing)', () => {
  const { container } = setup();
  let fail = true;
  const App = () => {
    useState(0);
    if (fail) {
      useState(1);
      throw new Error('first mount fails');
    }
    return h('p', {}, ['ok']);
  };
  const fc = new FunctionComponent(App);
  assert.throws(() => fc.mount(container), /first mount fails/);
  fail = false;
  assert.doesNotThrow(() => fc.mount(container));
  assert.equal(container.textContent, 'ok');
});

// Orchestrator's choice for F5 (the spec does not say; his "전부 고쳐" 11-09): an effect slot thrown away by an order
// change gets its cleanup called after patch, before that render's effects run (like React's unmount cleanup).
test('F5: an effect slot replaced by an order change gets its cleanup, after patch, so nothing leaks', (t) => {
  quiet(t);
  const { container } = setup();
  let live = 0;
  let swap = false;
  const seen = [];
  const resource = () => {
    live += 1;
    seen.push(`setup, screen ${container.textContent}`);
    return () => {
      live -= 1;
      seen.push(`cleanup, screen ${container.textContent}`);
    };
  };
  const App = () => {
    if (!swap) {
      useState(0);
      useEffect(resource, []);
      return h('p', {}, ['a']);
    }
    useEffect(resource, []);
    useState(0);
    return h('p', {}, ['b']);
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  assert.equal(live, 1);
  swap = true;
  fc.update();
  assert.equal(live, 1);
  assert.deepEqual(seen, ['setup, screen a', 'cleanup, screen b', 'setup, screen b']);
});

test('F5: if the render that replaced an effect slot fails, the old effect is NOT cleaned up (it is still live)', (t) => {
  quiet(t);
  const { container } = setup();
  let live = 0;
  let swap = false;
  const resource = () => {
    live += 1;
    return () => {
      live -= 1;
    };
  };
  const Child = () => {
    useState(0);
    return h('i', {}, []);
  };
  const App = () => {
    if (!swap) {
      useState(0);
      useEffect(resource, []);
      return h('p', {}, ['a']);
    }
    useEffect(resource, []);
    useState(0);
    return h('p', {}, [h(Child, {})]);
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  swap = true;
  assert.throws(() => fc.update(), /root/);
  assert.equal(live, 1);
  swap = false;
  fc.update(); // back to the original order: the original effect slot is intact, deps [] → no rerun
  assert.equal(live, 1);
});
