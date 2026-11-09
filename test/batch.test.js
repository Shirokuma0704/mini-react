// Tests for feature 17: batching. Spec-draft §4-4 (Q5, Q5-1 → Q5-2):
//   "set을 여러 번 불러도 한 번만 그린다(묶기)."
//   "묶는 시점은 지금 하던 JS 일이 끝난 직후(마이크로태스크). 첫 set이 update()를 예약하고 나머지는 표시만 한다."
//   (He first chose "when the relay function ends", then switched because a timer's set is not wrapped by the relay:
//    "외부호출은생각 못했네".)
// Written by the orchestrator (Opus) BEFORE the implementation.
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
const afterMicrotask = () => new Promise((r) => queueMicrotask(r));
const click = (el, window) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// A component that counts its own runs and exposes its setters.
function probe() {
  const p = { runs: 0 };
  p.App = () => {
    p.runs += 1;
    const [a, setA] = useState(0);
    const [b, setB] = useState(0);
    p.setA = setA;
    p.setB = setB;
    return h('p', {}, [`${a},${b}`]);
  };
  return p;
}

test('two different states set in one click → one re-render showing both (Q5)', async () => {
  const { container, window } = setup();
  let runs = 0;
  const App = () => {
    runs += 1;
    const [count, setCount] = useState(0);
    const [likes, setLikes] = useState(0);
    return h(
      'button',
      {
        onClick: () => {
          setCount(count + 1);
          setLikes(likes + 1);
        },
      },
      [`${count}/${likes}`],
    );
  };
  new FunctionComponent(App).mount(container);
  click(container.querySelector('button'), window);
  await settle();
  assert.equal(runs, 2); // mount + ONE re-render
  assert.equal(container.textContent, '1/1');
});

test('setCount(c => c + 1) twice in one click → one re-render, value +2', async () => {
  const { container, window } = setup();
  let runs = 0;
  const App = () => {
    runs += 1;
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
  assert.equal(runs, 2);
  assert.equal(container.textContent, '7');
});

test('the screen does NOT change synchronously inside the set call', () => {
  const { container } = setup();
  const p = probe();
  new FunctionComponent(p.App).mount(container);
  p.setA(1);
  assert.equal(container.textContent, '0,0');
  assert.equal(p.runs, 1);
});

test('the re-render happens right after the current JS work (one microtask turn), before any timer', async () => {
  const { container } = setup();
  const p = probe();
  new FunctionComponent(p.App).mount(container);
  p.setA(1);
  await afterMicrotask(); // queued after the library's own microtask
  assert.equal(container.textContent, '1,0');
  assert.equal(p.runs, 2);
});

test('sets made outside any event handler (in a timer) are batched too (Q5-2)', async () => {
  const { container } = setup();
  const p = probe();
  new FunctionComponent(p.App).mount(container);
  await new Promise((resolve) =>
    setTimeout(() => {
      p.setA(1);
      p.setB(2);
      p.setA((a) => a + 10);
      resolve();
    }, 0),
  );
  await settle();
  assert.equal(p.runs, 2);
  assert.equal(container.textContent, '11,2');
});

test('many sets in a row, plain code (no event at all) → still exactly one re-render', async () => {
  const { container } = setup();
  const p = probe();
  new FunctionComponent(p.App).mount(container);
  for (let i = 1; i <= 50; i++) p.setA(i);
  await settle();
  assert.equal(p.runs, 2);
  assert.equal(container.textContent, '50,0');
});

test('two batches in two separate turns → two re-renders', async () => {
  const { container } = setup();
  const p = probe();
  new FunctionComponent(p.App).mount(container);
  p.setA(1);
  p.setB(1);
  await settle();
  p.setA(2);
  p.setB(2);
  await settle();
  assert.equal(p.runs, 3);
  assert.equal(container.textContent, '2,2');
});

test('only same-value sets → no re-render at all (§4-4 skip still works with batching)', async () => {
  const { container } = setup();
  const p = probe();
  new FunctionComponent(p.App).mount(container);
  p.setA(0);
  p.setB((b) => b);
  await settle();
  assert.equal(p.runs, 1);
});

test('a same-value set mixed with a real change → one re-render', async () => {
  const { container } = setup();
  const p = probe();
  new FunctionComponent(p.App).mount(container);
  p.setA(0); // same
  p.setB(3); // changed
  await settle();
  assert.equal(p.runs, 2);
  assert.equal(container.textContent, '0,3');
});

test('each mounted component batches on its own', async () => {
  const { container, other } = setup();
  const p = probe();
  const q = probe();
  new FunctionComponent(p.App).mount(container);
  new FunctionComponent(q.App).mount(other);
  p.setA(1);
  q.setA(7);
  p.setB(1);
  await settle();
  assert.equal(p.runs, 2);
  assert.equal(q.runs, 2);
  assert.equal(container.textContent, '1,1');
  assert.equal(other.textContent, '7,0');
});

test('a set made during the re-render work of a batch schedules another re-render (not lost)', async () => {
  const { container } = setup();
  let runs = 0;
  let setLater;
  const App = () => {
    runs += 1;
    const [v, setV] = useState(0);
    setLater = setV;
    return h('p', {}, [v]);
  };
  new FunctionComponent(App).mount(container);
  setLater(1);
  await afterMicrotask(); // batch 1 has run → shows 1
  setLater(2); // new set after the batch → a new re-render must be scheduled
  await settle();
  assert.equal(container.textContent, '2');
  assert.equal(runs, 3);
});

test('update() called directly still re-renders synchronously (only set is batched)', () => {
  const { container } = setup();
  let n = 0;
  const fc = new FunctionComponent(() => h('p', {}, [++n]));
  fc.mount(container);
  fc.update();
  assert.equal(container.textContent, '2');
});
