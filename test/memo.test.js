// Tests for feature 19: useMemo. Spec-draft §4-6 (Q7), §4-8, §4-4 (pointer comparison). Written by the orchestrator
// (Opus) BEFORE the implementation.
//   §4-6 "App() 안에서 useMemo를 부르는 그 자리에서 계산하거나 기억해 둔 값을 꺼낸다. 지켜볼 값이 같으면 기억해 둔 값,
//         다르면 다시 계산." (unlike useEffect, which runs after patch)
//   §4-8 "목록 없는 useMemo(fn)은 그릴 때마다 다시 계산한다." (AI candidate he accepted)
//   §4-4 / §4-5 deps are compared item by item with Object.is (pointer comparison), same as useEffect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { h } from '../src/h.js';
import { FunctionComponent, useState, useEffect, useMemo } from '../src/component.js';

function setup() {
  const { window } = new JSDOM('<!DOCTYPE html><body><div id="c"></div></body>');
  return { container: window.document.getElementById('c') };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

// A component with two states and one memo whose deps are listFor(n, other).
function memoProbe(listFor) {
  const t = { computes: 0, values: [] };
  t.App = () => {
    const [n, setN] = useState(1);
    const [other, setOther] = useState(0);
    t.setN = setN;
    t.setOther = setOther;
    const doubled = useMemo(() => {
      t.computes += 1;
      return n * 2;
    }, listFor(n, other));
    t.values.push(doubled);
    return h('p', {}, [doubled]);
  };
  return t;
}

test('first render: useMemo calls fn right there and returns its value (usable in the same render)', () => {
  const { container } = setup();
  const t = memoProbe((n) => [n]);
  new FunctionComponent(t.App).mount(container);
  assert.equal(t.computes, 1);
  assert.equal(container.textContent, '2');
});

test('it is computed during render, before the component returns (not after patch like useEffect)', () => {
  const { container } = setup();
  const log = [];
  const App = () => {
    useEffect(() => log.push('effect'));
    const v = useMemo(() => {
      log.push('memo');
      return 1;
    }, []);
    log.push(`render got ${v}`);
    return h('p');
  };
  new FunctionComponent(App).mount(container);
  assert.deepEqual(log, ['memo', 'render got 1', 'effect']);
});

test('[n]: a re-render with n unchanged returns the remembered value without calling fn', async () => {
  const { container } = setup();
  const t = memoProbe((n) => [n]);
  new FunctionComponent(t.App).mount(container);
  t.setOther(1);
  await settle();
  assert.equal(t.computes, 1);
  assert.deepEqual(t.values, [2, 2]);
});

test('[n]: n changed → fn is called again and the new value is returned', async () => {
  const { container } = setup();
  const t = memoProbe((n) => [n]);
  new FunctionComponent(t.App).mount(container);
  t.setN(5);
  await settle();
  assert.equal(t.computes, 2);
  assert.equal(container.textContent, '10');
});

test('[] → computed once, never again', async () => {
  const { container } = setup();
  const t = memoProbe(() => []);
  new FunctionComponent(t.App).mount(container);
  t.setN(5);
  await settle();
  t.setOther(1);
  await settle();
  assert.equal(t.computes, 1);
  assert.equal(container.textContent, '2'); // stale on purpose: [] promised "never changes"
});

test('no deps list → computed on every render (§4-8)', async () => {
  const { container } = setup();
  const t = memoProbe(() => undefined);
  new FunctionComponent(t.App).mount(container);
  t.setOther(1);
  await settle();
  t.setOther(2);
  await settle();
  assert.equal(t.computes, 3);
});

test('[n, other] → recomputed when either changes', async () => {
  const { container } = setup();
  const t = memoProbe((n, other) => [n, other]);
  new FunctionComponent(t.App).mount(container);
  t.setOther(1);
  await settle();
  t.setN(3);
  await settle();
  assert.equal(t.computes, 3);
});

test('the remembered value is the SAME object (pointer) while deps are unchanged', async () => {
  const { container } = setup();
  const seen = [];
  let setOther;
  const App = () => {
    const [n] = useState(1);
    const [o, setO] = useState(0);
    setOther = setO;
    const obj = useMemo(() => ({ n }), [n]);
    seen.push(obj);
    return h('p', {}, [o]);
  };
  new FunctionComponent(App).mount(container);
  setOther(1);
  await settle();
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1]);
});

test('the Q5-5 trap: deps compared by pointer, so pushing into the same array keeps the old count', async () => {
  const { container } = setup();
  let todos;
  let setOther;
  let setTodos;
  const App = () => {
    const [list, setList] = useState(['밥']);
    const [o, setO] = useState(0);
    todos = list;
    setTodos = setList;
    setOther = setO;
    const count = useMemo(() => list.length, [list]);
    return h('p', {}, [`${count}/${o}`]);
  };
  new FunctionComponent(App).mount(container);
  todos.push('국'); // same pointer
  setOther(1); // re-render for another reason
  await settle();
  assert.equal(container.textContent, '1/1'); // memo did not see the push
  setTodos([...todos]); // new pointer
  await settle();
  assert.equal(container.textContent, '2/1');
});

test('NaN in deps counts as unchanged (Object.is)', async () => {
  const { container } = setup();
  let computes = 0;
  let set;
  const App = () => {
    const [n, setN] = useState(0);
    set = setN;
    useMemo(() => {
      computes += 1;
    }, [NaN]);
    return h('p', {}, [n]);
  };
  new FunctionComponent(App).mount(container);
  set(1);
  await settle();
  assert.equal(computes, 1);
});

test('fn may return undefined; that value is remembered too (not recomputed)', async () => {
  const { container } = setup();
  let computes = 0;
  let set;
  const App = () => {
    const [n, setN] = useState(0);
    set = setN;
    const v = useMemo(() => {
      computes += 1;
      return undefined;
    }, []);
    return h('p', {}, [String(v), n]);
  };
  new FunctionComponent(App).mount(container);
  set(1);
  await settle();
  assert.equal(computes, 1);
});

test('useMemo shares the hooks array by call order; its slot has kind "memo"', () => {
  const { container } = setup();
  const App = () => {
    useState(0);
    useMemo(() => 1, []);
    useEffect(() => {}, []);
    useMemo(() => 2);
    return h('p');
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  assert.deepEqual(
    fc.hooks.map((s) => s.kind),
    ['state', 'memo', 'effect', 'memo'],
  );
});

test('useMemo outside a component render throws', () => {
  assert.throws(() => useMemo(() => 1, []));
});
