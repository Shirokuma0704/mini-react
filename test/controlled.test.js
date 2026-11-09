// Tests for feature 21: form controls follow state. Spec-draft §4-10 (11-09 evening grill Q1~Q3, after a code review
// found that patch only changed the value/checked ATTRIBUTE, which a box the user has typed in ignores):
//   "입력칸의 value는 다시 그릴 때마다 state를 따른다." ("가아니야?", Q1)
//   "체크박스 checked, textarea의 value도 같은 규칙이다." ("가 아닐까?", Q2) + select value (orchestrator's addition)
//   "state를 따르는 칸에 onInput 없이 치면 바로 state 값으로 되돌아간다(잠긴 칸)." (Q3, React's way)
//   "value·checked를 아예 안 준 칸은 사용자 몫이다. 잠그지 않는다." (orchestrator's addition)
// Written by the orchestrator (Opus) BEFORE the implementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { h } from '../src/h.js';
import { FunctionComponent, useState } from '../src/component.js';
import { htmlToVdom, renderInto } from '../src/render.js';

function setup() {
  const { window } = new JSDOM('<!DOCTYPE html><body><div id="c"></div></body>');
  const doc = window.document;
  return { doc, window, container: doc.getElementById('c') };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
// What a user's keystroke does: the browser changes the live value, then fires "input".
const type = (el, text, window) => {
  el.value = text;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};
// What picking an option does: the live value changes, then "input" and "change".
const pick = (el, value, window) => {
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const click = (el, window) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// ---------- input value ----------

test('Q1: a "clear" button empties an input the user has typed in', async () => {
  const { container, window } = setup();
  const App = () => {
    const [text, setText] = useState('abc');
    return h('div', {}, [
      h('input', { value: text, onInput: (e) => setText(e.target.value) }),
      h('button', { onClick: () => setText('') }, ['지우기']),
    ]);
  };
  new FunctionComponent(App).mount(container);
  const input = container.querySelector('input');
  assert.equal(input.value, 'abc');
  type(input, '안녕', window);
  await settle();
  assert.equal(input.value, '안녕');
  click(container.querySelector('button'), window);
  await settle();
  assert.equal(input.value, '');
});

test('Q1: a value set from state reaches the box even when it is not the first value (set from outside)', async () => {
  const { container, window } = setup();
  let set;
  const App = () => {
    const [text, setText] = useState('a');
    set = setText;
    return h('input', { value: text, onInput: (e) => setText(e.target.value) });
  };
  new FunctionComponent(App).mount(container);
  const input = container.querySelector('input');
  type(input, 'typed', window);
  await settle();
  set('from state');
  await settle();
  assert.equal(input.value, 'from state');
});

test('Q3: an input with a value and no onInput is locked: typing goes straight back to the state value', async () => {
  const { container, window } = setup();
  const App = () => h('input', { value: '고정' });
  new FunctionComponent(App).mount(container);
  const input = container.querySelector('input');
  type(input, '고정abc', window);
  await settle();
  assert.equal(input.value, '고정');
});

test('Q3: a handler that keeps the state as it was (max 3 letters) also puts the box back', async () => {
  const { container, window } = setup();
  const App = () => {
    const [text, setText] = useState('abc');
    return h('input', { value: text, onInput: (e) => setText(e.target.value.slice(0, 3)) });
  };
  new FunctionComponent(App).mount(container);
  const input = container.querySelector('input');
  type(input, 'abcd', window); // state stays 'abc' (same value → no re-render at all)
  await settle();
  assert.equal(input.value, 'abc');
});

test('Q3: the lock is not broken by an unrelated re-render either (the box follows state on every render)', async () => {
  const { container, window } = setup();
  let bump;
  const App = () => {
    const [n, setN] = useState(0);
    bump = () => setN((x) => x + 1);
    return h('div', {}, [h('input', { value: 'v' }), h('b', {}, [n])]);
  };
  new FunctionComponent(App).mount(container);
  const input = container.querySelector('input');
  input.value = 'changed without an event'; // e.g. a script, no input event fired
  bump();
  await settle();
  assert.equal(input.value, 'v');
});

// Writing the same value again is harmless, but writing a DIFFERENT value moves the caret to the end (browsers and
// jsdom both do this). So the box must never be written with the old value first and the new value after it.
test('typing in the middle of an accepted controlled input keeps the caret where it was', async () => {
  const { container, window } = setup();
  const App = () => {
    const [text, setText] = useState('abc');
    return h('input', { value: text, onInput: (e) => setText(e.target.value) });
  };
  new FunctionComponent(App).mount(container);
  const input = container.querySelector('input');
  input.focus();
  input.value = 'abXc';
  input.setSelectionRange(3, 3);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await settle();
  assert.equal(input.value, 'abXc');
  assert.equal(input.selectionStart, 3);
});

test('caret test again, with onInput added in a LATER render than the value (listener order must not matter)', async () => {
  const { container, window } = setup();
  let accept = false;
  const App = () => {
    const [text, setText] = useState('abc');
    const props = { value: text };
    if (accept) props.onInput = (e) => setText(e.target.value);
    return h('input', props);
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  accept = true;
  fc.update();
  const input = container.querySelector('input');
  input.focus();
  input.value = 'abXc';
  input.setSelectionRange(3, 3);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await settle();
  assert.equal(input.value, 'abXc');
  assert.equal(input.selectionStart, 3);
});

// ---------- checkbox checked ----------

test('Q2: a controlled checkbox follows state: the user ticks it, then "전부 해제" unticks it', async () => {
  const { container, window } = setup();
  const App = () => {
    const [done, setDone] = useState(false);
    return h('div', {}, [
      h('input', { type: 'checkbox', checked: done, onChange: (e) => setDone(e.target.checked) }),
      h('button', { onClick: () => setDone(false) }, ['전부 해제']),
    ]);
  };
  new FunctionComponent(App).mount(container);
  const box = container.querySelector('input');
  assert.equal(box.checked, false);
  box.click(); // a real click: toggles, then fires click, input, change
  await settle();
  assert.equal(box.checked, true);
  click(container.querySelector('button'), window);
  await settle();
  assert.equal(box.checked, false);
});

test('Q3: a checkbox with checked: false and no handler is locked (stays unticked after a click)', async () => {
  const { container } = setup();
  const App = () => h('input', { type: 'checkbox', checked: false });
  new FunctionComponent(App).mount(container);
  const box = container.querySelector('input');
  box.click();
  await settle();
  assert.equal(box.checked, false);
});

test('Q3: a checkbox with checked: true and no handler is locked too (stays ticked)', async () => {
  const { container } = setup();
  const App = () => h('input', { type: 'checkbox', checked: true });
  new FunctionComponent(App).mount(container);
  const box = container.querySelector('input');
  assert.equal(box.checked, true);
  box.click();
  await settle();
  assert.equal(box.checked, true);
});

test('Q2: checked set to true by state ticks a box the user had unticked', async () => {
  const { container } = setup();
  let set;
  const App = () => {
    const [done, setDone] = useState(true);
    set = setDone;
    return h('input', { type: 'checkbox', checked: done, onChange: (e) => setDone(e.target.checked) });
  };
  new FunctionComponent(App).mount(container);
  const box = container.querySelector('input');
  box.click(); // user unticks → state false
  await settle();
  assert.equal(box.checked, false);
  set(true);
  await settle();
  assert.equal(box.checked, true);
});

// ---------- textarea value ----------

test('Q2: textarea value follows state (shown on mount, typed, then cleared by a button)', async () => {
  const { container, window } = setup();
  const App = () => {
    const [memo, setMemo] = useState('메모');
    return h('div', {}, [
      h('textarea', { value: memo, onInput: (e) => setMemo(e.target.value) }),
      h('button', { onClick: () => setMemo('') }, ['비우기']),
    ]);
  };
  new FunctionComponent(App).mount(container);
  const area = container.querySelector('textarea');
  assert.equal(area.value, '메모');
  type(area, '새 메모', window);
  await settle();
  assert.equal(area.value, '새 메모');
  click(container.querySelector('button'), window);
  await settle();
  assert.equal(area.value, '');
});

test('Q3: a textarea with a value and no onInput is locked', async () => {
  const { container, window } = setup();
  const App = () => h('textarea', { value: '고정' });
  new FunctionComponent(App).mount(container);
  const area = container.querySelector('textarea');
  type(area, '고정!!', window);
  await settle();
  assert.equal(area.value, '고정');
});

// ---------- select value (orchestrator's addition to Q2) ----------

const options = ['a', 'b', 'c'].map((v) => h('option', { value: v }, [v.toUpperCase()]));

test('select value follows state: right on mount (the options exist only after the children are drawn), then by set', async () => {
  const { container, window } = setup();
  const App = () => {
    const [choice, setChoice] = useState('b');
    return h('div', {}, [
      h('select', { value: choice, onChange: (e) => setChoice(e.target.value) }, options),
      h('button', { onClick: () => setChoice('a') }, ['A로']),
    ]);
  };
  new FunctionComponent(App).mount(container);
  const sel = container.querySelector('select');
  assert.equal(sel.value, 'b');
  pick(sel, 'c', window);
  await settle();
  assert.equal(sel.value, 'c');
  click(container.querySelector('button'), window);
  await settle();
  assert.equal(sel.value, 'a');
});

test('a select with a value and no handler is locked', async () => {
  const { container, window } = setup();
  const App = () => h('select', { value: 'b' }, options);
  new FunctionComponent(App).mount(container);
  const sel = container.querySelector('select');
  pick(sel, 'c', window);
  await settle();
  assert.equal(sel.value, 'b');
});

// ---------- boxes without value / checked are the user's ----------

test('an input and a checkbox given no value/checked stay free, even across re-renders', async () => {
  const { container, window } = setup();
  const App = () => {
    const [n, setN] = useState(0);
    return h('div', {}, [
      h('input', {}),
      h('input', { type: 'checkbox' }),
      h('button', { onClick: () => setN(n + 1) }, [n]),
    ]);
  };
  new FunctionComponent(App).mount(container);
  const [text, box] = container.querySelectorAll('input');
  type(text, 'mine', window);
  box.click();
  await settle();
  click(container.querySelector('button'), window);
  await settle();
  assert.equal(container.querySelector('button').textContent, '1');
  assert.equal(text.value, 'mine');
  assert.equal(box.checked, true);
});

// ---------- Phase 1 is out of scope ----------

test('Phase 1 drawing (HTML text → preview) does not lock inputs: §4-10 is about components', async () => {
  const { container, doc, window } = setup();
  renderInto(container, htmlToVdom('<input value="a"><input type="checkbox">', doc), doc, { keys: false });
  const [text, box] = container.querySelectorAll('input');
  type(text, 'ab', window);
  box.click();
  await settle();
  assert.equal(text.value, 'ab');
  assert.equal(box.checked, true);
});
