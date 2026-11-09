// Functional test of the whole page in jsdom (goal DONE WHEN: "sample 1 -> edit -> Patch -> back -> forward works").
// Drives index.html through its buttons and form fields like a user would. A real browser is NOT checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './helpers/page.js';
import { SAMPLES } from '../src/samples.js';
import { htmlToVdom, containerToVdom } from '../src/render.js';

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
  assert.deepEqual(p.actualVdom(), p.sampleVdom(0));
  assert.equal(p.$('movelog').textContent, 'v1');
  assert.equal(p.$('back').disabled, true);
  assert.equal(p.$('forward').disabled, true);
});

test('sample 1 -> edit -> Patch -> back -> forward', () => {
  const p = page();
  const edited = SAMPLES[0].html.replace('오늘 할 일', '내일 할 일');
  p.edit(edited);
  // Before Patch, 실제 영역 is unchanged.
  assert.deepEqual(p.actualVdom(), p.sampleVdom(0));

  p.$('patch').click();
  assert.deepEqual(p.actualVdom(), htmlToVdom(edited, p.doc));
  assert.match(p.$('actual').querySelector('h2').textContent, /내일 할 일/);
  assert.equal(p.$('movelog').textContent, 'v1 → v2');

  p.$('back').click();
  assert.deepEqual(p.actualVdom(), p.sampleVdom(0));
  assert.equal(p.$('source').value, SAMPLES[0].html); // test area changes together
  assert.deepEqual(containerToVdom(p.$('preview')), p.sampleVdom(0));
  assert.equal(p.$('forward').disabled, false);

  p.$('forward').click();
  assert.deepEqual(p.actualVdom(), htmlToVdom(edited, p.doc));
  assert.equal(p.$('source').value, edited);
  assert.equal(p.$('movelog').textContent, 'v1 → v2 → v1 → v2');
});

test('Patch with nothing changed makes no version and says so (§2-2)', () => {
  const p = page();
  p.$('patch').click();
  assert.equal(p.$('movelog').textContent, 'v1');
  assert.match(p.$('status').textContent, /바뀐 게 없어요/);
});

test('sample 2 button fills only the text box (§2-4); Patch then makes v2', () => {
  const p = page();
  const btn = [...p.$('samples').querySelectorAll('button')].find((b) => b.textContent === '샘플 2');
  btn.click();
  assert.equal(p.$('source').value, SAMPLES[1].html);
  assert.deepEqual(p.actualVdom(), p.sampleVdom(0));
  assert.equal(p.$('movelog').textContent, 'v1');
  p.$('patch').click();
  assert.deepEqual(p.actualVdom(), p.sampleVdom(1));
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
  assert.deepEqual(p.actualVdom(), htmlToVdom('<p>x</p>', p.doc));
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
