// Tests for goal scope item 2: page layout. The page is index.html; src/app.js mounts behaviour onto it.
// The regions come from spec-draft §2 ("과제 문서로 이미 정해진 것") and §2-1..2-4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './helpers/page.js';

test('index.html has every region the spec names', () => {
  const { doc } = loadPage();
  // 실제 영역
  assert.ok(doc.getElementById('actual'), '실제 영역');
  // 테스트 영역 = HTML text box + editable preview (§2-1)
  assert.equal(doc.getElementById('source').localName, 'textarea');
  assert.equal(doc.getElementById('preview').getAttribute('contenteditable'), 'true');
  assert.ok(doc.getElementById('warning'), 'warning line under the text box');
  // Patch / 뒤로가기 / 앞으로가기
  assert.equal(doc.getElementById('patch').localName, 'button');
  assert.equal(doc.getElementById('back').localName, 'button');
  assert.equal(doc.getElementById('forward').localName, 'button');
  // sample buttons (§2-4), history tree + move log (§2-2), debug panel (§2-3)
  assert.ok(doc.getElementById('samples'), 'sample buttons');
  assert.ok(doc.getElementById('tree'), 'history tree view');
  assert.ok(doc.getElementById('movelog'), 'move log');
  assert.ok(doc.getElementById('debug-old'), 'debug panel, old side');
  assert.ok(doc.getElementById('debug-new'), 'debug panel, new side');
  assert.ok(doc.getElementById('status'), 'status line for notices');
});

test('the warning line sits right under the text box', () => {
  const { doc } = loadPage();
  assert.equal(doc.getElementById('source').nextElementSibling, doc.getElementById('warning'));
});

test('the text box is the first editor, before the preview (§2-1 "텍스트가 메인")', () => {
  const { doc } = loadPage();
  const source = doc.getElementById('source');
  const preview = doc.getElementById('preview');
  // DOCUMENT_POSITION_FOLLOWING = 4
  assert.ok(source.compareDocumentPosition(preview) & 4);
});

test('mountApp runs on the page without throwing and returns the app', () => {
  const { app } = loadPage({ mount: true });
  assert.equal(typeof app, 'object');
});

// Codex sync r1 #2: sync must work through mountApp on the real page, both ways.
test('on the page, text box and preview sync both ways', () => {
  const { doc, win } = loadPage({ mount: true });
  const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
  const source = doc.getElementById('source');
  const preview = doc.getElementById('preview');
  source.value = '<p>from text</p>';
  fire(source, 'input');
  fire(source, 'focusout');
  assert.equal(preview.innerHTML, '<p>from text</p>');
  preview.querySelector('p').firstChild.nodeValue = 'from preview';
  fire(preview, 'input');
  fire(preview, 'focusout');
  assert.equal(source.value, '<p>from preview</p>');
});

// Goal scope 4 / §2-1: one warning line under the text box, updated while typing, never blocking editing.
test('the warning line shows broken HTML while typing and clears when fixed', () => {
  const { doc, win } = loadPage({ mount: true });
  const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
  const source = doc.getElementById('source');
  const warning = doc.getElementById('warning');
  source.value = '<ul>\n<li>a</li>\n<lx>b</lx>';
  fire(source, 'input');
  assert.equal(warning.textContent, '1번째 줄: 닫히지 않은 태그 <ul> (외 1개)');
  assert.equal(warning.classList.contains('on'), true);
  assert.equal(source.value, '<ul>\n<li>a</li>\n<lx>b</lx>'); // editing not blocked, text untouched
  source.value = '<ul>\n<li>a</li>\n</ul>';
  fire(source, 'input');
  assert.equal(warning.textContent, '');
  assert.equal(warning.classList.contains('on'), false);
});

test('the warning also follows edits that come from the preview', () => {
  const { doc, win } = loadPage({ mount: true });
  const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
  const source = doc.getElementById('source');
  const preview = doc.getElementById('preview');
  source.value = '<p>open';
  fire(source, 'input');
  fire(source, 'focusout');
  assert.match(doc.getElementById('warning').textContent, /닫히지 않은 태그 <p>/);
  preview.querySelector('p').firstChild.nodeValue = 'closed';
  fire(preview, 'input');
  fire(preview, 'focusout'); // preview -> text box writes well-formed HTML back
  assert.equal(source.value, '<p>closed</p>');
  assert.equal(doc.getElementById('warning').textContent, '');
});
