// Reproductions of Codex bundle-10-20-r1 findings. Each test asserts the CORRECT behavior; a failure = finding is real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const P = 'file:///C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/';
const { JSDOM } = await import(P + 'node_modules/jsdom/lib/api.js');
const { FunctionComponent, useState, useEffect, useMemo } = await import(P + 'src/component.js');
const { h } = await import(P + 'src/h.js');
const { lintHtml } = await import(P + 'src/lint.js');
const { htmlToVdom } = await import(P + 'src/render.js');
const { diff } = await import(P + 'src/diff.js');
const { debugLines } = await import(P + 'src/debugView.js');

const doc = new JSDOM('<!DOCTYPE html><body></body>').window.document;
const box = () => { const c = doc.createElement('div'); doc.body.appendChild(c); return c; };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('#1 effect booked by a rejected (child-hook) render must not run later', () => {
  const log = [];
  const Child = ({ bad }) => { if (bad) useState(0); return h('i', {}, ['c']); };
  const App = ({ n, bad }) => {
    useEffect(() => { log.push('run ' + n); return () => log.push('clean ' + n); }, [n]);
    return h('p', {}, [n, h(Child, { bad })]);
  };
  const c = box();
  const fc = new FunctionComponent(App, { n: 0, bad: false });
  fc.mount(c);
  fc.props = { n: 1, bad: true };
  assert.throws(() => fc.update(), /root/);
  fc.props = { n: 0, bad: false };
  fc.update();
  assert.equal(c.textContent, '0c');
  assert.deepEqual(log, ['run 0']);
});

test('#2 after a count error, the committed state slot and its setter still work', async () => {
  let mode = 'good'; let set;
  const App = () => {
    if (mode === 'good') { const [v, s] = useState(0); set = s; return h('p', {}, [v]); }
    useMemo(() => 42, []); useState(1); return h('p', {}, ['x']);
  };
  const c = box();
  const fc = new FunctionComponent(App);
  fc.mount(c);
  const saved = set;
  saved(7); await tick();
  assert.equal(c.textContent, '7');
  mode = 'bad';
  assert.throws(() => fc.update(), /hook count/);
  assert.equal(c.textContent, '7');
  mode = 'good';
  saved(8); await tick();
  assert.equal(c.textContent, '8');
});

test('#3a lint: key="a" and key="&#97;" are the same parsed key → duplicate warning', () => {
  const html = '<ul><li key="a">A</li><li key="&#97;">B</li></ul>';
  const keys = htmlToVdom(html, doc).children[0].children.map((n) => n.attrs.key);
  assert.deepEqual(keys, ['a', 'a']);
  assert.ok(lintHtml(html).some((w) => /key/i.test(w.message ?? String(w))), JSON.stringify(lintHtml(html)));
});

test('#3b lint: "key=a" inside a title value is not a key', () => {
  const html = '<ul><li title="x key=a y">A</li><li title="x key=a y">B</li></ul>';
  assert.deepEqual(lintHtml(html), []);
});

test('#4 debug colors: move + replace at the same key → old red, new green', () => {
  const a = htmlToVdom('<ul><li key="a">A</li><li key="b">B</li></ul>', doc);
  const b = htmlToVdom('<ul><p key="b">B</p><li key="a">A</li></ul>', doc);
  const ch = diff(a, b);
  console.log('changes', JSON.stringify(ch.map((x) => ({ t: x.type, w: x.what, p: x.path, o: x.oldPath }))));
  const oldB = debugLines(a, ch, 'old').find((l) => l.text.startsWith('<li key="b"'));
  const newP = debugLines(b, ch, 'new').find((l) => l.text.startsWith('<p'));
  console.log('oldB', oldB?.mark, 'newP', newP?.mark);
  assert.equal(oldB.mark, 'del');
  assert.equal(newP.mark, 'add');
});

test('#5 kind swap (state,effect → effect,state): old effect cleaned up, live count stays 1', () => {
  let live = 0, cleans = 0, swap = false;
  const res = () => { live++; return () => { live--; cleans++; }; };
  const App = () => {
    if (!swap) { useState(0); useEffect(res, []); } else { useEffect(res, []); useState(0); }
    return h('p', {}, ['x']);
  };
  const warn = console.warn; console.warn = () => {};
  try {
    const fc = new FunctionComponent(App); fc.mount(box());
    swap = true; fc.update();
  } finally { console.warn = warn; }
  console.log('live', live, 'cleans', cleans);
  assert.equal(live, 1);
});

test('#6 patch.test random generator: how many keyed nodes / shared keys / moves', () => {
  let seed = 20261109;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  let keyed = 0, unkeyed = 0, sharedPairs = 0, moves = 0;
  const list = () => {
    const keys = [...'abcdefg']; const out = []; const n = rand(6);
    for (let i = 0; i < n; i++) {
      const k = keys.splice(rand(keys.length), 1)[0];
      rand(3); const tag = rand(5) === 0 ? 'p' : 'li'; rand(3);
      if (rand(4) === 0) { unkeyed++; out.push(`<${tag}>x</${tag}>`); } else { keyed++; out.push(`<${tag} key="${k}">x</${tag}>`); }
    }
    return `<ul>${out.join('')}</ul>`;
  };
  for (let i = 0; i < 400; i++) {
    const A = list(), B = list();
    const ka = [...A.matchAll(/key="(.)"/g)].map((m) => m[1]);
    if ([...B.matchAll(/key="(.)"/g)].some((m) => ka.includes(m[1]))) sharedPairs++;
    moves += diff(htmlToVdom(A, doc), htmlToVdom(B, doc)).filter((x) => x.what === 'move' || x.type === 'move').length;
  }
  console.log({ keyed, unkeyed, sharedPairs, moves });
  assert.ok(moves > 0);
});

test('#8 (note) set(1); fc.update() → booked microtask renders again', async () => {
  let runs = 0, set;
  const App = () => { runs++; const [v, s] = useState(0); set = s; return h('p', {}, [v]); };
  const fc = new FunctionComponent(App); fc.mount(box());
  set(1); fc.update(); await tick();
  console.log('runs', runs);
  assert.equal(runs, 2);
});
