// Tests for the action log on the hooks check page (his request 11-10: "hook쪽에도 액션로그가 있으면좋겠어").
// Two kinds of lines, written in the order things happened, newest on top:
// - what HE did:       a button press, typing in a box, ticking a checkbox
// - what the LIBRARY did: the card's component ran again ("다시 그림 (n번째)") + how many nodes of the card were
//   really touched (MutationObserver, same counting as the verification page), or what the rules card printed.
// A press with no "다시 그림" line after it = the set was skipped (spec §4-4). Render lines that follow each other
// with nothing in between (the timer ticking) are folded into one line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { mountHooksPage } from '../src/hooksPage.js';

const html = readFileSync(new URL('../hooks.html', import.meta.url), 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 0));

function open() {
  const { window } = new JSDOM(html);
  const doc = window.document;
  let tick = 0;
  const now = () => new Date(2026, 10, 10, 9, 5, 3 + tick++);
  mountHooksPage(doc, { tickMs: 15, timerStartsRunning: false, now });
  const press = async (cardId, label) => {
    const btn = [...doc.querySelectorAll(`#${cardId} button`)].find((b) => b.textContent === label);
    assert.ok(btn, `button "${label}" in #${cardId}`);
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await settle();
  };
  const lines = () =>
    [...doc.getElementById('hookslog').children].map((li) => ({
      action: li.dataset.action,
      card: li.dataset.card,
      when: li.querySelector('.when')?.textContent ?? null,
      what: li.querySelector('.what')?.textContent ?? null,
      result: li.querySelector('.result')?.textContent ?? null,
      touched: li.querySelector('.touched')?.textContent ?? null,
    }));
  return { doc, window, press, lines };
}

test('hooks.html has the log list, outside every card', () => {
  const { doc } = open();
  const list = doc.getElementById('hookslog');
  assert.equal(list.localName, 'ol');
  assert.equal(list.closest('.demo'), null);
  assert.equal(list.closest('.cards'), null);
});

test('on load there is one line: the start', () => {
  const { lines } = open();
  const all = lines();
  assert.equal(all.length, 1);
  assert.equal(all[0].action, 'load');
  assert.equal(all[0].what, '시작');
  assert.equal(all[0].when, '09:05:03');
});

test('a press that changes state: the press line, then a render line with the count and the touched nodes', async () => {
  const { press, lines } = open();
  await press('counter', '+1');
  const [render, pressed, load] = lines(); // newest first
  assert.equal(load.action, 'load');
  assert.deepEqual(
    { action: pressed.action, card: pressed.card, what: pressed.what, result: pressed.result, touched: pressed.touched },
    { action: 'press', card: 'counter', what: '카운터', result: '"+1" 누름', touched: null },
  );
  assert.equal(render.action, 'render');
  assert.equal(render.card, 'counter');
  assert.equal(render.what, '카운터');
  assert.equal(render.result, '다시 그림 (2번째)');
  assert.equal(render.touched, '건드린 노드 1개'); // only the number's text node
});

test('"같은 값": the press is logged and no render line follows (the set was skipped, §4-4)', async () => {
  const { press, lines } = open();
  await press('counter', '같은 값');
  const all = lines();
  assert.equal(all.length, 2);
  assert.equal(all[0].action, 'press');
  assert.equal(all[0].result, '"같은 값" 누름');
});

test('"함수로 두 번": two sets, ONE render line (batching, §4-4)', async () => {
  const { press, lines } = open();
  await press('counter', '함수로 두 번');
  const all = lines();
  assert.deepEqual(all.map((l) => l.action), ['render', 'press', 'load']);
  assert.equal(all[0].result, '다시 그림 (2번째)');
});

test('todo card: "push로 추가" gives no render line; "앞에 추가" then touches the new li and the count text', async () => {
  const { press, lines } = open();
  await press('todos', 'push로 추가');
  assert.deepEqual(lines().map((l) => l.action), ['press', 'load']);
  await press('todos', '앞에 추가');
  const [render, pressed] = lines();
  assert.equal(pressed.result, '"앞에 추가" 누름');
  assert.equal(render.what, '할 일 목록');
  assert.equal(render.result, '다시 그림 (2번째)');
  // the hidden pushed item + the new one appear, and "2개" becomes "4개"
  assert.equal(render.touched, '건드린 노드 3개');
});

test('render lines with nothing in between are folded into one (the timer ticking)', async () => {
  const { press, lines } = open();
  await press('timer', '다시 시작');
  await new Promise((r) => setTimeout(r, 120)); // several 15 ms ticks
  await press('timer', '멈춤'); // stops the interval (cleanup), so the test process can end
  await new Promise((r) => setTimeout(r, 40));
  const all = lines().reverse(); // oldest first
  const firstPress = all.findIndex((l) => l.action === 'press' && l.result === '"다시 시작" 누름');
  const secondPress = all.findIndex((l) => l.action === 'press' && l.result === '"멈춤" 누름');
  assert.ok(firstPress >= 0 && secondPress > firstPress);
  const between = all.slice(firstPress + 1, secondPress);
  assert.equal(between.length, 1, 'one folded render line between the two presses');
  assert.equal(between[0].action, 'render');
  assert.equal(between[0].what, '타이머');
  assert.match(between[0].result, /^다시 그림 ×\d+ \(\d+번째까지\)$/);
  const [, times, upTo] = between[0].result.match(/×(\d+) \((\d+)번째까지\)/).map(Number);
  assert.ok(times >= 3);
  assert.equal(upTo, 1 + times); // the first render was the mount
});

test('rules card: the press, then what the library said', async () => {
  const { press, lines, doc } = open();
  await press('rules', '자식에서 useState');
  const [said, pressed] = lines();
  assert.equal(pressed.action, 'press');
  assert.equal(pressed.what, '규칙 어기기');
  assert.equal(said.action, 'said');
  assert.equal(said.result, doc.getElementById('rules-out').textContent);
  assert.match(said.result, /^에러\(멈춤\)/);
});

test('typing in the followed box: an input line with the typed text, then a render line', async () => {
  const { doc, window, lines } = open();
  const box = doc.querySelector('#form input[type=text]');
  box.value = 'abcd';
  box.dispatchEvent(new window.Event('input', { bubbles: true }));
  await settle();
  const [render, typed] = lines();
  assert.equal(typed.action, 'input');
  assert.equal(typed.what, '입력칸');
  assert.equal(typed.result, '"abcd" 입력');
  assert.equal(render.action, 'render');
  assert.equal(render.what, '입력칸');
});

test('ticking the checkbox is logged with its new state', async () => {
  const { doc, window, lines } = open();
  const check = doc.querySelector('#form input[type=checkbox]');
  check.checked = true;
  check.dispatchEvent(new window.Event('change', { bubbles: true }));
  await settle();
  const typed = lines().find((l) => l.action === 'input');
  assert.equal(typed.result, '체크 켬');
});

test('the log writes nothing into the cards', async () => {
  const { doc, press } = open();
  const before = doc.getElementById('counter').innerHTML;
  await press('counter', '같은 값');
  assert.equal(doc.getElementById('counter').innerHTML, before);
});
