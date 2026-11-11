// Motion on the verification page (src/page-tools/motion.js, his request 11-10). jsdom draws nothing, so the motion itself is
// only checked in a real browser (docs/agent/progress.md). These tests pin the two promises that CAN be checked here:
// - motion never writes into 실제 영역 or the preview (no class, no style, no extra node), and
// - with or without element.animate the page works the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './helpers/page.js';
import { mountApp } from '../src/verify-page/app.js';
import { containerToVdom, htmlToVdom } from '../src/core/render.js';
import { stripKeys } from './helpers/vdom.js';
import { SAMPLES } from '../src/verify-page/samples.js';

// A page whose elements can "animate": every call is recorded, nothing moves.
function animatedPage() {
  const p = loadPage();
  const { doc, win } = p;
  const calls = [];
  win.Element.prototype.animate = function animate(frames, options) {
    calls.push({ el: this, frames, options });
    return { onfinish: null };
  };
  win.matchMedia = () => ({ matches: false });
  const app = mountApp(doc);
  const $ = (id) => doc.getElementById(id);
  const edit = (text) => {
    $('source').value = text;
    $('source').dispatchEvent(new win.Event('input', { bubbles: true }));
    $('source').dispatchEvent(new win.Event('focusout', { bubbles: true }));
  };
  return { ...p, app, calls, $, edit };
}

const S1 = SAMPLES[0].html;
const EDITED = S1
  .replace('오늘 할 일', '내일 할 일')
  .replace('    <li key="page" class="done">검증 페이지 만들기</li>\n', '')
  .replace('    <li key="vdom">', '    <li key="new">새 항목</li>\n    <li key="vdom" class="hot">');

test('index.html has the layer for the boxes outside 실제 영역, and the ring layer outside the tree', () => {
  const { doc } = loadPage();
  const fx = doc.getElementById('actual-fx');
  assert.ok(fx);
  assert.equal(doc.getElementById('actual').contains(fx), false);
  assert.equal(fx.getAttribute('aria-hidden'), 'true');
  const ring = doc.getElementById('tree-ring');
  assert.ok(ring);
  assert.equal(doc.getElementById('tree').contains(ring), false);
});

test('with motion running, 실제 영역 is still exactly the version (no class, no style, no extra node)', () => {
  const p = animatedPage();
  p.edit(EDITED);
  p.$('patch').click();
  assert.ok(p.calls.length > 0, 'motion ran');
  assert.deepEqual(containerToVdom(p.$('actual')), stripKeys(htmlToVdom(EDITED, p.doc)));
  assert.equal(p.$('actual').querySelector('[style]'), null);
  p.$('back').click();
  assert.deepEqual(containerToVdom(p.$('actual')), stripKeys(htmlToVdom(S1, p.doc)));
  assert.deepEqual(containerToVdom(p.$('preview')), htmlToVdom(S1, p.doc));
  assert.equal(p.$('actual').querySelector('[style]'), null);
});

test('a removed node gets a box in the layer, labelled in words', () => {
  const p = animatedPage();
  // jsdom gives every node a 0×0 box, so only the boxes that do not depend on a size show up here: removed nodes.
  p.edit(S1.replace('    <li key="page" class="done">검증 페이지 만들기</li>\n', ''));
  p.$('patch').click();
  const boxes = [...p.$('actual-fx').querySelectorAll('.fx-box.del')];
  assert.ok(boxes.length >= 1);
  assert.equal(boxes[0].querySelector('.fx-tag').textContent, '지워짐');
});

test('prefers-reduced-motion: nothing is animated and no box is made', () => {
  const p = loadPage();
  const calls = [];
  p.win.Element.prototype.animate = function animate() {
    calls.push(this);
    return {};
  };
  p.win.matchMedia = () => ({ matches: true });
  mountApp(p.doc);
  const source = p.doc.getElementById('source');
  source.value = EDITED;
  source.dispatchEvent(new p.win.Event('input', { bubbles: true }));
  source.dispatchEvent(new p.win.Event('focusout', { bubbles: true }));
  p.doc.getElementById('patch').click();
  assert.equal(calls.length, 0);
  assert.equal(p.doc.getElementById('actual-fx').children.length, 0);
  assert.deepEqual(containerToVdom(p.doc.getElementById('actual')), stripKeys(htmlToVdom(EDITED, p.doc)));
});
