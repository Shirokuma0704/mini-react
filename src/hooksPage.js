// The hooks check page (hooks.html): small cards where 상철님 presses buttons and checks Phase 2 by eye.
// Not the final demo page (spec §4-9, topic undecided). Each Phase 2 feature adds a card.
//
// "그린 횟수" (render count) is written OUTSIDE the component's container, by a wrapper around the component.
// It is a probe for checking, not part of the component: it shows whether a set really re-ran the component
// (spec §4-4 "같은 값이면 다시 그리지 않고 건너뛴다").
import { h } from './h.js';
import { FunctionComponent, useState } from './component.js';

// Wrap a component so every run bumps a number shown in `out`.
function countRenders(Component, out) {
  let n = 0;
  return (props) => {
    n += 1;
    out.textContent = String(n);
    return Component(props);
  };
}

// ---------- 카운터 (spec §4-3, §4-4) ----------
function Counter() {
  const [count, setCount] = useState(0);
  return h('div', { class: 'demo-row' }, [
    h('output', { class: 'big' }, [count]),
    h('button', { type: 'button', onClick: () => setCount(count + 1) }, ['+1']),
    h(
      'button',
      {
        type: 'button',
        onClick: () => {
          setCount((c) => c + 1);
          setCount((c) => c + 1);
        },
      },
      ['함수로 두 번'],
    ),
    h(
      'button',
      {
        type: 'button',
        onClick: () => {
          setCount(count + 1);
          setCount(count + 1);
        },
      },
      ['값으로 두 번'],
    ),
    h('button', { type: 'button', onClick: () => setCount(count) }, ['같은 값']),
    // Q5-2: a set from a timer is not wrapped by the event relay; batching must still make it one render.
    h(
      'button',
      {
        type: 'button',
        onClick: () =>
          setTimeout(() => {
            setCount((c) => c + 1);
            setCount((c) => c + 1);
          }, 300),
      },
      ['타이머로 두 번'],
    ),
  ]);
}

// ---------- 할 일 목록 (spec §3-2 keys, §4-4 new array vs same array) ----------
// Each item is a child component: stateless, props only (assignment: Lifting State Up).
function TodoItem(props) {
  return h('li', { key: props.id }, [props.text]);
}

// New item ids come from a plain counter, not from state: "push로 추가" must not call any set (that is the point of
// the button), yet every item needs its own key. So each page gets its own counter (makeTodos), outside the hooks.
function makeTodos() {
  let seq = 2;
  const make = () => {
    seq += 1;
    return { id: seq, text: `할 일 ${seq}` };
  };
  return function Todos() {
    const [todos, setTodos] = useState([
      { id: 1, text: '할 일 1' },
      { id: 2, text: '할 일 2' },
    ]);
    return renderTodos(todos, setTodos, make);
  };
}

function renderTodos(todos, setTodos, make) {
  return h('div', {}, [
    h('div', { class: 'demo-row' }, [
      h('button', { type: 'button', onClick: () => setTodos([make(), ...todos]) }, ['앞에 추가']),
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            todos.push(make());
            setTodos(todos);
          },
        },
        ['push로 추가'],
      ),
      h('button', { type: 'button', onClick: () => setTodos(todos.slice(1)) }, ['맨 앞 지우기']),
      h('output', { class: 'muted' }, [`${todos.length}개`]),
    ]),
    h('ul', { class: 'todo-list' }, todos.map((t) => h(TodoItem, { id: t.id, text: t.text }))),
  ]);
}

export function mountHooksPage(doc) {
  const byId = (id) => doc.getElementById(id);
  new FunctionComponent(countRenders(Counter, byId('counter-renders'))).mount(byId('counter'));
  new FunctionComponent(countRenders(makeTodos(), byId('todos-renders'))).mount(byId('todos'));
}
