// Tests for feature 18: useEffect. Spec-draft §4-5 (Q6 - Q6-3), §4-4 (pointer comparison). Written by the
// orchestrator (Opus) BEFORE the implementation.
//   "patch가 실제 화면을 바꾼 다음에 실행한다."
//   "effect가 걸어 둔 걸 치우는 건 그 effect의 책임이다. 치우는 함수를 return하고, 라이브러리는 같은 effect가 다음에
//    다시 실행되기 직전에 그 함수를 부른다."
//   "지켜볼 값 목록: []는 처음 한 번만, [a, b]는 칸마다 포인터 비교해서 하나라도 다르면 다시 실행."
//   "목록을 아예 안 주면 그릴 때마다 실행한다."
// Orchestrator's reading pinned here (tell him if it bites): effects run synchronously right after patch inside
// mount()/update() (so after a batched set they run in the same microtask as the re-render), in the order the
// useEffect calls appear; a hook slot for an effect has kind 'effect'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { h } from '../src/h.js';
import { FunctionComponent, useState, useEffect } from '../src/component.js';

function setup() {
  const { window } = new JSDOM('<!DOCTYPE html><body><div id="c"></div></body>');
  return { window, container: window.document.getElementById('c') };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- when: after patch (§4-5 Q6) ----------

test('on mount, the effect runs after the screen is drawn (it can find the button)', () => {
  const { container } = setup();
  let seen = 'not run';
  const App = () => {
    useEffect(() => {
      const btn = container.querySelector('button');
      seen = btn ? btn.textContent : 'no button';
    });
    return h('button', {}, ['0']);
  };
  new FunctionComponent(App).mount(container);
  assert.equal(seen, '0');
});

test('on re-render, the effect sees the NEW screen (patch already happened)', async () => {
  const { container } = setup();
  const seen = [];
  let set;
  const App = () => {
    const [n, setN] = useState(0);
    set = setN;
    useEffect(() => {
      seen.push(container.textContent);
    });
    return h('p', {}, [n]);
  };
  new FunctionComponent(App).mount(container);
  set(5);
  await settle();
  assert.deepEqual(seen, ['0', '5']);
});

test('the effect does not run while the component function is running', () => {
  const { container } = setup();
  const log = [];
  const App = () => {
    log.push('render start');
    useEffect(() => log.push('effect'));
    log.push('render end');
    return h('p');
  };
  new FunctionComponent(App).mount(container);
  assert.deepEqual(log, ['render start', 'render end', 'effect']);
});

test('several effects run in the order their useEffect calls appear', () => {
  const { container } = setup();
  const log = [];
  const App = () => {
    useEffect(() => log.push('first'));
    useEffect(() => log.push('second'));
    useEffect(() => log.push('third'));
    return h('p');
  };
  new FunctionComponent(App).mount(container);
  assert.deepEqual(log, ['first', 'second', 'third']);
});

test('update() called directly runs the effects before it returns', () => {
  const { container } = setup();
  let runs = 0;
  const fc = new FunctionComponent(() => {
    useEffect(() => {
      runs += 1;
    });
    return h('p');
  });
  fc.mount(container);
  fc.update();
  assert.equal(runs, 2);
});

// ---------- deps (§4-5 Q6-3) ----------

function deps(listFor) {
  // A component with one state `n` and an effect whose deps are listFor(n, other).
  const t = { runs: 0 };
  t.App = () => {
    const [n, setN] = useState(0);
    const [other, setOther] = useState(0);
    t.setN = setN;
    t.setOther = setOther;
    useEffect(() => {
      t.runs += 1;
    }, listFor(n, other));
    return h('p', {}, [`${n}/${other}`]);
  };
  return t;
}

test('no deps list → runs after every render ("매번 갱신하는게 나은거같아서")', async () => {
  const { container } = setup();
  const t = deps(() => undefined);
  new FunctionComponent(t.App).mount(container);
  t.setN(1);
  await settle();
  t.setOther(1);
  await settle();
  assert.equal(t.runs, 3);
});

test('[] → runs once, after the first render only', async () => {
  const { container } = setup();
  const t = deps(() => []);
  new FunctionComponent(t.App).mount(container);
  t.setN(1);
  await settle();
  t.setOther(1);
  await settle();
  assert.equal(t.runs, 1);
});

test('[n] → runs again only when n changed', async () => {
  const { container } = setup();
  const t = deps((n) => [n]);
  new FunctionComponent(t.App).mount(container);
  t.setOther(1); // n unchanged
  await settle();
  assert.equal(t.runs, 1);
  t.setN(1); // n changed
  await settle();
  assert.equal(t.runs, 2);
});

test('[n, other] → runs when any one of them changed', async () => {
  const { container } = setup();
  const t = deps((n, other) => [n, other]);
  new FunctionComponent(t.App).mount(container);
  t.setOther(1);
  await settle();
  t.setN(1);
  await settle();
  assert.equal(t.runs, 3);
});

test('deps are compared by pointer: the same array object → skip, a new array with the same items → run (§4-4 Q5-5)', async () => {
  const { container } = setup();
  const shared = ['a'];
  let list = shared;
  let runs = 0;
  let set;
  const App = () => {
    const [n, setN] = useState(0);
    set = setN;
    useEffect(() => {
      runs += 1;
    }, [list]);
    return h('p', {}, [n]);
  };
  new FunctionComponent(App).mount(container);
  shared.push('b'); // changed inside, same pointer
  set(1);
  await settle();
  assert.equal(runs, 1);
  list = ['a', 'b']; // new pointer, same items
  set(2);
  await settle();
  assert.equal(runs, 2);
});

test('NaN in deps counts as unchanged (Object.is)', async () => {
  const { container } = setup();
  let runs = 0;
  let set;
  const App = () => {
    const [n, setN] = useState(0);
    set = setN;
    useEffect(() => {
      runs += 1;
    }, [NaN]);
    return h('p', {}, [n]);
  };
  new FunctionComponent(App).mount(container);
  set(1);
  await settle();
  assert.equal(runs, 1);
});

// ---------- cleanup (§4-5 Q6-1, Q6-2) ----------

test('the returned function is called right before the same effect runs again', async () => {
  const { container } = setup();
  const log = [];
  let set;
  const App = () => {
    const [n, setN] = useState(0);
    set = setN;
    useEffect(() => {
      log.push(`run ${n}`);
      return () => log.push(`clean ${n}`);
    });
    return h('p', {}, [n]);
  };
  new FunctionComponent(App).mount(container);
  set(1);
  await settle();
  set(2);
  await settle();
  assert.deepEqual(log, ['run 0', 'clean 0', 'run 1', 'clean 1', 'run 2']);
});

test('cleanup is not called when the effect is skipped (deps unchanged)', async () => {
  const { container } = setup();
  const log = [];
  let setOther;
  const App = () => {
    const [n] = useState(0);
    const [o, setO] = useState(0);
    setOther = setO;
    useEffect(() => {
      log.push('run');
      return () => log.push('clean');
    }, [n]);
    return h('p', {}, [`${n}${o}`]);
  };
  new FunctionComponent(App).mount(container);
  setOther(1);
  await settle();
  setOther(2);
  await settle();
  assert.deepEqual(log, ['run']);
});

test('an effect that returns nothing is fine (no cleanup to call)', async () => {
  const { container } = setup();
  let set;
  const App = () => {
    const [n, setN] = useState(0);
    set = setN;
    useEffect(() => {});
    return h('p', {}, [n]);
  };
  new FunctionComponent(App).mount(container);
  set(1);
  await assert.doesNotReject(settle());
  assert.equal(container.textContent, '1');
});

test('the Q6-1 timer: with [] and a cleanup, only ONE timer is ever running while the screen re-renders', async () => {
  const { container } = setup();
  let active = 0;
  let maxActive = 0;
  const live = new Set(); // interval ids still running, so the test can stop them (there is no unmount yet)
  const App = () => {
    const [tick, setT] = useState(0);
    useEffect(() => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const id = setInterval(() => setT((c) => c + 1), 10);
      live.add(id);
      return () => {
        clearInterval(id);
        live.delete(id);
        active -= 1;
      };
    }, []);
    return h('p', {}, [tick]);
  };
  new FunctionComponent(App).mount(container);
  // Wait for 3 ticks on screen (up to 2 s), not a fixed time: a busy machine may run a 10 ms timer late.
  for (let waited = 0; Number(container.textContent) < 3 && waited < 2000; waited += 20) await sleep(20);
  live.forEach(clearInterval);
  const shown = Number(container.textContent);
  assert.ok(shown >= 3, `ticks shown: ${shown}`);
  assert.equal(maxActive, 1);
  assert.equal(active, 1);
});

test('the Q6-1 trap without deps: no cleanup + no deps → timers pile up (shows why cleanup exists)', async () => {
  const { container } = setup();
  let started = 0;
  const ids = [];
  let set;
  const App = () => {
    const [n, setN] = useState(0);
    set = setN;
    useEffect(() => {
      started += 1;
      ids.push(setInterval(() => {}, 1000));
    });
    return h('p', {}, [n]);
  };
  new FunctionComponent(App).mount(container);
  set(1);
  await settle();
  set(2);
  await settle();
  ids.forEach(clearInterval);
  assert.equal(started, 3);
});

// ---------- effects and state together ----------

test('a set inside an effect re-renders once more (batched), and [] stops it from looping', async () => {
  const { container } = setup();
  let renders = 0;
  const App = () => {
    renders += 1;
    const [ready, setReady] = useState(false);
    useEffect(() => {
      setReady(true);
    }, []);
    return h('p', {}, [ready ? '준비됨' : '로딩']);
  };
  new FunctionComponent(App).mount(container);
  assert.equal(container.textContent, '로딩');
  await settle();
  assert.equal(container.textContent, '준비됨');
  assert.equal(renders, 2);
});

test('an effect with no deps that sets the SAME value does not loop (same value is skipped)', async () => {
  const { container } = setup();
  let runs = 0;
  const App = () => {
    const [v, setV] = useState('x');
    useEffect(() => {
      runs += 1;
      setV('x');
    });
    return h('p', {}, [v]);
  };
  new FunctionComponent(App).mount(container);
  await settle();
  assert.equal(runs, 1);
});

test('useEffect and useState share the hooks array by call order; an effect slot has kind "effect"', () => {
  const { container } = setup();
  const App = () => {
    useState(1);
    useEffect(() => {}, []);
    useState(2);
    return h('p');
  };
  const fc = new FunctionComponent(App);
  fc.mount(container);
  assert.deepEqual(
    fc.hooks.map((s) => s.kind),
    ['state', 'effect', 'state'],
  );
});

test('useEffect outside a component render throws', () => {
  assert.throws(() => useEffect(() => {}));
});
