// Smoke tests for the Phase 2 check page (hooks.html + src/hooksPage.js). The page is Opus's (page design stays on
// Opus, orchestrate §1); these tests only pin that each card does what its hint line says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { mountHooksPage } from '../src/hooksPage.js';

const html = readFileSync(new URL('../hooks.html', import.meta.url), 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 0));

function open() {
  const { window } = new JSDOM(html); // scripts in the HTML do not run here; we mount by hand
  const doc = window.document;
  mountHooksPage(doc, { tickMs: 15, timerStartsRunning: false });
  const press = async (cardId, label) => {
    const btn = [...doc.querySelectorAll(`#${cardId} button`)].find((b) => b.textContent === label);
    assert.ok(btn, `button "${label}" in #${cardId}`);
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await settle();
  };
  return { doc, press };
}

test('counter card: first render shows 0 and counts 1 render', () => {
  const { doc } = open();
  assert.equal(doc.querySelector('#counter .big').textContent, '0');
  assert.equal(doc.getElementById('counter-renders').textContent, '1');
});

test('counter card: +1, then "함수로 두 번" adds 2, "값으로 두 번" adds 1', async () => {
  const { doc, press } = open();
  await press('counter', '+1');
  assert.equal(doc.querySelector('#counter .big').textContent, '1');
  await press('counter', '함수로 두 번');
  assert.equal(doc.querySelector('#counter .big').textContent, '3');
  await press('counter', '값으로 두 번');
  assert.equal(doc.querySelector('#counter .big').textContent, '4');
});

test('counter card: "같은 값" does not re-render (render count unchanged)', async () => {
  const { doc, press } = open();
  const before = doc.getElementById('counter-renders').textContent;
  await press('counter', '같은 값');
  assert.equal(doc.getElementById('counter-renders').textContent, before);
});

test('counter card (feature 17 batching): "함수로 두 번" and "값으로 두 번" each add ONE render', async () => {
  const { doc, press } = open();
  const renders = () => Number(doc.getElementById('counter-renders').textContent);
  const start = renders();
  await press('counter', '함수로 두 번');
  assert.equal(renders(), start + 1);
  await press('counter', '값으로 두 번');
  assert.equal(renders(), start + 2);
});

test('counter card: "타이머로 두 번" adds 2 after the timer, in ONE render (Q5-2)', async () => {
  const { doc, press } = open();
  const renders = () => Number(doc.getElementById('counter-renders').textContent);
  const start = renders();
  await press('counter', '타이머로 두 번');
  assert.equal(doc.querySelector('#counter .big').textContent, '0'); // timer not fired yet
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(doc.querySelector('#counter .big').textContent, '2');
  assert.equal(renders(), start + 1);
});

test('todo card: "앞에 추가" puts a new item first and keeps the old <li> elements', async () => {
  const { doc, press } = open();
  const old = [...doc.querySelectorAll('#todos li')];
  await press('todos', '앞에 추가');
  const now = [...doc.querySelectorAll('#todos li')];
  assert.deepEqual(now.map((li) => li.textContent), ['할 일 3', '할 일 1', '할 일 2']);
  assert.equal(now[1], old[0]);
  assert.equal(now[2], old[1]);
});

test('todo card: "push로 추가" changes nothing on screen (same array → skipped)', async () => {
  const { doc, press } = open();
  const renders = doc.getElementById('todos-renders').textContent;
  await press('todos', 'push로 추가');
  assert.equal(doc.querySelectorAll('#todos li').length, 2);
  assert.equal(doc.getElementById('todos-renders').textContent, renders);
});

test('todo card: every item keeps its own key even after "push로 추가" (no duplicate keys)', async () => {
  const { doc, press } = open();
  await press('todos', 'push로 추가');
  await press('todos', 'push로 추가');
  await press('todos', '앞에 추가');
  const texts = [...doc.querySelectorAll('#todos li')].map((li) => li.textContent);
  assert.deepEqual(texts, ['할 일 5', '할 일 1', '할 일 2', '할 일 3', '할 일 4']);
});

test('todo card: "맨 앞 지우기" removes the first item', async () => {
  const { doc, press } = open();
  await press('todos', '맨 앞 지우기');
  assert.deepEqual([...doc.querySelectorAll('#todos li')].map((li) => li.textContent), ['할 일 2']);
});

// ---------- timer card (feature 18, useEffect) ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (doc, id) => doc.getElementById(id).textContent;

test('timer card: starting turns ONE timer on; re-rendering by another state keeps it at one; stopping turns it off', async () => {
  const { doc, press } = open();
  assert.equal(text(doc, 'timer-alive'), '0'); // started paused (test option)
  await press('timer', '다시 시작');
  assert.equal(text(doc, 'timer-alive'), '1');
  await press('timer', '다른 상태 바꾸기');
  await press('timer', '다른 상태 바꾸기');
  assert.equal(text(doc, 'timer-alive'), '1'); // [running] unchanged → no new timer
  for (let waited = 0; Number(doc.querySelector('#timer .big').textContent) < 2 && waited < 2000; waited += 15) {
    await sleep(15);
  }
  await press('timer', '멈춤'); // cleanup runs → interval cleared
  assert.equal(text(doc, 'timer-alive'), '0');
  const stopped = doc.querySelector('#timer .big').textContent;
  assert.ok(Number(stopped) >= 2);
  await sleep(60);
  assert.equal(doc.querySelector('#timer .big').textContent, stopped); // really stopped
});

test('timer card: the no-deps effect saw the number already on screen (it runs after patch)', async () => {
  const { doc, press } = open();
  assert.equal(text(doc, 'timer-saw'), '0');
  await press('timer', '다시 시작');
  for (let waited = 0; Number(doc.querySelector('#timer .big').textContent) < 1 && waited < 2000; waited += 15) {
    await sleep(15);
  }
  await press('timer', '멈춤');
  assert.equal(text(doc, 'timer-saw'), doc.querySelector('#timer .big').textContent);
});

// ---------- filter card (feature 19, useMemo) ----------

test('the header link back to the Phase 1 page is present (it got lost twice while editing the header)', () => {
  const { doc } = open();
  const link = doc.querySelector('.top a[href="./index.html"]');
  assert.ok(link);
  assert.match(link.textContent, /Phase 1/);
});

test('filter card: computed once on mount; "다른 상태 바꾸기" re-renders without recomputing; toggling recomputes', async () => {
  const { doc, press } = open();
  assert.equal(text(doc, 'filter-computes'), '1');
  await press('filter', '다른 상태 바꾸기');
  assert.equal(text(doc, 'filter-renders'), '2');
  assert.equal(text(doc, 'filter-computes'), '1');
  await press('filter', '짝수만');
  assert.equal(text(doc, 'filter-computes'), '2');
  assert.equal(doc.querySelector('#filter .nums').textContent, '2 · 4 · 6');
});

test('filter card: "새 배열로 추가" recomputes; "push로 추가" then "다른 상태 바꾸기" shows the stale list (Q5-5 trap)', async () => {
  const { doc, press } = open();
  await press('filter', '새 배열로 추가');
  assert.equal(doc.querySelector('#filter .nums').textContent, '1 · 2 · 3 · 4 · 5 · 6 · 7');
  const computes = text(doc, 'filter-computes');
  await press('filter', 'push로 추가'); // same pointer → set skipped, no render
  await press('filter', '다른 상태 바꾸기'); // re-render, but [nums] is the same pointer → memo not recomputed
  assert.equal(text(doc, 'filter-computes'), computes);
  assert.equal(doc.querySelector('#filter .nums').textContent, '1 · 2 · 3 · 4 · 5 · 6 · 7'); // 8 is hidden
  assert.match(doc.querySelector('#filter .muted').textContent, /실제 배열 8개/); // but the array has 8
});

// ---------- rules card (feature 20) ----------

test('rules card: each button shows what the library said (2 errors, 1 warning that keeps drawing)', async (t) => {
  t.mock.method(console, 'warn', () => {}); // keep the test output quiet; the card wraps console.warn itself
  const { doc, press } = open();
  const said = () => doc.getElementById('rules-out').textContent;
  await press('rules', '자식에서 useState');
  assert.match(said(), /^에러\(멈춤\):.*root/);
  await press('rules', '훅 개수 바꾸기');
  assert.match(said(), /^에러\(멈춤\):.*hook count changed/);
  await press('rules', '훅 순서 바꾸기');
  assert.match(said(), /^경고\(계속 그림\):.*hook order changed.*"그려짐"/);
});

test('no key attribute reaches the real DOM of the cards (§3-3 Q12)', async () => {
  const { doc, press } = open();
  await press('todos', '앞에 추가');
  assert.equal(doc.querySelector('#todos [key]'), null);
});

test('input card (feature 21): typed text then "지우기" empties the box; the locked box goes back to 고정', async () => {
  const { doc, press } = open();
  const win = doc.defaultView;
  const [follow, locked] = doc.querySelectorAll('#form input[type=text]');
  assert.equal(follow.value, 'abc');
  follow.value = '안녕';
  follow.dispatchEvent(new win.Event('input', { bubbles: true }));
  await settle();
  assert.match(doc.getElementById('form').textContent, /state: "안녕"/);
  await press('form', '지우기');
  assert.equal(follow.value, '');
  locked.value = '고정!!';
  locked.dispatchEvent(new win.Event('input', { bubbles: true }));
  await settle();
  assert.equal(locked.value, '고정');
});

test('input card (feature 21): "했음" ticked then "전부 해제" unticks it; the locked checkbox stays unticked', async () => {
  const { doc, press } = open();
  const [done, locked] = doc.querySelectorAll('#form input[type=checkbox]');
  done.click();
  await settle();
  assert.equal(done.checked, true);
  await press('form', '전부 해제');
  assert.equal(done.checked, false);
  locked.click();
  await settle();
  assert.equal(locked.checked, false);
});
