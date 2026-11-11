// Tests for patch, spec-draft §3 + the assignment's "바뀐 부분만 실제 영역에 반영". Written before src/core/patch.js.
// Replaces test/diffPatch.test.js, which pinned only the PROVISIONAL "replace the root" contract.
//
// What is checked:
// 1. Result: after patch(실제 영역, diff(old, new)), 실제 영역 holds exactly `new` (without keys, §3-3 Q12).
// 2. "바뀐 부분만": DOM nodes diff did not touch are the SAME objects afterwards (not redrawn).
// 3. A random check over many keyed / unkeyed lists, so the move / insert / remove order is exercised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { diff } from '../src/core/diff.js';
import { patch } from '../src/core/patch.js';
import { htmlToVdom, containerToVdom, renderInto } from '../src/core/render.js';
import { stripKeys } from './helpers/vdom.js';

const doc = new JSDOM('<!DOCTYPE html><body></body>').window.document;
const v = (html) => htmlToVdom(html, doc);

function area(root) {
  const el = doc.createElement('div');
  renderInto(el, root, doc, { keys: false });
  return el;
}

function check(oldHtml, newHtml) {
  const a = v(oldHtml);
  const b = v(newHtml);
  const el = area(a);
  patch(el, diff(a, b), doc);
  assert.deepEqual(containerToVdom(el), stripKeys(b), `${oldHtml}  →  ${newHtml}`);
  assert.equal(el.querySelector('[key]'), null, 'no key attribute in 실제 영역');
  return el;
}

const ul = (...xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const kul = (...xs) => `<ul>${xs.map((x) => `<li key="${x}">${x}</li>`).join('')}</ul>`;

test('every kind of change lands: result equals the new VDOM', () => {
  const pairs = [
    ['<p class="msg">hi <b>there</b> bye</p>', '<p class="msg">hello <b>there</b> bye</p>'],
    ['<li class="a" title="t">x</li>', '<li class="b" data-id="1">x</li>'],
    ['<ul><li>밥</li></ul>', '<ol><li>국</li></ol>'],
    ['<p>밥</p>', '<p><b>밥</b></p>'],
    ['<p><b>밥</b></p>', '<p>밥</p>'],
    [ul('a', 'b', 'c'), ul('x', 'a', 'b', 'c')],
    [ul('a', 'b', 'c'), ul('a', 'x', 'b', 'c')],
    [ul('a', 'b', 'c'), ul('a', 'c')],
    [ul('a', 'b', 'c'), ul('a', 'x', 'y', 'c')],
    [ul('a', 'x', 'y', 'c'), ul('a', 'b', 'c')],
    [kul('a', 'b', 'c'), kul('x', 'a', 'b', 'c')],
    [kul('a', 'b', 'c'), kul('c', 'a', 'b')],
    [kul('a', 'b', 'c', 'd'), kul('b', 'c', 'd', 'a')],
    [kul('a', 'b', 'c', 'd'), kul('d', 'c', 'b', 'a')],
    ['<ul><li key="a">밥</li></ul>', '<ul><li key="z">밥</li></ul>'],
    ['<div><li key="a">밥</li><li key="b">국</li></div>', '<div><li key="b">국</li><p key="a">밥</p></div>'],
    [kul('a', 'b'), '<ul><li key="b">B</li><li key="a">a</li></ul>'],
    ['<ul>\n  <li key="a">a</li>\n  <li key="b">b</li>\n</ul>', '<ul>\n  <li key="x">x</li>\n  <li key="a">a</li>\n  <li key="b">b</li>\n</ul>'],
    ['<ul>\n  <li key="a">a</li>\n  <li key="b">b</li>\n</ul>', '<ul>\n  <li key="a">a</li>\n</ul>'],
    ['<ul><li key="a">밥</li></ul>', '<ul><li key="a">밥</li><li key="a">국</li></ul>'],
    ['<ul><li key="a">밥</li><li key="a">국</li></ul>', '<ul><li key="a">국</li></ul>'],
    ['<p>a</p>', '<p>b</p><ul><li>x</li></ul>'],
    ['<p>a</p><p>b</p>', ''],
    ['', '<p>a</p>'],
    ['<div><ul><li key="1">a<b>x</b></li><li key="2">b</li></ul></div>', '<div><ul><li key="2">b!</li><li key="3">c</li><li key="1"><b>y</b>a</li></ul></div>'],
  ];
  for (const [a, b] of pairs) check(a, b);
});

test('an empty change list changes nothing', () => {
  const el = area(v('<p>a</p>'));
  patch(el, [], doc);
  assert.equal(el.innerHTML, '<p>a</p>');
});

test('the container itself is kept (only its inside changes)', () => {
  const a = v('<p>a</p>');
  const el = area(a);
  el.id = 'actual';
  patch(el, diff(a, v('<ul><li>x</li></ul>')), doc);
  assert.equal(el.id, 'actual');
});

// §3-3 Q12: 실제 영역 never shows keys, also for nodes patch inserts or replaces.
test('keys are never drawn into 실제 영역, also for inserted and replaced nodes', () => {
  const el = check('<ul><li key="a">a</li></ul>', '<ul><li key="b"><span key="c">b</span></li><li key="a">a</li></ul>');
  assert.equal(el.innerHTML, '<ul><li><span>b</span></li><li>a</li></ul>');
});

// "바뀐 부분만": the nodes diff did not report are untouched DOM objects.
test('insert at the front of a keyed list: the old li elements are the same objects', () => {
  const a = v(kul('a', 'b'));
  const el = area(a);
  const [la, lb] = el.querySelectorAll('li');
  patch(el, diff(a, v(kul('x', 'a', 'b'))), doc);
  const lis = el.querySelectorAll('li');
  assert.equal(lis[1], la);
  assert.equal(lis[2], lb);
});

test('a move keeps the moved element itself (it is not redrawn)', () => {
  const a = v(kul('a', 'b', 'c'));
  const el = area(a);
  const lc = el.querySelectorAll('li')[2];
  patch(el, diff(a, v(kul('c', 'a', 'b'))), doc);
  assert.equal(el.querySelectorAll('li')[0], lc);
});

test('a text change rewrites that text node only; its parent and siblings stay', () => {
  const a = v('<p class="msg">hi <b>there</b> bye</p>');
  const el = area(a);
  const p = el.firstChild;
  const [t0, b, t2] = p.childNodes;
  patch(el, diff(a, v('<p class="msg">hello <b>there</b> bye</p>')), doc);
  assert.equal(el.firstChild, p);
  assert.deepEqual([...p.childNodes], [t0, b, t2]);
  assert.equal(t0.data, 'hello ');
});

test('an attribute change keeps the element', () => {
  const a = v('<li class="a">x</li>');
  const el = area(a);
  const li = el.firstChild;
  patch(el, diff(a, v('<li class="b">x</li>')), doc);
  assert.equal(el.firstChild, li);
  assert.equal(li.className, 'b');
});

test('a node inserted under <svg> is an SVG element', () => {
  const el = check('<svg><rect></rect></svg>', '<svg><circle r="1"></circle><rect></rect></svg>');
  assert.equal(el.querySelector('circle').namespaceURI, 'http://www.w3.org/2000/svg');
});

// Random check: lists of keyed and unkeyed items, shuffled / edited / grown / shrunk, patched and read back.
test('random lists: patch(diff(a, b)) always gives b', () => {
  // MINSTD generator: seed * 48271 stays below 2^53, so every step is exact. (The first version multiplied by
  // 1103515245, which overflowed the exact range; it made 3 keyed nodes and 0 moves in 400 pairs. Codex bundle r1 F6.)
  let seed = 20261109;
  const rand = (n) => {
    seed = (seed * 48271) % 2147483647;
    return seed % n;
  };
  const item = (k) => {
    const text = 'abc'[rand(3)];
    const tag = rand(5) === 0 ? 'p' : 'li';
    const ws = rand(3) === 0 ? '\n  ' : '';
    return rand(4) === 0 ? `${ws}<${tag}>${text}</${tag}>` : `${ws}<${tag} key="${k}">${text}</${tag}>`;
  };
  const items = () => {
    const keys = [...'abcdefg'];
    const out = [];
    const n = rand(6);
    for (let i = 0; i < n; i++) out.push(item(keys.splice(rand(keys.length), 1)[0]));
    return out;
  };
  // Half of the new lists are the old items shuffled (so the same keys meet in a new order = moves).
  const shuffled = (xs) => {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const ul = (xs) => `<ul>${xs.join('')}</ul>`;
  let keyed = 0;
  let moves = 0;
  let inserts = 0;
  let removes = 0;
  for (let i = 0; i < 400; i++) {
    const old = items();
    const a = ul(old);
    const b = ul(rand(2) === 0 ? shuffled(old) : items());
    keyed += (a.match(/ key="/g) ?? []).length;
    for (const c of diff(v(a), v(b))) {
      if (c.type === 'update' && c.what === 'move') moves += 1;
      if (c.type === 'insert') inserts += 1;
      if (c.type === 'remove') removes += 1;
    }
    check(a, b);
  }
  // The random lists must really exercise what this test claims: keyed items, moves, inserts and removes.
  assert.ok(keyed > 400, `keyed nodes: ${keyed}`);
  assert.ok(moves > 50, `moves: ${moves}`);
  assert.ok(inserts > 50 && removes > 50, `inserts ${inserts}, removes ${removes}`);
});
