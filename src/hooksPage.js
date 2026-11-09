// The hooks check page (hooks.html): small cards where 상철님 presses buttons and checks Phase 2 by eye.
// Not the final demo page (spec §4-9, topic undecided). Each Phase 2 feature adds a card.
//
// "그린 횟수" (render count) is written OUTSIDE the component's container, by a wrapper around the component.
// It is a probe for checking, not part of the component: it shows whether a set really re-ran the component
// (spec §4-4 "같은 값이면 다시 그리지 않고 건너뛴다").
import { h } from './h.js';
import { FunctionComponent, useState, useEffect, useMemo } from './component.js';

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

// ---------- 타이머 (spec §4-5, the Q6-1 timer) ----------
// Probes outside the component: how many timers are alive right now, and what the screen said when the
// no-deps effect ran (it runs after patch, so it must see the new number).
function makeTimer(probe, tickMs, startRunning) {
  return function Timer() {
    const [seconds, setSeconds] = useState(0);
    const [running, setRunning] = useState(startRunning);
    const [other, setOther] = useState(0);

    // [running]: start a timer while running; the cleanup stops it before the next run or when running changes.
    useEffect(() => {
      if (!running) return undefined;
      probe.alive(+1);
      const id = setInterval(() => setSeconds((s) => s + 1), tickMs);
      return () => {
        clearInterval(id);
        probe.alive(-1);
      };
    }, [running]);

    // No deps: runs after every render, after patch.
    useEffect(() => {
      probe.saw();
    });

    return h('div', {}, [
      h('div', { class: 'demo-row' }, [
        h('output', { class: 'big' }, [seconds]),
        h('button', { type: 'button', onClick: () => setRunning(!running) }, [running ? '멈춤' : '다시 시작']),
        h('button', { type: 'button', onClick: () => setOther(other + 1) }, ['다른 상태 바꾸기']),
        h('output', { class: 'muted' }, [`다른 상태 ${other}`]),
      ]),
    ]);
  };
}

// ---------- 거르기 (spec §4-6 useMemo, §4-4 pointer comparison) ----------
// "계산 횟수" is a probe outside the component: how many times the memo's fn really ran.
function makeFilter(onCompute) {
  let next = 7;
  return function Filter() {
    const [nums, setNums] = useState([1, 2, 3, 4, 5, 6]);
    const [onlyEven, setOnlyEven] = useState(false);
    const [other, setOther] = useState(0);

    const shown = useMemo(() => {
      onCompute();
      // Always a NEW array (filter makes one). Returning `nums` itself would share the pointer, and a push would
      // show up through the remembered value even though the memo never re-ran (found by the page test, 11-09).
      return nums.filter((n) => !onlyEven || n % 2 === 0);
    }, [nums, onlyEven]);

    return h('div', {}, [
      h('div', { class: 'demo-row' }, [
        h('button', { type: 'button', onClick: () => setOnlyEven(!onlyEven) }, [onlyEven ? '전부 보기' : '짝수만']),
        h('button', { type: 'button', onClick: () => setOther(other + 1) }, ['다른 상태 바꾸기']),
        h('button', { type: 'button', onClick: () => setNums([...nums, next++]) }, ['새 배열로 추가']),
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              nums.push(next++);
              setNums(nums);
            },
          },
          ['push로 추가'],
        ),
      ]),
      h('p', { class: 'nums' }, [shown.join(' · ')]),
      h('output', { class: 'muted' }, [`실제 배열 ${nums.length}개 · 다른 상태 ${other}`]),
    ]);
  };
}

// Options are for tests: a short tick, and a timer that starts paused (there is no unmount, so a running interval
// would keep the test process alive).
export function mountHooksPage(doc, { tickMs = 1000, timerStartsRunning = true } = {}) {
  const byId = (id) => doc.getElementById(id);
  new FunctionComponent(countRenders(Counter, byId('counter-renders'))).mount(byId('counter'));
  new FunctionComponent(countRenders(makeTodos(), byId('todos-renders'))).mount(byId('todos'));

  let alive = 0;
  const probe = {
    alive(delta) {
      alive += delta;
      byId('timer-alive').textContent = String(alive);
    },
    saw() {
      byId('timer-saw').textContent = byId('timer').querySelector('.big')?.textContent ?? '';
    },
  };
  new FunctionComponent(countRenders(makeTimer(probe, tickMs, timerStartsRunning), byId('timer-renders'))).mount(byId('timer'));

  let computes = 0;
  const onCompute = () => {
    computes += 1;
    byId('filter-computes').textContent = String(computes);
  };
  new FunctionComponent(countRenders(makeFilter(onCompute), byId('filter-renders'))).mount(byId('filter'));
}
