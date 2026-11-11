// Tests for feature 15: events. Spec-draft §4-2 (Q2, his choice "2번", the Preact way) and §4-8:
//   "VDOM 노드에 이벤트 칸을 따로 둔다. 실제 노드에는 중계 함수를 처음 한 번만 붙이고, 다시 그릴 때는 저장된 함수만
//    새것으로 바꾼다. diff는 이벤트를 바뀜으로 내놓지 않는다."
//   "이벤트가 새로 생기거나 없어지면 patch가 조용히 중계 함수를 붙이거나 포인터를 비운다."
// Written by the orchestrator (Opus) BEFORE the implementation.
//
// Contract pinned here:
//   - render.js: drawing an element whose VDOM has `events` attaches one relay listener per event type.
//   - src/core/events.js exports syncEvents(container, root): after patch, walk the new root VDOM and the container's DOM
//     side by side (실제 영역 is always drawn from a VDOM, so child indexes match) and point each element's stored
//     handler at the new function — adding a relay for a type seen for the first time, emptying the pointer for a
//     type that is gone. It never calls addEventListener for a type that already has a relay on that element.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { h } from '../src/component/h.js';
import { diff } from '../src/core/diff.js';
import { patch } from '../src/core/patch.js';
import { renderInto, vdomToDom } from '../src/core/render.js';
import { syncEvents } from '../src/core/events.js';

function setup() {
  const { window } = new JSDOM('<!DOCTYPE html><body><div id="c"></div></body>');
  const doc = window.document;
  return { doc, window, container: doc.getElementById('c') };
}

const click = (el, window) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// Count addEventListener calls on every element under `root` from now on.
function countListeners(root) {
  const counts = { n: 0 };
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const orig = el.addEventListener.bind(el);
    el.addEventListener = (...args) => {
      counts.n++;
      return orig(...args);
    };
  }
  return counts;
}

// The full loop one render does in Phase 2 (§4-8: expand before diff, then Phase 1 diff + patch, then events).
function rerender(container, oldRoot, newRoot, doc) {
  patch(container, diff(oldRoot, newRoot), doc);
  syncEvents(container, newRoot);
}

// ---------- drawing ----------

test('a drawn element with an onClick handler calls it on click, with the event', () => {
  const { doc, window } = setup();
  const seen = [];
  const el = vdomToDom(h('button', { onClick: (e) => seen.push(e.type) }, ['+']), doc);
  click(el, window);
  assert.deepEqual(seen, ['click']);
});

test('several event types on one element each reach their own handler', () => {
  const { doc, window } = setup();
  const seen = [];
  const el = vdomToDom(h('input', { onInput: () => seen.push('input'), onFocus: () => seen.push('focus') }), doc);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.FocusEvent('focus'));
  assert.deepEqual(seen, ['input', 'focus']);
});

test('handlers deep inside the tree are attached when the whole tree is drawn', () => {
  const { doc, window, container } = setup();
  let hit = 0;
  const root = h('div', {}, [h('ul', {}, [h('li', {}, [h('button', { onClick: () => hit++ }, ['x'])])])]);
  renderInto(container, root, doc, { keys: false });
  click(container.querySelector('button'), window);
  assert.equal(hit, 1);
});

test('events are not written as attributes on the real element', () => {
  const { doc } = setup();
  const el = vdomToDom(h('button', { onClick: () => {}, class: 'big' }), doc);
  assert.equal(el.getAttribute('onclick'), null);
  assert.deepEqual(
    [...el.attributes].map((a) => a.name),
    ['class'],
  );
});

test('an element with no events still draws exactly as in Phase 1', () => {
  const { doc } = setup();
  const el = vdomToDom(h('p', { class: 'msg' }, ['hi ', h('b', {}, ['there'])]), doc);
  assert.equal(el.outerHTML, '<p class="msg">hi <b>there</b></p>');
});

// ---------- re-render: swap the pointer, keep the relay (§4-2) ----------

test('after re-render the NEW handler runs, not the old one (the F0 problem from Q2)', () => {
  const { doc, window, container } = setup();
  const calls = [];
  const v0 = h('div', {}, [h('button', { onClick: () => calls.push('F0') }, ['0'])]);
  const v1 = h('div', {}, [h('button', { onClick: () => calls.push('F1') }, ['0'])]);
  renderInto(container, v0, doc, { keys: false });
  rerender(container, v0, v1, doc);
  click(container.querySelector('button'), window);
  assert.deepEqual(calls, ['F1']);
});

test('re-render does not add a second listener for a type the element already has (relay attached once)', () => {
  const { doc, window, container } = setup();
  const calls = [];
  const v0 = h('div', {}, [h('button', { onClick: () => calls.push('F0') }, ['0'])]);
  renderInto(container, v0, doc, { keys: false });
  const counts = countListeners(container);
  const v1 = h('div', {}, [h('button', { onClick: () => calls.push('F1') }, ['0'])]);
  const v2 = h('div', {}, [h('button', { onClick: () => calls.push('F2') }, ['0'])]);
  rerender(container, v0, v1, doc);
  rerender(container, v1, v2, doc);
  assert.equal(counts.n, 0);
  click(container.querySelector('button'), window);
  assert.deepEqual(calls, ['F2']); // one click → exactly one call
});

test('the button element itself is kept across re-renders (patch changed only its text)', () => {
  const { doc, container } = setup();
  const v0 = h('div', {}, [h('button', { onClick: () => {} }, ['0'])]);
  const v1 = h('div', {}, [h('button', { onClick: () => {} }, ['1'])]);
  renderInto(container, v0, doc, { keys: false });
  const before = container.querySelector('button');
  rerender(container, v0, v1, doc);
  assert.equal(container.querySelector('button'), before);
  assert.equal(before.textContent, '1');
});

test('a counter built with closures keeps counting (does not get stuck at 1, Q2)', () => {
  const { doc, window, container } = setup();
  let state = 0;
  const view = (count) => h('div', {}, [h('button', { onClick: () => (state = count + 1) }, [count])]);
  let current = view(state);
  renderInto(container, current, doc, { keys: false });
  for (let i = 0; i < 3; i++) {
    click(container.querySelector('button'), window);
    const next = view(state);
    rerender(container, current, next, doc);
    current = next;
  }
  assert.equal(state, 3);
  assert.equal(container.querySelector('button').textContent, '3');
});

// ---------- events that appear or disappear (§4-8) ----------

test('a handler that appears on an element drawn without one starts working after re-render', () => {
  const { doc, window, container } = setup();
  let hit = 0;
  const v0 = h('div', {}, [h('button', {}, ['x'])]);
  const v1 = h('div', {}, [h('button', { onClick: () => hit++ }, ['x'])]);
  renderInto(container, v0, doc, { keys: false });
  rerender(container, v0, v1, doc);
  click(container.querySelector('button'), window);
  assert.equal(hit, 1);
});

test('a handler that disappears stops being called (pointer emptied), and clicking does not throw', () => {
  const { doc, window, container } = setup();
  let hit = 0;
  const v0 = h('div', {}, [h('button', { onClick: () => hit++ }, ['x'])]);
  const v1 = h('div', {}, [h('button', {}, ['x'])]);
  renderInto(container, v0, doc, { keys: false });
  rerender(container, v0, v1, doc);
  assert.doesNotThrow(() => click(container.querySelector('button'), window));
  assert.equal(hit, 0);
});

test('one event type removed, another kept on the same element', () => {
  const { doc, window, container } = setup();
  const seen = [];
  const v0 = h('div', {}, [h('input', { onInput: () => seen.push('in0'), onFocus: () => seen.push('fo0') })]);
  const v1 = h('div', {}, [h('input', { onFocus: () => seen.push('fo1') })]);
  renderInto(container, v0, doc, { keys: false });
  rerender(container, v0, v1, doc);
  const el = container.querySelector('input');
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.FocusEvent('focus'));
  assert.deepEqual(seen, ['fo1']);
});

// ---------- nodes created by patch ----------

test('an element inserted by patch gets its handler', () => {
  const { doc, window, container } = setup();
  const seen = [];
  const item = (id) => h('li', { key: id }, [h('button', { onClick: () => seen.push(id) }, [id])]);
  const v0 = h('div', {}, [h('ul', {}, [item('a')])]);
  const v1 = h('div', {}, [h('ul', {}, [item('x'), item('a')])]);
  renderInto(container, v0, doc, { keys: false });
  rerender(container, v0, v1, doc);
  const buttons = container.querySelectorAll('button');
  click(buttons[0], window);
  click(buttons[1], window);
  assert.deepEqual(seen, ['x', 'a']);
});

test('an element replaced by patch (tag changed) gets the new handler, the old one is gone', () => {
  const { doc, window, container } = setup();
  const seen = [];
  const v0 = h('div', {}, [h('button', { onClick: () => seen.push('button') }, ['x'])]);
  const v1 = h('div', {}, [h('a', { onClick: () => seen.push('a') }, ['x'])]);
  renderInto(container, v0, doc, { keys: false });
  rerender(container, v0, v1, doc);
  assert.equal(container.querySelector('button'), null);
  click(container.querySelector('a'), window);
  assert.deepEqual(seen, ['a']);
});

test('after a keyed move, each moved element calls its own new handler', () => {
  const { doc, window, container } = setup();
  const seen = [];
  const item = (id, round) => h('li', { key: id, onClick: () => seen.push(`${id}${round}`) }, [id]);
  const v0 = h('div', {}, [h('ul', {}, [item('a', 0), item('b', 0), item('c', 0)])]);
  const v1 = h('div', {}, [h('ul', {}, [item('c', 1), item('a', 1), item('b', 1)])]);
  renderInto(container, v0, doc, { keys: false });
  rerender(container, v0, v1, doc);
  for (const li of container.querySelectorAll('li')) click(li, window);
  assert.deepEqual(seen, ['c1', 'a1', 'b1']);
});

test('syncEvents does not change the DOM structure or attributes', () => {
  const { doc, container } = setup();
  const v0 = h('div', {}, [h('p', { class: 'a', onClick: () => {} }, ['hi'])]);
  renderInto(container, v0, doc, { keys: false });
  const html = container.innerHTML;
  syncEvents(container, h('div', {}, [h('p', { class: 'a', onClick: () => {} }, ['hi'])]));
  assert.equal(container.innerHTML, html);
});

test('syncEvents on a tree with no events at all is harmless', () => {
  const { doc, container } = setup();
  const v0 = h('div', {}, [h('p', {}, ['hi']), 'text']);
  renderInto(container, v0, doc, { keys: false });
  assert.doesNotThrow(() => syncEvents(container, v0));
});
