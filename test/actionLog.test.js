// Tests for the action log on the verification page (spec-draft §2-6, his request 11-10:
// "무슨 액션이있었는지 로그도 보여줬으면 좋겠어").
// One line per action he takes: load, sample button, Patch (new / nothing changed / moved to an equal ancestor),
// back, forward, tree click. Newest line first. A line that changed 실제 영역 also shows
// - the four change kinds counted from OUR diff's result (same rule as the debug panel, §2-3), and
// - how many nodes of 실제 영역 were really touched, counted by a MutationObserver (not by the diff).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './helpers/page.js';
import { mountApp } from '../src/app.js';
import { countChanges, countChips } from '../src/actionLog.js';
import { diff } from '../src/diff.js';
import { htmlToVdom } from '../src/render.js';
import { SAMPLES } from '../src/samples.js';

function page() {
  const p = loadPage();
  const { doc, win } = p;
  // A fixed clock: 09:05:03, one second later on every call.
  let tick = 0;
  const now = () => new Date(2026, 10, 10, 9, 5, 3 + tick++);
  const app = mountApp(doc, { now });
  const $ = (id) => doc.getElementById(id);
  const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
  const edit = (text) => {
    $('source').value = text;
    fire($('source'), 'input');
    fire($('source'), 'focusout');
  };
  const entries = () => [...$('actionlog').children];
  const part = (li, cls) => li.querySelector(`.${cls}`)?.textContent ?? null;
  const chips = (li) => [...li.querySelectorAll('.chip')].map((c) => c.textContent);
  return { ...p, app, $, edit, entries, part, chips };
}

const S1 = SAMPLES[0].html;

// ---------- counting from the diff result ----------

test('countChanges counts the four kinds, and what was fixed, from a diff result', () => {
  const doc = loadPage().doc;
  const a = htmlToVdom('<p class="x">hi</p><ul><li key="a">a</li><li key="b">b</li></ul><i>gone</i>', doc);
  const b = htmlToVdom('<p class="y">ho</p><ul><li key="b">b</li><li key="a">a</li></ul><b>new</b><u>more</u>', doc);
  const changes = diff(a, b);
  const counts = countChanges(changes);
  // Counted straight from the list, never by comparing a and b again.
  const n = (f) => changes.filter(f).length;
  assert.deepEqual(counts, {
    insert: n((c) => c.type === 'insert'),
    remove: n((c) => c.type === 'remove'),
    replace: n((c) => c.type === 'replace'),
    text: n((c) => c.type === 'update' && c.what === 'text'),
    attrs: n((c) => c.type === 'update' && c.what === 'attrs'),
    move: n((c) => c.type === 'update' && c.what === 'move'),
  });
  assert.equal(counts.text, 1);
  assert.equal(counts.attrs, 1);
  assert.ok(counts.move >= 1);
  assert.equal(counts.insert + counts.remove + counts.replace + counts.text + counts.attrs + counts.move, changes.length);
});

test('countChips: one chip per kind that happened, 고침 says what was fixed', () => {
  assert.deepEqual(countChips({ insert: 0, remove: 0, replace: 0, text: 0, attrs: 0, move: 0 }), []);
  assert.deepEqual(countChips({ insert: 2, remove: 1, replace: 1, text: 1, attrs: 0, move: 3 }), [
    { kind: 'add', text: '추가 2' },
    { kind: 'del', text: '지워짐 1' },
    { kind: 'rep', text: '교체 1' },
    { kind: 'chg', text: '고침 4 (글자 1 · 자리 3)' },
  ]);
  assert.deepEqual(countChips({ insert: 0, remove: 0, replace: 0, text: 0, attrs: 2, move: 0 }), [
    { kind: 'chg', text: '고침 2 (속성 2)' },
  ]);
});

// ---------- the log on the page ----------

test('index.html has the action log list', () => {
  const { doc } = loadPage();
  assert.equal(doc.getElementById('actionlog').localName, 'ol');
});

test('on load the log has one line: the start, with the time and v1', () => {
  const p = page();
  const lines = p.entries();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].dataset.action, 'load');
  assert.equal(p.part(lines[0], 'when'), '09:05:03');
  assert.equal(p.part(lines[0], 'what'), '시작');
  assert.match(p.part(lines[0], 'result'), /v1/);
  assert.deepEqual(p.chips(lines[0]), []);
  assert.equal(p.part(lines[0], 'touched'), null);
});

test('a sample button is logged; it changes no version, so no counts', () => {
  const p = page();
  [...p.$('samples').querySelectorAll('button')].find((b) => b.textContent === '샘플 2').click();
  const lines = p.entries();
  assert.equal(lines.length, 2);
  assert.equal(lines[0].dataset.action, 'sample'); // newest first
  assert.equal(p.part(lines[0], 'what'), '샘플');
  assert.match(p.part(lines[0], 'result'), /샘플 2/);
  assert.deepEqual(p.chips(lines[0]), []);
  assert.equal(p.part(lines[0], 'touched'), null);
  assert.equal(lines[1].dataset.action, 'load');
});

test('Patch that makes a version: result, counts from the diff, touched nodes from the real DOM', () => {
  const p = page();
  p.edit(S1.replace('오늘 할 일', '내일 할 일'));
  p.$('patch').click();
  const line = p.entries()[0];
  assert.equal(line.dataset.action, 'patch');
  assert.equal(p.part(line, 'what'), 'Patch');
  assert.equal(p.part(line, 'result'), 'v1 → v2 · 새 버전');
  assert.deepEqual(p.chips(line), ['고침 1 (글자 1)']);
  assert.equal(line.querySelector('.chip').classList.contains('chg'), true);
  assert.equal(p.part(line, 'touched'), '건드린 노드 1개'); // one text node, nothing else in 실제 영역
  assert.equal(p.part(line, 'when'), '09:05:04');
});

test('Patch with nothing changed is logged too, without counts', () => {
  const p = page();
  p.$('patch').click();
  const line = p.entries()[0];
  assert.equal(p.entries().length, 2);
  assert.equal(line.dataset.action, 'patch');
  assert.equal(p.part(line, 'result'), '바뀐 게 없어요 (v1 그대로)');
  assert.deepEqual(p.chips(line), []);
  assert.equal(p.part(line, 'touched'), null);
});

test('Patch that lands on an equal ancestor says so (§2-2)', () => {
  const p = page();
  p.edit('<p>one</p>');
  p.$('patch').click(); // v2
  p.edit(S1);
  p.$('patch').click(); // same as v1 on the same branch → move
  const line = p.entries()[0];
  assert.equal(line.dataset.action, 'patch');
  assert.equal(p.part(line, 'result'), 'v2 → v1 · 같은 갈래의 같은 버전으로 이동');
  assert.ok(p.chips(line).length > 0);
});

test('back, forward and a tree click are each one line, with the versions and counts', () => {
  const p = page();
  p.edit(S1.replace('오늘 할 일', '내일 할 일'));
  p.$('patch').click(); // v2
  p.$('back').click();
  let line = p.entries()[0];
  assert.equal(line.dataset.action, 'back');
  assert.equal(p.part(line, 'what'), '뒤로가기');
  assert.equal(p.part(line, 'result'), 'v2 → v1');
  assert.deepEqual(p.chips(line), ['고침 1 (글자 1)']);
  assert.equal(p.part(line, 'touched'), '건드린 노드 1개');

  p.$('forward').click();
  line = p.entries()[0];
  assert.equal(line.dataset.action, 'forward');
  assert.equal(p.part(line, 'what'), '앞으로가기');
  assert.equal(p.part(line, 'result'), 'v1 → v2');

  [...p.$('tree').querySelectorAll('button')].find((b) => b.textContent === 'v1').click();
  line = p.entries()[0];
  assert.equal(line.dataset.action, 'tree');
  assert.equal(p.part(line, 'what'), '트리 클릭');
  assert.equal(p.part(line, 'result'), 'v2 → v1');

  // load, patch, back, forward, tree
  assert.deepEqual(p.entries().map((li) => li.dataset.action), ['tree', 'forward', 'back', 'patch', 'load']);
});

test('touched nodes are counted from 실제 영역 itself: a keyed move touches the moved nodes only', () => {
  const p = page();
  // One line, so no whitespace text sits between the items (§3-2 Q8 would regroup it).
  const abc = '<ul><li key="a">a</li><li key="b">b</li><li key="c">c</li></ul>';
  const cab = '<ul><li key="c">c</li><li key="a">a</li><li key="b">b</li></ul>';
  p.edit(abc);
  p.$('patch').click(); // v2
  const lisBefore = [...p.$('actual').querySelectorAll('li')];
  p.edit(cab);
  p.$('patch').click(); // v3
  const line = p.entries()[0];
  const counts = countChanges(diff(htmlToVdom(abc, p.doc), htmlToVdom(cab, p.doc)));
  assert.ok(counts.move >= 1);
  assert.equal(counts.insert + counts.remove + counts.replace + counts.text + counts.attrs, 0);
  // Every move puts one node somewhere else; nothing is created or dropped.
  assert.equal(p.part(line, 'touched'), `건드린 노드 ${counts.move}개`);
  const lisAfter = [...p.$('actual').querySelectorAll('li')];
  assert.deepEqual(lisAfter.map((li) => li.textContent), ['c', 'a', 'b']);
  assert.ok(lisAfter.every((li) => lisBefore.includes(li))); // same elements, only moved
});

test('the app hands back its log entries (newest last in the array, newest first on the page)', () => {
  const p = page();
  p.$('patch').click();
  const log = p.app.log();
  assert.equal(log.length, 2);
  assert.equal(log[0].action, 'load');
  assert.equal(log[1].action, 'patch');
});
