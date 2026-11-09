// Tests for feature 16: FunctionComponent + mount() / update() + useState. Spec-draft §4-3, §4-4, §4-8.
// Written by the orchestrator (Opus) BEFORE the implementation.
//
// Assignment (fixed): a FunctionComponent class wraps a function component; it has a `hooks` array, mount() (first
// render) and update() (re-render after a state change). Re-rendering goes through Phase 1's diff → patch.
// His decisions pinned here:
//   §4-3 "상태는 함수 바깥 hooks 배열에 두고, useState는 '몇 번째로 불렸나'로 자기 칸을 찾는다."
//   §4-3 "mount()와 update()가 App()을 부르기 직전에 번호(cursor)를 0으로 되돌린다."
//   §4-4 "set은 값과 함수를 둘 다 받는다. 함수면 최신 값을 넣어 부른다."
//   §4-4 "지금과 같은 값이면 다시 그리지 않고 건너뛴다." / "'같다'는 포인터 비교다."
//   §4-8 "new FunctionComponent(App).mount(그릴_곳)" ; "set이 불리면 루트부터 전부 다시 실행하고, diff가 바뀐 곳만 patch"
//
// WHEN the re-render happens after a set is feature 17 (batching in a microtask). These tests do not care: they
// always wait with `await settle()` (a macrotask, so every microtask has run) before looking at the screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { h } from '../src/h.js';
import { FunctionComponent, useState } from '../src/component.js';

function setup() {
  const { window } = new JSDOM('<!DOCTYPE html><body><div id="c"></div><div id="d"></div></body>');
  const doc = window.document;
  return { doc, window, container: doc.getElementById('c'), other: doc.getElementById('d') };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const click = (el, window) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// ---------- mount ----------

test('mount draws the component into the container (its output, not a wrapper)', () => {
  const { container } = setup();
  const App = () => h('p', { class: 'msg' }, ['hi']);
  new FunctionComponent(App).mount(container);
  assert.equal(container.innerHTML, '<p class="msg">hi</p>');
});

test('mount unrolls child components (h(Child, props)) before drawing', () => {
  const { container } = setup();
  const Item = (p) => h('li', {}, [p.text]);
  const App = () => h('ul', {}, ['밥', '국'].map((t) => h(Item, { text: t })));
  new FunctionComponent(App).mount(container);
  assert.equal(container.innerHTML, '<ul><li>밥</li><li>국</li></ul>');
});

test('mount: keys are not drawn into the real DOM (§3-3 Q12)', () => {
  const { container } = setup();
  const App = () => h('ul', {}, [h('li', { key: 'a' }, ['a'])]);
  new FunctionComponent(App).mount(container);
  assert.equal(container.innerHTML, '<ul><li>a</li></ul>');
});

test('mount: a root component that returns null draws nothing and does not throw', () => {
  const { container } = setup();
  container.innerHTML = '<span>old</span>';
  new FunctionComponent(() => null).mount(container);
  assert.equal(container.innerHTML, '');
});

test('a FunctionComponent has a hooks array', () => {
  const fc = new FunctionComponent(() => h('p'));
  assert.ok(Array.isArray(fc.hooks));
});

// ---------- useState: first value, state kept across renders (§4-3) ----------

test('useState returns [initial value, setter] on the first render', () => {
  const { container } = setup();
  let got;
  const App = () => {
    got = useState(5);
    return h('p', {}, [got[0]]);
  };
  new FunctionComponent(App).mount(container);
  assert.equal(got[0], 5);
  assert.equal(typeof got[1], 'function');
  assert.equal(container.textContent, '5');
});

test('the counter: clicking +1 three times shows 3', async () => {
  const { container, window } = setup();
  const App = () => {
    const [count, setCount] = useState(0);
    return h('button', { onClick: () => setCount(count + 1) }, [count]);
  };
  new FunctionComponent(App).mount(container);
  for (let i = 0; i < 3; i++) {
    click(container.querySelector('button'), window);
    await settle();
  }
  assert.equal(container.textContent, '3');
});

test('state lives in the hooks array, not in the function (the component is called again on each render)', async () => {
  const { container } = setup();
  let calls = 0;
  let set;
  const App = () => {
    calls++;
    const [v, setV] = useState('a');
    set = setV;
    return h('p', {}, [v]);
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  set('b');
  await settle();
  assert.equal(calls, 2);
  assert.equal(container.textContent, 'b');
  assert.equal(fc.hooks.length, 1);
});

test('two useState(0) calls get two different slots by call order (count vs likes, Q3)', async () => {
  const { container, window } = setup();
  const App = () => {
    const [count, setCount] = useState(0);
    const [likes, setLikes] = useState(0);
    return h('div', {}, [
      h('button', { id: 'c', onClick: () => setCount(count + 1) }, [count]),
      h('button', { id: 'l', onClick: () => setLikes(likes + 10) }, [likes]),
    ]);
  };
  new FunctionComponent(App).mount(container);
  click(container.querySelector('#c'), window);
  await settle();
  click(container.querySelector('#c'), window);
  await settle();
  click(container.querySelector('#l'), window);
  await settle();
  assert.equal(container.querySelector('#c').textContent, '2');
  assert.equal(container.querySelector('#l').textContent, '10');
});

test('the initial value is used only on the first render', async () => {
  const { container } = setup();
  let set;
  let initArg = 100;
  const App = () => {
    const [v, setV] = useState(initArg);
    set = setV;
    return h('p', {}, [v]);
  };
  new FunctionComponent(App).mount(container);
  initArg = 999;
  set(7);
  await settle();
  assert.equal(container.textContent, '7');
});

// ---------- update(): through diff → patch, only what changed (§4-8) ----------

test('re-render patches only what changed: the same <button> element is kept', async () => {
  const { container, window } = setup();
  const App = () => {
    const [count, setCount] = useState(0);
    return h('div', {}, [h('h1', {}, ['카운터']), h('button', { onClick: () => setCount(count + 1) }, [count])]);
  };
  new FunctionComponent(App).mount(container);
  const button = container.querySelector('button');
  const title = container.querySelector('h1');
  click(button, window);
  await settle();
  assert.equal(container.querySelector('button'), button);
  assert.equal(container.querySelector('h1'), title);
  assert.equal(button.textContent, '1');
});

test('update() can be called directly and re-runs the component', () => {
  const { container } = setup();
  let n = 0;
  const App = () => h('p', {}, [++n]);
  const fc = new FunctionComponent(App);
  fc.mount(container);
  fc.update();
  assert.equal(container.textContent, '2');
});

test('a keyed list that grows at the front reuses the old <li> elements', async () => {
  const { container, window } = setup();
  const App = () => {
    const [items, setItems] = useState(['a', 'b']);
    return h('div', {}, [
      h('button', { onClick: () => setItems(['x', ...items]) }, ['add']),
      h('ul', {}, items.map((t) => h('li', { key: t }, [t]))),
    ]);
  };
  new FunctionComponent(App).mount(container);
  const [liA, liB] = container.querySelectorAll('li');
  click(container.querySelector('button'), window);
  await settle();
  const lis = container.querySelectorAll('li');
  assert.deepEqual([...lis].map((li) => li.textContent), ['x', 'a', 'b']);
  assert.equal(lis[1], liA);
  assert.equal(lis[2], liB);
});

// ---------- set: value or updater function (§4-4 Q5-3, Q5-4) ----------

test('set(fn) calls fn with the latest value: two setCount(c => c + 1) in one click add 2', async () => {
  const { container, window } = setup();
  const App = () => {
    const [count, setCount] = useState(5);
    return h(
      'button',
      {
        onClick: () => {
          setCount((c) => c + 1);
          setCount((c) => c + 1);
        },
      },
      [count],
    );
  };
  new FunctionComponent(App).mount(container);
  click(container.querySelector('button'), window);
  await settle();
  assert.equal(container.textContent, '7');
});

test('set(value) twice with count + 1 in one click adds only 1 (the closure keeps the old count, Q5-3)', async () => {
  const { container, window } = setup();
  const App = () => {
    const [count, setCount] = useState(5);
    return h(
      'button',
      {
        onClick: () => {
          setCount(count + 1);
          setCount(count + 1);
        },
      },
      [count],
    );
  };
  new FunctionComponent(App).mount(container);
  click(container.querySelector('button'), window);
  await settle();
  assert.equal(container.textContent, '6');
});

// ---------- same value → skip (§4-4 Q5-4, Q5-5) ----------

test('setting the same value does not re-render (the component is not called again)', async () => {
  const { container } = setup();
  let calls = 0;
  let set;
  const App = () => {
    calls++;
    const [v, setV] = useState(3);
    set = setV;
    return h('p', {}, [v]);
  };
  new FunctionComponent(App).mount(container);
  set(3);
  await settle();
  set((x) => x);
  await settle();
  assert.equal(calls, 1);
});

test('"same" is pointer comparison: pushing into the same array and setting it does not re-render (Q5-5)', async () => {
  const { container } = setup();
  let calls = 0;
  let todos;
  let setTodos;
  const App = () => {
    calls++;
    [todos, setTodos] = useState(['밥']);
    return h('ul', {}, todos.map((t) => h('li', {}, [t])));
  };
  new FunctionComponent(App).mount(container);
  todos.push('국');
  setTodos(todos);
  await settle();
  assert.equal(calls, 1);
  assert.equal(container.querySelectorAll('li').length, 1);
});

test('a NEW array with the same contents does re-render ([...todos, x] is the way, Q5-5)', async () => {
  const { container } = setup();
  let todos;
  let setTodos;
  const App = () => {
    [todos, setTodos] = useState(['밥']);
    return h('ul', {}, todos.map((t) => h('li', {}, [t])));
  };
  new FunctionComponent(App).mount(container);
  setTodos([...todos, '국']);
  await settle();
  assert.equal(container.querySelectorAll('li').length, 2);
});

test('NaN set to NaN counts as the same value (no re-render)', async () => {
  const { container } = setup();
  let calls = 0;
  let set;
  const App = () => {
    calls++;
    const [v, setV] = useState(NaN);
    set = setV;
    return h('p', {}, [String(v)]);
  };
  new FunctionComponent(App).mount(container);
  set(NaN);
  await settle();
  assert.equal(calls, 1);
});

// ---------- several components on one page ----------

test('two mounted components keep separate hooks', async () => {
  const { container, other, window } = setup();
  const Counter = () => {
    const [n, setN] = useState(0);
    return h('button', { onClick: () => setN(n + 1) }, [n]);
  };
  new FunctionComponent(Counter).mount(container);
  new FunctionComponent(Counter).mount(other);
  click(container.querySelector('button'), window);
  await settle();
  click(container.querySelector('button'), window);
  await settle();
  click(other.querySelector('button'), window);
  await settle();
  assert.equal(container.textContent, '2');
  assert.equal(other.textContent, '1');
});
