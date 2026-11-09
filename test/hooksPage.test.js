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
  mountHooksPage(doc);
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

test('no key attribute reaches the real DOM of the cards (§3-3 Q12)', async () => {
  const { doc, press } = open();
  await press('todos', '앞에 추가');
  assert.equal(doc.querySelector('#todos [key]'), null);
});
