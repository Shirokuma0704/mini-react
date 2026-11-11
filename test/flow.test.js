// Functional test of the whole page in jsdom (goal DONE WHEN: "sample 1 -> edit -> Patch -> back -> forward works").
// Drives index.html through its buttons and form fields like a user would. A real browser is NOT checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './helpers/page.js';
import { SAMPLES } from '../src/verify-page/samples.js';
import { htmlToVdom, containerToVdom } from '../src/core/render.js';
import { stripKeys } from './helpers/vdom.js';

function page() {
  const p = loadPage({ mount: true });
  const { doc, win } = p;
  const $ = (id) => doc.getElementById(id);
  const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
  const edit = (text) => {
    $('source').value = text;
    fire($('source'), 'input');
    fire($('source'), 'focusout');
  };
  const actualVdom = () => containerToVdom($('actual'));
  const sampleVdom = (i) => htmlToVdom(SAMPLES[i].html, doc);
  return { ...p, $, fire, edit, actualVdom, sampleVdom };
}

test('load: sample 1 is in the text box, the preview and 실제 영역; history is v1', () => {
  const p = page();
  assert.equal(p.$('source').value, SAMPLES[0].html);
  assert.deepEqual(containerToVdom(p.$('preview')), p.sampleVdom(0));
  assert.deepEqual(p.actualVdom(), stripKeys(p.sampleVdom(0))); // 실제 영역 has no keys (§3-3 Q12)
  assert.equal(p.$('movelog').textContent, 'v1');
  assert.equal(p.$('back').disabled, true);
  assert.equal(p.$('forward').disabled, true);
});

test('sample 1 -> edit -> Patch -> back -> forward', () => {
  const p = page();
  const edited = SAMPLES[0].html.replace('오늘 할 일', '내일 할 일');
  p.edit(edited);
  // Before Patch, 실제 영역 is unchanged.
  assert.deepEqual(p.actualVdom(), stripKeys(p.sampleVdom(0))); // 실제 영역 has no keys (§3-3 Q12)

  p.$('patch').click();
  assert.deepEqual(p.actualVdom(), stripKeys(htmlToVdom(edited, p.doc))); // 실제 영역 has no keys (§3-3 Q12)
  assert.match(p.$('actual').querySelector('h2').textContent, /내일 할 일/);
  assert.equal(p.$('movelog').textContent, 'v1 → v2');

  p.$('back').click();
  assert.deepEqual(p.actualVdom(), stripKeys(p.sampleVdom(0))); // 실제 영역 has no keys (§3-3 Q12)
  assert.equal(p.$('source').value, SAMPLES[0].html); // test area changes together
  assert.deepEqual(containerToVdom(p.$('preview')), p.sampleVdom(0));
  assert.equal(p.$('forward').disabled, false);

  p.$('forward').click();
  assert.deepEqual(p.actualVdom(), stripKeys(htmlToVdom(edited, p.doc))); // 실제 영역 has no keys (§3-3 Q12)
  assert.equal(p.$('source').value, edited);
  assert.equal(p.$('movelog').textContent, 'v1 → v2 → v1 → v2');
});

test('Patch with nothing changed makes no version and says so (§2-2)', () => {
  const p = page();
  p.$('patch').click();
  assert.equal(p.$('movelog').textContent, 'v1');
  assert.match(p.$('status').textContent, /바뀐 게 없어요/);
});

test('sample 2 button fills the test area only (§2-4); Patch then makes v2', () => {
  const p = page();
  const btn = [...p.$('samples').querySelectorAll('button')].find((b) => b.textContent === '샘플 2');
  btn.click();
  assert.equal(p.$('source').value, SAMPLES[1].html);
  assert.deepEqual(p.actualVdom(), stripKeys(p.sampleVdom(0))); // 실제 영역 has no keys (§3-3 Q12)
  assert.equal(p.$('movelog').textContent, 'v1');
  p.$('patch').click();
  assert.deepEqual(p.actualVdom(), stripKeys(p.sampleVdom(1))); // 실제 영역 has no keys (§3-3 Q12)
  assert.equal(p.$('movelog').textContent, 'v1 → v2');
});

test('Patch back to an ancestor\'s content moves there (§2-2 "같은 갈래에서만")', () => {
  const p = page();
  p.edit('<p>x</p>');
  p.$('patch').click(); // v2
  p.edit('<p>y</p>');
  p.$('patch').click(); // v3
  p.edit('<p>x</p>');
  p.$('patch').click(); // equals v2 → move
  assert.equal(p.$('movelog').textContent, 'v1 → v2 → v3 → v2');
  assert.equal(p.$('tree').querySelectorAll('button').length, 3);
});

test('branching and clicking the tree', () => {
  const p = page();
  p.edit('<p>x</p>');
  p.$('patch').click(); // v2
  p.$('back').click(); // v1
  p.edit('<p>y</p>');
  p.$('patch').click(); // v3, new branch
  const btn = (label) => [...p.$('tree').querySelectorAll('button')].find((b) => b.textContent === label);
  assert.ok(btn('v2') && btn('v3'));
  btn('v2').click();
  assert.deepEqual(p.actualVdom(), stripKeys(htmlToVdom('<p>x</p>', p.doc))); // 실제 영역 has no keys (§3-3 Q12)
  assert.equal(p.$('source').value, '<p>x</p>');
  assert.equal(p.$('movelog').textContent, 'v1 → v2 → v1 → v3 → v2');
});

test('an edit made in the preview is what Patch uses', () => {
  const p = page();
  const h2 = p.$('preview').querySelector('h2');
  h2.firstChild.nodeValue = '미리보기에서 고침';
  p.fire(p.$('preview'), 'input');
  p.$('patch').click(); // Patch flushes the preview first
  assert.equal(p.$('actual').querySelector('h2').textContent, '미리보기에서 고침');
  assert.match(p.$('source').value, /미리보기에서 고침/);
});

test('broken HTML shows the warning line and does not block Patch', () => {
  const p = page();
  p.edit('<p>open');
  assert.match(p.$('warning').textContent, /닫히지 않은 태그 <p>/);
  p.$('patch').click();
  assert.equal(p.$('actual').innerHTML, '<p>open</p>');
  p.edit('<p>fine</p>');
  assert.equal(p.$('warning').textContent, '');
});

// Goal scope 6 / §2-3: debug panel shows old vs new side by side, colored from the diff RESULT.
test('debug panel after Patch: old side = previous version, new side = new one, colored from the diff', () => {
  const p = page();
  p.edit('<p>x</p>');
  p.$('patch').click();
  const newLines = [...p.$('debug-new').querySelectorAll('.line')];
  assert.deepEqual(newLines.map((l) => l.textContent), ['<p>', '  "x"', '</p>']);
  assert.ok(newLines.every((l) => l.classList.contains('add')));
  const oldLines = [...p.$('debug-old').querySelectorAll('.line')];
  assert.equal(oldLines[0].textContent, '<section class="card" id="todo">');
  assert.ok(oldLines.every((l) => l.classList.contains('del')));
});

test('debug panel follows back/forward too (old = where we were, new = where we went)', () => {
  const p = page();
  p.edit('<p>x</p>');
  p.$('patch').click();
  p.$('back').click();
  assert.equal(p.$('debug-old').querySelector('.line').textContent, '<p>');
  assert.equal(p.$('debug-new').querySelector('.line').textContent, '<section class="card" id="todo">');
});

test('debug panel on load: nothing on the old side, v1 uncolored on the new side', () => {
  const p = page();
  assert.equal(p.$('debug-old').querySelectorAll('.line').length, 0);
  const lines = [...p.$('debug-new').querySelectorAll('.line')];
  assert.equal(lines[0].textContent, '<section class="card" id="todo">');
  assert.ok(lines.every((l) => l.className === 'line'));
});

test('debug panel is untouched when Patch finds nothing changed', () => {
  const p = page();
  const before = p.$('debug-new').innerHTML;
  p.$('patch').click();
  assert.equal(p.$('debug-new').innerHTML, before);
});

test('status line: new version, and the move to an equal ancestor, are both announced', () => {
  const p = page();
  p.edit('<p>x</p>');
  p.$('patch').click();
  assert.equal(p.$('status').textContent, '새 버전 v2 만들었어요.');
  p.edit(SAMPLES[0].html);
  p.$('patch').click();
  assert.match(p.$('status').textContent, /옮겨 갔어요 → v1$/);
});

// Spec §3-3 Q12/Q13 with the keyed sample 1: keys live in the text box and the preview, never in 실제 영역.
test('load: 실제 영역 has no key attributes; the text box and the preview keep them', () => {
  const p = page();
  assert.ok(p.$('source').value.includes('key="'));
  assert.ok(p.$('preview').querySelector('[key]'));
  assert.equal(p.$('actual').querySelector('[key]'), null);
});

// "바뀐 부분만": with keys, moving an item is a move of the SAME element in 실제 영역, not a redraw.
test('keyed sample 1: move the last li to the front, Patch → that li element is reused, the others too', () => {
  const p = page();
  const before = [...p.$('actual').querySelectorAll('ul li')];
  const wrapper = p.doc.createElement('div');
  wrapper.innerHTML = SAMPLES[0].html;
  const ul = wrapper.querySelector('ul');
  const lis = ul.querySelectorAll('li');
  ul.insertBefore(lis[lis.length - 1], lis[0]);
  p.edit(wrapper.innerHTML);
  p.$('patch').click();
  const after = [...p.$('actual').querySelectorAll('ul li')];
  assert.equal(after[0], before[before.length - 1]);
  assert.deepEqual(new Set(after), new Set(before));
  assert.deepEqual(p.actualVdom(), stripKeys(htmlToVdom(wrapper.innerHTML, p.doc)));
});
