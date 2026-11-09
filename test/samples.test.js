// Tests for goal scope item 7 / spec-draft §2-4 (samples).
// §2-4: "샘플 버튼(샘플 1, 샘플 2 …)을 누르면 글자 칸만 채운다. 실제 영역과 히스토리는 그대로" / "처음 열면 샘플 1이 들어 있다"
// Goal: samples mix lists, attributes and nesting. The content is the orchestrator's, not 상철님's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SAMPLES } from '../src/samples.js';
import { lintHtml } from '../src/lint.js';
import { htmlToVdom, rootToHtml, containerToVdom } from '../src/render.js';
import { loadPage } from './helpers/page.js';

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
  assert.deepEqual(containerToVdom(pageDoc.getElementById('actual')), expected);
  assert.deepEqual(containerToVdom(pageDoc.getElementById('preview')), expected);
  assert.equal(pageDoc.getElementById('warning').textContent, '');
});

test('one button per sample, in order', () => {
  const { doc: pageDoc } = loadPage({ mount: true });
  const names = [...pageDoc.getElementById('samples').querySelectorAll('button')].map((b) => b.textContent);
  assert.deepEqual(names, SAMPLES.map((s) => s.name));
});

// §2-4 "글자 칸만 채운다": the preview is NOT redrawn by the button (Codex batch-after-limit, 6486c27). It follows the
// text box by the §2-1 rule (another spot / leaving the text box), or Patch flushes it.
test('a sample button fills only the text box; preview, 실제 영역 and history stay (§2-4)', () => {
  const { doc: pageDoc } = loadPage({ mount: true });
  const actualBefore = pageDoc.getElementById('actual').innerHTML;
  const previewBefore = pageDoc.getElementById('preview').innerHTML;
  const btn = [...pageDoc.getElementById('samples').querySelectorAll('button')][1];
  btn.click();
  assert.equal(pageDoc.getElementById('source').value, SAMPLES[1].html);
  assert.equal(pageDoc.getElementById('preview').innerHTML, previewBefore);
  assert.equal(pageDoc.getElementById('actual').innerHTML, actualBefore);
  assert.equal(pageDoc.getElementById('movelog').textContent, 'v1');
  assert.equal(pageDoc.getElementById('tree').querySelectorAll('button').length, 1);
  assert.match(pageDoc.getElementById('status').textContent, /Patch/);
});

test('after a sample button, the preview follows when the text box is left, and Patch uses the sample', () => {
  const { doc: pageDoc, win } = loadPage({ mount: true });
  const btn = [...pageDoc.getElementById('samples').querySelectorAll('button')][1];
  btn.click();
  pageDoc.getElementById('source').dispatchEvent(new win.Event('focusout', { bubbles: true }));
  assert.deepEqual(containerToVdom(pageDoc.getElementById('preview')), htmlToVdom(SAMPLES[1].html, pageDoc));

  const p2 = loadPage({ mount: true });
  [...p2.doc.getElementById('samples').querySelectorAll('button')][1].click();
  p2.doc.getElementById('patch').click(); // Patch flushes the pending text box edit first
  assert.deepEqual(containerToVdom(p2.doc.getElementById('actual')), htmlToVdom(SAMPLES[1].html, p2.doc));
  assert.deepEqual(containerToVdom(p2.doc.getElementById('preview')), htmlToVdom(SAMPLES[1].html, p2.doc));
});
