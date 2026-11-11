// Tests for goal scope item 7 / spec-draft §2-4 (samples).
// §2-4: "샘플 버튼(샘플 1, 샘플 2 …)을 누르면 글자 칸만 채운다. 실제 영역과 히스토리는 그대로" / "처음 열면 샘플 1이 들어 있다"
// Goal: samples mix lists, attributes and nesting. The content is the orchestrator's, not 상철님's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SAMPLES } from '../src/verify-page/samples.js';
import { lintHtml } from '../src/verify-page/lint.js';
import { htmlToVdom, rootToHtml, containerToVdom } from '../src/core/render.js';
import { loadPage } from './helpers/page.js';
import { stripKeys } from './helpers/vdom.js';

const doc = new JSDOM('<!DOCTYPE html><body></body>').window.document;

test('there are at least two samples, named 샘플 1, 샘플 2', () => {
  assert.ok(SAMPLES.length >= 2);
  assert.equal(SAMPLES[0].name, '샘플 1');
  assert.equal(SAMPLES[1].name, '샘플 2');
});

for (const sample of SAMPLES) {
  test(`${sample.name} is well-formed (no warning) and survives html -> VDOM -> html unchanged`, () => {
    assert.deepEqual(lintHtml(sample.html), []);
    assert.equal(rootToHtml(htmlToVdom(sample.html, doc)), sample.html);
  });

  test(`${sample.name} mixes a list, attributes and nesting`, () => {
    const wrapper = doc.createElement('div');
    wrapper.innerHTML = sample.html;
    assert.ok(wrapper.querySelector('ul li, ol li'), 'a list');
    assert.ok([...wrapper.querySelectorAll('*')].filter((el) => el.attributes.length > 0).length >= 2, 'attributes');
    assert.ok(wrapper.querySelector('li *'), 'nesting inside a list item');
  });
}

test('load: sample 1 is in 실제 영역, the text box and the preview (§2-4, spec §2 load flow)', () => {
  const { doc: pageDoc } = loadPage({ mount: true });
  const expected = htmlToVdom(SAMPLES[0].html, pageDoc);
  assert.equal(pageDoc.getElementById('source').value, SAMPLES[0].html);
  assert.deepEqual(containerToVdom(pageDoc.getElementById('actual')), stripKeys(expected)); // no keys there (§3-3 Q12)
  assert.deepEqual(containerToVdom(pageDoc.getElementById('preview')), expected);
  assert.equal(pageDoc.getElementById('warning').textContent, '');
});

// Spec §2-5 (11-09 after the diff grill): "key를 넣은 샘플이 필요하다". Sample 1's list is keyed, so the page can
// show key pairing (§3-2); sample 2 keeps one list without keys, so 양 끝 잘라내기 can be seen too.
test('sample 1 has a list whose items all have keys; sample 2 has a list without keys', () => {
  const w = doc.createElement('div');
  w.innerHTML = SAMPLES[0].html;
  const items = [...w.querySelector('ul').children];
  assert.ok(items.length >= 3);
  assert.ok(items.every((li) => li.hasAttribute('key')));
  assert.equal(new Set(items.map((li) => li.getAttribute('key'))).size, items.length, 'no duplicate keys');
  w.innerHTML = SAMPLES[1].html;
  assert.ok([...w.querySelectorAll('ul, ol')].some((list) => [...list.children].every((li) => !li.hasAttribute('key'))));
});

test('one button per sample, in order', () => {
  const { doc: pageDoc } = loadPage({ mount: true });
  const names = [...pageDoc.getElementById('samples').querySelectorAll('button')].map((b) => b.textContent);
  assert.deepEqual(names, SAMPLES.map((s) => s.name));
});

// §2-4 + 상철님 11-09 afternoon ("미리보기도 같이"): the button fills the test area — text box AND its preview —
// at once. 실제 영역 and history stay until Patch.
test('a sample button fills the text box and its preview; 실제 영역 and history stay (§2-4)', () => {
  const { doc: pageDoc } = loadPage({ mount: true });
  const actualBefore = pageDoc.getElementById('actual').innerHTML;
  const btn = [...pageDoc.getElementById('samples').querySelectorAll('button')][1];
  btn.click();
  assert.equal(pageDoc.getElementById('source').value, SAMPLES[1].html);
  assert.deepEqual(containerToVdom(pageDoc.getElementById('preview')), htmlToVdom(SAMPLES[1].html, pageDoc));
  assert.equal(pageDoc.getElementById('actual').innerHTML, actualBefore);
  assert.equal(pageDoc.getElementById('movelog').textContent, 'v1');
  assert.equal(pageDoc.getElementById('tree').querySelectorAll('button').length, 1);
  assert.match(pageDoc.getElementById('status').textContent, /Patch/);
});

test('a sample button drops an unsynced preview edit (the sample replaces the whole test area)', () => {
  const { doc: pageDoc, win } = loadPage({ mount: true });
  const preview = pageDoc.getElementById('preview');
  preview.querySelector('h2').firstChild.nodeValue = 'unsynced edit';
  preview.dispatchEvent(new win.Event('input', { bubbles: true }));
  [...pageDoc.getElementById('samples').querySelectorAll('button')][1].click();
  preview.dispatchEvent(new win.Event('focusout', { bubbles: true }));
  assert.equal(pageDoc.getElementById('source').value, SAMPLES[1].html);
});
